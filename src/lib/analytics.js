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
