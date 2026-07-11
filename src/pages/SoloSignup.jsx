import React, { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../supabase'
import './inkseal.css'

/*
  Self-serve signup for individual (solo) monitors — "Ink & Seal" brand system.
  No agency, no approval gate. Creates the account + a 14-day trial via the
  solo-signup function, then signs them straight in.
*/

const TICKER = [
  'Solo plan — start free today', '14 days free · no card',
  'Court-ready in your jurisdiction', 'No agency required', 'Cancel anytime',
]

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

export default function SoloSignup() {
  const nav = useNavigate()
  const [form, setForm] = useState({ first_name: '', last_name: '', email: '', password: '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  useReveal([])

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

  const goTop = (e) => {
    e.preventDefault()
    window.scrollTo({ top: 0, behavior: 'smooth' })
    setTimeout(() => document.getElementById('ik-first-input')?.focus({ preventScroll: true }), 450)
  }

  return (
    <div className="ik-page">
      <div className="ik-grain" aria-hidden="true" />

      <div className="ik-topline ik-mono" aria-hidden="true">
        <div className="ik-ticker">
          {[...TICKER, ...TICKER].map((t, i) => (
            <React.Fragment key={i}><span>{t}</span><b>✦</b></React.Fragment>
          ))}
        </div>
      </div>

      <nav className="ik-nav">
        <div className="ik-wrap ik-navrow">
          <Link to="/welcome" className="ik-wordmark">KaNun <span className="ik-tag">Monitoring · Solo</span></Link>
          <div className="ik-navlinks">
            <a href="#ik-platform">Platform</a>
            <a href="#ik-exhibit">The Record</a>
            <a href="#ik-creed">Security</a>
          </div>
          <div className="ik-navright">
            <Link className="ik-signin" to="/login">Sign in</Link>
            <a className="ik-btn ik-btn-wax" href="#top" onClick={goTop}>Start free</a>
          </div>
        </div>
      </nav>

      <main>
        {/* ============ HERO + INTAKE ============ */}
        <section className="ik-hero" id="ik-start">
          <div className="ik-wrap">
            <div className="ik-hero-meta ik-mono">
              <span className="ik-live">Solo plan · Open now</span>
              <span>For independent professional monitors</span>
              <span>Court-ready · Every jurisdiction</span>
            </div>
            <div className="ik-hero-grid">
              <div>
                <h1 className="ik-display">
                  Work solo.<br />File like a <span className="ik-ital">firm.</span>
                </h1>
                <p className="ik-lede" style={{ marginTop: 28 }}>
                  For independent professional monitors. Guided visits, GPS-verified
                  check-ins, voice notes — <b>a court-ready report in 5 minutes, not 45.</b>
                  {' '}No agency required.
                </p>
                <div className="ik-points ik-mono">
                  <span>14 days free</span>
                  <span>No card to start</span>
                  <span>Cancel anytime</span>
                </div>
              </div>

              <form className="ik-intake ik-form" onSubmit={submit} noValidate>
                <div className="ik-intakehead ik-mono"><span>Intake · Solo Plan</span><span>~1 min</span></div>
                <h2>Open your practice</h2>
                <p className="ik-intakesub">You'll be signed straight in — no approval, no waiting.</p>

                <div className="ik-frow ik-fpair">
                  <div>
                    <div className="ik-flabel"><span>First name</span><span className="ik-req">Required</span></div>
                    <input id="ik-first-input" type="text" required value={form.first_name}
                      onChange={set('first_name')} autoComplete="given-name" placeholder="Jordan" />
                  </div>
                  <div>
                    <div className="ik-flabel"><span>Last name</span></div>
                    <input type="text" value={form.last_name} onChange={set('last_name')}
                      autoComplete="family-name" placeholder="Rivera" />
                  </div>
                </div>

                <div className="ik-frow">
                  <div className="ik-flabel"><span>Email</span><span className="ik-req">Required</span></div>
                  <input type="email" required value={form.email} onChange={set('email')}
                    autoComplete="email" placeholder="you@email.com" />
                </div>

                <div className="ik-frow">
                  <div className="ik-flabel"><span>Choose a password</span><span className="ik-req">Required</span></div>
                  <input type="password" required minLength={8} value={form.password}
                    onChange={set('password')} autoComplete="new-password" placeholder="At least 8 characters" />
                  <p className="ik-fhint">Your trial starts the moment you sign up.</p>
                </div>

                {err && <div className="ik-error">{err}</div>}

                <button className="ik-btn ik-btn-ink" disabled={busy}>
                  {busy ? <span className="ik-spin" aria-hidden="true" /> : null}
                  {busy ? 'Creating your account…' : 'Start my free trial →'}
                </button>

                <p className="ik-fnote">Already have an account? <Link to="/login">Sign in</Link></p>
                <p className="ik-crosslink">
                  Running an agency with multiple monitors? <Link to="/apply">Apply for the agency pilot →</Link>
                </p>
              </form>
            </div>
          </div>
        </section>

        {/* ============ THE MATH ============ */}
        <section className="ik-math">
          <div className="ik-wrap ik-mathgrid">
            <div className="ik-cell ik-rv">
              <div className="ik-mathnum">45 <em>→</em> 5</div>
              <p className="ik-mathlbl">Minutes per report. The visit ends; the report is basically done.</p>
            </div>
            <div className="ik-cell ik-rv">
              <div className="ik-mathnum"><em>Zero</em></div>
              <p className="ik-mathlbl">Agency required. Your cases, your clients, your record — under your name.</p>
            </div>
            <div className="ik-cell ik-rv">
              <div className="ik-mathnum">100<em>%</em></div>
              <p className="ik-mathlbl">Court-ready. Your court's format — California's 5.20 built in first.</p>
            </div>
          </div>
        </section>

        {/* ============ SOLO PREMISE ============ */}
        <section className="ik-sec" style={{ borderBottom: '1px solid var(--ik-line-l)' }}>
          <div className="ik-wrap">
            <div className="ik-kicker ik-mono ik-rv">No. 01 — The Solo Premise</div>
            <blockquote className="ik-rv" style={{
              fontFamily: 'var(--ik-display)', fontWeight: 340, border: 'none',
              fontSize: 'clamp(26px,4vw,52px)', lineHeight: 1.14, letterSpacing: '-0.01em', maxWidth: '26ch',
            }}>
              When you work alone, your record <em style={{ fontStyle: 'italic', color: 'var(--ik-wax)' }}>is</em> your reputation.
            </blockquote>
            <div className="ik-support">
              <p className="ik-rv" style={{ color: 'var(--ik-soft)' }}>
                When an attorney challenges a detail from three months ago, "I remember it
                clearly" is not a defense. KaNun puts <b style={{ color: 'var(--ik-ink)' }}>a verified, tamper-evident record
                behind every report you sign</b> — court-grade infrastructure, priced for a
                practice of one.
              </p>
            </div>
          </div>
        </section>

        {/* ============ PLATFORM INDEX ============ */}
        <section className="ik-sec ik-platform" id="ik-platform">
          <div className="ik-wrap">
            <div className="ik-kicker ik-mono ik-rv">No. 02 — The Platform</div>
            <h2 className="ik-h2 ik-rv">Your entire back office,<br /><span className="ik-ital">in your pocket.</span></h2>
            <div className="ik-idx">
              {[
                ['01', 'Guided visits', "The court order's conditions, built into the flow. Every visit, defensible."],
                ['02', 'GPS-verified check-ins', 'Arrivals and exchanges verified against the location. Nobody has to take your word.'],
                ['03', 'Voice, transcribed', 'Speak your observations. They land timestamped and transcribed in the case file.'],
                ['04', 'Court-ready, in minutes', 'End the visit, export a report your court recognizes on sight — before you\'re home.'],
                ['05', 'Cases & scheduling', 'Orders, schedules, contacts, history — a practice of one, organized like a program of fifty.'],
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
              <h2 className="ik-exh2">Your signature,<br />fully <em>backed.</em></h2>
              <p>
                Verified locations. Sealed timestamps. Built first to California's exacting
                Standard 5.20. Your name on the line — the record behind it.
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
              Encrypted end-to-end. Tamper-evident. Every touch logged. Built by a team that
              spent two decades securing the world's most valuable companies —
              <b> now guarding the family court record.</b>
            </p>
          </div>
        </section>

        {/* ============ FINAL CTA ============ */}
        <section className="ik-sec ik-final">
          <div className="ik-wrap">
            <h2 className="ik-h2 ik-rv">Tonight's reports,<br />done by <span className="ik-ital">dinner.</span></h2>
            <p className="ik-rv">Fourteen days free. No card. No agency. Cancel anytime.</p>
            <a className="ik-btn ik-btn-wax ik-rv" href="#top" onClick={goTop}>Start my free trial →</a>
            <span className="ik-mono ik-finalunder ik-rv">
              Running an agency? <Link to="/apply">Apply for the agency pilot</Link>
            </span>
          </div>
        </section>
      </main>

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
    </div>
  )
}
