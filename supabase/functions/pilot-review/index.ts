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
      .select("id,created_at,name,email,role,organization,jurisdiction,court_or_provider,use_case,how_heard,status,reviewed_at,reviewed_by")
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
      const html = `
        <div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;color:#1b2b27">
          <h2 style="color:#2D6A4F">You're in, ${esc(appRow.name)} 🎉</h2>
          <p>Your KaNun Monitoring pilot account is now active. You can sign in
             with the email and password you chose when you applied.</p>
          <p><a href="https://kanunmonitoring.com/login"
                style="background:#2D6A4F;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">
                Sign in to KaNun Monitoring →</a></p>
          <p style="color:#6b7d77;font-size:13px">Signed in as <strong>${esc(appRow.email)}</strong>
             (${esc(ROLE_LABEL[appRow.role] ?? appRow.role)}). Reply any time with questions.</p>
          <p style="color:#6b7d77;font-size:13px">— Munya Kanaventi, KaNun Monitoring</p>
        </div>`;
      const mail = await sendEmail(appRow.email,
        "Your KaNun Monitoring pilot access is approved", html);
      return json({ ok: true, status, email_sent: mail.ok, email_pending: !!mail.skipped });
    }

    return json({ ok: true, status });
  }

  return json({ error: "Unknown action" }, 400);
});
