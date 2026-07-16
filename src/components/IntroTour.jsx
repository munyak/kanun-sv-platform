import React, { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../supabase'
import './introTour.css'

/*
  IntroTour — first-login welcome walkthrough.

  A lightweight, role-aware product tour shown once to every new user right
  after they first sign in — the "welcome moment" in the SaaS onboarding
  playbook (Pendo / Appcues / Intercom). It:
    • greets them and frames what the product does,
    • walks the 3–5 key first actions for THEIR role,
    • prompts adding the app to the home screen (PWA),
    • is fully skippable, and
    • is shown ONCE PER USER — persisted to the user's Supabase profile
      (user_metadata) so it doesn't repeat on a new device/browser, with a
      localStorage fast-path so it never flashes twice on the same device.

  It hands off to the always-available "Get started" checklist on the
  dashboard (OnboardingChecklist for owners, MonitorOnboarding for monitors),
  which tracks the same first actions and completes itself from live data.

  Pure overlay: no DOM anchoring, no changes to existing pages or styles.css.
*/

const TOUR_META_KEY = 'kanun_tour_completed_at'

const MONITOR_STEPS = [
  {
    icon: '👋',
    title: 'Welcome to KaNun Monitoring',
    body: 'This is your monitor portal. Everything you need before, during, and after a supervised visit lives here — on your phone.',
  },
  {
    icon: '📲',
    title: 'Add this app to your phone',
    body: 'On iPhone: in Safari tap Share → “Add to Home Screen”. On Android: in Chrome tap ⋮ → “Install app”. KaNun then opens full-screen like a normal app — the fastest way to check in at a visit.',
  },
  {
    icon: '👤',
    title: 'Finish your profile',
    body: 'Add your availability, service areas, and certifications under My Profile. Your agency uses this to assign you the right visits.',
  },
  {
    icon: '📅',
    title: 'See your assigned visits',
    body: 'The My Visits tab shows the visits your agency schedules for you. Tap one to open the guided, step-by-step workflow.',
  },
  {
    icon: '🎙️',
    title: 'Notes are hands-free',
    body: 'During a visit, tap Voice to dictate observations and use the quick flags for Standard 5.20 incidents. Check-in and check-out capture GPS automatically, and every entry is timestamped for the court report.',
  },
]

const OWNER_STEPS = [
  {
    icon: '👋',
    title: 'Welcome to KaNun Monitoring',
    body: 'Your agency command center for supervised visitation — cases, visits, monitors, reports, and billing in one place. Here are the first few things to set up.',
  },
  {
    icon: '📁',
    title: 'Create your first case',
    body: 'Run a guided intake to capture the case, parties, children, and court conditions. Everything else — visits and reports — hangs off the case.',
  },
  {
    icon: '🧑‍🤝‍🧑',
    title: 'Add a monitor',
    body: 'Invite a monitor by email from the Monitors page. They get a plain-language email with sign-up and app-install steps, and are linked to your agency automatically when they join.',
  },
  {
    icon: '📅',
    title: 'Schedule a visit',
    body: 'Book a visit on the Schedule tab and assign a monitor. Parents get a portal link automatically, and the monitor sees it in their own portal.',
  },
  {
    icon: '🎓',
    title: 'Explore the Academy',
    body: 'Built-in training toward KaNun Certified Monitor for you and your team. After each visit, the monitor’s timestamped notes become a Standard 5.20 report you review under Reports.',
  },
  {
    icon: '✅',
    title: 'Your checklist is on the dashboard',
    body: 'A “Get started” checklist on your dashboard tracks these first steps and checks them off automatically as you go. You can always pick up where you left off there.',
  },
]

const SOLO_STEPS = [
  {
    icon: '👋',
    title: 'Welcome to KaNun Monitoring',
    body: 'Your practice in one place — cases, visits, court-ready reports, and billing. You run the visit; the record writes itself. Here are the first things to set up.',
  },
  {
    icon: '📲',
    title: 'Add this app to your phone',
    body: 'On iPhone: in Safari tap Share → “Add to Home Screen”. On Android: in Chrome tap ⋮ → “Install app”. KaNun then opens full-screen like a normal app — the fastest way to check in at a visit.',
  },
  {
    icon: '📁',
    title: 'Create your first case',
    body: 'Run a guided intake to capture the case, parties, children, and court conditions. Everything else — visits and reports — hangs off the case.',
  },
  {
    icon: '📅',
    title: 'Schedule a visit',
    body: 'Book a visit on the Schedule tab. Parents get a portal link automatically, and the guided visit workflow is ready on your phone when you arrive.',
  },
  {
    icon: '🎙️',
    title: 'Run it hands-free',
    body: 'Check-in and check-out capture GPS automatically. Dictate observations with Voice, use the quick incident flags, and your timestamped notes become a court-ready report under Reports.',
  },
  {
    icon: '✅',
    title: 'Your checklist is on the dashboard',
    body: 'A “Get started” checklist on your dashboard tracks these first steps and checks them off automatically as you go. You can always pick up where you left off there.',
  },
]

export default function IntroTour() {
  const { user, role, isSolo } = useAuth()
  const [step, setStep] = useState(0)
  const [open, setOpen] = useState(false)

  const storageKey = user ? `kanun_tour_seen_${user.id}` : null
  const steps = useMemo(
    () => (role === 'monitor' ? MONITOR_STEPS : isSolo ? SOLO_STEPS : OWNER_STEPS),
    [role, isSolo]
  )

  useEffect(() => {
    if (!user) return
    // Already completed on this device? Don't even flash the modal.
    try {
      if (storageKey && localStorage.getItem(storageKey)) return
    } catch (_) { /* storage unavailable */ }
    // Already completed on ANY device? The flag lives on the user's profile.
    if (user.user_metadata?.[TOUR_META_KEY]) {
      // Mirror it locally so future loads skip the storage lookup miss.
      try { storageKey && localStorage.setItem(storageKey, user.user_metadata[TOUR_META_KEY]) } catch (_) {}
      return
    }
    setOpen(true)
  }, [user, storageKey])

  function dismiss() {
    setOpen(false)
    const now = new Date().toISOString()
    try { storageKey && localStorage.setItem(storageKey, now) } catch (_) {}
    // Persist per-user so the welcome tour doesn't repeat on another device.
    // Fire-and-forget — a failure just means it may show once more elsewhere.
    try {
      supabase.auth.updateUser({ data: { [TOUR_META_KEY]: now } }).catch(() => {})
    } catch (_) { /* no session — ignore */ }
  }

  if (!open || !user) return null
  const s = steps[step]
  const last = step === steps.length - 1

  return (
    <div className="tour-backdrop" role="dialog" aria-modal="true" aria-label="Getting started tour">
      <div className="tour-card">
        <div className="tour-icon" aria-hidden="true">{s.icon}</div>
        <div className="tour-title">{s.title}</div>
        <div className="tour-body">{s.body}</div>

        <div className="tour-dots" aria-hidden="true">
          {steps.map((_, i) => (
            <span key={i} className={`tour-dot ${i === step ? 'active' : ''}`} />
          ))}
        </div>

        <div className="tour-actions">
          <button type="button" className="btn btn-secondary btn-sm" onClick={dismiss}>
            Skip
          </button>
          <div className="tour-actions-right">
            {step > 0 && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setStep(step - 1)}>
                Back
              </button>
            )}
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => (last ? dismiss() : setStep(step + 1))}
            >
              {last ? 'Get started' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
