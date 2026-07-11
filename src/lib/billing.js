// Solo self-serve billing helpers.
//
// A solo org (is_solo) starts on a 14-day trial (subscription_status 'trialing',
// trial_ends_at in the future). When the trial lapses without an active
// subscription — or the subscription is canceled / past_due — the app shows a
// paywall. Everything here FAILS OPEN: if we don't positively know an org is a
// lapsed solo org, we never block. Agencies (is_solo false) are never paywalled.

const DAY = 86_400_000

// LIVE-BILLING SWITCH. While false, real subscription checkout is NOT offered
// anywhere and no solo user is ever paywalled — signups + free trials work fully,
// but nobody can hit Stripe checkout (which is still on the TEST key pre-cutover).
// FLIP TO true at the live-Stripe cutover (live key + live webhook set), rebuild,
// and redeploy — that turns on the Subscribe buttons and the trial-end paywall.
export const BILLING_LIVE = false

// Displayed solo price. Keep in sync with the server's SOLO_PRICE_CENTS env on
// the create-subscription-checkout function (3900 = $39). Single knob for the UI.
export const SOLO_PRICE = '$39'
export const SOLO_PRICE_SUFFIX = '/mo'

// Normalize an org row's billing fields into a single state object the UI uses.
export function billingState(org) {
  const isSolo = !!org?.is_solo
  const status = org?.subscription_status || null // trialing | active | past_due | canceled | null
  const trialEnd = org?.trial_ends_at ? new Date(org.trial_ends_at) : null
  const now = Date.now()

  const active = status === 'active'
  const trialing = status === 'trialing'
  const trialMsLeft = trialEnd ? trialEnd.getTime() - now : null
  const trialDaysLeft = trialMsLeft != null ? Math.max(0, Math.ceil(trialMsLeft / DAY)) : null
  const trialExpired = trialing && trialEnd != null && trialEnd.getTime() < now

  // Block only when we KNOW this is a solo org that has lost access — AND billing
  // is live. Before the live-Stripe cutover we never lock anyone out (there'd be
  // no working way for them to pay), so trials effectively fail open.
  const needsPaywall = BILLING_LIVE &&
    isSolo && !active && (trialExpired || status === 'canceled' || status === 'past_due')

  // Gentle nudge while still on an active trial.
  const showTrialBanner = isSolo && trialing && !trialExpired && trialDaysLeft != null

  return {
    isSolo, status, active, trialing, trialEnd, trialDaysLeft, trialExpired,
    needsPaywall, showTrialBanner,
  }
}

// Kick off Stripe Checkout for the solo subscription. The edge function creates
// (or reuses) the price + customer server-side and returns a hosted Checkout URL;
// we just redirect there. Throws with a user-safe message on failure.
export async function startSoloCheckout(supabase) {
  if (!BILLING_LIVE) {
    // Pre-cutover safety net — the UI shouldn't surface a checkout button while
    // billing is off, but never let a stray call hit the test-mode checkout.
    throw new Error('Subscriptions open soon — your free trial is active in the meantime.')
  }
  const { data, error } = await supabase.functions.invoke('create-subscription-checkout', {
    body: { return_path: '/subscription' },
  })
  if (error) {
    let body = {}
    try { body = await error.context.json() } catch { /* not json */ }
    throw new Error(body.error || error.message || 'Could not start checkout.')
  }
  if (data?.error) throw new Error(data.error)
  if (!data?.url) throw new Error('Checkout did not return a URL.')
  window.location.assign(data.url)
}
