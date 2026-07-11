import React, { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { trackEvent } from '../lib/analytics'
import './inkseal.css'

/*
  Public marketing landing page — ad/SEO destination (/welcome).
  "Ink & Seal" brand system. Acts as the front door that routes the two
  funnels: solo monitors → /start (self-serve trial), agencies → /apply
  (pilot application).
*/

const TICKER = [
  'Every visit — on the record', 'Court-ready in your jurisdiction',
  'GPS-verified check-ins', 'Tamper-evident record', 'End-to-end encrypted',
]

function useReveal() {
  useEffect(() => {
    const els = document.querySelectorAll('.ik-rv')
    if (!('IntersectionObserver' in window)) { els.forEach((el) => el.classList.add('ik-in')); return }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('ik-in'); io.unobserve(e.target) } })
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' })
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [])
}

export default function Landing() {
  const cta = (name) => () => trackEvent(name, { page: 'landing' })
  useReveal()

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
          <span className="ik-wordmark">KaNun <span className="ik-tag">Monitoring</span></span>
          <div className="ik-navlinks">
            <a href="#ik-platform">Platform</a>
            <a href="#ik-exhibit">The Record</a>
            <a href="#ik-doors">Get started</a>
          </div>
          <div className="ik-navright">
            <Link className="ik-signin" to="/login" onClick={cta('cta_login_click')}>Sign in</Link>
            <Link className="ik-btn ik-btn-wax" to="/start" onClick={cta('cta_signup_click')}>Start free</Link>
          </div>
        </div>
      </nav>

      <main>
        {/* ============ HERO ============ */}
        <section className="ik-hero">
          <div className="ik-wrap">
            <div className="ik-hero-meta ik-mono">
              <span className="ik-live">Now onboarding monitors & agencies</span>
              <span>Supervised visitation — every jurisdiction</span>
              <span>Est. 2026 · Los Angeles</span>
            </div>
            <h1 className="ik-display">
              Every visit.<br />
              On the <span className="ik-ital">record.</span>
            </h1>
            <div className="ik-hero-sub">
              <p className="ik-lede">
                The supervised-visitation platform for professional monitors and agencies.
                Guided visits, GPS-verified check-ins, voice notes —
                <b> a court-ready report in minutes,</b> not evenings.
              </p>
              <div className="ik-hero-ctas">
                <a className="ik-btn ik-btn-wax" href="#ik-doors">Get started</a>
                <a
                  className="ik-btn ik-btn-line"
                  href="mailto:mkanaventi@gmail.com?subject=KaNun%20Monitoring%20demo%20request"
                  onClick={cta('cta_demo_click')}
                >
                  Book a demo
                </a>
              </div>
            </div>
          </div>
          <div className="ik-hero-foot ik-mono">
            <div className="ik-cell">Reports in minutes, not evenings</div>
            <div className="ik-cell">Bill the visit, not the paperwork</div>
            <div className="ik-cell">No credit card to start</div>
          </div>
        </section>

        {/* ============ DOORS ============ */}
        <section className="ik-sec" id="ik-doors" style={{ borderBottom: '1px solid var(--ik-line-l)' }}>
          <div className="ik-wrap">
            <div className="ik-kicker ik-mono ik-rv">No. 01 — Two ways in</div>
            <h2 className="ik-h2 ik-rv">Choose your <span className="ik-ital">door.</span></h2>
            <div className="ik-doors">
              <Link className="ik-door ik-rv" to="/start" onClick={cta('cta_signup_click')}>
                <span className="ik-mono">Solo monitors</span>
                <div className="ik-doorname">Start free today.</div>
                <p className="ik-doordesc">
                  Independent professional monitors. 14-day trial, no card, no agency
                  required — signed in and working in about a minute.
                </p>
                <span className="ik-doorgo">Open your practice →</span>
              </Link>
              <Link className="ik-door ik-rv" to="/apply" onClick={cta('cta_apply_click')}>
                <span className="ik-mono">Agencies & programs</span>
                <div className="ik-doorname">Join Pilot 001.</div>
                <p className="ik-doordesc">
                  Multi-monitor agencies and programs. A small founding cohort, reviewed
                  individually — free for the full pilot.
                </p>
                <span className="ik-doorgo">Apply for admission →</span>
              </Link>
            </div>
          </div>
        </section>

        {/* ============ PLATFORM INDEX ============ */}
        <section className="ik-sec ik-platform" id="ik-platform">
          <div className="ik-wrap">
            <div className="ik-kicker ik-mono ik-rv">No. 02 — The Platform</div>
            <h2 className="ik-h2 ik-rv">From intake<br />to <span className="ik-ital">invoice.</span></h2>
            <div className="ik-idx">
              {[
                ['01', 'Guided visits', "The court order's conditions, built into the flow. Every visit, defensible."],
                ['02', 'GPS-verified check-ins', 'Arrivals and exchanges verified against the location. Nobody’s word required.'],
                ['03', 'Voice, transcribed', 'Speak your observations. They land timestamped and transcribed in the case file.'],
                ['04', 'Court-ready, in minutes', 'End the visit, export a report your court recognizes on sight. Sign. File.'],
                ['05', 'Scheduling & your roster', 'Cases, monitors, court conditions, arrivals — one view of the whole practice.'],
                ['06', 'Invoicing built in', 'Generate invoices, record payments, see who owes what. No spreadsheet.'],
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
              Encrypted end-to-end. Tamper-evident. Every touch logged. Built by a team that
              spent two decades securing the world's most valuable companies —
              <b> now guarding the family court record.</b>
            </p>
          </div>
        </section>

        {/* ============ FINAL CTA ============ */}
        <section className="ik-sec ik-final">
          <div className="ik-wrap">
            <h2 className="ik-h2 ik-rv">Your reports are billable.<br />Your paperwork <span className="ik-ital">isn't.</span></h2>
            <p className="ik-rv">Join the monitors modernizing supervised visitation.</p>
            <Link className="ik-btn ik-btn-wax ik-rv" to="/start" onClick={cta('cta_signup_click')}>Start free — solo plan →</Link>
            <span className="ik-mono ik-finalunder ik-rv">
              Running an agency? <Link to="/apply" onClick={cta('cta_apply_click')}>Apply for Pilot 001</Link>
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
            <span className="ik-mono">© {new Date().getFullYear()} KaNun Monitoring · Los Angeles, CA</span>
            <span className="ik-mono">
              <Link to="/privacy">Privacy</Link>
              <Link to="/terms">Terms</Link>
              <a href="mailto:mkanaventi@gmail.com" onClick={cta('cta_contact_click')}>Contact</a>
            </span>
          </div>
        </div>
      </footer>
    </div>
  )
}
