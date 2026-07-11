# Self-serve Solo Monitor tier — deploy checklist

Branch: `feature/solo-self-serve`. Everything below is built, type-clean, and the
signup path was tested live end-to-end (a test solo account was created and then
deleted). Deploys are yours to run.

## What this ships
A solo monitor can sign up at **`/start`** with no agency and no admin approval,
land in the app instantly on a **14-day free trial (no card)**, and is prompted to
**subscribe at $39/mo** via Stripe Checkout when the trial ends. A paywall replaces
the app only after the trial lapses; their data is preserved.

## Two decisions I defaulted (change if you disagree)
1. **Price = $39/mo.** One knob each side:
   - UI: `SOLO_PRICE` in `src/lib/billing.js`
   - Server: `SOLO_PRICE_CENTS` env on the checkout function (default 3900)
2. **Trial-first, no card.** Signup collects no payment; card is only taken at the
   end-of-trial paywall. (Matches the "no card to start" copy on `/start`.)

## Deploy steps

### 1. DB migration (0023 already applied; 0024 is new)
```bash
# Apply db/migrations/0024_solo_stripe_customer.sql (adds sv_organizations.stripe_customer_id)
# via Supabase SQL editor or CLI. Additive + nullable — safe.
```

### 2. Function secrets (Supabase → project yxhwcicxarfmptwivkdu)
- `STRIPE_SECRET_KEY` — already set (currently a **test** key; swap to live for real charges)
- `STRIPE_WEBHOOK_SECRET` — **NEW**, get it in step 4
- `SOLO_PRICE_CENTS` — optional, default 3900
- `APP_BASE_URL` — optional, default `https://kanunmonitoring.com`

### 3. Deploy the functions
```bash
cd ~/kanun-sv-platform
export SUPABASE_ACCESS_TOKEN=...   # (keychain: security find-generic-password -s "Supabase CLI" -a supabase -w | ... base64 -d)
supabase functions deploy create-subscription-checkout --project-ref yxhwcicxarfmptwivkdu   # authed (JWT on)
supabase functions deploy stripe-subscription-webhook --no-verify-jwt --project-ref yxhwcicxarfmptwivkdu
# solo-signup is already deployed (--no-verify-jwt)
```

### 4. Register the Stripe webhook
URL: `https://yxhwcicxarfmptwivkdu.supabase.co/functions/v1/stripe-subscription-webhook`
Events: `checkout.session.completed`, `customer.subscription.created`,
`customer.subscription.updated`, `customer.subscription.deleted`. Copy the
**Signing secret** → set as `STRIPE_WEBHOOK_SECRET` (step 2), then redeploy the
webhook function once so it picks up the secret.

**DEPLOYED 2026-07-10 (test mode):**
- ✅ Migration 0023 + **0024** applied to live DB (`stripe_customer_id` present).
- ✅ Functions deployed: `solo-signup`, `create-subscription-checkout` (JWT on),
  `stripe-subscription-webhook` (--no-verify-jwt).
- ✅ **Checkout path smoke-tested end-to-end** — create-subscription-checkout
  returns a real `cs_test_…` Checkout URL, auto-created the "KaNun Solo Monitor"
  $39/mo price (lookup_key `kanun_solo_monthly`) in the sandbox, created a
  customer, wrote `stripe_customer_id`. (One orphaned test customer
  `cus_UrHOsD5QWQnCng` left in the sandbox — harmless test data.)
- ✅ **`STRIPE_WEBHOOK_SECRET` SET (test) + webhook VERIFIED** — valid-signature
  event → 200, forged signature → 400, and a signed `checkout.session.completed`
  flipped a test org `trialing → active` with the customer id synced. Webhook
  handler hardened to default 'active' if the subscription retrieve fails.
  **THE FULL TEST-MODE LOOP (signup → trial → checkout → webhook → active) IS
  PROVEN.**
- 🐛 **FIXED 2026-07-10:** the `/start` route + `SoloSignup` import were missing
  from `src/App.jsx` (lost in the earlier stash) — `/start` fell through to the
  catch-all → `/`. Re-added the public route; verified rendering on a Netlify
  draft. `/subscription` route confirmed present too.
- 🔎 **Preview (draft) deployed for testing:**
  `https://6a50aeb1137597d8ebe6fc11--kanun-monitoring-archive.netlify.app/start`
  (draft only — NOT production. Note: signups here create REAL rows in the prod
  Supabase and checkout runs in Stripe TEST mode — use card 4242 4242 4242 4242.)
- ⏳ **Frontend `/start` intentionally NOT deployed to PROD** — holding until live Stripe
  is active so real signups don't hit a test-only checkout dead-end. Deploy it
  together with the live cutover.

**STATUS (2026-07-09):**
- ✅ **TEST/sandbox webhook DONE** — created in the KaNun Monitoring sandbox
  (`acct_1Tq7oDAzvdzRI1EE`), name `kanun-solo-subscription`, id
  `we_1TrTXNAzvdzRI1EEkdi5289U`, Active, all 4 events, "Your account" scope.
  Matches the deployed `sk_test_…` key. Still need to reveal its signing secret
  (👁 on the webhook page) → set `STRIPE_WEBHOOK_SECRET`, then deploy the fns.
- ⛔ **LIVE webhook BLOCKED on account activation.** The live account
  (`acct_1Tq7o4Bryn2IZeeR`) shows "Verify your business" — Stripe blocks all live
  resource creation until business verification (bank + tax ID + identity) is
  complete. Munya must finish activation himself (can't be automated — sensitive
  personal/financial data). AFTER activation: register the SAME webhook in Live
  mode, set `STRIPE_WEBHOOK_SECRET` to the **live** signing secret, and swap
  `STRIPE_SECRET_KEY` to the `sk_live_…` key.
  - **UPDATE 2026-07-10:** Munya registered **Kanun Monitoring LLC** (approval
    expected ~2026-07-11). This is the intended Stripe payout entity — at
    activation choose "Create a new account" / the new LLC (NOT the pre-selected
    VibeQA or Sip&Seared). Needs the LLC's EIN + a business bank account. Once
    activated → ping to register the live webhook (~2 min).

### 5. Deploy the frontend
```bash
cd ~/kanun-sv-platform && npm run build && netlify deploy --prod
```

### 6. Smoke test (test mode)
- Visit `/start`, create an account → lands in app, trial banner shows "14 days left".
- Click Subscribe → Stripe Checkout (use test card 4242 4242 4242 4242) → returns to
  `/subscription?status=success` → status flips to **Active** (webhook fired).

## Design + deploy-durability notes (2026-07-10)
- ✅ **`/start` redesigned** to match the site — now reuses `pilot.css` / `pa-*`
  classes (same animated split-screen hero + card as `/apply`), added a
  `.pa-field-row` rule for the first/last-name row. Previewed & verified.
- ⚠️ **Durability:** the whole solo tier is **uncommitted** on top of `main`
  (branch `feature/solo-self-serve` == `main` commit `aa49b37`; all changes are
  working-tree only). A manual `netlify deploy --prod` would ship it, BUT if
  Netlify auto-deploys from GitHub `main`, the next push to `main` would rebuild
  WITHOUT these changes and revert prod. **For a durable prod deploy: commit the
  solo-tier files + push to the branch prod deploys from, THEN build + deploy.**
  Skip committing `.claude/` and `deno.lock`.
- 🔒 If deploying `/start` to prod BEFORE live Stripe: gate the early "Subscribe"
  button (trial banner / paywall) behind a `BILLING_LIVE` flag so a real user
  can't hit test-mode checkout. Flip the flag on at the live cutover.

## Files
- Frontend: `src/pages/SoloSignup.jsx` (`/start`), `src/pages/Subscription.jsx`
  (`/subscription`), `src/components/TrialBanner.jsx`, `src/components/Paywall.jsx`,
  `src/lib/billing.js`; edits to `src/App.jsx`, `src/auth/AuthContext.jsx`,
  `src/components/AppShell.jsx`.
- Functions: `supabase/functions/solo-signup`, `.../create-subscription-checkout`,
  `.../stripe-subscription-webhook`.
- Migrations: `db/migrations/0023_solo_self_serve.sql`, `0024_solo_stripe_customer.sql`.

## Marketing hook
Point solo monitors to `kanunmonitoring.com/start`. This unblocks the ~half of
demand that is individual monitors who currently can't buy (the app was agency-gated).
