import React from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './AuthContext'

export function RequireAuth({ children }) {
  const { user, loading } = useAuth()
  const loc = useLocation()
  if (loading) return <div className="loading">Loading…</div>
  if (!user) return <Navigate to="/login" replace state={{ from: loc }} />
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
