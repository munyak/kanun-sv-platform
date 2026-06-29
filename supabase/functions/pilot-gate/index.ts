// pilot-gate — AUTH endpoint (JWT verified). The single source of truth for
// "may this signed-in user use the platform?" — used by the RequireApproved
// guard so EVERY authenticated session (email/password OR Google/Facebook
// OAuth) is held to the same pilot approval gate.
//
// Decision for the calling user:
//   admin allow-list ............................ access: "admin"
//   has an org membership (existing real user) .. access: "member"
//   has an APPROVED pilot application ........... access: "approved"
//   pending / rejected application .............. access: "pending" | "rejected"
//   none of the above (e.g. fresh OAuth sign-in)  -> create a PENDING
//       application from their profile so Munya can approve them, then
//       access: "pending"
//
// access ∈ {admin, member, approved} => allowed through the gate.
// Anything else => the user sits on the "pending approval" screen.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { cors, json } from "../_shared/util.ts";

const ADMIN_EMAILS = (Deno.env.get("PILOT_ADMIN_EMAILS") ??
  "mkanaventi@gmail.com,munya@kanunmonitoring.com,admin@kanunmonitoring.com,munya@kanun.digital")
  .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const authHeader = req.headers.get("Authorization") ?? "";

  const asCaller = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: who } = await asCaller.auth.getUser();
  const u = who?.user;
  if (!u) return json({ access: "unauthenticated" }, 401);

  const email = (u.email ?? "").toLowerCase();
  if (email && ADMIN_EMAILS.includes(email)) return json({ access: "admin" });

  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Existing platform members (agency owners, monitors, etc.) are never gated.
  const { count: roleCount } = await admin
    .from("sv_user_roles")
    .select("id", { count: "exact", head: true })
    .eq("user_id", u.id);
  if ((roleCount ?? 0) > 0) return json({ access: "member" });

  // Look up the pilot application by user_id first, then by email.
  let { data: app } = await admin
    .from("sv_pilot_applications")
    .select("id,status")
    .eq("user_id", u.id)
    .maybeSingle();
  if (!app && email) {
    const byEmail = await admin
      .from("sv_pilot_applications")
      .select("id,status")
      .eq("email", email)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    app = byEmail.data ?? null;
  }

  if (app) {
    if (app.status === "approved") return json({ access: "approved" });
    return json({ access: app.status }); // "pending" | "rejected"
  }

  // No application and not a member => an OAuth sign-in that never applied.
  // Create a PENDING record from their profile so they enter the queue.
  const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
  const name = (meta.full_name as string) || (meta.name as string) ||
    (email ? email.split("@")[0] : "Unknown");
  const provider =
    ((u.app_metadata ?? {}) as Record<string, unknown>).provider as string ||
    "oauth";

  const { error: insErr } = await admin.from("sv_pilot_applications").insert({
    name,
    email: email || `${u.id}@no-email.local`,
    role: null,
    source: "oauth",
    status: "pending",
    user_id: u.id,
    how_heard: `Signed in via ${provider}`,
  });
  if (insErr) {
    console.error("[pilot-gate insert]", insErr.message);
    // Fail closed: still hold them on the pending screen.
    return json({ access: "pending", note: "queue_insert_failed" });
  }
  return json({ access: "pending", created: true });
});
