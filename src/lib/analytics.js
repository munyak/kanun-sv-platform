/*
  Lightweight GA4 wrapper.
  Activates ONLY when VITE_GA_MEASUREMENT_ID is set (Netlify env var),
  so local dev and preview deploys stay untracked unless configured.

  Usage:
    initAnalytics()                 — once, on app mount
    trackPageView(path)             — SPA route changes
    trackEvent('sign_up', {...})    — conversions
*/

const GA_ID = import.meta.env.VITE_GA_MEASUREMENT_ID || null
let initialized = false

export function initAnalytics() {
  if (!GA_ID || initialized || typeof document === 'undefined') return
  initialized = true

  const s = document.createElement('script')
  s.async = true
  s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`
  document.head.appendChild(s)

  window.dataLayer = window.dataLayer || []
  window.gtag = function gtag() { window.dataLayer.push(arguments) }
  window.gtag('js', new Date())
  // SPA: we send page_view manually on route change
  window.gtag('config', GA_ID, { send_page_view: false })
}

export function trackPageView(path) {
  if (!GA_ID || !window.gtag) return
  window.gtag('event', 'page_view', {
    page_path: path,
    page_location: window.location.href,
  })
}

export function trackEvent(name, params = {}) {
  if (!GA_ID || !window.gtag) return
  window.gtag('event', name, params)
}

/* ── In-platform tester telemetry (Supabase) ──────────────────────────────
   Persists usage events + feedback to Supabase (separate from GA4) so
   platform admins can see what testers do inside the app. RLS lets users
   write only their own rows; platform admins read everything. Fire-and-forget
   — never blocks or throws into the UI. */
import { supabase } from '../supabase'

async function currentIds() {
  try {
    const { data } = await supabase.auth.getSession() // local, no network
    const uid = data?.session?.user?.id
    if (!uid) return null
    return { uid, org_id: localStorage.getItem('kanun.activeOrgId') || null }
  } catch { return null }
}

export async function logUsage(event, props = {}) {
  try {
    const ids = await currentIds()
    if (!ids) return
    await supabase.from('sv_usage_events').insert({
      user_id: ids.uid,
      org_id: ids.org_id,
      event,
      path: typeof location !== 'undefined' ? location.pathname : null,
      props,
    })
  } catch { /* fire and forget */ }
}

export async function logFeedback({ prompt, rating = null, comment = null, context = {} }) {
  try {
    const ids = await currentIds()
    if (!ids) return false
    const { error } = await supabase.from('sv_feedback').insert({
      user_id: ids.uid, org_id: ids.org_id, prompt, rating, comment, context,
    })
    return !error
  } catch { return false }
}
