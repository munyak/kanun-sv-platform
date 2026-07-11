// create-subscription-checkout — authed. Starts a Stripe Checkout session for a
// solo monitor's $39/mo subscription and returns the hosted checkout URL.
//
// Self-contained: the monthly Price is created lazily on first use (found by a
// stable lookup_key) so there's no manual Stripe dashboard step. The org's Stripe
// Customer is created once and reused. If the org is still inside its free trial,
// the subscription's trial is aligned to the existing trial_ends_at so the monitor
// is never double-charged for days they already had free.
//
// Env: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, STRIPE_SECRET_KEY,
//      SOLO_PRICE_CENTS (default 3900), APP_BASE_URL (default https://kanunmonitoring.com).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { ...cors, "Content-Type": "application/json" },
  });
}

const PRICE_LOOKUP_KEY = "kanun_solo_monthly";
const PRICE_CENTS = Number(Deno.env.get("SOLO_PRICE_CENTS") ?? "3900");
const APP_URL = (Deno.env.get("APP_BASE_URL") ?? "https://kanunmonitoring.com").replace(/\/$/, "");

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2024-06-20",
  httpClient: Stripe.createFetchHttpClient(),
});

// Find the recurring Price by lookup_key, creating the Product + Price the first
// time. Idempotent: the lookup_key guarantees we never create a duplicate.
async function ensurePriceId(): Promise<string> {
  const existing = await stripe.prices.list({ lookup_keys: [PRICE_LOOKUP_KEY], active: true, limit: 1 });
  if (existing.data[0]) return existing.data[0].id;
  const price = await stripe.prices.create({
    unit_amount: PRICE_CENTS,
    currency: "usd",
    recurring: { interval: "month" },
    lookup_key: PRICE_LOOKUP_KEY,
    product_data: { name: "KaNun Solo Monitor" },
  });
  return price.id;
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
  if (!caller) return json({ error: "Please sign in and try again." }, 401);

  let body: Record<string, string> = {};
  try { body = await req.json(); } catch { /* optional */ }
  const returnPath = (body.return_path && body.return_path.startsWith("/")) ? body.return_path : "/subscription";

  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Find the caller's org — prefer a solo org they own.
  const { data: roles } = await admin.from("sv_user_roles").select("org_id, role").eq("user_id", caller.id);
  const orgIds = (roles ?? []).map((r) => r.org_id).filter(Boolean);
  if (orgIds.length === 0) return json({ error: "No organization found for your account." }, 400);

  const { data: orgs } = await admin.from("sv_organizations")
    .select("id, name, email, is_solo, stripe_customer_id, stripe_subscription_id, subscription_status, trial_ends_at")
    .in("id", orgIds);
  const org = (orgs ?? []).find((o) => o.is_solo) ?? (orgs ?? [])[0];
  if (!org) return json({ error: "No organization found for your account." }, 400);
  if (org.subscription_status === "active") {
    return json({ error: "Your subscription is already active." }, 400);
  }

  try {
    const priceId = await ensurePriceId();

    // Reuse or create the Stripe customer for this org.
    let customerId = org.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: org.email ?? caller.email ?? undefined,
        name: org.name ?? undefined,
        metadata: { org_id: org.id, supabase_user_id: caller.id },
      });
      customerId = customer.id;
      await admin.from("sv_organizations").update({ stripe_customer_id: customerId }).eq("id", org.id);
    }

    // Align the subscription trial to any free-trial days the org still has.
    // Stripe requires trial_end to be at least 48h out, so only pass it when
    // there's a meaningful remaining trial; otherwise the subscription starts
    // (and charges) immediately.
    const trialEnd = org.trial_ends_at ? Math.floor(new Date(org.trial_ends_at).getTime() / 1000) : 0;
    const now = Math.floor(Date.now() / 1000);
    const MIN_TRIAL_BUFFER = 49 * 3600; // 49h — safely past Stripe's 48h floor
    const subData: Record<string, unknown> = { metadata: { org_id: org.id } };
    if (trialEnd > now + MIN_TRIAL_BUFFER) subData.trial_end = trialEnd;

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      client_reference_id: org.id,
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: subData,
      allow_promotion_codes: true,
      success_url: `${APP_URL}${returnPath}?status=success`,
      cancel_url: `${APP_URL}${returnPath}?status=cancel`,
    });

    return json({ url: session.url });
  } catch (e) {
    console.error("[checkout error]", String(e));
    return json({ error: "Could not start checkout. Please try again." }, 500);
  }
});
