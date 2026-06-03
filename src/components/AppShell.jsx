import React, { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth, roleLabel } from '../auth/AuthContext'

/* ----- Lucide-style icons (inline SVG, stroke-current) ----- */
const Icon = ({ d, children, size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
       stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
       aria-hidden="true">
    {d && <path d={d} />}
    {children}
  </svg>
)

const I = {
  dashboard: (
    <Icon>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </Icon>
  ),
  folder: (
    <Icon>
      <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
    </Icon>
  ),
  plus: (
    <Icon>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v8M8 12h8" />
    </Icon>
  ),
  calendar: (
    <Icon>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4M8 3v4M3 10h18" />
    </Icon>
  ),
  monitors: (
    <Icon>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0113 0" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M22 18a4.5 4.5 0 00-6-4.25" />
    </Icon>
  ),
  team: (
    <Icon>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20a7 7 0 0114 0" />
    </Icon>
  ),
  settings: (
    <Icon>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 01-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 01-4 0v-.1a1.7 1.7 0 00-1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 010-4h.1a1.7 1.7 0 001.5-1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 014 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 010 4h-.1a1.7 1.7 0 00-1.5 1z" />
    </Icon>
  ),
  shield: (
    <Icon>
      <path d="M12 3l8 3v6a9 9 0 01-8 9 9 9 0 01-8-9V6l8-3z" />
    </Icon>
  ),
  briefcase: (
    <Icon>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2" />
      <path d="M3 13h18" />
    </Icon>
  ),
  scale: (
    <Icon>
      <path d="M12 3v18M5 21h14M5 8l-3 8h6l-3-8zm14 0l-3 8h6l-3-8z" />
    </Icon>
  ),
  sun: (
    <Icon>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </Icon>
  ),
  search: (
    <Icon size={16}>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </Icon>
  ),
  bell: (
    <Icon>
      <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 01-3.46 0" />
    </Icon>
  ),
}

/* ----- Role-aware navigation with icons ----- */
const NAV_BY_ROLE = {
  platform_admin: [
    { to: '/', label: 'Dashboard', icon: I.dashboard, exact: true },
    { to: '/cases', label: 'Cases', icon: I.folder },
    { to: '/intake', label: 'New Intake', icon: I.plus },
    { to: '/visits', label: 'Schedule', icon: I.calendar },
    { to: '/monitors', label: 'Monitors', icon: I.monitors },
    { to: '/reports', label: 'Reports', icon: I.shield },
    { to: '/team', label: 'Team', icon: I.team },
    { to: '/settings', label: 'Settings', icon: I.settings },
    { to: '/billing', label: 'Billing', icon: I.briefcase },
    { to: '/admin', label: 'Platform', icon: I.shield },
    { to: '/admin', label: 'Platform', icon: I.shield },
    { to: '/billing', label: 'Billing', icon: I.briefcase },
  ],
  agency_owner: [
    { to: '/', label: 'Dashboard', icon: I.dashboard, exact: true },
    { to: '/cases', label: 'Cases', icon: I.folder },
    { to: '/intake', label: 'New Intake', icon: I.plus },
    { to: '/billing', label: 'Billing', icon: I.briefcase },
    { to: '/visits', label: 'Schedule', icon: I.calendar },
    { to: '/monitors', label: 'Monitors', icon: I.monitors },
    { to: '/reports', label: 'Reports', icon: I.shield },
    { to: '/team', label: 'Team', icon: I.team },
    { to: '/settings', label: 'Settings', icon: I.settings },
    { to: '/billing', label: 'Billing', icon: I.briefcase },
  ],
  agency_manager: [
    { to: '/', label: 'Dashboard', icon: I.dashboard, exact: true },
    { to: '/cases', label: 'Cases', icon: I.folder },
    { to: '/intake', label: 'New Intake', icon: I.plus },
    { to: '/visits', label: 'Schedule', icon: I.calendar },
    { to: '/monitors', label: 'Monitors', icon: I.monitors },
    { to: '/reports', label: 'Reports', icon: I.shield },
    { to: '/team', label: 'Team', icon: I.team },
  ],
  monitor: [
    { to: '/', label: 'My Day', icon: I.sun, exact: true },
    { to: '/visits', label: 'My Visits', icon: I.calendar },
    { to: '/cases', label: 'My Cases', icon: I.folder },
    { to: '/my-profile', label: 'My Profile', icon: I.team },
  ],
  parent: [{ to: '/', label: 'My Visits', icon: I.calendar, exact: true }],
  attorney: [
    { to: '/', label: 'Overview', icon: I.dashboard, exact: true },
    { to: '/cases', label: 'Cases', icon: I.briefcase },
  ],
  court_liaison: [
    { to: '/', label: 'Compliance', icon: I.shield, exact: true },
    { to: '/cases', label: 'Cases', icon: I.scale },
  ],
}

function Initials({ user }) {
  const src = user?.user_metadata?.full_name || user?.email || '?'
  const parts = src.split(/[\s@.]/).filter(Boolean)
  const text = ((parts[0]?.[0] || '?') + (parts[1]?.[0] || '')).toUpperCase()
  return <div className="avatar">{text}</div>
}

export default function AppShell() {
  const {
    user, org, role, memberships, setActiveOrg, activeOrgId, signOut,
    actualRole, viewAsRole, canSwitchView, setViewAsRole,
  } = useAuth()
  const nav = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const items = NAV_BY_ROLE[role] || NAV_BY_ROLE.agency_owner
  const isMonitor = role === 'monitor'
  const isViewingAs = !!viewAsRole

  async function handleSignOut() {
    await signOut()
    nav('/login', { replace: true })
  }

  return (
    <div className={`shell ${isMonitor ? 'shell-monitor' : ''}`}>
      <header className="topbar">
        <div className="topbar-left">
          <button className="hamburger" aria-label="Menu" onClick={() => setSidebarOpen((s) => !s)}>
            <span /><span /><span />
          </button>
          <div className="topbar-brand">
            <div className="brand-mark">KW</div>
            <div className="topbar-org">
              <div className="topbar-org-name">
                {isMonitor ? 'Monitor portal' : (org?.name || 'KaNun Wellness')}
              </div>
              <div className="topbar-org-sub">
                {isMonitor ? (org?.name || 'KaNun Wellness') : 'Supervised Visitation'}
              </div>
            </div>
          </div>
        </div>

        {!isMonitor && (
          <div className="topbar-search">
            <span className="topbar-search-icon">{I.search}</span>
            <input type="search" placeholder="Search cases, monitors, visits…" aria-label="Search" />
          </div>
        )}

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
          {canSwitchView && (
            <select
              className={`view-as-switcher${isViewingAs ? ' view-as-switcher-active' : ''}`}
              value={viewAsRole || ''}
              onChange={(e) => {
                const next = e.target.value || null
                setViewAsRole(next)
                // Land on the appropriate home so the user sees the right
                // dashboard immediately after switching.
                nav('/', { replace: true })
              }}
              aria-label="Switch view (dev)"
              title="Dev: preview the app as another role"
            >
              <option value="">Owner view</option>
              <option value="monitor">Monitor view</option>
            </select>
          )}
          {role && (
            <span className={`role-badge${isViewingAs ? ' role-badge-viewas' : ''}`}>
              {isViewingAs ? `Viewing as ${roleLabel(role)}` : roleLabel(role)}
            </span>
          )}
          <button className="notif-bell" aria-label="Notifications" title="Notifications (coming soon)">
            {I.bell}
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
                <button className="user-menu-item" onClick={() => { setMenuOpen(false); nav(role === 'monitor' ? '/my-profile' : '/settings') }}>{role === 'monitor' ? 'My profile' : 'Settings'}</button>
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
                <span className="nav-icon">{it.icon}</span>
                <span>{it.label}</span>
              </NavLink>
            ))}
          </nav>
          <div className="sidebar-footer">
            <a
              href="https://www.courts.ca.gov/cms/rules/index.cfm?title=five&linkid=rule5_20"
              target="_blank" rel="noopener noreferrer"
              className="footer-link"
            >
              CA Standard 5.20 ↗
            </a>
            <div className="footer-meta">v0.3.0 · Phase 1</div>
          </div>
        </aside>

        <main className="shell-main">
          {isViewingAs && (
            <div className="view-as-banner" role="status">
              <span className="view-as-banner-dot" />
              <span>
                Dev preview — viewing the app as <strong>{roleLabel(role)}</strong>.
                Your real role is <strong>{roleLabel(actualRole)}</strong>.
              </span>
              <button
                type="button"
                className="view-as-banner-exit"
                onClick={() => { setViewAsRole(null); nav('/', { replace: true }) }}
              >
                Exit preview
              </button>
            </div>
          )}
          <Outlet />
        </main>
      </div>

      {sidebarOpen && <div className="shell-backdrop" onClick={() => setSidebarOpen(false)} />}
    </div>
  )
}
