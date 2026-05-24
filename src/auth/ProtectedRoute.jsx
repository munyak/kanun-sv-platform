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

export function RequireRole({ allow, children }) {
  const { role } = useAuth()
  if (!role) return <Navigate to="/onboarding" replace />
  if (!allow.includes(role)) {
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
