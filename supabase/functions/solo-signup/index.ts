// solo-signup — PUBLIC, ungated self-serve signup for individual monitors.
//
// The revenue unlock: a solo monitor signs up in ~30 seconds, no admin approval, and is
// in the app immediately on a 14-day free trial. Flow (all service role):
//   1. Create a CONFIRMED auth user (email_confirm:true) so they can sign in right away.
//   2. Create their own 1-person org (is_solo, plan 'solo', trialing, trial_ends_at +14d).
//   3. Give them the agency_owner role on that org — a membership, which makes the app's
//      access gate pass instantly (no pilot approval needed).
//   4. Create their sv_monitors record so they can run their own visits.
// Idempotent-ish: if the email already has an auth user, returns a clear "already have an
// account" message instead of duplicating.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { cors, json } from "../_shared/util.ts";

const TRIAL_DAYS = Number(Deno.env.get("SOLO_TRIAL_DAYS") ?? "14");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let b: Record<string, string>;
  try { b = await req.json(); } catch { return json({ error: "Bad request" }, 400); }
  const email = (b.email ?? "").trim().toLowerCase();
  const password = b.password ?? "";
  const firstName = (b.first_name ?? "").trim();
  const lastName = (b.last_name ?? "").trim();
  if (!email || !email.includes("@")) return json({ error: "A valid email is required." }, 400);
  if (password.length < 8) return json({ error: "Password must be at least 8 characters." }, 400);
  if (!firstName) return json({ error: "Please tell us your first name." }, 400);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } });

  // 1. Create the confirmed auth user.
  const { data: created, error: cErr } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { full_name: `${firstName} ${lastName}`.trim(), signup: "solo_self_serve" },
  });
  if (cErr || !created?.user) {
    const msg = (cErr?.message || "").toLowerCase();
    if (msg.includes("already") || msg.includes("registered") || msg.includes("exists"))
      return json({ error: "You already have an account with this email — try signing in.", existing: true }, 409);
    return json({ error: cErr?.message ?? "Could not create your account." }, 500);
  }
  const uid = created.user.id;

  // 2. Create their solo org with a 14-day trial.
  const trialEnds = new Date(Date.now() + TRIAL_DAYS * 864e5).toISOString();
  const orgName = `${firstName} ${lastName}`.trim() + " (Solo)";
  const { data: org, error: oErr } = await admin.from("sv_organizations").insert({
    name: orgName, email, created_by: uid,
    is_solo: true, plan: "solo", subscription_status: "trialing", trial_ends_at: trialEnds,
  }).select("id").single();
  if (oErr || !org) {
    await admin.auth.admin.deleteUser(uid).catch(() => {});  // roll back the user
    return json({ error: oErr?.message ?? "Could not set up your workspace." }, 500);
  }

  // 3. Owner role → membership → access gate passes instantly.
  await admin.from("sv_user_roles").insert({ user_id: uid, org_id: org.id, role: "agency_owner" });

  // 4. Their own monitor record so they can run visits.
  await admin.from("sv_monitors").insert({
    org_id: org.id, user_id: uid, auth_user_id: uid, email,
    first_name: firstName, last_name: lastName || null, active: true, status: "active",
  });

  return json({ ok: true, org_id: org.id, trial_ends_at: trialEnds, trial_days: TRIAL_DAYS });
});
