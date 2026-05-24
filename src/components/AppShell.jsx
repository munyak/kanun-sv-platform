import React, { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth, roleLabel } from '../auth/AuthContext'

const NAV_BY_ROLE = {
  platform_admin: [
    { to: '/', label: 'Dashboard', exact: true },
    { to: '/cases', label: 'Cases' },
    { to: '/intake', label: 'New Intake' },
    { to: '/visits', label: 'Visits' },
    { to: '/monitors', label: 'Monitors' },
    { to: '/team', label: 'Team' },
    { to: '/settings', label: 'Settings' },
  ],
  agency_owner: [
    { to: '/', label: 'Dashboard', exact: true },
    { to: '/cases', label: 'Cases' },
    { to: '/intake', label: 'New Intake' },
    { to: '/visits', label: 'Visits' },
    { to: '/monitors', label: 'Monitors' },
    { to: '/team', label: 'Team' },
    { to: '/settings', label: 'Settings' },
  ],
  agency_manager: [
    { to: '/', label: 'Dashboard', exact: true },
    { to: '/cases', label: 'Cases' },
    { to: '/intake', label: 'New Intake' },
    { to: '/visits', label: 'Visits' },
    { to: '/monitors', label: 'Monitors' },
    { to: '/team', label: 'Team' },
  ],
  monitor: [
    { to: '/', label: 'My Day', exact: true },
    { to: '/visits', label: 'My Visits' },
    { to: '/cases', label: 'My Cases' },
  ],
  parent: [{ to: '/', label: 'My Visits', exact: true }],
  attorney: [
    { to: '/', label: 'Overview', exact: true },
    { to: '/cases', label: 'Cases' },
  ],
  court_liaison: [
    { to: '/', label: 'Compliance', exact: true },
    { to: '/cases', label: 'Cases' },
  ],
}

function Initials({ user }) {
  const src = user?.user_metadata?.full_name || user?.email || '?'
  const parts = src.split(/[\s@.]/).filter(Boolean)
  const text = ((parts[0]?.[0] || '?') + (parts[1]?.[0] || '')).toUpperCase()
  return <div className="avatar">{text}</div>
}

export default function AppShell() {
  const { user, org, role, memberships, setActiveOrg, activeOrgId, signOut } = useAuth()
  const nav = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const items = NAV_BY_ROLE[role] || NAV_BY_ROLE.agency_owner

  async function handleSignOut() {
    await signOut()
    nav('/login', { replace: true })
  }

  return (
    <div className="shell">
      <header className="topbar">
        <div className="topbar-left">
          <button className="hamburger" aria-label="Menu" onClick={() => setSidebarOpen((s) => !s)}>
            <span /><span /><span />
          </button>
          <div className="topbar-brand">
            <div className="brand-mark">KW</div>
            <div className="topbar-org">
              <div className="topbar-org-name">{org?.name || 'KaNun Wellness'}</div>
              <div className="topbar-org-sub">Supervised Visitation</div>
            </div>
          </div>
        </div>

        <div className="topbar-right">
          {memberships.length > 1 && (
            <select
              className="org-switcher"
              value={activeOrgId || ''}
              onChange={(e) => setActiveOrg(e.target.value)}
              aria-label="Switch organization"
            >
              {memberships.map((m) => (
                <option key={m.org_id} value={m.org_id}>{m.sv_organizations?.name || 'Org'}</option>
              ))}
            </select>
          )}
          {role && <span className="role-badge">{roleLabel(role)}</span>}
          <button className="notif-bell" aria-label="Notifications" title="Notifications (coming soon)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                 strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 01-3.46 0" />
            </svg>
          </button>
          <div className="user-menu">
            <button className="user-trigger" onClick={() => setMenuOpen((s) => !s)} aria-haspopup="menu">
              <Initials user={user} />
            </button>
            {menuOpen && (
              <div className="user-menu-pop" role="menu" onMouseLeave={() => setMenuOpen(false)}>
                <div className="user-menu-head">
                  <div className="user-menu-name">{user?.user_metadata?.full_name || user?.email}</div>
                  <div className="user-menu-email">{user?.email}</div>
                </div>
                <button className="user-menu-item" onClick={() => { setMenuOpen(false); nav('/settings') }}>Settings</button>
                <button className="user-menu-item" onClick={handleSignOut}>Sign out</button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="shell-body">
        <aside className={`shell-sidebar ${sidebarOpen ? 'open' : ''}`}>
          <nav className="sidebar-nav">
            {items.map((it) => (
              <NavLink
                key={it.to}
                to={it.to}
                end={it.exact}
                className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}
                onClick={() => setSidebarOpen(false)}
              >
                {it.label}
              </NavLink>
            ))}
          </nav>
          <div className="sidebar-footer">
            <a
              href="https://www.courts.ca.gov/cms/rules/index.cfm?title=five&linkid=rule5_20"
              target="_blank" rel="noopener noreferrer"
              className="footer-link"
            >
              CA Standard 5.20 →
            </a>
            <div className="footer-meta">v0.2.0 · Phase 1</div>
          </div>
        </aside>

        <main className="shell-main">
          <Outlet />
        </main>
      </div>

      {sidebarOpen && <div className="shell-backdrop" onClick={() => setSidebarOpen(false)} />}
    </div>
  )
}
