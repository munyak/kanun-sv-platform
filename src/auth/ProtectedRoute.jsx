import React from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './AuthContext'
import PilotApply from '../pages/PilotApply'

// Admin emails allowed to view the pilot approval queue (/admin/pilots).
// Keep in sync with PILOT_ADMIN_EMAILS in the pilot-review Edge Function.
export const PILOT_ADMIN_EMAILS = [
  'mkanaventi@gmail.com',
  'munya@kanunmonitoring.com',
  'admin@kanunmonitoring.com',
  'munya@kanun.digital',
]

export function RequireAuth({ children }) {
  const { user, loading } = useAuth()
  const loc = useLocation()
  if (loading) return <div className="loading">Loading…</div>
  // Logged-out visitors to the front door (kanunmonitoring.com/) get the public
  // pilot-tester splash instead of being bounced to the sign-in screen.
  if (!user && loc.pathname === '/') return <PilotApply />
  if (!user) return <Navigate to="/login" replace state={{ from: loc }} />
  return children
}

// Gate for the pilot approval queue: requires an authenticated, allow-listed
// admin. Independent of org/role onboarding so Munya can approve testers even
// without an agency membership.
export function RequireAdminEmail({ children }) {
  const { user, loading } = useAuth()
  const loc = useLocation()
  if (loading) return <div className="loading">Loading…</div>
  if (!user) return <Navigate to="/login" replace state={{ from: loc }} />
  const email = (user.email || '').toLowerCase()
  if (!PILOT_ADMIN_EMAILS.includes(email)) {
    return (
      <div className="empty-state" style={{ marginTop: 48 }}>
        <div className="empty-state-title">Not authorized</div>
        <div className="empty-state-desc">This area is limited to KaNun administrators.</div>
      </div>
    )
  }
  return children
}

export function RequireOrg({ children }) {
  const { user, loading, bootstrapping, hasOrg, onboarding } = useAuth()
  const loc = useLocation()
  if (loading || bootstrapping) return <div className="loading">Loading…</div>
  if (!user) return <Navigate to="/login" replace state={{ from: loc }} />
  if (!hasOrg || (onboarding && !onboarding.completed)) {
    return <Navigate to="/onboarding" replace />
  }
  return children
}

// Default landing route for each role. Used when a user lands on a page
// they don't have access to and we'd rather redirect than show an error.
const ROLE_HOME = {
  platform_admin: '/',
  agency_owner:   '/',
  agency_manager: '/',
  monitor:        '/',
  attorney:       '/',
  court_liaison:  '/',
  parent:         '/',
}

export function RequireRole({ allow, redirect = false, children }) {
  const { role } = useAuth()
  if (!role) return <Navigate to="/onboarding" replace />
  if (!allow.includes(role)) {
    if (redirect) return <Navigate to={ROLE_HOME[role] || '/'} replace />
    return (
      <div className="empty-state" style={{ marginTop: 48 }}>
        <div className="empty-state-title">Not authorized</div>
        <div className="empty-state-desc">
          Your role ({role.replace(/_/g, ' ')}) doesn’t have access to this page.
        </div>
      </div>
    )
  }
  return children
}

// Owner-tier roles that can run the agency (configure org, see all monitors etc.)
export const OWNER_ROLES = ['platform_admin', 'agency_owner', 'agency_manager']
