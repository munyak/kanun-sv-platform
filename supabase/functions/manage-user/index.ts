// manage-user — ADMIN endpoint (JWT verified). Centralizes the two
// user-removal actions with server-side authorization so the rules can't be
// bypassed from the client:
//
//   remove_access  -> revoke the target's role(s) + deactivate their monitor
//                     profile so they can no longer use the platform. Their
//                     authored visits / observations / reports are PRESERVED
//                     (court records). Reversible by re-inviting.
//       authz: platform_admin (any org) OR agency_owner of the target's org.
//              When the caller is an owner, only their own org's role rows are
//              removed — never roles the target holds in other agencies.
//
//   delete_account -> permanently delete the auth account + role/monitor rows.
//       authz: platform_admin ONLY, and ONLY when the user has no authored
//              records (otherwise we'd orphan legal records — caller is told
//              to use remove_access instead).
//
// Runs with the service role; authorization is enforced here, not by RLS.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
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
  const action = body.action ?? "";
  const targetId = (body.user_id ?? "").trim();
  if (!targetId) return json({ error: "Missing user_id" }, 400);
  if (targetId === caller.id) {
    return json({ error: "You can't remove your own account here." }, 400);
  }

  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Caller's roles → platform admin? which orgs do they own?
  const { data: callerRoles } = await admin
    .from("sv_user_roles").select("role, org_id").eq("user_id", caller.id);
  const isPlatform = (callerRoles ?? []).some((r) => r.role === "platform_admin");
  const ownerOrgs = new Set(
    (callerRoles ?? []).filter((r) => r.role === "agency_owner").map((r) => r.org_id),
  );
  if (!isPlatform && ownerOrgs.size === 0) return json({ error: "Forbidden" }, 403);

  // Target's roles (which orgs they belong to).
  const { data: targetRoles } = await admin
    .from("sv_user_roles").select("id, role, org_id").eq("user_id", targetId);

  // Don't let one platform admin remove another (avoid lockout/foot-guns).
  if ((targetRoles ?? []).some((r) => r.role === "platform_admin")) {
    return json({ error: "Platform administrators can't be removed here." }, 403);
  }

  // ---------------------------------------------------------------- monitor ids
  // A user maps to monitor profile(s) via user_id or auth_user_id.
  const { data: monitors } = await admin
    .from("sv_monitors").select("id, org_id").or(`user_id.eq.${targetId},auth_user_id.eq.${targetId}`);
  const monitorIds = (monitors ?? []).map((m) => m.id);

  if (action === "remove_access") {
    // Which org role-rows may this caller remove?
    const rowsToRemove = (targetRoles ?? []).filter((r) =>
      isPlatform || ownerOrgs.has(r.org_id)
    );
    if (rowsToRemove.length === 0) {
      return json({ error: "This user isn't in an agency you manage." }, 403);
    }
    const removableOrgIds = new Set(rowsToRemove.map((r) => r.org_id));

    const { error: roleErr } = await admin
      .from("sv_user_roles").delete().in("id", rowsToRemove.map((r) => r.id));
    if (roleErr) return json({ error: roleErr.message }, 500);

    // Deactivate monitor profiles in the same org(s) — preserves their records.
    const monToDeactivate = (monitors ?? [])
      .filter((m) => removableOrgIds.has(m.org_id)).map((m) => m.id);
    if (monToDeactivate.length) {
      await admin.from("sv_monitors")
        .update({ active: false, status: "inactive" }).in("id", monToDeactivate);
    }
    return json({ ok: true, action: "remove_access", removed_roles: rowsToRemove.length });
  }

  if (action === "delete_account") {
    if (!isPlatform) {
      return json({ error: "Only platform administrators can permanently delete accounts." }, 403);
    }
    // Block if the user authored any legal records.
    const counts = await Promise.all([
      monitorIds.length
        ? admin.from("sv_visits").select("id", { count: "exact", head: true }).in("monitor_id", monitorIds)
        : Promise.resolve({ count: 0 }),
      monitorIds.length
        ? admin.from("sv_visit_observations").select("id", { count: "exact", head: true }).in("monitor_id", monitorIds)
        : Promise.resolve({ count: 0 }),
      admin.from("sv_reports").select("id", { count: "exact", head: true }).or(
        `created_by.eq.${targetId}${monitorIds.length ? `,monitor_id.in.(${monitorIds.join(",")})` : ""}`,
      ),
      admin.from("sv_documents").select("id", { count: "exact", head: true }).eq("uploaded_by", targetId),
    ]);
    const totalRecords = counts.reduce((s, r: { count?: number | null }) => s + (r.count ?? 0), 0);
    if (totalRecords > 0) {
      return json({
        error: "has_records",
        message:
          "This user has authored visit records or reports (legal records). Use “Remove access” instead, which disables them while preserving their records.",
        records: totalRecords,
      }, 409);
    }

    // Clean: drop role rows, monitor profiles, then the auth account.
    await admin.from("sv_user_roles").delete().eq("user_id", targetId);
    if (monitorIds.length) await admin.from("sv_monitors").delete().in("id", monitorIds);
    const { error: delErr } = await admin.auth.admin.deleteUser(targetId);
    if (delErr) return json({ error: delErr.message }, 500);
    return json({ ok: true, action: "delete_account" });
  }

  return json({ error: "Unknown action" }, 400);
});
