import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabase'
import { trackEvent } from '../lib/analytics'
import './pilot.css'

/*
  Public pilot-tester splash + application form. This is the front door at
  kanunmonitoring.com for logged-out visitors. Submissions create a PENDING
  record (and a gated, unconfirmed account) via the `pilot-apply` Edge Function
  — applicants cannot sign in until Munya approves them.
*/

const ROLES = [
  { value: 'parent', label: 'Parent', hint: 'A parent in a supervised-visitation arrangement' },
  { value: 'monitor', label: 'Monitor / Agency', hint: 'A professional monitor or visitation agency' },
  { value: 'court', label: 'Court / Legal', hint: 'Court staff, attorney, or court liaison' },
]

const COURT_OPTIONS = [
  { value: '', label: 'Select…' },
  { value: 'court_ordered', label: 'Court-ordered visitation' },
  { value: 'provider', label: 'Provider / agency (we run visits)' },
  { value: 'both', label: 'Both' },
  { value: 'unsure', label: 'Not sure yet' },
]

export default function PilotApply() {
  const [form, setForm] = useState({
    name: '', email: '', password: '', role: '',
    organization: '', jurisdiction: '', court_or_provider: '',
    use_case: '', how_heard: '', website: '', // website = honeypot
  })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [done, setDone] = useState(false)

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  async function submit(e) {
    e.preventDefault()
    setErr(null)
    if (!form.role) { setErr('Please choose your role.'); return }
    if (form.password.length < 8) { setErr('Password must be at least 8 characters.'); return }
    setBusy(true)
    try {
      const { data, error } = await supabase.functions.invoke('pilot-apply', { body: form })
      if (error) {
        // Edge function returned a non-2xx — surface its message if present.
        let msg = 'Something went wrong. Please try again.'
        try { const j = await error.context?.json?.(); if (j?.error) msg = j.error } catch { /* noop */ }
        throw new Error(msg)
      }
      if (data?.error) throw new Error(data.error)
      trackEvent('pilot_apply', { role: form.role })
      setDone(true)
    } catch (e) {
      setErr(e.message || 'Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  // OAuth sign-up/sign-in. New OAuth users don't bypass the gate: after the
  // provider round-trip they land in the same pending-approval state (the
  // pilot-gate function enqueues them) until Munya approves.
  async function oauth(provider) {
    setErr(null)
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: window.location.origin + '/auth/callback' },
      })
      if (error) throw error
    } catch (e) {
      setErr(e.message || `Could not continue with ${provider}.`)
    }
  }

  if (done) {
    return (
      <div className="pa-page">
        <div className="pa-card pa-thanks">
          <div className="pa-badge">✓</div>
          <h1>You're on the list</h1>
          <p>
            Thanks for your interest in the <strong>KaNun Monitoring</strong> pilot.
            We'll review your application and be in touch <strong>within one week</strong> to
            approve your access and activate your test account.
          </p>
          <p className="pa-muted">
            You can't sign in just yet — your account unlocks once we approve you.
          </p>
          <Link className="pa-btn pa-btn-ghost" to="/login">Go to sign in</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="pa-page">
      <div className="pa-hero">
        {/* animated branded backdrop */}
        <div className="pa-hero-bg" aria-hidden="true">
          <span className="pa-blob pa-blob-1" />
          <span className="pa-blob pa-blob-2" />
          <span className="pa-blob pa-blob-3" />
          <span className="pa-grid-overlay" />
        </div>

        <div className="pa-hero-inner">
          <div className="pa-brand"><span className="pa-brand-mark">KW</span> KaNun Monitoring</div>

          <div className="pa-eyebrow"><span className="pa-dot" /> Private pilot · now onboarding testers</div>

          <h1 className="pa-headline">
            The supervised-visitation platform,<br />
            <span className="pa-grad">built for the people who run visits.</span>
          </h1>

          <p className="pa-sub">
            We're inviting a small group of parents, monitors, and court professionals to put
            KaNun Monitoring through its paces — guided visit workflows, GPS-verified check-ins,
            voice notes, and court-ready California&nbsp;Standard&nbsp;5.20 reports in minutes.
          </p>

          <div className="pa-hero-ctas">
            <a href="#apply-form" className="pa-btn pa-btn-primary pa-btn-hero"
               onClick={(e) => { e.preventDefault(); document.getElementById('apply-form')?.scrollIntoView({ behavior: 'smooth' }) }}>
              Apply to the pilot →
            </a>
            <Link to="/login" className="pa-hero-signin">Already approved? Sign in</Link>
          </div>

          <div className="pa-chips">
            <span className="pa-chip">⚖️ Court-ready 5.20 reports</span>
            <span className="pa-chip">📍 GPS-verified check-ins</span>
            <span className="pa-chip">🎙️ Hands-free voice notes</span>
            <span className="pa-chip">🔒 Security-veteran built</span>
          </div>
        </div>
      </div>

      <div className="pa-card" id="apply-form">
        <h2>Request pilot access</h2>
        <p className="pa-muted">Takes about a minute. We approve testers individually.</p>
        <form onSubmit={submit} className="pa-form" noValidate>
          {/* honeypot */}
          <input type="text" name="website" tabIndex={-1} autoComplete="off"
            className="pa-hp" value={form.website} onChange={set('website')} aria-hidden="true" />

          <label className="pa-field">
            <span>Your name *</span>
            <input required value={form.name} onChange={set('name')} autoComplete="name" />
          </label>

          <label className="pa-field">
            <span>Email *</span>
            <input type="email" required value={form.email} onChange={set('email')} autoComplete="email" />
          </label>

          <label className="pa-field">
            <span>Choose a password *</span>
            <input type="password" required minLength={8} value={form.password}
              onChange={set('password')} autoComplete="new-password" />
            <small>At least 8 characters. We activate your account once you're approved.</small>
          </label>

          <fieldset className="pa-field pa-roles">
            <span>I am a… *</span>
            <div className="pa-role-grid">
              {ROLES.map((r) => (
                <button type="button" key={r.value}
                  className={`pa-role${form.role === r.value ? ' pa-role-on' : ''}`}
                  onClick={() => setForm((f) => ({ ...f, role: r.value }))}>
                  <strong>{r.label}</strong>
                  <small>{r.hint}</small>
                </button>
              ))}
            </div>
          </fieldset>

          <label className="pa-field">
            <span>Organization / agency</span>
            <input value={form.organization} onChange={set('organization')}
              placeholder="Agency, firm, court — or “self”" />
          </label>

          <label className="pa-field">
            <span>Jurisdiction / location</span>
            <input value={form.jurisdiction} onChange={set('jurisdiction')}
              placeholder="e.g. Los Angeles County, CA" />
          </label>

          <label className="pa-field">
            <span>Court-ordered or provider?</span>
            <select value={form.court_or_provider} onChange={set('court_or_provider')}>
              {COURT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>

          <label className="pa-field">
            <span>What do you want to test? / your use case</span>
            <textarea rows={3} value={form.use_case} onChange={set('use_case')}
              placeholder="e.g. running visits and generating reports for my agency" />
          </label>

          <label className="pa-field">
            <span>How did you hear about us?</span>
            <input value={form.how_heard} onChange={set('how_heard')}
              placeholder="Referral, search, court, social…" />
          </label>

          {err && <div className="pa-error">{err}</div>}

          <button className="pa-btn pa-btn-primary" disabled={busy}>
            {busy ? 'Submitting…' : 'Request pilot access'}
          </button>

          <div className="auth-divider"><span>or continue with</span></div>
          <div className="auth-social">
            <button type="button" className="btn-social" disabled={busy} onClick={() => oauth('google')}>
              <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
                <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"/>
                <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"/>
                <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z"/>
                <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"/>
              </svg>
              Google
            </button>
            <button type="button" className="btn-social" disabled={busy} onClick={() => oauth('facebook')}>
              <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
                <path fill="#1877F2" d="M18 9a9 9 0 1 0-10.41 8.89v-6.29H5.31V9h2.28V7.02c0-2.25 1.34-3.5 3.4-3.5.98 0 2.01.18 2.01.18v2.21h-1.13c-1.12 0-1.47.7-1.47 1.41V9h2.5l-.4 2.6h-2.1v6.29A9 9 0 0 0 18 9z"/>
              </svg>
              Facebook
            </button>
          </div>
          <p className="pa-foot" style={{ marginTop: 10 }}>
            Google/Facebook testers are approved the same way — you’ll be pending until reviewed.
          </p>

          <p className="pa-foot">
            Already approved? <Link to="/login">Sign in</Link>
          </p>
        </form>
      </div>
    </div>
  )
}
