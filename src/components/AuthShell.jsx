import React from 'react'

export default function AuthShell({ title, subtitle, children }) {
  return (
    <div className="auth-page">
      <div className="auth-hero">
        <div className="auth-brand">
          <div className="auth-brand-mark">KW</div>
          <div>
            <div className="auth-brand-title">KaNun Wellness</div>
            <div className="auth-brand-sub">Supervised Visitation Platform</div>
          </div>
        </div>
        <div className="auth-hero-body">
          <h1 className="auth-hero-title">Run a safer, more compliant supervised visitation practice.</h1>
          <p className="auth-hero-text">
            Built for California Standard 5.20 — from intake to court-ready reports, in one secure workspace.
          </p>
          <ul className="auth-hero-bullets">
            <li>Role-based access for monitors, managers, attorneys, and courts</li>
            <li>Mobile-friendly visit documentation</li>
            <li>HIPAA-grade data isolation per agency</li>
          </ul>
        </div>
      </div>
      <div className="auth-panel">
        <div className="auth-card">
          <h2 className="auth-title">{title}</h2>
          {subtitle && <p className="auth-subtitle">{subtitle}</p>}
          {children}
        </div>
      </div>
    </div>
  )
}
