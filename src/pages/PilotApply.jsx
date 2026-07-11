import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabase'
import { trackEvent } from '../lib/analytics'
import './inkseal.css'

/*
  Public pilot-tester splash + application form — "Ink & Seal" brand system.
  This is the front door at kanunmonitoring.com for logged-out visitors.
  Submissions create a PENDING record (and a gated, unconfirmed account) via
  the `pilot-apply` Edge Function — applicants cannot sign in until approved.
*/

const ROLES = [
  { value: 'monitor', label: 'Professional monitor', hint: 'Individual visitation monitor' },
  { value: 'agency', label: 'Agency / provider', hint: 'You run a program or roster' },
  { value: 'parent', label: 'Parent / family', hint: 'In a supervised arrangement' },
  { value: 'court', label: 'Court / legal', hint: 'Court staff, attorney, liaison' },
]

const COURT_OPTIONS = [
  { value: '', label: 'Select…' },
  { value: 'court_ordered', label: 'Court-ordered visitation' },
  { value: 'provider', label: 'Provider / agency (we run visits)' },
  { value: 'both', label: 'Both' },
  { value: 'unsure', label: 'Not sure yet' },
]

const TICKER = [
  'Private pilot — now reviewing applicants', 'Court-ready in your jurisdiction',
  'GPS-verified check-ins', 'Tamper-evident record', 'End-to-end encrypted',
]

// Scroll-reveal hook for .ik-rv elements.
function useReveal(deps = []) {
  useEffect(() => {
    const els = document.querySelectorAll('.ik-rv')
    if (!('IntersectionObserver' in window)) { els.forEach((el) => el.classList.add('ik-in')); return }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('ik-in'); io.unobserve(e.target) } })
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' })
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, deps) // eslint-disable-line react-hooks/exhaustive-deps
}

function Ticker() {
  return (
    <div className="ik-topline ik-mono" aria-hidden="true">
      <div className="ik-ticker">
        {[...TICKER, ...TICKER].map((t, i) => (
          <React.Fragment key={i}><span>{t}</span><b>✦</b></React.Fragment>
        ))}
      </div>
    </div>
  )
}

function Footer() {
  return (
    <footer className="ik-footer">
      <div className="ik-wrap">
        <svg className="ik-giant" viewBox="0 0 1240 132" aria-hidden="true" focusable="false">
          <text x="620" y="106" textAnchor="middle" fontSize="120" textLength="1220" lengthAdjust="spacingAndGlyphs">KANUN MONITORING</text>
        </svg>
        <div className="ik-footrow">
          <span className="ik-mono">© 2026 KaNun Monitoring · Los Angeles, CA</span>
          <span className="ik-mono">
            <Link to="/privacy">Privacy</Link>
            <Link to="/terms">Terms</Link>
            <a href="mailto:hello@kanunmonitoring.com">Contact</a>
          </span>
        </div>
      </div>
    </footer>
  )
}

export default function PilotApply() {
  const [form, setForm] = useState({
    name: '', email: '', password: '', role: '',
    organization: '', jurisdiction: '', court_or_provider: '',
    use_case: '', how_heard: '', website: '', // website = honeypot
  })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [done, setDone] = useState(false)

  useReveal([done])

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
        let msg = 'Something went wrong. Please try again.'
        try { const j = await error.context?.json?.(); if (j?.error) msg = j.error } catch { /* noop */ }
        throw new Error(msg)
      }
      if (data?.error) throw new Error(data.error)
      trackEvent('pilot_apply', { role: form.role })
      setDone(true)
      window.scrollTo({ top: 0 })
    } catch (e) {
      setErr(e.message || 'Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  // OAuth sign-up/sign-in. New OAuth users don't bypass the gate: they land in
  // the same pending-approval state until approved.
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

  const goApply = (e) => {
    e.preventDefault()
    document.getElementById('ik-apply')?.scrollIntoView({ behavior: 'smooth' })
    setTimeout(() => document.getElementById('ik-name-input')?.focus({ preventScroll: true }), 450)
  }

  if (done) {
    return (
      <div className="ik-page">
        <div className="ik-grain" aria-hidden="true" />
        <Ticker />
        <div className="ik-done">
          <div className="ik-donecard">
            <div className="ik-doneseal">
              <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </div>
            <h1>Application received.</h1>
            <p>
              Thanks for applying to the <b>KaNun Monitoring</b> pilot. We review every
              application personally and will be in touch <b>within one week</b> to
              activate your account.
            </p>
            <p>You can't sign in just yet — your account unlocks once you're approved.</p>
            <Link className="ik-btn ik-btn-ink" to="/login">Go to sign in</Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="ik-page">
      <div className="ik-grain" aria-hidden="true" />
      <Ticker />

      <nav className="ik-nav">
        <div className="ik-wrap ik-navrow">
          <Link to="/welcome" className="ik-wordmark">KaNun <span className="ik-tag">Monitoring</span></Link>
          <div className="ik-navlinks">
            <a href="#ik-platform">Platform</a>
            <a href="#ik-exhibit">The Record</a>
            <a href="#ik-creed">Security</a>
          </div>
          <div className="ik-navright">
            <Link className="ik-signin" to="/login">Sign in</Link>
            <a className="ik-btn ik-btn-wax" href="#ik-apply" onClick={goApply}>Apply — Pilot 001</a>
          </div>
        </div>
      </nav>

      <main>
        {/* ============ HERO ============ */}
        <section className="ik-hero">
          <div className="ik-wrap">
            <div className="ik-hero-meta ik-mono">
              <span className="ik-live">Private pilot · Limited spots open</span>
              <span>Supervised visitation — every jurisdiction</span>
              <span>Est. 2026 · Los Angeles</span>
            </div>
            <h1 className="ik-display">
              Every visit.<br />
              On the <span className="ik-ital">record.</span>
            </h1>
            <div className="ik-hero-sub">
              <p className="ik-lede">
                The supervised-visitation platform for professional monitors.
                Guided visits, GPS-verified check-ins, voice notes —
                <b> a court-ready report in minutes,</b> not evenings.
              </p>
              <div className="ik-hero-ctas">
                <a className="ik-btn ik-btn-wax" href="#ik-apply" onClick={goApply}>Apply to the pilot</a>
                <a className="ik-btn ik-btn-line" href="#ik-platform">Explore the platform</a>
              </div>
            </div>
          </div>
          <div className="ik-hero-foot ik-mono">
            <div className="ik-cell">Free during the pilot</div>
            <div className="ik-cell">Approval in ~1 week</div>
            <div className="ik-cell">No credit card</div>
          </div>
        </section>

        {/* ============ MANIFESTO ============ */}
        <section className="ik-sec ik-manifesto ik-dark">
          <div className="ik-wrap">
            <div className="ik-kicker ik-mono ik-rv">No. 01 — The Premise</div>
            <blockquote className="ik-rv">
              Supervised visitation runs on trust.
              Trust runs on <em>the record.</em>
            </blockquote>
            <div className="ik-support">
              <p className="ik-rv">
                A monitor's report can shape where a child sleeps at night — yet it's still
                written from memory, at midnight. KaNun writes the record while you stay
                present: <b>verified, timestamped, court-ready.</b>
              </p>
            </div>
          </div>
        </section>

        {/* ============ PLATFORM INDEX ============ */}
        <section className="ik-sec ik-platform" id="ik-platform">
          <div className="ik-wrap">
            <div className="ik-kicker ik-mono ik-rv">No. 02 — The Platform</div>
            <h2 className="ik-h2 ik-rv">Built for the<br /><span className="ik-ital">burden of proof.</span></h2>
            <div className="ik-idx">
              {[
                ['01', 'Guided visits', "The court order's conditions, built into the flow. Every visit, defensible."],
                ['02', 'GPS-verified check-ins', 'Arrivals and exchanges verified against the location. Nobody’s word required.'],
                ['03', 'Voice, transcribed', 'Speak your observations. They land timestamped and transcribed in the case file.'],
                ['04', 'Court-ready, in minutes', 'End the visit, export a report your court recognizes on sight. Sign. File.'],
                ['05', 'Tamper-evident by design', 'Sealed records. No silent edits — it holds up under cross-examination.'],
              ].map(([num, title, desc]) => (
                <div className="ik-row ik-rv" key={num}>
                  <div className="ik-num">{num}</div>
                  <div className="ik-title">{title}</div>
                  <div className="ik-desc">{desc}</div>
                  <div className="ik-arrow">→</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ============ EXHIBIT ============ */}
        <section className="ik-sec ik-exhibit ik-dark" id="ik-exhibit">
          <div className="ik-wrap ik-exgrid">
            <div className="ik-excopy ik-rv">
              <span className="ik-mono ik-exkicker">No. 03 — Exhibit A</span>
              <h2 className="ik-exh2">The report is<br />the <em>product.</em></h2>
              <p>
                One artifact matters: a report a judge trusts on sight. Verified locations,
                sealed timestamps — built first to California's exacting Standard 5.20.
              </p>
            </div>
            <div className="ik-docframe ik-rv">
              <div className="ik-stamp">Filed · GPS Verified</div>
              <div className="ik-doc" role="img" aria-label="A completed KaNun visit report">
                <div className="ik-dochead">
                  <div>
                    <div className="ik-mono">Visit report · Case 24-0187</div>
                    <h3>Supervised Visitation Record</h3>
                    <div className="ik-mono">Sat Jun 27 · 14:00–16:00 · Long Beach, CA</div>
                  </div>
                  <div className="ik-seal">Sealed<br />✦<br />KaNun</div>
                </div>
                <div className="ik-docrows">
                  <div className="ik-docrow">
                    <span className="ik-doct">14:00:07</span>
                    <span className="ik-docv">Check-in confirmed<span>Location match — all parties present</span></span>
                    <span className="ik-docok">Verified</span>
                  </div>
                  <div className="ik-docrow">
                    <span className="ik-doct">14:14:32</span>
                    <span className="ik-docv">Voice note transcribed<span>"Child greeted parent warmly, engaged in board game…"</span></span>
                    <span className="ik-docok">Sealed</span>
                  </div>
                  <div className="ik-docrow">
                    <span className="ik-doct">15:52:11</span>
                    <span className="ik-docv">Visit ended — no interventions<span>Exchange completed per court order</span></span>
                    <span className="ik-docok">Sealed</span>
                  </div>
                </div>
                <div className="ik-docfoot">
                  <span className="ik-mono">Formatted to CA Standard 5.20</span>
                  <span className="ik-sig">M. Alvarez, PM</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ============ CREED ============ */}
        <section className="ik-sec ik-creed" id="ik-creed">
          <div className="ik-wrap">
            <span className="ik-mono ik-creedkick ik-rv">No. 04 — The Standard</span>
            <h2 className="ik-rv">These records decide custody.<br />We engineer them <em style={{ whiteSpace: 'nowrap' }}>like it.</em></h2>
            <p className="ik-attrib ik-rv">
              Built by a team that spent two decades securing the world's most valuable
              companies — <b>now guarding the family court record.</b>
            </p>
            <div className="ik-creedcols">
              <div className="ik-c ik-rv">
                <div className="ik-mono">Encrypted</div>
                <p><b>End-to-end.</b> In transit, at rest, always. Access limited to the parties entitled to it.</p>
              </div>
              <div className="ik-c ik-rv">
                <div className="ik-mono">Sealed</div>
                <p><b>Tamper-evident.</b> No silent edits, ever. Amendments are additive, attributed, timestamped.</p>
              </div>
              <div className="ik-c ik-rv">
                <div className="ik-mono">Audited</div>
                <p><b>Every touch logged.</b> Who viewed, who edited, who exported — answerable in seconds.</p>
              </div>
              <div className="ik-c ik-rv">
                <div className="ik-mono">Scoped</div>
                <p><b>Least privilege.</b> Parents, monitors, agencies, and courts each see exactly what their role permits.</p>
              </div>
            </div>
          </div>
        </section>

        {/* ============ APPLY ============ */}
        <section className="ik-sec" id="ik-apply">
          <div className="ik-wrap ik-applygrid">
            <div>
              <div className="ik-kicker ik-mono ik-rv">No. 05 — Admission</div>
              <h2 className="ik-h2 ik-rv">Join<br />Pilot <span className="ik-ital">001.</span></h2>
              <p className="ik-lead ik-rv">
                A small founding cohort of monitors, agencies, families, and court professionals.
                Reviewed individually. One minute to apply.
              </p>
              <div className="ik-terms ik-rv">
                <div className="ik-term"><span className="ik-mono">A.</span><span><b>Free for the full pilot.</b> No card. Feedback is the price of admission.</span></div>
                <div className="ik-term"><span className="ik-mono">B.</span><span><b>Reviewed in ~1 week</b> — by the founding team, not a queue.</span></div>
                <div className="ik-term"><span className="ik-mono">C.</span><span><b>Founding status.</b> Pilot members shape the roadmap and keep it at launch.</span></div>
              </div>
            </div>

            <form className="ik-form ik-rv" onSubmit={submit} noValidate>
              {/* honeypot */}
              <input type="text" name="website" tabIndex={-1} autoComplete="off"
                className="ik-hp" value={form.website} onChange={set('website')} aria-hidden="true" />

              <div className="ik-frow">
                <div className="ik-flabel"><span>Your name</span><span className="ik-req">Required</span></div>
                <input id="ik-name-input" type="text" required value={form.name} onChange={set('name')}
                  autoComplete="name" placeholder="Jordan Rivera" />
              </div>

              <div className="ik-frow">
                <div className="ik-flabel"><span>Email</span><span className="ik-req">Required</span></div>
                <input type="email" required value={form.email} onChange={set('email')}
                  autoComplete="email" placeholder="you@agency.com" />
              </div>

              <div className="ik-frow">
                <div className="ik-flabel"><span>Choose a password</span><span className="ik-req">Required</span></div>
                <input type="password" required minLength={8} value={form.password}
                  onChange={set('password')} autoComplete="new-password" placeholder="At least 8 characters" />
                <p className="ik-fhint">We activate your account once you're approved.</p>
              </div>

              <div className="ik-frow">
                <div className="ik-flabel"><span>I am a…</span><span className="ik-req">Required</span></div>
                <div className="ik-roles" role="radiogroup" aria-label="Your role">
                  {ROLES.map((r) => (
                    <button type="button" key={r.value}
                      className={`ik-role${form.role === r.value ? ' ik-role-on' : ''}`}
                      aria-pressed={form.role === r.value}
                      onClick={() => setForm((f) => ({ ...f, role: r.value }))}>
                      <strong>{r.label}</strong>
                      <small>{r.hint}</small>
                    </button>
                  ))}
                </div>
              </div>

              <div className="ik-frow">
                <div className="ik-flabel"><span>Organization / agency</span><span>Optional</span></div>
                <input type="text" value={form.organization} onChange={set('organization')}
                  placeholder={'Agency, firm, court — or "self"'} />
              </div>

              <div className="ik-frow">
                <div className="ik-flabel"><span>County / jurisdiction</span><span>Optional</span></div>
                <input type="text" value={form.jurisdiction} onChange={set('jurisdiction')}
                  placeholder="e.g. Los Angeles County, CA" />
              </div>

              <div className="ik-frow">
                <div className="ik-flabel"><span>Court-ordered or provider?</span><span>Optional</span></div>
                <select value={form.court_or_provider} onChange={set('court_or_provider')}>
                  {COURT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>

              <div className="ik-frow">
                <div className="ik-flabel"><span>What would you use it for?</span><span>Optional</span></div>
                <textarea rows={3} value={form.use_case} onChange={set('use_case')}
                  placeholder="Running visits and generating reports for my agency" />
              </div>

              <div className="ik-frow">
                <div className="ik-flabel"><span>How did you hear about us?</span><span>Optional</span></div>
                <input type="text" value={form.how_heard} onChange={set('how_heard')}
                  placeholder="Referral, search, court, social…" />
              </div>

              {err && <div className="ik-error">{err}</div>}

              <button className="ik-btn ik-btn-ink" disabled={busy}>
                {busy ? <span className="ik-spin" aria-hidden="true" /> : null}
                {busy ? 'Submitting…' : 'Request pilot access →'}
              </button>

              <div className="ik-divider"><span>or continue with</span></div>
              <div className="ik-social">
                <button type="button" className="ik-socialbtn" disabled={busy} onClick={() => oauth('google')}>
                  <svg width="17" height="17" viewBox="0 0 18 18" aria-hidden="true">
                    <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"/>
                    <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"/>
                    <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z"/>
                    <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"/>
                  </svg>
                  Google
                </button>
                <button type="button" className="ik-socialbtn" disabled={busy} onClick={() => oauth('facebook')}>
                  <svg width="17" height="17" viewBox="0 0 18 18" aria-hidden="true">
                    <path fill="#1877F2" d="M18 9a9 9 0 1 0-10.41 8.89v-6.29H5.31V9h2.28V7.02c0-2.25 1.34-3.5 3.4-3.5.98 0 2.01.18 2.01.18v2.21h-1.13c-1.12 0-1.47.7-1.47 1.41V9h2.5l-.4 2.6h-2.1v6.29A9 9 0 0 0 18 9z"/>
                  </svg>
                  Facebook
                </button>
              </div>
              <p className="ik-fnote">OAuth applicants are reviewed the same way — pending until approved.</p>
              <p className="ik-fnote">Already approved? <Link to="/login">Sign in</Link></p>
            </form>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  )
}
