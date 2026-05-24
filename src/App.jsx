import React from 'react'
import { Routes, Route, NavLink, Navigate } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import Cases from './pages/Cases'
import IntakeForm from './pages/IntakeForm'
import Visits from './pages/Visits'
import Monitors from './pages/Monitors'

export default function App() {
  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-mark">KW</div>
          <div className="brand-text">
            <div className="brand-title">KaNun Wellness</div>
            <div className="brand-sub">Supervised Visitation</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          <NavLink to="/dashboard" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
            Dashboard
          </NavLink>
          <NavLink to="/cases" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
            Cases
          </NavLink>
          <NavLink to="/intake" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
            New Intake
          </NavLink>
          <NavLink to="/visits" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
            Visits
          </NavLink>
          <NavLink to="/monitors" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
            Monitors
          </NavLink>
        </nav>

        <div className="sidebar-footer">
          <a
            href="https://www.courts.ca.gov/cms/rules/index.cfm?title=five&linkid=rule5_20"
            target="_blank"
            rel="noopener noreferrer"
            className="footer-link"
          >
            CA Standard 5.20 →
          </a>
          <div className="footer-meta">v0.1.0 · MVP</div>
        </div>
      </aside>

      <main className="main-content">
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/cases" element={<Cases />} />
          <Route path="/intake" element={<IntakeForm />} />
          <Route path="/visits" element={<Visits />} />
          <Route path="/monitors" element={<Monitors />} />
        </Routes>
      </main>
    </div>
  )
}
