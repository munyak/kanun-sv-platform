// Shared helpers for the pilot-tester flow Edge Functions.
// CORS, JSON responses, and a best-effort Resend email sender that degrades
// gracefully when RESEND_API_KEY is not configured yet (DNS/verification is
// the one remaining manual step before email actually delivers).

export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

const FROM =
  Deno.env.get("PILOT_FROM") ?? "KaNun Monitoring <munya@kanunmonitoring.com>";
const REPLY_TO = Deno.env.get("PILOT_REPLY_TO") ?? "munya@kanunmonitoring.com";

export interface MailResult {
  ok: boolean;
  skipped?: boolean;
  id?: string;
  error?: string;
}

// Sends via Resend. Returns {skipped:true} (not an error) when the API key is
// absent, so the signup/approval flow still succeeds end-to-end while email
// verification is pending.
export async function sendEmail(
  to: string | string[],
  subject: string,
  html: string,
): Promise<MailResult> {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) {
    console.log(`[email skipped — no RESEND_API_KEY] to=${to} subject="${subject}"`);
    return { ok: false, skipped: true };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM,
        to: Array.isArray(to) ? to : [to],
        reply_to: REPLY_TO,
        subject,
        html,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error("[email error]", res.status, JSON.stringify(data));
      return { ok: false, error: data?.message ?? `HTTP ${res.status}` };
    }
    return { ok: true, id: data?.id };
  } catch (e) {
    console.error("[email exception]", String(e));
    return { ok: false, error: String(e) };
  }
}

export const ROLE_LABEL: Record<string, string> = {
  parent: "Parent",
  agency: "Agency owner",
  monitor: "Monitor",
  court: "Court / Legal professional",
};

export const COURT_LABEL: Record<string, string> = {
  court_ordered: "Court-ordered",
  provider: "Provider / Agency",
  both: "Both",
  unsure: "Unsure",
};
