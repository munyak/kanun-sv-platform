import React, { useState, useEffect, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../supabase'
import './pilot.css'

// Self-serve signup for individual (solo) monitors — no agency, no approval.
// Creates the account + a 14-day trial via the solo-signup function, then signs
// them straight in. Shares the pilot-apply visual shell (pilot.css / pa-* classes)
// so it matches the rest of the site; only the copy and the (shorter) form differ.

// Audience words that rotate in the headline, same motion cue as /apply.
const ROTATE = ['solo monitors', 'private practice', 'independent pros', 'your caseload', 'you']

// Trust signals that drift across the hero marquee.
const MARQUEE = [
  'California Standard 5.20', 'Court-ready exports', 'GPS-verified check-ins',
  'Tamper-evident logs', 'End-to-end encrypted', 'No agency required',
]

export default function SoloSignup() {
  const nav = useNavigate()
  const [form, setForm] = useState({ first_name: '', last_name: '', email: '', password: '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [wi, setWi] = useState(0)
  const heroRef = useRef(null)

  // Rotate the audience word in the headline.
  useEffect(() => {
    const id = setInterval(() => setWi((i) => (i + 1) % ROTATE.length), 2200)
    return () => clearInterval(id)
  }, [])

  // Pointer-driven parallax on the hero (disabled for reduced-motion / touch).
  useEffect(() => {
    const el = heroRef.current
    if (!el) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    if (!window.matchMedia('(pointer: fine)').matches) return
    let raf = 0
    const onMove = (e) => {
      const r = el.getBoundingClientRect()
      const x = (e.clientX - r.left) / r.width - 0.5
      const y = (e.clientY - r.top) / r.height - 0.5
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        el.style.setProperty('--mx', x.toFixed(3))
        el.style.setProperty('--my', y.toFixed(3))
      })
    }
    const reset = () => { el.style.setProperty('--mx', '0'); el.style.setProperty('--my', '0') }
    el.addEventListener('mousemove', onMove)
    el.addEventListener('mouseleave', reset)
    return () => {
      el.removeEventListener('mousemove', onMove)
      el.removeEventListener('mouseleave', reset)
      cancelAnimationFrame(raf)
    }
  }, [])

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  async function submit(e) {
    e.preventDefault()
    setErr(null)
    if (!form.first_name.trim()) { setErr('Please tell us your first name.'); return }
    if (form.password.length < 8) { setErr('Password must be at least 8 characters.'); return }
    setBusy(true)
    try {
      const { data, error } = await supabase.functions.invoke('solo-signup', { body: form })
      if (error) {
        let body = {}
        try { body = await error.context.json() } catch { /* not json */ }
        if (body.existing) { setErr('You already have an account — sign in instead.'); setBusy(false); return }
        throw new Error(body.error || error.message)
      }
      if (data?.error) throw new Error(data.error)
      // Sign them straight in, then into onboarding.
      const { error: sErr } = await supabase.auth.signInWithPassword({ email: form.email, password: form.password })
      if (sErr) { nav('/login'); return }
      nav('/onboarding')
    } catch (e) {
      setErr(e.message || 'Could not create your account.'); setBusy(false)
    }
  }

  return (
    <div className="pa-page">
      <div className="pa-hero" ref={heroRef}>
        {/* layered animated branded backdrop */}
        <div className="pa-hero-bg" aria-hidden="true">
          <span className="pa-aurora" />
          <span className="pa-blob pa-blob-1" />
          <span className="pa-blob pa-blob-2" />
          <span className="pa-blob pa-blob-3" />
          <span className="pa-grid-overlay" />
          <span className="pa-spotlight" />
          <span className="pa-grain" />
        </div>

        {/* signature visual: pinging "live monitoring" radar */}
        <div className="pa-visual" aria-hidden="true">
          <span className="pa-ping">
            <span className="pa-ping-ring" />
            <span className="pa-ping-ring pa-ping-ring-2" />
            <span className="pa-ping-ring pa-ping-ring-3" />
            <span className="pa-ping-core" />
          </span>
        </div>

        <div className="pa-hero-inner">
          <div className="pa-brand">
            <span className="pa-brand-mark">KW<span className="pa-brand-orbit" /></span>
            KaNun Monitoring
          </div>

          <div className="pa-eyebrow"><span className="pa-dot" /> Solo plan · start free</div>

          <h1 className="pa-headline">
            The supervised-visitation<br />
            platform for{' '}
            <span className="pa-rotator">
              <span key={wi} className="pa-rotator-word pa-grad">{ROTATE[wi]}</span>
            </span>
          </h1>

          <p className="pa-sub">
            Guided visit workflows, GPS-verified check-ins, voice notes, and court-ready
            California&nbsp;Standard&nbsp;5.20 reports in minutes. No agency required —
            start free in about a minute.
          </p>

          <div className="pa-hero-ctas">
            <a href="#start-form" className="pa-btn pa-btn-primary pa-btn-hero pa-cta-shine"
               onClick={(e) => { e.preventDefault(); document.getElementById('start-form')?.scrollIntoView({ behavior: 'smooth' }); document.getElementById('solo-first-input')?.focus() }}>
              Start free — no card
              <svg className="pa-arrow" width="18" height="18" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </a>
            <Link to="/login" className="pa-hero-signin">Already have an account? Sign in</Link>
          </div>

          <div className="pa-microcopy">✦ 14 days free · no credit card to start · cancel anytime</div>

          {/* drifting trust marquee */}
          <div className="pa-marquee" aria-hidden="true">
            <div className="pa-marquee-track">
              {[...MARQUEE, ...MARQUEE].map((m, i) => (
                <span className="pa-marquee-item" key={i}><span className="pa-marquee-dot" /> {m}</span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="pa-formwrap">
        <div className="pa-card" id="start-form">
          <div className="pa-card-head">
            <h2>Start your free trial</h2>
            <span className="pa-card-badge">~1 min</span>
          </div>
          <p className="pa-muted">Court-ready visit reports in 5 minutes, not 45. No agency required, no card to start.</p>
          <form onSubmit={submit} className="pa-form" noValidate>
            <div className="pa-field-row">
              <label className="pa-field">
                <span>First name *</span>
                <input id="solo-first-input" required value={form.first_name} onChange={set('first_name')}
                  autoComplete="given-name" placeholder="Jordan" />
              </label>
              <label className="pa-field">
                <span>Last name</span>
                <input value={form.last_name} onChange={set('last_name')}
                  autoComplete="family-name" placeholder="Rivera" />
              </label>
            </div>

            <label className="pa-field">
              <span>Email *</span>
              <input type="email" required value={form.email} onChange={set('email')} autoComplete="email"
                placeholder="you@email.com" />
            </label>

            <label className="pa-field">
              <span>Choose a password *</span>
              <input type="password" required minLength={8} value={form.password}
                onChange={set('password')} autoComplete="new-password" placeholder="At least 8 characters" />
              <small>You’ll be signed straight in — no approval needed.</small>
            </label>

            {err && <div className="pa-error">{err}</div>}

            <button className="pa-btn pa-btn-primary pa-btn-submit pa-cta-shine" disabled={busy}>
              {busy ? <span className="pa-spin" aria-hidden="true" /> : null}
              {busy ? 'Creating your account…' : 'Start my free trial'}
            </button>

            <p className="pa-foot">
              Already have an account? <Link to="/login">Sign in</Link>
            </p>
            <p className="pa-foot">
              Running an agency with multiple monitors? <Link to="/apply">Apply for the agency pilot</Link>.
            </p>
          </form>
        </div>
      </div>
    </div>
  )
}
