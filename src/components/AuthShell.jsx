import React, { useEffect, useState } from 'react'

const FEATURES = [
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/>
        <rect x="9" y="3" width="6" height="4" rx="2"/>
        <path d="M9 14l2 2 4-4"/>
      </svg>
    ),
    title: 'Court-ready documentation',
    desc: 'Generate professional visit reports that meet Standard 5.20 requirements.'
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <polyline points="12 6 12 12 16 14"/>
      </svg>
    ),
    title: 'Real-time visit tracking',
    desc: 'GPS check-in, live timers, and structured observation logging from any device.'
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
        <circle cx="9" cy="7" r="4"/>
        <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
        <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
      </svg>
    ),
    title: 'Multi-monitor management',
    desc: 'Assign cases, manage schedules, and track compliance across your team.'
  },
]

const STATS = [
  { value: '5.20', label: 'Standard compliant' },
  { value: '100%', label: 'Court-admissible' },
  { value: '<2min', label: 'Report generation' },
]

export default function AuthShell({ title, subtitle, children }) {
  const [activeFeature, setActiveFeature] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveFeature(prev => (prev + 1) % FEATURES.length)
    }, 4000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="auth-page">
      {/* Left panel — brand story */}
      <div className="auth-hero">
        <div className="auth-hero-inner">
          <div className="auth-hero-top">
            <div className="auth-hero-badge">KaNun Wellness</div>
            <h2 className="auth-hero-headline">
              Professional family visit monitoring, simplified.
            </h2>
            <p className="auth-hero-desc">
              The platform trusted by agencies, attorneys, and courts for supervised visitation documentation and compliance.
            </p>
          </div>

          <div className="auth-hero-features">
            {FEATURES.map((f, i) => (
              <div
                key={i}
                className={`auth-hero-feature ${i === activeFeature ? 'active' : ''}`}
                onMouseEnter={() => setActiveFeature(i)}
              >
                <div className="auth-hero-feature-icon">{f.icon}</div>
                <div className="auth-hero-feature-content">
                  <div className="auth-hero-feature-title">{f.title}</div>
                  <div className={`auth-hero-feature-desc ${i === activeFeature ? 'show' : ''}`}>
                    {f.desc}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="auth-hero-stats">
            {STATS.map((s, i) => (
              <div key={i} className="auth-hero-stat">
                <div className="auth-hero-stat-value">{s.value}</div>
                <div className="auth-hero-stat-label">{s.label}</div>
              </div>
            ))}
          </div>

          <div className="auth-hero-footer">
            <div className="auth-hero-trust">
              Compliant with California Rules of Court, Standard 5.20
            </div>
          </div>
        </div>
      </div>

      {/* Right panel — auth form */}
      <div className="auth-panel">
        <div className="auth-card">
          <div className="auth-logo">
            <div className="brand-mark">KW</div>
          </div>
          <h1 className="auth-title">{title}</h1>
          {subtitle && <p className="auth-subtitle">{subtitle}</p>}
          {children}
        </div>
      </div>
    </div>
  )
}
