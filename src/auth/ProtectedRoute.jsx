import React, { useState, useEffect } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './AuthContext'
import { supabase } from '../supabase'
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

// Cache the gate decision per user id for this page load so we don't re-hit
// the edge function on every protected navigation.
const gateCache = new Map()

// Pilot approval gate. Applies to EVERY authenticated session — email/password
// AND Google/Facebook OAuth — so OAuth users can't bypass approval. Admins and
// existing org members pass instantly (no network call); everyone else is
// checked (and, for fresh OAuth sign-ins, enqueued) by the pilot-gate function.
export function RequireApproved({ children }) {
  const { user, memberships, loading, bootstrapping } = useAuth()
  const [access, setAccess] = useState(() => (user && gateCache.get(user.id)) || null)

  useEffect(() => {
    if (!user || bootstrapping) return
    const email = (user.email || '').toLowerCase()
    if (PILOT_ADMIN_EMAILS.includes(email)) { gateCache.set(user.id, 'admin'); setAccess('admin'); return }
    if (memberships.length > 0) { gateCache.set(user.id, 'member'); setAccess('member'); return }
    if (gateCache.has(user.id)) { setAccess(gateCache.get(user.id)); return }
    let cancelled = false
    supabase.functions.invoke('pilot-gate').then(({ data, error }) => {
      if (cancelled) return
      const a = (!error && data?.access) ? data.access : 'pending'
      gateCache.set(user.id, a)
      setAccess(a)
    })
    return () => { cancelled = true }
  }, [user, memberships, bootstrapping])

  if (loading || bootstrapping) return <div className="loading">Loading…</div>
  if (!user) return <Navigate to="/login" replace />
  if (['admin', 'member', 'approved'].includes(access)) return children
  if (!access) return <div className="loading">Loading…</div>
  return <PendingApproval status={access} email={user.email} />
}

function PendingApproval({ status, email }) {
  const { signOut } = useAuth()
  const rejected = status === 'rejected'
  return (
    <div className="pa-page">
      <div className="pa-card pa-thanks">
        <div className="pa-badge">{rejected ? '–' : '⏳'}</div>
        <h1>{rejected ? 'Application not approved' : 'Your access is pending approval'}</h1>
        <p>
          {rejected
            ? 'Your request to join the KaNun Monitoring pilot wasn’t approved. If you think this is a mistake, reply to your confirmation email.'
            : <>Thanks for signing in{email ? <> as <strong>{email}</strong></> : ''}. A KaNun administrator
              reviews each pilot tester individually — you’ll be able to access the platform as soon as
              you’re approved (within about a week).</>}
        </p>
        {!rejected && (
          <button className="pa-btn pa-btn-ghost" onClick={() => window.location.reload()}>
            I’ve been approved — refresh
          </button>
        )}
        <button className="pa-btn pa-btn-ghost" onClick={signOut} style={{ marginTop: 8 }}>Sign out</button>
      </div>
    </div>
  )
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
