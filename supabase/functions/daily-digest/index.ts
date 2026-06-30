// daily-digest — emails a platform activity/usage digest to the founder.
// Invoked by pg_cron (see cron.schedule) with an x-digest-secret header so it
// can't be triggered publicly. Reads platform_daily_digest() with the service
// role and sends via Resend from the verified kanunmonitoring.com domain.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const DIGEST_TO = Deno.env.get("DIGEST_TO") ?? "mkanaventi@gmail.com";
const FROM = Deno.env.get("PILOT_FROM") ?? "KaNun Monitoring <admin@kanunmonitoring.com>";

function esc(s: unknown): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok");

  // Shared-secret guard (set DIGEST_SECRET; cron passes it as a header).
  const secret = Deno.env.get("DIGEST_SECRET");
  if (secret && req.headers.get("x-digest-secret") !== secret) {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: d, error } = await admin.rpc("platform_daily_digest");
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  const date = new Date(d.generated_at).toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", timeZone: "America/Los_Angeles",
  });

  const stat = (label: string, value: unknown, hint = "") =>
    `<td style="padding:12px 14px;background:#f6f9f7;border-radius:10px;vertical-align:top">
       <div style="font-size:26px;font-weight:700;color:#1b2b27;letter-spacing:-.02em">${esc(value ?? 0)}</div>
       <div style="font-size:12px;color:#6b7d77;margin-top:2px">${label}${hint ? ` · ${hint}` : ""}</div>
     </td>`;

  const row = (cells: string[]) =>
    `<table style="width:100%;border-collapse:separate;border-spacing:8px 8px"><tr>${cells.join("")}</tr></table>`;

  const list = (arr: Array<Record<string, unknown>>, key: string, valKey: string) =>
    (arr || []).length
      ? `<table style="width:100%;border-collapse:collapse;font-size:13px">${arr.map((r) =>
          `<tr><td style="padding:5px 0;color:#2a3b36">${esc(String(r[key]).replace(/_/g, " "))}</td>
               <td style="padding:5px 0;text-align:right;font-weight:600">${esc(r[valKey])}</td></tr>`).join("")}</table>`
      : `<div style="font-size:13px;color:#9aa8a2;padding:4px 0">No activity in the last 24h</div>`;

  const comments = (d.recent_comments || []).length
    ? `<div style="margin-top:18px">
         <div style="font-size:13px;font-weight:700;color:#2D6A4F;margin-bottom:6px">What testers said</div>
         ${(d.recent_comments as Array<Record<string, unknown>>).map((c) =>
           `<div style="font-size:13px;color:#2a3b36;border-left:3px solid #d8e6df;padding:2px 0 2px 10px;margin:6px 0">
              ${c.rating ? `<strong>${esc(c.rating)}/5</strong> · ` : ""}“${esc(c.comment)}”</div>`).join("")}
       </div>` : "";

  const html = `
  <div style="font-family:Inter,Arial,sans-serif;max-width:640px;margin:0 auto;color:#1b2b27">
    <div style="background:linear-gradient(135deg,#0a3322,#1c6b4c);padding:24px 26px;border-radius:14px 14px 0 0;color:#eafff5">
      <div style="font-size:12px;letter-spacing:.6px;text-transform:uppercase;color:#aef0d0;font-weight:700">KaNun Monitoring · Daily digest</div>
      <h1 style="margin:6px 0 0;font-size:22px;color:#fff">${esc(date)}</h1>
    </div>
    <div style="background:#fff;padding:20px 22px;border:1px solid #e3ece8;border-top:0;border-radius:0 0 14px 14px">
      <h2 style="font-size:14px;color:#2D6A4F;margin:0 0 6px">Last 24 hours</h2>
      ${row([stat("New signups", d.signups_24h), stat("Approved", d.approved_24h), stat("Pending review", d.pending_total)])}
      ${row([stat("Active testers", d.active_testers_24h), stat("Activity events", d.events_24h), stat("New feedback", d.feedback_24h, d.avg_rating_24h ? `avg ${d.avg_rating_24h}/5` : "")])}
      ${row([stat("Reports submitted", d.reports_submitted_24h), stat("Cases created", d.cases_created_24h), stat("Visits completed", d.visits_completed_24h)])}

      <div style="display:flex;gap:18px;margin-top:18px;flex-wrap:wrap">
        <div style="flex:1;min-width:240px">
          <div style="font-size:13px;font-weight:700;color:#2D6A4F;margin-bottom:4px">Top actions</div>
          ${list(d.top_events, "event", "count")}
        </div>
        <div style="flex:1;min-width:240px">
          <div style="font-size:13px;font-weight:700;color:#2D6A4F;margin-bottom:4px">Most-visited pages</div>
          ${list(d.top_pages, "path", "count")}
        </div>
      </div>
      ${comments}

      <div style="margin-top:20px;padding-top:14px;border-top:1px solid #eef2f0;font-size:12px;color:#6b7d77">
        Platform totals: ${esc(d.orgs)} orgs · ${esc(d.users)} users · ${esc(d.active_monitors)}/${esc(d.monitors)} active monitors ·
        ${esc(d.visits_scheduled_today)} visits scheduled today.
        <a href="https://kanunmonitoring.com/admin" style="color:#2D6A4F;font-weight:600;text-decoration:none"> Open the admin dashboard →</a>
      </div>
    </div>
  </div>`;

  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return new Response(JSON.stringify({ ok: true, email_skipped: true, digest: d }), { status: 200 });

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: FROM,
      to: [DIGEST_TO],
      subject: `KaNun daily digest · ${date} · ${d.active_testers_24h} active, ${d.signups_24h} new`,
      html,
    }),
  });
  const out = await res.json().catch(() => ({}));
  return new Response(JSON.stringify({ ok: res.ok, id: out?.id, sent_to: DIGEST_TO }), {
    status: res.ok ? 200 : 500,
    headers: { "Content-Type": "application/json" },
  });
});
