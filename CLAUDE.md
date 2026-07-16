# KaNun SV Platform — Claude Code Configuration

## Model Configuration

This project requires **Claude Opus** for complex reasoning on:
- Stripe integration & payment flows
- KaNun outreach & sales automation
- Strategic analysis & product decisions
- Multi-phase deployments

**Model:** `claude-opus-4-20250805`  
**Provider:** Anthropic  

Override: `hermes config set model anthropic claude-opus-4-20250805`

## Key Constraints

**DEPLOYMENT RULE:** Always test branch → staging approval → main. Incremental 1-change commits only. Netlify needs `--clear-cache` after every major change.

**Stripe Mode:** LIVE (real money). Test with Stripe test card `4242 4242 4242 4242` only when explicitly needed.

**Production Site:** https://kanunmonitoring.com (Netlify + Supabase backend)

## Project Structure

```
/src              — React/SPA frontend
/netlify          — Supabase Edge Functions (checkout, webhooks)
/db               — Database migrations
/docs             — Architecture & guides
package.json      — Dependencies (includes Stripe.js)
```

## Key Files

- `src/lib/billing.js` — Billing state management (BILLING_LIVE flag controls checkout)
- `netlify/functions/create-subscription-checkout.js` — Stripe checkout session creation
- `netlify/functions/stripe-subscription-webhook.js` — Event handling
- `SOLO_TIER_DEPLOY.md` — Deployment checklist & status

## Environment Variables (Supabase Secrets)

- `STRIPE_SECRET_KEY` — sk_live_… (live account acct_1Tq7o4Bryn2IZeeR)
- `STRIPE_WEBHOOK_SECRET` — Signing secret from Stripe Dashboard
- `SOLO_PRICE_CENTS` — Default 3900 ($39/month)
- `APP_BASE_URL` — Default https://kanunmonitoring.com

## Recent Updates

- **2026-07-11:** Flipped `BILLING_LIVE=true` in `src/lib/billing.js`
- **2026-07-10:** Deployed functions, registered test webhook, verified full flow
- **2026-07-08:** Built solo signup (`/start`), 14-day trial, checkout integration

## Next Steps

1. ✅ Flip BILLING_LIVE to true
2. 📋 Push to main & rebuild Netlify
3. 📋 Verify production checkout at https://kanunmonitoring.com/start
4. 📋 Monitor Stripe Dashboard for first real transactions

## Communication Style

- Geoffrey prefers concise, action-focused responses
- Wants data/content presented directly for review (not wrapped in reasoning)
- Appreciates immediate deliverables (drafts, diffs, options)
- Fast reader: gets to the point in first 1-2 sentences
- Solution-focused despite frustration with repeated failures

## Team

- **Geoffrey (User):** CEO, runs KaNun Monitoring
- **Claude Code (Agent):** Execution, development, automation
- **Note:** Maintain sync between Claude Code sessions and Hermes TUI
