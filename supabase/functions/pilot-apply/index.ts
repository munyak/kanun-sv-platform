// pilot-apply — PUBLIC endpoint (deployed with --no-verify-jwt).
// Handles a pilot-tester application from the public splash form:
//   1. Validates input (+ honeypot spam guard).
//   2. Provisions a GATED auth user (email_confirm:false) so the applicant
//      cannot sign in until Munya approves. Uses admin.createUser, which sends
//      no email, so signup never depends on SMTP.
//   3. Inserts a PENDING row in sv_pilot_applications with all classification
//      fields, linked to the user.
//   4. Best-effort sends the applicant confirmation + Munya notification.
//
// Everything runs with the service role; the table's RLS stays locked.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { cors, json, sendEmail, ROLE_LABEL, COURT_LABEL } from "../_shared/util.ts";

const NOTIFY = Deno.env.get("PILOT_NOTIFY_EMAIL") ?? "mkanaventi@gmail.com";

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: Record<string, string> = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  // Honeypot: real users never fill this hidden field.
  if (body.website && body.website.trim() !== "") {
    return json({ ok: true, status: "pending" });
  }

  const name = (body.name ?? "").trim();
  const email = (body.email ?? "").trim().toLowerCase();
  const password = body.password ?? "";
  const role = (body.role ?? "").trim();
  const organization = (body.organization ?? "").trim() || null;
  const jurisdiction = (body.jurisdiction ?? "").trim() || null;
  const court_or_provider = (body.court_or_provider ?? "").trim() || null;
  const use_case = (body.use_case ?? "").trim() || null;
  const how_heard = (body.how_heard ?? "").trim() || null;

  if (!name) return json({ error: "Please enter your name." }, 400);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    return json({ error: "Please enter a valid email address." }, 400);
  if (!["parent", "monitor", "court"].includes(role))
    return json({ error: "Please choose your role." }, 400);
  if (password.length < 8)
    return json({ error: "Password must be at least 8 characters." }, 400);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // Already applied? (active = pending or approved)
  const { data: existing } = await admin
    .from("sv_pilot_applications")
    .select("id, status")
    .eq("email", email)
    .in("status", ["pending", "approved"])
    .maybeSingle();
  if (existing) {
    return json({
      ok: true,
      status: existing.status,
      message:
        existing.status === "approved"
          ? "You're already approved — head to the sign-in page."
          : "You've already applied — we'll be in touch within a week.",
    });
  }

  // Provision the gated auth user. email_confirm:false => cannot sign in until
  // approved. Tolerate an already-existing auth user (reuse it).
  let userId: string | null = null;
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: false,
    user_metadata: { full_name: name, pilot: true, pilot_role: role },
  });
  if (createErr) {
    // User may already exist from a prior attempt — look them up.
    const { data: list } = await admin.auth.admin.listUsers();
    const found = list?.users?.find(
      (u) => (u.email ?? "").toLowerCase() === email,
    );
    if (found) userId = found.id;
    else {
      console.error("[createUser]", createErr.message);
      return json({ error: "Could not create your account. Try again." }, 500);
    }
  } else {
    userId = created.user?.id ?? null;
  }

  const { data: app, error: insErr } = await admin
    .from("sv_pilot_applications")
    .insert({
      name, email, role, organization, jurisdiction,
      court_or_provider, use_case, how_heard,
      status: "pending", user_id: userId,
    })
    .select("id")
    .single();
  if (insErr) {
    console.error("[insert]", insErr.message);
    return json({ error: "Could not save your application. Try again." }, 500);
  }

  // ---- Best-effort emails (skipped cleanly if RESEND_API_KEY unset) ----
  const applicantHtml = `
    <div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;color:#1b2b27">
      <h2 style="color:#2D6A4F">Thanks for your interest, ${esc(name)}!</h2>
      <p>We've received your request to join the <strong>KaNun Monitoring</strong>
         supervised-visitation pilot.</p>
      <p>Our team will review your application and <strong>be in touch within one week</strong>
         to approve your access and issue your test account.</p>
      <p>You applied as: <strong>${esc(ROLE_LABEL[role] ?? role)}</strong></p>
      <p style="color:#6b7d77;font-size:13px;margin-top:28px">
         You can't sign in yet — your account activates once we approve you.
         Questions? Just reply to this email.</p>
      <p style="color:#6b7d77;font-size:13px">— Munya Kanaventi, KaNun Monitoring</p>
    </div>`;

  const notifyHtml = `
    <div style="font-family:Inter,Arial,sans-serif;max-width:600px;margin:0 auto;color:#1b2b27">
      <h2 style="color:#2D6A4F">New pilot-tester application</h2>
      <table style="border-collapse:collapse;width:100%;font-size:14px">
        ${[
          ["Name", esc(name)],
          ["Email", esc(email)],
          ["Role", esc(ROLE_LABEL[role] ?? role)],
          ["Organization / agency", esc(organization ?? "—")],
          ["Jurisdiction / location", esc(jurisdiction ?? "—")],
          ["Court-ordered vs provider", esc(COURT_LABEL[court_or_provider ?? ""] ?? court_or_provider ?? "—")],
          ["Use case / what they want to test", esc(use_case ?? "—")],
          ["How they heard", esc(how_heard ?? "—")],
        ].map(([k, v]) =>
          `<tr><td style="padding:6px 12px 6px 0;color:#6b7d77;vertical-align:top;white-space:nowrap">${k}</td>
               <td style="padding:6px 0">${v}</td></tr>`).join("")}
      </table>
      <p style="margin-top:24px">
        <a href="https://kanunmonitoring.com/admin/pilots"
           style="background:#2D6A4F;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">
           Review &amp; approve in the admin queue →</a>
      </p>
      <p style="color:#6b7d77;font-size:13px">Application ID: ${esc(app.id)}</p>
    </div>`;

  const [appMail, notifyMail] = await Promise.all([
    sendEmail(email, "Thanks for your interest in the KaNun Monitoring pilot", applicantHtml),
    sendEmail(NOTIFY, `New pilot applicant: ${name} (${ROLE_LABEL[role] ?? role})`, notifyHtml),
  ]);

  return json({
    ok: true,
    status: "pending",
    email_sent: appMail.ok && notifyMail.ok,
    email_pending: !!(appMail.skipped || notifyMail.skipped),
  });
});
