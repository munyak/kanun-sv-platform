import React from 'react'
import { Link } from 'react-router-dom'
import '../pages/inkseal.css'

/*
  Shared shell for all auth screens (Login, Join, Forgot, Reset) —
  "Ink & Seal" brand system. Left panel carries the brand; right panel
  hosts the form. Inner pages keep their existing auth-* / form-* class
  markup — inkseal.css restyles those classes inside .ik-auth.
*/

const POINTS = [
  'Court-ready reports in minutes',
  'GPS-verified check-ins',
  'Tamper-evident visit record',
  'End-to-end encrypted',
]

export default function AuthShell({ title, subtitle, children }) {
  return (
    <div className="ik-page">
      <div className="ik-grain" aria-hidden="true" />
      <div className="ik-auth">
        {/* Left panel — brand */}
        <div className="ik-authhero">
          <div className="ik-mono">KaNun Monitoring · Supervised Visitation</div>
          <div>
            <div className="ik-authline">
              Every visit.<br />On the <span className="ik-ital">record.</span>
            </div>
            <ul className="ik-authpoints">
              {POINTS.map((p) => <li key={p}>{p}</li>)}
            </ul>
          </div>
          <div className="ik-mono">Est. 2026 · Los Angeles, CA</div>
        </div>

        {/* Right panel — form */}
        <div className="ik-authpanel">
          <div className="ik-authcard">
            <Link to="/welcome" className="ik-wordmark">KaNun <span className="ik-tag">Monitoring</span></Link>
            <h1 className="auth-title">{title}</h1>
            {subtitle && <p className="auth-subtitle">{subtitle}</p>}
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}
