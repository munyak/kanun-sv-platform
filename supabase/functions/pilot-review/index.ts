// pilot-review — ADMIN endpoint (JWT verified). The caller must be a
// logged-in user whose email is on the admin allow-list. Backs the
// /admin/pilots page: list applications, approve, or reject.
//
//   approve -> status=approved, confirm the auth user (email_confirm:true) so
//              they can finally sign in with the password they chose.
//   reject  -> status=rejected, the auth user stays unconfirmed (cannot sign in).
//
// Runs with the service role; authorization is enforced by checking the
// caller's verified JWT email against PILOT_ADMIN_EMAILS.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { cors, json, sendEmail, ROLE_LABEL } from "../_shared/util.ts";

const ADMIN_EMAILS = (Deno.env.get("PILOT_ADMIN_EMAILS") ??
  "mkanaventi@gmail.com,munya@kanunmonitoring.com,admin@kanunmonitoring.com,munya@kanun.digital")
  .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

function esc(s: unknown): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const authHeader = req.headers.get("Authorization") ?? "";

  // Identify the caller from their JWT.
  const asCaller = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: who } = await asCaller.auth.getUser();
  const callerEmail = (who?.user?.email ?? "").toLowerCase();
  if (!callerEmail || !ADMIN_EMAILS.includes(callerEmail)) {
    return json({ error: "Forbidden" }, 403);
  }

  let body: Record<string, string> = {};
  try { body = await req.json(); } catch { /* list has no body */ }
  const action = body.action ?? "list";

  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  if (action === "list") {
    const { data, error } = await admin
      .from("sv_pilot_applications")
      .select("id,created_at,name,email,role,source,organization,jurisdiction,court_or_provider,use_case,how_heard,status,reviewed_at,reviewed_by")
      .order("created_at", { ascending: false });
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true, applications: data });
  }

  if (action === "approve" || action === "reject") {
    const id = body.id;
    if (!id) return json({ error: "Missing application id" }, 400);

    const { data: appRow, error: getErr } = await admin
      .from("sv_pilot_applications").select("*").eq("id", id).maybeSingle();
    if (getErr || !appRow) return json({ error: "Application not found" }, 404);

    const status = action === "approve" ? "approved" : "rejected";

    if (action === "approve" && appRow.user_id) {
      const { error: confErr } = await admin.auth.admin.updateUserById(
        appRow.user_id, { email_confirm: true },
      );
      if (confErr) {
        console.error("[confirm user]", confErr.message);
        return json({ error: "Could not activate the tester's account." }, 500);
      }
    }

    const { error: updErr } = await admin
      .from("sv_pilot_applications")
      .update({ status, reviewed_at: new Date().toISOString(), reviewed_by: callerEmail })
      .eq("id", id);
    if (updErr) return json({ error: updErr.message }, 500);

    if (action === "approve") {
      const firstName = esc((appRow.name ?? "").split(" ")[0] || appRow.name);
      const roleText = esc(ROLE_LABEL[appRow.role] ?? appRow.role ?? "tester");
      const feature = (icon: string, title: string, desc: string) =>
        `<tr>
           <td style="vertical-align:top;padding:7px 10px 7px 0;font-size:18px;width:26px">${icon}</td>
           <td style="padding:7px 0;font-size:14px;line-height:1.5;color:#1b2b27">
             <strong>${title}</strong> — ${desc}</td>
         </tr>`;
      const html = `
        <div style="font-family:Inter,Arial,sans-serif;max-width:600px;margin:0 auto;color:#1b2b27">
          <div style="background:linear-gradient(135deg,#0a3322,#1c6b4c);padding:30px 28px;border-radius:14px 14px 0 0;color:#eafff5">
            <div style="font-size:12px;letter-spacing:.6px;text-transform:uppercase;color:#aef0d0;font-weight:700;margin-bottom:8px">KaNun Monitoring · Pilot access</div>
            <h1 style="margin:0;font-size:24px;color:#fff">You're in, ${firstName} 🎉</h1>
          </div>
          <div style="background:#fff;padding:26px 28px;border:1px solid #e3ece8;border-top:0;border-radius:0 0 14px 14px">
            <p style="font-size:15px;line-height:1.6;margin:0 0 18px">
              Congratulations — your KaNun Monitoring pilot account is <strong>approved and active</strong>.
              You're set up as <strong>${roleText}</strong>. Sign in with the email and password you chose when you applied.
            </p>
            <p style="margin:0 0 26px">
              <a href="https://kanunmonitoring.com/login"
                 style="background:#2D6A4F;color:#fff;padding:13px 24px;border-radius:10px;text-decoration:none;font-weight:600;display:inline-block">
                 Sign in to KaNun Monitoring →</a>
            </p>

            <h2 style="font-size:15px;color:#2D6A4F;margin:0 0 8px">What you can do</h2>
            <table style="width:100%;border-collapse:collapse;margin-bottom:8px">
              ${feature("📋", "Guided visit workflows", "run each supervised visit step by step.")}
              ${feature("📍", "GPS-verified check-ins", "timestamped proof of when and where a visit happened.")}
              ${feature("🎙️", "Hands-free voice notes", "capture observations out loud during the visit.")}
              ${feature("⚖️", "Court-ready 5.20 reports", "California Standard 5.20 reports generated in minutes.")}
              ${feature("🗂️", "Cases &amp; monitors", "manage your caseload, schedule, and team in one place.")}
              ${feature("🎓", "KaNun Academy", "built-in training toward KaNun Certified Monitor.")}
            </table>

            <h2 style="font-size:15px;color:#2D6A4F;margin:24px 0 8px">Getting started — 4 quick steps</h2>
            <ol style="font-size:14px;line-height:1.65;padding-left:20px;margin:0">
              <li><strong>Sign in</strong> at kanunmonitoring.com/login with your email and password.</li>
              <li><strong>Finish setup</strong> — confirm your profile and (for agencies) your organization details.</li>
              <li><strong>Take the quick tour</strong> — a short guided walkthrough opens automatically on your first login.</li>
              <li><strong>Run your first visit</strong> — add a case, schedule it, check in with GPS, capture voice notes, and generate a court-ready 5.20 report.</li>
            </ol>

            <p style="font-size:14px;line-height:1.6;color:#44564f;margin:20px 0 0">
              This is an early pilot, so your feedback genuinely shapes what we build next.
              Just reply to this email any time — questions, bugs, or ideas are all welcome.
            </p>
            <p style="font-size:13px;color:#6b7d77;margin:18px 0 0">— Munya Kanaventi, Founder · KaNun Monitoring</p>
          </div>
        </div>`;
      const mail = await sendEmail(appRow.email,
        `🎉 You're approved — welcome to the KaNun Monitoring pilot, ${firstName}`, html);
      return json({ ok: true, status, email_sent: mail.ok, email_pending: !!mail.skipped });
    }

    return json({ ok: true, status });
  }

  return json({ error: "Unknown action" }, 400);
});
