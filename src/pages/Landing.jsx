import React from 'react'
import { Link } from 'react-router-dom'
import { trackEvent } from '../lib/analytics'
import './landing.css'

/*
  Public marketing landing page — ad/SEO destination (/welcome).
  Self-contained styling; does not touch styles.css or the auth shell.
*/

const FEATURES = [
  {
    icon: '🧾',
    title: 'Court-ready reports in minutes',
    body: 'Timestamped observations become Standard 5.20-compliant reports automatically. Stop spending evenings writing up visits — bill the visit, not your paperwork time.',
  },
  {
    icon: '📍',
    title: 'GPS-verified check-ins',
    body: 'Check-in and check-out capture location and accuracy automatically, with a breadcrumb trail during the visit. Defensible documentation when it matters.',
  },
  {
    icon: '🎙️',
    title: 'Hands-free voice notes',
    body: 'Dictate observations during the visit instead of typing. Quick-flag buttons cover Standard 5.20 incident categories in two taps.',
  },
  {
    icon: '📅',
    title: 'Scheduling & monitor management',
    body: 'Assign visits to your monitors, track arrivals and departures, and keep every case, party, and court condition in one place.',
  },
  {
    icon: '💳',
    title: 'Invoicing & aging built in',
    body: 'Generate invoices, record payments, and see exactly who owes what — no separate spreadsheet or billing tool.',
  },
  {
    icon: '🔒',
    title: 'Built by a security veteran',
    body: 'Architected by a 21-year information-security executive. Role-based access, row-level security, and audit-conscious design from day one.',
  },
]

const STEPS = [
  { n: '1', title: 'Create your agency', body: 'Set up your organization, services, and rates in about five minutes.' },
  { n: '2', title: 'Add cases & invite monitors', body: 'Parties, children, court conditions, and your monitor team — invitations handle access automatically.' },
  { n: '3', title: 'Run visits, deliver reports', body: 'Monitors work from their phone; you review and deliver court-ready reports.' },
]

export default function Landing() {
  const cta = (name) => () => trackEvent(name, { page: 'landing' })

  return (
    <div className="lp">
      <div className="lp-wrap">
        <nav className="lp-nav">
          <div className="lp-brand">
            <div className="lp-brand-mark">KW</div>
            KaNun Monitoring
          </div>
          <div className="lp-nav-actions">
            <Link className="lp-btn lp-btn-ghost" to="/login" onClick={cta('cta_login_click')}>Sign in</Link>
            <Link className="lp-btn lp-btn-primary" to="/signup" onClick={cta('cta_signup_click')}>Start free</Link>
          </div>
        </nav>

        <header className="lp-hero">
          <h1>Supervised visitation documentation, <em>without the paperwork nights</em></h1>
          <p>
            KaNun Monitoring is the platform for professional visitation monitors and agencies in California —
            guided visit workflows, GPS-verified check-ins, voice dictation, and court-ready
            Standard 5.20 reports generated in minutes.
          </p>
          <div className="lp-hero-ctas">
            <Link className="lp-btn lp-btn-primary lp-btn-xl" to="/signup" onClick={cta('cta_signup_click')}>
              Start free
            </Link>
            <a
              className="lp-btn lp-btn-ghost lp-btn-xl"
              href="mailto:mkanaventi@gmail.com?subject=KaNun%20Monitoring%20demo%20request"
              onClick={cta('cta_demo_click')}
            >
              Book a demo
            </a>
          </div>
          <div className="lp-hero-note">No credit card required · Built for California Rules of Court, Standard 5.20</div>
        </header>

        <div className="lp-stats">
          <div className="lp-stat"><div className="lp-stat-v">5.20</div><div className="lp-stat-l">Standard compliant</div></div>
          <div className="lp-stat"><div className="lp-stat-v">&lt;2 min</div><div className="lp-stat-l">Report generation</div></div>
          <div className="lp-stat"><div className="lp-stat-v">100%</div><div className="lp-stat-l">Court-admissible format</div></div>
        </div>

        <section className="lp-section">
          <h2 className="lp-section-title">Everything a visitation practice needs</h2>
          <p className="lp-section-sub">From intake to invoice — one platform, on any phone.</p>
          <div className="lp-grid">
            {FEATURES.map((f, i) => (
              <div className="lp-card" key={i}>
                <div className="lp-card-icon" aria-hidden="true">{f.icon}</div>
                <h3>{f.title}</h3>
                <p>{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="lp-section">
          <h2 className="lp-section-title">Up and running today</h2>
          <p className="lp-section-sub">No implementation project. No training manual.</p>
          <div className="lp-grid">
            {STEPS.map((s) => (
              <div className="lp-card" key={s.n}>
                <div className="lp-card-icon">{s.n}.</div>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="lp-section">
          <div className="lp-cta-band">
            <h2>Your reports are billable. Your paperwork time isn't.</h2>
            <p>Join the monitors modernizing supervised visitation in Los Angeles County and beyond.</p>
            <Link className="lp-btn lp-btn-primary lp-btn-xl" to="/signup" onClick={cta('cta_signup_click')}>
              Create your account
            </Link>
          </div>
        </section>

        <footer className="lp-footer">
          <div>© {new Date().getFullYear()} KaNun Digital · Supervised Visitation Platform</div>
          <div style={{ display: 'flex', gap: 16 }}>
            <Link to="/terms" style={{ color: 'inherit' }}>Terms</Link>
            <Link to="/privacy" style={{ color: 'inherit' }}>Privacy</Link>
            <a href="mailto:mkanaventi@gmail.com" onClick={cta('cta_contact_click')}>Contact</a>
          </div>
        </footer>
      </div>
    </div>
  )
}
