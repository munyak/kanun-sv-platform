import React, { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { supabase } from '../supabase'
import { logUsage } from '../lib/analytics'

// Record a login for engagement analytics. Deduped to at most once per user
// per day per browser so token refreshes / re-mounts don't inflate the count.
function maybeLogLogin(uid) {
  if (!uid) return
  try {
    const marker = `${uid}:${new Date().toISOString().slice(0, 10)}`
    if (localStorage.getItem('kanun.loginLogged') === marker) return
    localStorage.setItem('kanun.loginLogged', marker)
    logUsage('login', {})
  } catch { /* fire and forget */ }
}

const AuthContext = createContext(null)

const ROLE_RANK = {
  platform_admin: 100,
  agency_owner:    90,
  agency_manager:  80,
  monitor:         60,
  attorney:        40,
  court_liaison:   40,
  parent:          20,
}

function pickPrimaryRole(rows) {
  if (!rows?.length) return null
  return [...rows].sort((a, b) => (ROLE_RANK[b.role] || 0) - (ROLE_RANK[a.role] || 0))[0]
}

// Owner-tier roles that can run the agency (configure org, see all monitors etc.)
// Exported below for use in route guards; declared up here so AuthProvider can
// check whether the "view as" override should apply.
const OWNER_TIER_ROLES = ['platform_admin', 'agency_owner', 'agency_manager']

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [user, setUser] = useState(null)
  const [memberships, setMemberships] = useState([]) // [{ org_id, role, sv_organizations: {...} }]
  const [activeOrgId, setActiveOrgId] = useState(() => localStorage.getItem('kanun.activeOrgId') || null)
  const [onboarding, setOnboarding] = useState(null)
  const [loading, setLoading] = useState(true)
  const [bootstrapping, setBootstrapping] = useState(true)
  // Owner-only dev/testing override: when set, the app renders as if the user
  // had this role (e.g. "monitor") without touching the real membership.
  const [viewAsRole, setViewAsRoleState] = useState(() => localStorage.getItem('kanun.viewAsRole') || null)
  const mountedRef = useRef(true)

  useEffect(() => () => { mountedRef.current = false }, [])

  // initial session + subscribe to changes
  useEffect(() => {
    let sub
    supabase.auth.getSession().then(({ data }) => {
      if (!mountedRef.current) return
      setSession(data.session ?? null)
      setUser(data.session?.user ?? null)
    }).finally(() => {
      if (mountedRef.current) setLoading(false)
    })

    const { data } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (!mountedRef.current) return
      // Don't clear user on transient events (token refresh can emit null briefly)
      if (!newSession && event !== 'SIGNED_OUT') return
      setSession(newSession ?? null)
      setUser(newSession?.user ?? null)
      if (event === 'SIGNED_IN') maybeLogLogin(newSession?.user?.id)
    })
    sub = data?.subscription
    return () => sub?.unsubscribe()
  }, [])

  const loadMemberships = useCallback(async (uid) => {
    if (!uid) {
      setMemberships([])
      setOnboarding(null)
      setBootstrapping(false)
      return
    }
    setBootstrapping(true)
    const { data: roleRows, error: rolesErr } = await supabase
      .from('sv_user_roles')
      .select('id, org_id, role')
      .eq('user_id', uid)
    if (rolesErr) console.error('loadMemberships roles error:', rolesErr)
    let rows = roleRows || []
    // No memberships? They may have a pending invitation created after their
    // account existed (the signup trigger only fires on auth user creation).
    if (rows.length === 0) {
      const { data: accepted, error: accErr } = await supabase.rpc('accept_pending_invitations')
      if (accErr) console.warn('accept_pending_invitations:', accErr.message)
      if (accepted > 0) {
        const retry = await supabase
          .from('sv_user_roles')
          .select('id, org_id, role')
          .eq('user_id', uid)
        rows = retry.data || []
      }
    }
    // Fetch org details separately to avoid PostgREST nested embed issues
    for (const row of rows) {
      if (row.org_id) {
        const { data: org } = await supabase
          .from('sv_organizations')
          .select('id, name, logo_url')
          .eq('id', row.org_id)
          .maybeSingle()
        row.sv_organizations = org
      }
    }
    setMemberships(rows)

    const { data: onb, error: onbErr } = await supabase
      .from('sv_onboarding_progress')
      .select('*')
      .eq('user_id', uid)
      .maybeSingle()
    if (onbErr && onbErr.code !== 'PGRST116') console.error('onboarding load error:', onbErr)
    setOnboarding(onb || null)

    // pick active org if not set or no longer valid
    setActiveOrgId((current) => {
      const valid = current && rows.some((r) => r.org_id === current)
      if (valid) return current
      const primary = pickPrimaryRole(rows)
      const next = primary?.org_id || null
      if (next) localStorage.setItem('kanun.activeOrgId', next)
      else localStorage.removeItem('kanun.activeOrgId')
      return next
    })

    setBootstrapping(false)
  }, [])

  // reload memberships when user changes
  useEffect(() => {
    loadMemberships(user?.id || null)
  }, [user?.id, loadMemberships])

  const setActiveOrg = useCallback((orgId) => {
    setActiveOrgId(orgId)
    if (orgId) localStorage.setItem('kanun.activeOrgId', orgId)
    else localStorage.removeItem('kanun.activeOrgId')
  }, [])

  const refresh = useCallback(() => loadMemberships(user?.id || null), [user?.id, loadMemberships])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    localStorage.removeItem('kanun.activeOrgId')
    localStorage.removeItem('kanun.viewAsRole')
    setMemberships([])
    setOnboarding(null)
    setActiveOrgId(null)
    setViewAsRoleState(null)
  }, [])

  const setViewAsRole = useCallback((nextRole) => {
    setViewAsRoleState(nextRole)
    if (nextRole) localStorage.setItem('kanun.viewAsRole', nextRole)
    else localStorage.removeItem('kanun.viewAsRole')
  }, [])

  const value = useMemo(() => {
    const activeMembership = memberships.find((m) => m.org_id === activeOrgId) || null
    const actualRole = activeMembership?.role || null
    // Only owner-tier roles can use the dev "view as" override.
    const canSwitchView = OWNER_TIER_ROLES.includes(actualRole)
    const effectiveViewAs = canSwitchView ? viewAsRole : null
    const role = effectiveViewAs || actualRole
    const org = activeMembership?.sv_organizations || null
    return {
      session,
      user,
      memberships,
      activeOrgId,
      activeMembership,
      org,
      role,
      actualRole,
      viewAsRole: effectiveViewAs,
      canSwitchView,
      setViewAsRole,
      onboarding,
      hasOrg: !!activeOrgId,
      loading,
      bootstrapping,
      setActiveOrg,
      refresh,
      signOut,
    }
  }, [session, user, memberships, activeOrgId, viewAsRole, onboarding, loading, bootstrapping, setActiveOrg, setViewAsRole, refresh, signOut])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

export function roleLabel(role) {
  if (!role) return ''
  return role
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}
