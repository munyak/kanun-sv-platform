# KaNun SV Platform — Shared Agent Operating File

Multiple AI agents work in this repo (Cowork/Claude sessions, Orca, others).
This file is the ONE shared source of truth. Every agent reads it before
working and updates it after shipping. Munya should never have to relay
state between agents.

## ⚠️ Coordination Protocol (mandatory for every agent)

1. **Before any work:** `git pull` and read `git log --oneline -10`. Another
   agent may have shipped since your last session.
2. **Before changing shared surfaces** (billing, auth, signup flows,
   netlify.toml, edge functions): re-read the relevant section below AND
   `SOLO_TIER_DEPLOY.md`. Do not act on this file's claims without checking
   the code — verify, then trust.
3. **After shipping:** update "Current State" and "Agent Log" below in the
   same commit (or an immediate follow-up).
4. **Commit style:** small commits with descriptive messages — commit
   messages are the inter-agent changelog. Push to `main` deploys to
   production via Netlify.
5. **Never** reintroduce founder-name attribution in marketing copy, revert
   the Ink & Seal design, or flip billing flags without the checklist in
   SOLO_TIER_DEPLOY.md being verifiably complete.

## Facts (corrects earlier errors in this file)

- **Founder/CEO:** Munya Kanaventi (KaNun Monitoring LLC, EIN 87-4488272).
  "Geoffrey" is the macOS user account / machine name, not a person's role.
- **Edge functions live in `supabase/functions/*/index.ts`** (Deno), NOT
  /netlify. There are no Netlify functions in this project.
- **Stack:** React+Vite SPA (`src/`) → Netlify site `kanun-monitoring-archive`
  → kanunmonitoring.com. Backend: Supabase project `yxhwcicxarfmptwivkdu`
  (DB, auth, edge functions). PWA service worker caches aggressively.
- **Routes:** `/` + `/apply` = agency pilot application (gated).
  `/start` = solo self-serve signup (14-day trial). `/welcome` = marketing
  chooser. Aliases: `/monitor` → /start, `/agency` → /apply.

## Current State (update when you change it)

- **Design:** entire public site + auth on the "Ink & Seal" system
  (`src/pages/inkseal.css`, `docs/BRAND-INK-AND-SEAL.md`). Marketing copy is
  team-attributed and jurisdiction-neutral (CA 5.20 = proof point, not scope).
- **Onboarding:** split flows — solo (5 steps, practice-framed) vs agency
  (6 steps). Courts step is state-aware (state dropdown + LA curated list +
  free-entry chips). Solo in-app: Monitors/Team nav hidden, solo tour, solo
  dashboard checklist (`isSolo` on AuthContext).
- **Standards:** `src/lib/courtStandards.js` — verified state citations
  (CA/FL/MN/UT) + SVN Practice Standards fallback. Add states only with
  verified primary sources — never fabricate legal citations.
- **BILLING — ⚠️ UNVERIFIED LIVE STATE:** `BILLING_LIVE=true` was flipped
  (commit a51783c, 2026-07-16) and is deployed, so trial-end paywalls are
  ENFORCED. NOT verified: (1) STRIPE_SECRET_KEY on Supabase is sk_live,
  (2) a LIVE-mode webhook is registered with its signing secret set as
  STRIPE_WEBHOOK_SECRET, (3) Stripe business verification for
  acct_1Tq7o4Bryn2IZeeR is complete. Until Munya confirms all three in the
  Stripe dashboard, the risk is: customer pays → webhook never fires → org
  stays trialing → paying customer hits the paywall. Earliest trial
  expiries ~2026-07-25. If in doubt, flip BILLING_LIVE=false (fail-open)
  and redeploy.
- **SEO:** netlify.toml still sets `X-Robots-Tag: noindex` site-wide —
  intentional during the private pilot; remove at public launch.

## Lanes (to avoid collisions)

- **Product, site, design, onboarding, standards:** Cowork Claude.
- **Outreach/sales automation + Stripe cutover execution:** Orca / local
  sessions — but any billing-flag change follows the SOLO_TIER_DEPLOY.md
  checklist and must be logged below.
- Cross-lane work: leave an Agent Log note; prefer small, reviewable commits.

## Agent Log (append newest first: date · agent · what/why)

- 2026-07-16 · Cowork Claude · Rewrote this file as the shared operating
  doc; corrected factual errors (functions path, roles). Shipped: national
  court-standards module, solo-aware app experience, solo/agency onboarding
  split, /monitor + /agency aliases.
- 2026-07-16 · Orca/local · Flipped BILLING_LIVE=true (a51783c) + original
  CLAUDE.md (ce59384). Live-Stripe prerequisites not confirmed in repo —
  see BILLING above.
- 2026-07-11..16 · Cowork Claude · Ink & Seal redesign of /, /apply, /start,
  /welcome, auth shell; brand skill + docs/BRAND-INK-AND-SEAL.md.
- 2026-07-10..11 · earlier session · Solo tier built; test-mode Stripe loop
  proven end-to-end (see SOLO_TIER_DEPLOY.md).

## Key Files

- `src/lib/billing.js` — BILLING_LIVE flag (fail-open when false)
- `src/lib/courtStandards.js` — state → court-standard mapping
- `src/pages/inkseal.css` — brand system (see docs/BRAND-INK-AND-SEAL.md)
- `supabase/functions/` — solo-signup, pilot-apply, create-subscription-
  checkout, stripe-subscription-webhook, invite-monitor, …
- `SOLO_TIER_DEPLOY.md` — billing cutover checklist & deploy history
