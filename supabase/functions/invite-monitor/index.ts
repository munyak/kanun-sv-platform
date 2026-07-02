// invite-monitor — ADMIN endpoint (JWT verified). Called when an agency owner
// (or manager / platform admin) adds a monitor to their agency. It does three
// things, all with the service role so RLS can't get in the way:
//
//   1. Ensures a placeholder monitor record exists (status pending_verification,
//      active:false) so the new hire shows up in the Monitors list right away.
//   2. Ensures an open sv_invitations row exists for {org, email, role:monitor}.
//      When the monitor later signs up with this email, the app's
//      accept_pending_invitations() RPC links them to the agency automatically.
//   3. Sends the monitor a plain-language onboarding email FROM
//      munya@kanunmonitoring.com (via Resend) telling them who added them, how
//      to activate their account, and how to install the app on their phone.
//
// Authorization: the caller must own or manage the target org (agency_owner /
// agency_manager) or be a platform_admin. Enforced here, not by RLS.
//
// Email delivery degrades gracefully: if RESEND_API_KEY is unset the flow still
// succeeds and returns email_pending:true, and the caller is shown a shareable
// signup link so onboarding is never blocked on email.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { cors, json, sendEmail } from "../_shared/util.ts";

const SITE_URL = (Deno.env.get("SITE_URL") ?? "https://kanunmonitoring.com").replace(/\/+$/, "");

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
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
  const caller = who?.user;
  if (!caller) return json({ error: "Unauthorized" }, 401);

  let body: Record<string, string> = {};
  try { body = await req.json(); } catch { /* */ }

  const orgId = (body.org_id ?? "").trim();
  const email = (body.email ?? "").trim().toLowerCase();
  // Names are optional: the Monitors page collects them, but the onboarding
  // wizard's "invite your first monitor" step only has an email. Fall back to
  // the email's local part so the placeholder record and greeting still read
  // sensibly.
  const localPart = email.split("@")[0] || "there";
  const firstName = (body.first_name ?? "").trim() || localPart;
  const lastName = (body.last_name ?? "").trim() || "(pending)";
  const phone = (body.phone ?? "").trim() || null;

  if (!orgId) return json({ error: "Missing org_id" }, 400);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    return json({ error: "Please enter a valid email address." }, 400);

  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ---- Authorization: caller must own/manage this org (or be platform admin).
  const { data: callerRoles } = await admin
    .from("sv_user_roles").select("role, org_id").eq("user_id", caller.id);
  const isPlatform = (callerRoles ?? []).some((r) => r.role === "platform_admin");
  const managesOrg = (callerRoles ?? []).some((r) =>
    r.org_id === orgId && (r.role === "agency_owner" || r.role === "agency_manager")
  );
  if (!isPlatform && !managesOrg) return json({ error: "Forbidden" }, 403);

  // ---- 1. Placeholder monitor record (only if none exists for this email).
  const { data: existingMon } = await admin
    .from("sv_monitors").select("id").eq("org_id", orgId).ilike("email", email).maybeSingle();
  if (!existingMon) {
    const { error: mErr } = await admin.from("sv_monitors").insert({
      org_id: orgId,
      first_name: firstName,
      last_name: lastName,
      email,
      phone,
      status: "pending_verification",
      active: false,
    });
    if (mErr) {
      console.error("[invite-monitor monitor insert]", mErr.message);
      return json({ error: "Could not create the monitor record." }, 500);
    }
  }

  // ---- 2. Open invitation (idempotent — unique partial index guards dupes).
  const { error: invErr } = await admin.from("sv_invitations").insert({
    org_id: orgId, email, role: "monitor", invited_by: caller.id,
  });
  if (invErr && !/duplicate|unique/i.test(invErr.message)) {
    console.error("[invite-monitor invitation insert]", invErr.message);
    return json({ error: "Could not create the invitation." }, 500);
  }

  // ---- Context for the email: agency name + who invited them.
  const { data: org } = await admin
    .from("sv_organizations").select("name").eq("id", orgId).maybeSingle();
  const orgName = org?.name || "your agency";

  const callerMeta = (caller.user_metadata ?? {}) as Record<string, unknown>;
  const inviterName =
    (callerMeta.full_name as string) || (callerMeta.name as string) ||
    caller.email || "your agency administrator";

  const joinLink = `${SITE_URL}/join?email=${encodeURIComponent(email)}`;

  // ---- 3. Onboarding email (plain language, non-technical).
  const html = `
    <div style="font-family:Inter,Arial,sans-serif;max-width:600px;margin:0 auto;color:#1b2b27">
      <div style="background:linear-gradient(135deg,#0a3322,#1c6b4c);padding:30px 28px;border-radius:14px 14px 0 0;color:#eafff5">
        <div style="font-size:12px;letter-spacing:.6px;text-transform:uppercase;color:#aef0d0;font-weight:700;margin-bottom:8px">KaNun Monitoring</div>
        <h1 style="margin:0;font-size:23px;color:#fff">You've been added as a monitor 🎉</h1>
      </div>
      <div style="background:#fff;padding:26px 28px;border:1px solid #e3ece8;border-top:0;border-radius:0 0 14px 14px">
        <p style="font-size:15px;line-height:1.6;margin:0 0 16px">
          Hi ${esc(firstName)},
        </p>
        <p style="font-size:15px;line-height:1.6;margin:0 0 18px">
          <strong>${esc(orgName)}</strong> has added you as a <strong>monitor</strong> on
          <strong>KaNun Monitoring</strong> — the app your agency uses to run supervised visits,
          check in with GPS, capture notes, and produce court-ready reports.
          ${esc(inviterName)} invited you using this email address.
        </p>

        <h2 style="font-size:15px;color:#2D6A4F;margin:22px 0 8px">Step 1 — Create your account</h2>
        <p style="font-size:14px;line-height:1.6;margin:0 0 14px">
          Tap the button below, choose a password, and you're in. Use <strong>this same email
          address</strong> (${esc(email)}) so we can connect you to ${esc(orgName)} automatically.
        </p>
        <p style="margin:0 0 8px">
          <a href="${joinLink}"
             style="background:#2D6A4F;color:#fff;padding:13px 24px;border-radius:10px;text-decoration:none;font-weight:600;display:inline-block">
             Set up my account →</a>
        </p>
        <p style="font-size:12px;line-height:1.5;color:#6b7d77;margin:0 0 22px">
          If the button doesn't work, copy and paste this link into your browser:<br>
          <span style="word-break:break-all">${joinLink}</span>
        </p>

        <h2 style="font-size:15px;color:#2D6A4F;margin:22px 0 8px">Step 2 — Add the app to your phone</h2>
        <p style="font-size:14px;line-height:1.6;margin:0 0 12px">
          KaNun works like a normal app once you add it to your home screen — the fastest way to
          check in when you arrive at a visit. It only takes a few seconds:
        </p>
        <div style="background:#f4f8f6;border:1px solid #e3ece8;border-radius:10px;padding:14px 16px;margin:0 0 10px">
          <div style="font-size:14px;font-weight:600;color:#1b2b27;margin-bottom:4px">📱 On an iPhone or iPad (Safari)</div>
          <div style="font-size:13.5px;line-height:1.6;color:#44564f">
            1. Open <strong>${esc(SITE_URL.replace(/^https?:\/\//, ""))}</strong> in <strong>Safari</strong>.<br>
            2. Tap the <strong>Share</strong> button (the square with an arrow pointing up) at the bottom.<br>
            3. Scroll down and tap <strong>“Add to Home Screen”</strong>, then tap <strong>Add</strong>.
          </div>
        </div>
        <div style="background:#f4f8f6;border:1px solid #e3ece8;border-radius:10px;padding:14px 16px;margin:0 0 22px">
          <div style="font-size:14px;font-weight:600;color:#1b2b27;margin-bottom:4px">🤖 On an Android phone (Chrome)</div>
          <div style="font-size:13.5px;line-height:1.6;color:#44564f">
            1. Open <strong>${esc(SITE_URL.replace(/^https?:\/\//, ""))}</strong> in <strong>Chrome</strong>.<br>
            2. Tap the <strong>⋮ menu</strong> (three dots) in the top-right corner.<br>
            3. Tap <strong>“Install app”</strong> or <strong>“Add to Home screen”</strong>, then confirm.
          </div>
        </div>

        <h2 style="font-size:15px;color:#2D6A4F;margin:22px 0 8px">What you'll do as a monitor</h2>
        <ul style="font-size:14px;line-height:1.65;padding-left:20px;margin:0 0 8px">
          <li>See the visits your agency assigns to you.</li>
          <li>Check in with one tap — GPS confirms you arrived on time.</li>
          <li>Record observations hands-free with voice notes during the visit.</li>
          <li>Finish, and your notes become a court-ready report automatically.</li>
        </ul>

        <p style="font-size:14px;line-height:1.6;color:#44564f;margin:20px 0 0">
          Questions or trouble signing in? Just reply to this email — we're happy to help.
        </p>
        <p style="font-size:13px;color:#6b7d77;margin:18px 0 0">— Munya Kanaventi, KaNun Monitoring</p>
      </div>
    </div>`;

  const mail = await sendEmail(
    email,
    `You've been added to KaNun Monitoring by ${orgName}`,
    html,
  );

  return json({
    ok: true,
    invite_link: joinLink,
    email_sent: mail.ok,
    email_pending: !!mail.skipped,
    email_error: mail.error ?? null,
  });
});
