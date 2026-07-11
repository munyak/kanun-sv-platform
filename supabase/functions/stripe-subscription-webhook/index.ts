// stripe-subscription-webhook — receives Stripe subscription lifecycle events and
// keeps sv_organizations.subscription_status in sync so the app's paywall reflects
// reality. Deploy with --no-verify-jwt (Stripe calls it, not a signed-in user); the
// Stripe signature is verified here instead.
//
// Handles:
//   checkout.session.completed          -> record subscription id + status
//   customer.subscription.created/updated -> map Stripe status -> our status
//   customer.subscription.deleted       -> canceled
//
// Org is resolved from metadata.org_id / client_reference_id, falling back to the
// Stripe customer id we stored at checkout.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2024-06-20",
  httpClient: Stripe.createFetchHttpClient(),
});
const cryptoProvider = Stripe.createSubtleCryptoProvider();

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

// Map a Stripe subscription status to the small set the app understands.
function mapStatus(s: string): string {
  switch (s) {
    case "active":
    case "trialing": return s === "trialing" ? "trialing" : "active";
    case "past_due":
    case "unpaid": return "past_due";
    case "canceled":
    case "incomplete_expired": return "canceled";
    default: return "past_due"; // incomplete / paused — treat as not-yet-active
  }
}

// Update the org row, resolving it by org_id first, then by stripe_customer_id.
async function updateOrg(
  orgId: string | null, customerId: string | null,
  patch: Record<string, unknown>,
) {
  if (orgId) {
    const { error, count } = await admin.from("sv_organizations")
      .update(patch, { count: "exact" }).eq("id", orgId);
    if (!error && (count ?? 0) > 0) return;
  }
  if (customerId) {
    await admin.from("sv_organizations").update(patch).eq("stripe_customer_id", customerId);
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const sig = req.headers.get("stripe-signature");
  const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  const raw = await req.text();
  if (!sig || !secret) return new Response("Missing signature/secret", { status: 400 });

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(raw, sig, secret, undefined, cryptoProvider);
  } catch (e) {
    console.error("[webhook] signature verification failed:", String(e));
    return new Response("Invalid signature", { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const s = event.data.object as Stripe.Checkout.Session;
        const orgId = (s.metadata?.org_id as string) || (s.client_reference_id as string) || null;
        const customerId = (s.customer as string) || null;
        const subId = (s.subscription as string) || null;
        // The subscription object carries the authoritative status. If we can't
        // retrieve it (transient error, or a synthetic test event with a fake
        // sub id), default to 'active' — checkout completing already means paid.
        let status = "active";
        if (subId) {
          try {
            const sub = await stripe.subscriptions.retrieve(subId);
            status = mapStatus(sub.status);
          } catch (e) {
            console.warn("[webhook] subscription retrieve failed, defaulting active:", subId, String(e));
          }
        }
        await updateOrg(orgId, customerId, {
          subscription_status: status, stripe_subscription_id: subId, stripe_customer_id: customerId,
        });
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        await updateOrg((sub.metadata?.org_id as string) || null, (sub.customer as string) || null, {
          subscription_status: mapStatus(sub.status), stripe_subscription_id: sub.id,
        });
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        await updateOrg((sub.metadata?.org_id as string) || null, (sub.customer as string) || null, {
          subscription_status: "canceled",
        });
        break;
      }
      default:
        break; // ignore everything else
    }
  } catch (e) {
    console.error("[webhook] handler error:", String(e));
    return new Response("Handler error", { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200, headers: { "Content-Type": "application/json" },
  });
});
