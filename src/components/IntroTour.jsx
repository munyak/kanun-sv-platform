import React, { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import './introTour.css'

/*
  IntroTour — first-login walkthrough.
  Shows once per user per device (localStorage flag), role-aware content.
  Pure overlay: no DOM anchoring, no changes to existing pages or styles.css.
*/

const MONITOR_STEPS = [
  {
    icon: '👋',
    title: 'Welcome to KaNun Monitoring',
    body: 'This is your monitor portal. Everything you need before, during, and after a supervised visit lives here.',
  },
  {
    icon: '📅',
    title: 'Your schedule',
    body: 'The Schedule tab shows visits assigned to you. Tap a visit to open the guided workflow.',
  },
  {
    icon: '🧭',
    title: 'Guided visit workflow',
    body: 'Each visit walks you through four phases: Pre-visit checks → Arrival → Active monitoring → Closeout. Check-in and check-out capture GPS automatically.',
  },
  {
    icon: '🎙️',
    title: 'Hands-free notes',
    body: 'During a visit, tap the Voice button to dictate observations, and use the quick flags for Standard 5.20 incident categories. Every entry is timestamped for the court report.',
  },
  {
    icon: '📲',
    title: 'Add this app to your phone',
    body: 'In Safari tap Share → "Add to Home Screen" (Chrome: ⋮ → "Add to Home Screen"). KaNun opens full-screen like a native app — fastest way to check in at a visit.',
  },
]

const OWNER_STEPS = [
  {
    icon: '👋',
    title: 'Welcome to KaNun Monitoring',
    body: 'Your agency command center for supervised visitation — cases, visits, monitors, reports, and billing in one place.',
  },
  {
    icon: '📁',
    title: 'Cases first',
    body: 'Create a case with parties, children, and court conditions. Everything else — visits and reports — hangs off the case.',
  },
  {
    icon: '📅',
    title: 'Schedule visits',
    body: 'Book visits on the Schedule tab and assign a monitor. Monitors see assigned visits in their own portal.',
  },
  {
    icon: '🧾',
    title: 'Court-ready reports',
    body: 'After each visit the monitor’s timestamped observations become a Standard 5.20-compliant report you can review under Reports.',
  },
  {
    icon: '💳',
    title: 'Billing & team',
    body: 'Track invoices and aging under Billing. Invite monitors from the Team or Monitors page — they’ll get the right access automatically.',
  },
]

export default function IntroTour() {
  const { user, role } = useAuth()
  const [step, setStep] = useState(0)
  const [open, setOpen] = useState(false)

  const storageKey = user ? `kanun_tour_seen_${user.id}` : null
  const steps = useMemo(
    () => (role === 'monitor' ? MONITOR_STEPS : OWNER_STEPS),
    [role]
  )

  useEffect(() => {
    if (!storageKey) return
    try {
      if (!localStorage.getItem(storageKey)) setOpen(true)
    } catch (_) { /* storage unavailable — skip tour */ }
  }, [storageKey])

  function dismiss() {
    setOpen(false)
    try { storageKey && localStorage.setItem(storageKey, new Date().toISOString()) } catch (_) {}
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
