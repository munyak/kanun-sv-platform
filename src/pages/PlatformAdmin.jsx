import React, { useEffect, useState, useCallback } from 'react'
import { supabase } from '../supabase'
import { useAuth, roleLabel } from '../auth/AuthContext'
import { callLLM, parseLLMJson } from '../lib/academy'

/* ---- helpers ---- */
function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
function fmtRelative(d) {
  if (!d) return 'Never'
  const diff = Date.now() - new Date(d).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'Just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const days = Math.floor(h / 24)
  if (days < 30) return `${days}d ago`
  return fmtDate(d)
}
function fmtTime(t) {
  if (!t) return ''
  const [h, m] = String(t).split(':')
  const d = new Date(); d.setHours(Number(h), Number(m))
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}
function statusDot(status) {
  const map = { scheduled: 'blue', confirmed: 'blue', in_progress: 'yellow', completed: 'green', report_pending: 'yellow', draft: 'gray', pending_review: 'yellow', approved: 'green', active: 'green' }
  return map[status] || 'gray'
}

/* ---- event icons ---- */
function EventIcon({ type }) {
  const icons = {
    visit_scheduled: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg>,
    report_submitted: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="2"/><path d="M9 14l2 2 4-4"/></svg>,
    user_joined: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="8" r="3.5"/><path d="M5 20a7 7 0 0114 0"/></svg>,
  }
  return <span style={{ color: 'var(--text-tertiary)', display: 'flex' }}>{icons[type] || icons.user_joined}</span>
}

export default function PlatformAdmin() {
  const { role } = useAuth()
  const [stats, setStats] = useState(null)
  const [orgs, setOrgs] = useState([])
  const [users, setUsers] = useState([])
  const [activity, setActivity] = useState([])
  const [attention, setAttention] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('overview')
  const [search, setSearch] = useState('')
  const [toast, setToast] = useState(null)
  const [resetBusy, setResetBusy] = useState(null)

  // Background checks
  const [bgChecks, setBgChecks] = useState([])
  const [orderCheckMonitor, setOrderCheckMonitor] = useState(null)
  const [orderBusy, setOrderBusy] = useState(false)
  const [checkForm, setCheckForm] = useState({
    date_of_birth: '', address: '', city: '', province_state: '',
    county: '', postal_code: '', sin_ssn: '', check_type: 'us_criminal_tier1',
  })

  // Usage analytics
  const [analytics, setAnalytics] = useState(null)
  const [analyticsLoading, setAnalyticsLoading] = useState(false)
  const [analyticsDays, setAnalyticsDays] = useState(30)
  // AI insights (LLM read of the analytics)
  const [insights, setInsights] = useState(null)
  const [insightsBusy, setInsightsBusy] = useState(false)
  const [insightsErr, setInsightsErr] = useState(null)
  // Tester feedback + usage events
  const [feedback, setFeedback] = useState(null)
  const [usageEvents, setUsageEvents] = useState(null)
  const [feedbackLoading, setFeedbackLoading] = useState(false)
  // Post-signup engagement (funnel + retention + activation + per-user activity)
  const [engagement, setEngagement] = useState(null)
  const [engagementLoading, setEngagementLoading] = useState(false)
  const [engSearch, setEngSearch] = useState('')
  // Engagement filters (segmentation)
  const [engPeriod, setEngPeriod] = useState(30)
  const [engExcludeInternal, setEngExcludeInternal] = useState(true)
  const [engRole, setEngRole] = useState('')
  const [engOrg, setEngOrg] = useState('')
  const [engShowInternal, setEngShowInternal] = useState(false)  // per-user table toggle
  // Per-user activity timeline (Amplitude-style event stream)
  const [userTimeline, setUserTimeline] = useState(null)
  const [userTimelineLoading, setUserTimelineLoading] = useState(false)

  // Detail panels
  const [selectedOrg, setSelectedOrg] = useState(null)
  const [orgDetail, setOrgDetail] = useState(null)
  const [orgDetailLoading, setOrgDetailLoading] = useState(false)
  const [selectedUser, setSelectedUser] = useState(null)
  const [userDetail, setUserDetail] = useState(null)
  const [userDetailLoading, setUserDetailLoading] = useState(false)
  // Remove-access / delete-account confirmation: { id, name, action }
  const [userAction, setUserAction] = useState(null)
  const [userActionBusy, setUserActionBusy] = useState(false)

  function showToast(message, kind = 'success') {
    setToast({ message, kind }); setTimeout(() => setToast(null), 4000)
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [sRes, oRes, uRes, aRes, atRes, bgRes] = await Promise.all([
        supabase.rpc('platform_admin_stats'),
        supabase.rpc('platform_admin_orgs'),
        supabase.rpc('platform_admin_users'),
        supabase.rpc('platform_admin_activity'),
        supabase.rpc('platform_admin_attention'),
        supabase.rpc('platform_admin_background_checks'),
      ])
      if (sRes.error) throw sRes.error
      setStats(sRes.data)
      setOrgs(oRes.data || [])
      setUsers(uRes.data || [])
      setActivity(aRes.data || [])
      setAttention(atRes.data || {})
      setBgChecks(bgRes.data || [])
    } catch (e) {
      console.error('PlatformAdmin load:', e)
      showToast(e.message || 'Failed to load', 'error')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  async function loadOrgDetail(orgId) {
    setSelectedOrg(orgId); setOrgDetailLoading(true); setOrgDetail(null)
    try {
      const { data, error } = await supabase.rpc('platform_admin_org_detail', { p_org_id: orgId })
      if (error) throw error
      setOrgDetail(data)
    } catch (e) { showToast(e.message, 'error') }
    finally { setOrgDetailLoading(false) }
  }

  async function loadUserDetail(userId) {
    setSelectedUser(userId); setUserDetailLoading(true); setUserDetail(null)
    setUserTimeline(null); setUserTimelineLoading(true)
    try {
      const { data, error } = await supabase.rpc('platform_admin_user_detail', { p_user_id: userId })
      if (error) throw error
      setUserDetail(data)
    } catch (e) { showToast(e.message, 'error') }
    finally { setUserDetailLoading(false) }
    // Activity timeline loads independently (metadata-only event stream)
    try {
      const { data, error } = await supabase.rpc('platform_admin_user_timeline', { p_user_id: userId, p_limit: 200 })
      if (error) throw error
      setUserTimeline(data || [])
    } catch (e) { setUserTimeline([]) }
    finally { setUserTimelineLoading(false) }
  }

  // Remove access (revoke role + deactivate monitor, records preserved) or
  // permanently delete the account — both enforced server-side in manage-user.
  async function runUserAction() {
    if (!userAction) return
    const { id, action } = userAction
    setUserActionBusy(true)
    try {
      const { data, error } = await supabase.functions.invoke('manage-user', { body: { action, user_id: id } })
      if (error) {
        let msg = 'Action failed.'
        try { const j = await error.context?.json?.(); if (j) msg = j.message || j.error || msg } catch { /* */ }
        throw new Error(msg)
      }
      if (data?.error) throw new Error(data.message || data.error)
      showToast(action === 'delete_account' ? 'Account permanently deleted.' : 'Access removed.')
      setUserAction(null); setSelectedUser(null); setUserDetail(null); load()
    } catch (e) {
      showToast(e.message || 'Action failed.', 'error')
    } finally { setUserActionBusy(false) }
  }

  async function handleOrderCheck(monitor) {
    if (!checkForm.address || !checkForm.city || !checkForm.province_state || !checkForm.county || !checkForm.postal_code || !checkForm.sin_ssn || !checkForm.date_of_birth) {
      showToast('Please fill in all required fields', 'error')
      return
    }
    setOrderBusy(true)
    try {
      const { data, error } = await supabase.functions.invoke('certn-proxy', {
        body: {
          action: 'order_check',
          monitor_id: monitor.id,
          org_id: monitor.org_id || selectedOrg,
          first_name: monitor.first_name,
          last_name: monitor.last_name,
          email: monitor.email,
          date_of_birth: checkForm.date_of_birth,
          check_type: checkForm.check_type,
          address: checkForm.address,
          city: checkForm.city,
          province_state: checkForm.province_state,
          county: checkForm.county,
          postal_code: checkForm.postal_code,
          country: 'US',
          sin_ssn: checkForm.sin_ssn.replace(/[^0-9]/g, ''),
        },
      })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      showToast(`Background check ordered for ${monitor.first_name} ${monitor.last_name}`)
      setOrderCheckMonitor(null)
      setCheckForm({ date_of_birth: '', address: '', city: '', province_state: '', county: '', postal_code: '', sin_ssn: '', check_type: 'us_criminal_tier1' })
      load()
    } catch (e) {
      showToast(e.message || 'Failed to order check', 'error')
    } finally { setOrderBusy(false) }
  }

  async function handlePasswordReset(email) {
    setResetBusy(email)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + '/reset-password' })
      if (error) throw error
      showToast(`Reset link sent to ${email}`)
    } catch (e) { showToast(e.message, 'error') }
    finally { setResetBusy(null) }
  }

  async function loadAnalytics(days = analyticsDays) {
    setAnalyticsLoading(true)
    try {
      const { data, error } = await supabase.rpc('platform_admin_usage_analytics', { p_days: days })
      if (error) throw error
      setAnalytics(data)
    } catch (e) {
      console.error('Analytics load:', e)
      showToast(e.message || 'Failed to load analytics', 'error')
    } finally { setAnalyticsLoading(false) }
  }

  const loadEngagement = useCallback(async (opts = {}) => {
    const days = opts.days ?? engPeriod
    const exclude = opts.exclude ?? engExcludeInternal
    const roleF = opts.role ?? engRole
    const orgF = opts.org ?? engOrg
    setEngagementLoading(true)
    try {
      const { data, error } = await supabase.rpc('platform_admin_engagement_v2', {
        p_days: days,
        p_exclude_internal: exclude,
        p_role: roleF || null,
        p_org: orgF || null,
      })
      if (error) throw error
      setEngagement(data)
    } catch (e) {
      console.error('Engagement load:', e)
      showToast(e.message || 'Failed to load engagement', 'error')
    } finally { setEngagementLoading(false) }
  }, [engPeriod, engExcludeInternal, engRole, engOrg])

  async function loadFeedback() {
    setFeedbackLoading(true)
    try {
      const [fb, ev] = await Promise.all([
        supabase.from('sv_feedback')
          .select('id,created_at,prompt,rating,comment,context,user_id,org_id')
          .order('created_at', { ascending: false }).limit(100),
        supabase.from('sv_usage_events')
          .select('event,created_at,path,user_id')
          .order('created_at', { ascending: false }).limit(300),
      ])
      if (fb.error) throw fb.error
      setFeedback(fb.data || [])
      setUsageEvents(ev.data || [])
    } catch (e) {
      showToast(e.message || 'Failed to load feedback', 'error')
    } finally { setFeedbackLoading(false) }
  }

  async function loadInsights() {
    if (!analytics) return
    setInsightsBusy(true); setInsightsErr(null)
    try {
      const payload = {
        period_days: analyticsDays,
        platform_totals: {
          orgs: stats?.total_orgs, users: stats?.total_users,
          monitors: stats?.total_monitors, reports: stats?.total_reports,
          pending_reports: stats?.pending_reports,
        },
        visits: analytics.visits_summary,
        observations: analytics.observations_summary,
        reports: analytics.reports_summary,
        feature_adoption: analytics.feature_adoption,
        active_users: analytics.active_users,
        daily_visits: analytics.daily_visits,
        monitor_activity: (analytics.monitor_activity || []).slice(0, 20),
        org_usage: analytics.org_usage,
      }
      const res = await callLLM({ mode: 'insights', messages: [{ role: 'user', content: JSON.stringify(payload) }] })
      setInsights(parseLLMJson(res.content))
    } catch (e) {
      setInsightsErr(e.message || 'Could not generate insights.')
    } finally { setInsightsBusy(false) }
  }

  // Lazy-load each heavy tab on first open
  useEffect(() => {
    if (tab === 'analytics' && !analytics && !analyticsLoading) loadAnalytics()
    if (tab === 'engagement' && !engagement && !engagementLoading) loadEngagement()
    if (tab === 'feedback' && !feedback && !feedbackLoading) loadFeedback()
  }, [tab])

  if (role !== 'platform_admin') {
    return <div className="empty-state" style={{ marginTop: 64 }}><div className="empty-state-title">Not authorized</div></div>
  }
  if (loading) return <div className="loading">Loading platform data...</div>

  const filteredUsers = users.filter(u => {
    if (!search) return true
    const q = search.toLowerCase()
    return (u.email || '').toLowerCase().includes(q) || (u.full_name || '').toLowerCase().includes(q)
      || (u.memberships || []).some(m => (m.org_name || '').toLowerCase().includes(q))
  })

  const pendingReports = attention?.pending_reports || []
  const uncompliantMonitors = attention?.uncompliant_monitors || []
  const recentIncidents = attention?.recent_incidents || []
  const attentionCount = pendingReports.length + uncompliantMonitors.length + recentIncidents.length

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Platform administration</h1>
          <div className="page-subtitle">Single pane of glass across all organizations</div>
        </div>
        <button className="btn btn-secondary" onClick={load}>Refresh</button>
      </div>

      {/* Tabs */}
      <div className="admin-tabs">
        {[
          { key: 'overview', label: 'Overview' },
          { key: 'organizations', label: `Organizations (${orgs.length})` },
          { key: 'users', label: `Users (${users.length})` },
          { key: 'attention', label: `Needs attention${attentionCount ? ` (${attentionCount})` : ''}` },
          { key: 'background_checks', label: `Background checks (${bgChecks.length})` },
          { key: 'analytics', label: 'Analytics' },
          { key: 'engagement', label: 'Engagement' },
          { key: 'feedback', label: 'Tester feedback' },
        ].map(t => (
          <button key={t.key} className={`admin-tab ${tab === t.key ? 'active' : ''}`} onClick={() => { setTab(t.key); setSelectedOrg(null); setSelectedUser(null) }}>{t.label}</button>
        ))}
      </div>

      {/* ============ OVERVIEW TAB ============ */}
      {tab === 'overview' && (
        <>
          {stats && (
            <div className="stats-grid">
              <StatCard label="Organizations" value={stats.total_orgs} sub="Registered agencies" onClick={() => setTab('organizations')} />
              <StatCard label="Users" value={stats.total_users} sub={`${stats.total_monitors} active monitors`} onClick={() => setTab('users')} />
              <StatCard label="Active cases" value={stats.total_cases} sub={`${stats.total_visits} total visits`} />
              <StatCard label="This month" value={stats.visits_this_month} sub="Visits scheduled" />
              <StatCard label="Reports" value={stats.total_reports} sub={`${stats.pending_reports} pending review`} onClick={() => setTab('attention')} />
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            {/* Recent activity */}
            <div className="card">
              <div className="card-header">
                <div className="card-title">Recent activity</div>
              </div>
              <div className="card-body" style={{ padding: 0 }}>
                {activity.length === 0 ? (
                  <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>No recent activity</div>
                ) : activity.map((a, i) => (
                  <div key={i} className="admin-activity-row">
                    <EventIcon type={a.event_type} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: 'var(--text-primary)' }}>
                        {a.event_type === 'visit_scheduled' && <>Visit scheduled{a.case_number ? ` · ${a.case_number}` : ''}</>}
                        {a.event_type === 'report_submitted' && <>Report {a.detail}{a.case_number ? ` · ${a.case_number}` : ''}</>}
                        {a.event_type === 'user_joined' && <>{roleLabel(a.detail)} joined</>}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{a.org_name}</div>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)', flexShrink: 0 }}>{fmtRelative(a.created_at)}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick attention */}
            <div className="card">
              <div className="card-header">
                <div className="card-title">Needs attention</div>
                {attentionCount > 0 && <span className="badge badge-yellow">{attentionCount} items</span>}
              </div>
              <div className="card-body" style={{ padding: 0 }}>
                {attentionCount === 0 ? (
                  <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>All clear</div>
                ) : (
                  <>
                    {pendingReports.map((r, i) => (
                      <div key={'r' + i} className="admin-activity-row">
                        <span className={`admin-dot dot-yellow`} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13 }}>Report pending review{r.case_number ? ` · ${r.case_number}` : ''}</div>
                          <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{r.org_name}</div>
                        </div>
                      </div>
                    ))}
                    {uncompliantMonitors.map((m, i) => (
                      <div key={'m' + i} className="admin-activity-row">
                        <span className="admin-dot dot-red" />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13 }}>{m.first_name} {m.last_name} — compliance gap</div>
                          <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                            {!m.livescan_completed && 'LiveScan '}{!m.trustline_registered && 'TrustLine '}{!m.mandated_reporter_training_date && 'Mandated Reporter'}
                            {' · '}{m.org_name}
                          </div>
                        </div>
                      </div>
                    ))}
                    {recentIncidents.map((inc, i) => (
                      <div key={'i' + i} className="admin-activity-row">
                        <span className={`admin-dot ${inc.severity === 'critical' ? 'dot-red' : 'dot-yellow'}`} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13 }}>{inc.severity === 'critical' ? 'Critical' : 'Concern'}: {(inc.description || '').slice(0, 80)}{(inc.description || '').length > 80 ? '...' : ''}</div>
                          <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{inc.org_name}{inc.case_number ? ` · ${inc.case_number}` : ''} · {fmtRelative(inc.observed_at)}</div>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* ============ ORGANIZATIONS TAB ============ */}
      {tab === 'organizations' && (
        <div style={{ display: 'grid', gridTemplateColumns: selectedOrg ? '1fr 1fr' : '1fr', gap: 20 }}>
          <div className="card">
            <div className="card-header">
              <div className="card-title">All organizations</div>
            </div>
            <div className="card-body-flush">
              {orgs.map(o => (
                <div key={o.id} className={`admin-row-clickable ${selectedOrg === o.id ? 'selected' : ''}`} onClick={() => loadOrgDetail(o.id)}>
                  <div style={{ flex: 1 }}>
                    <div className="cell-strong">{o.name}</div>
                    {o.email && <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{o.email}</div>}
                  </div>
                  <div className="admin-row-stats">
                    <MiniStat label="Members" value={o.member_count} />
                    <MiniStat label="Monitors" value={o.active_monitors} />
                    <MiniStat label="Cases" value={o.active_cases} />
                    <MiniStat label="Visits" value={o.total_visits} />
                  </div>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.5"><path d="M9 18l6-6-6-6"/></svg>
                </div>
              ))}
            </div>
          </div>

          {/* Org detail panel */}
          {selectedOrg && (
            <div className="card admin-detail-panel">
              {orgDetailLoading ? <div className="loading" style={{ padding: 32 }}>Loading...</div> : orgDetail ? (
                <>
                  <div className="card-header">
                    <div>
                      <div className="card-title">{orgDetail.org?.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>
                        {orgDetail.org?.address_city}{orgDetail.org?.address_state ? `, ${orgDetail.org.address_state}` : ''} · Since {fmtDate(orgDetail.org?.created_at)}
                      </div>
                    </div>
                    <button className="btn btn-sm btn-secondary" onClick={() => setSelectedOrg(null)}>Close</button>
                  </div>
                  <div className="card-body" style={{ padding: 0 }}>
                    {/* Members */}
                    <DetailSection title="Members" count={orgDetail.members?.length}>
                      {(orgDetail.members || []).map((m, i) => (
                        <div key={i} className="admin-detail-row" onClick={() => { setTab('users'); loadUserDetail(m.user_id) }} style={{ cursor: 'pointer' }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 13, fontWeight: 500 }}>{m.full_name || m.email}</div>
                            {m.full_name && <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{m.email}</div>}
                          </div>
                          <span className={`badge badge-${m.role === 'platform_admin' ? 'blue' : m.role === 'agency_owner' ? 'green' : 'gray'}`}>{roleLabel(m.role)}</span>
                        </div>
                      ))}
                    </DetailSection>

                    {/* Monitors */}
                    <DetailSection title="Monitors" count={orgDetail.monitors?.length}>
                      {(orgDetail.monitors || []).map((m, i) => (
                        <div key={i} className="admin-detail-row">
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 13, fontWeight: 500 }}>{m.first_name} {m.last_name}</div>
                            <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{m.email || m.phone || '—'}</div>
                          </div>
                          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                            <CompliancePill ok={m.livescan_completed} label="LS" />
                            <CompliancePill ok={m.trustline_registered} label="TL" />
                            <CompliancePill ok={m.mandated_reporter_training_date} label="MR" />
                            <button className="btn btn-sm btn-secondary" style={{ marginLeft: 8, fontSize: 11 }} onClick={(e) => { e.stopPropagation(); setOrderCheckMonitor({ ...m, org_id: selectedOrg }) }}>
                              Run check
                            </button>
                          </div>
                        </div>
                      ))}
                    </DetailSection>

                    {/* Cases */}
                    <DetailSection title="Cases" count={orgDetail.cases?.length}>
                      {(orgDetail.cases || []).map((c, i) => (
                        <div key={i} className="admin-detail-row">
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 12, fontWeight: 500, fontFamily: 'var(--font-mono)' }}>{c.case_number}</div>
                            <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{c.court_name || '—'}</div>
                          </div>
                          <span className={`badge badge-${statusDot(c.status)}`}>{(c.status || '—').replace(/_/g, ' ')}</span>
                        </div>
                      ))}
                    </DetailSection>

                    {/* Recent visits */}
                    <DetailSection title="Recent visits" count={orgDetail.recent_visits?.length}>
                      {(orgDetail.recent_visits || []).map((v, i) => (
                        <div key={i} className="admin-detail-row">
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 13 }}>{fmtDate(v.scheduled_date)} {fmtTime(v.scheduled_start_time)}</div>
                            <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{v.case_number} · {v.monitor_name || 'Unassigned'}</div>
                          </div>
                          <span className={`badge badge-${statusDot(v.status)}`}>{(v.status || '—').replace(/_/g, ' ')}</span>
                        </div>
                      ))}
                    </DetailSection>
                  </div>
                </>
              ) : null}
            </div>
          )}
        </div>
      )}

      {/* ============ USERS TAB ============ */}
      {tab === 'users' && (
        <div style={{ display: 'grid', gridTemplateColumns: selectedUser ? '1fr 1fr' : '1fr', gap: 20 }}>
          <div className="card">
            <div className="card-header">
              <div className="card-title">All users</div>
              <input type="search" className="form-input" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} style={{ width: 220, height: 30, fontSize: 13 }} />
            </div>
            <div className="card-body-flush">
              {filteredUsers.map(u => (
                <div key={u.user_id} className={`admin-row-clickable ${selectedUser === u.user_id ? 'selected' : ''}`} onClick={() => loadUserDetail(u.user_id)}>
                  <div style={{ flex: 1 }}>
                    <div className="cell-strong">{u.full_name || u.email}</div>
                    {u.full_name && <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{u.email}</div>}
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    {(u.memberships || []).map((m, i) => (
                      <span key={i} className={`badge badge-${m.role === 'platform_admin' ? 'blue' : m.role === 'agency_owner' ? 'green' : 'gray'}`}>{roleLabel(m.role)}</span>
                    ))}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)', minWidth: 60, textAlign: 'right' }}>{fmtRelative(u.last_sign_in_at)}</div>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.5"><path d="M9 18l6-6-6-6"/></svg>
                </div>
              ))}
            </div>
          </div>

          {/* User detail panel */}
          {selectedUser && (
            <div className="card admin-detail-panel">
              {userDetailLoading ? <div className="loading" style={{ padding: 32 }}>Loading...</div> : userDetail ? (
                <>
                  <div className="card-header">
                    <div>
                      <div className="card-title">{userDetail.user?.full_name || userDetail.user?.email}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>{userDetail.user?.email}</div>
                    </div>
                    <div className="btn-group">
                      <button className="btn btn-sm btn-secondary" onClick={() => handlePasswordReset(userDetail.user?.email)} disabled={resetBusy === userDetail.user?.email}>
                        {resetBusy === userDetail.user?.email ? 'Sending...' : 'Reset password'}
                      </button>
                      <button className="btn btn-sm btn-secondary" onClick={() => setUserAction({ id: selectedUser, name: userDetail.user?.full_name || userDetail.user?.email, action: 'remove_access' })}>Remove access</button>
                      <button className="btn btn-sm btn-secondary" style={{ color: '#c0392b', borderColor: '#e6b0aa' }} onClick={() => setUserAction({ id: selectedUser, name: userDetail.user?.full_name || userDetail.user?.email, action: 'delete_account' })}>Delete account</button>
                      <button className="btn btn-sm btn-secondary" onClick={() => setSelectedUser(null)}>Close</button>
                    </div>
                  </div>
                  <div className="card-body" style={{ padding: 0 }}>
                    {/* Account info */}
                    <DetailSection title="Account">
                      <div className="admin-kv-grid">
                        <KV label="Email" value={userDetail.user?.email} />
                        <KV label="Confirmed" value={userDetail.user?.email_confirmed_at ? fmtDate(userDetail.user.email_confirmed_at) : 'No'} />
                        <KV label="Last sign in" value={fmtRelative(userDetail.user?.last_sign_in_at)} />
                        <KV label="Created" value={fmtDate(userDetail.user?.created_at)} />
                      </div>
                    </DetailSection>

                    {/* Memberships */}
                    <DetailSection title="Memberships" count={userDetail.memberships?.length}>
                      {(userDetail.memberships || []).map((m, i) => (
                        <div key={i} className="admin-detail-row" onClick={() => { setTab('organizations'); loadOrgDetail(m.org_id) }} style={{ cursor: 'pointer' }}>
                          <div style={{ flex: 1, fontSize: 13 }}>{m.org_name}</div>
                          <span className={`badge badge-${m.role === 'platform_admin' ? 'blue' : 'green'}`}>{roleLabel(m.role)}</span>
                        </div>
                      ))}
                    </DetailSection>

                    {/* Monitor profile */}
                    {userDetail.monitor_profile && (
                      <DetailSection title="Monitor profile">
                        <div className="admin-kv-grid">
                          <KV label="Name" value={`${userDetail.monitor_profile.first_name} ${userDetail.monitor_profile.last_name}`} />
                          <KV label="Phone" value={userDetail.monitor_profile.phone} />
                          <KV label="Languages" value={Array.isArray(userDetail.monitor_profile.languages) ? userDetail.monitor_profile.languages.join(', ') : userDetail.monitor_profile.languages} />
                          <KV label="Travel radius" value={userDetail.monitor_profile.max_travel_radius_miles ? `${userDetail.monitor_profile.max_travel_radius_miles} mi` : '—'} />
                        </div>
                        <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
                          <CompliancePill ok={userDetail.monitor_profile.livescan_completed} label="LiveScan" full />
                          <CompliancePill ok={userDetail.monitor_profile.trustline_registered} label="TrustLine" full />
                          <CompliancePill ok={userDetail.monitor_profile.mandated_reporter_training_date} label="Mandated Reporter" full />
                        </div>
                      </DetailSection>
                    )}

                    {/* Recent visits */}
                    <DetailSection title="Recent visits" count={userDetail.recent_visits?.length}>
                      {(userDetail.recent_visits || []).length === 0 ? (
                        <div style={{ padding: '12px 16px', fontSize: 13, color: 'var(--text-tertiary)' }}>No visits yet</div>
                      ) : userDetail.recent_visits.map((v, i) => (
                        <div key={i} className="admin-detail-row">
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 13 }}>{fmtDate(v.scheduled_date)}</div>
                            <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{v.case_number} · {v.location || '—'}</div>
                          </div>
                          <span className={`badge badge-${statusDot(v.status)}`}>{(v.status || '—').replace(/_/g, ' ')}</span>
                        </div>
                      ))}
                    </DetailSection>

                    {/* Activity timeline — chronological, metadata-only event stream */}
                    <DetailSection title="Activity timeline" count={userTimeline ? userTimeline.length : undefined}>
                      <UserTimeline events={userTimeline} loading={userTimelineLoading} />
                    </DetailSection>
                  </div>
                </>
              ) : null}
            </div>
          )}
        </div>
      )}

      {/* ============ ATTENTION TAB ============ */}
      {tab === 'attention' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Pending reports */}
          <div className="card">
            <div className="card-header">
              <div className="card-title">Pending reports</div>
              <span className="badge badge-yellow">{pendingReports.length}</span>
            </div>
            <div className="card-body-flush">
              {pendingReports.length === 0 ? (
                <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>No pending reports</div>
              ) : (
                <table className="data-table">
                  <thead><tr><th>Case</th><th>Organization</th><th>Status</th><th>Created</th></tr></thead>
                  <tbody>
                    {pendingReports.map((r, i) => (
                      <tr key={i}>
                        <td className="cell-strong">{r.case_number || '—'}</td>
                        <td>{r.org_name}</td>
                        <td><span className={`badge badge-${statusDot(r.status)}`}>{(r.status || '').replace(/_/g, ' ')}</span></td>
                        <td className="cell-muted">{fmtRelative(r.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Non-compliant monitors */}
          <div className="card">
            <div className="card-header">
              <div className="card-title">Compliance gaps</div>
              <span className="badge badge-red">{uncompliantMonitors.length}</span>
            </div>
            <div className="card-body-flush">
              {uncompliantMonitors.length === 0 ? (
                <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>All monitors compliant</div>
              ) : (
                <table className="data-table">
                  <thead><tr><th>Monitor</th><th>Organization</th><th>LiveScan</th><th>TrustLine</th><th>Mandated Reporter</th></tr></thead>
                  <tbody>
                    {uncompliantMonitors.map((m, i) => (
                      <tr key={i}>
                        <td className="cell-strong">{m.first_name} {m.last_name}</td>
                        <td>{m.org_name}</td>
                        <td><CompliancePill ok={m.livescan_completed} label={m.livescan_completed ? 'Cleared' : 'Missing'} full /></td>
                        <td><CompliancePill ok={m.trustline_registered} label={m.trustline_registered ? 'Registered' : 'Missing'} full /></td>
                        <td><CompliancePill ok={m.mandated_reporter_training_date} label={m.mandated_reporter_training_date ? 'Trained' : 'Missing'} full /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Recent incidents */}
          <div className="card">
            <div className="card-header">
              <div className="card-title">Recent incidents</div>
              <span className="badge badge-red">{recentIncidents.length}</span>
            </div>
            <div className="card-body-flush">
              {recentIncidents.length === 0 ? (
                <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>No recent incidents</div>
              ) : recentIncidents.map((inc, i) => (
                <div key={i} className="admin-activity-row">
                  <span className={`admin-dot ${inc.severity === 'critical' ? 'dot-red' : 'dot-yellow'}`} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13 }}>{inc.description}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{inc.org_name}{inc.case_number ? ` · ${inc.case_number}` : ''} · {fmtRelative(inc.observed_at)}</div>
                  </div>
                  <span className={`badge badge-${inc.severity === 'critical' ? 'red' : 'yellow'}`}>{inc.severity}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ============ BACKGROUND CHECKS TAB ============ */}
      {tab === 'background_checks' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="card">
            <div className="card-header">
              <div>
                <div className="card-title">Background checks</div>
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>Powered by Certn — criminal records, identity verification, watchlist screening</div>
              </div>
            </div>
            <div className="card-body-flush">
              {bgChecks.length === 0 ? (
                <div style={{ padding: 48, textAlign: 'center' }}>
                  <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 8 }}>No background checks ordered yet</div>
                  <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 16 }}>Order checks from the Organizations tab by clicking an org and selecting a monitor.</div>
                </div>
              ) : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Monitor</th>
                      <th>Organization</th>
                      <th>Type</th>
                      <th>Status</th>
                      <th>Result</th>
                      <th>Criminal</th>
                      <th>Identity</th>
                      <th>Watchlist</th>
                      <th>Requested</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bgChecks.map((bc, i) => (
                      <tr key={i}>
                        <td className="cell-strong">{bc.monitor_name || `${bc.first_name} ${bc.last_name}`}</td>
                        <td>{bc.org_name}</td>
                        <td style={{ fontSize: 12 }}>{(bc.check_type || '').replace(/_/g, ' ')}</td>
                        <td><BgStatusBadge status={bc.certn_status} /></td>
                        <td><BgResultBadge result={bc.overall_result} /></td>
                        <td>{bc.criminal_record_found === null ? '—' : bc.criminal_record_found ? <span style={{ color: 'var(--error)' }}>Found</span> : <span style={{ color: 'var(--success)' }}>Clear</span>}</td>
                        <td>{bc.identity_verified === null ? '—' : bc.identity_verified ? <span style={{ color: 'var(--success)' }}>Verified</span> : <span style={{ color: 'var(--error)' }}>Failed</span>}</td>
                        <td>{bc.sanctions_found === null ? '—' : bc.sanctions_found ? <span style={{ color: 'var(--error)' }}>Found</span> : <span style={{ color: 'var(--success)' }}>Clear</span>}</td>
                        <td className="cell-muted">{fmtRelative(bc.requested_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <div className="card-title">Setup</div>
            </div>
            <div className="card-body">
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                <p style={{ marginBottom: 12 }}>Background checks are powered by Certn. To order a check, navigate to an organization, select a monitor, and click "Order background check". You will need the monitor's address, date of birth, and SSN.</p>
                <div style={{ background: 'var(--bg-subtle)', padding: '12px 16px', borderRadius: 'var(--r)', fontFamily: 'var(--font-mono)', fontSize: 12, marginBottom: 12 }}>
                  Status: Connected to Certn API<br/>
                  Check types: US Criminal Tier 1-3, International
                </div>
                <p>Checks include: criminal record (CA DOJ + FBI), sex offender registry, identity verification, and global watchlist/sanctions screening. Results typically return in 1-3 business days.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============ ANALYTICS TAB ============ */}
      {tab === 'analytics' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Period selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Period:</span>
            {[7, 30, 60, 90].map(d => (
              <button key={d} className={`btn btn-sm ${analyticsDays === d ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => { setAnalyticsDays(d); loadAnalytics(d) }}>
                {d}d
              </button>
            ))}
            <div style={{ flex: 1 }} />
            <button className="btn btn-sm btn-secondary" onClick={() => loadAnalytics(analyticsDays)} disabled={analyticsLoading}>
              {analyticsLoading ? 'Loading...' : 'Refresh'}
            </button>
          </div>

          {analyticsLoading && !analytics ? (
            <div className="loading" style={{ padding: 48 }}>Loading analytics...</div>
          ) : analytics ? (
            <>
              {/* ── KPI Cards ── */}
              <div className="stats-grid">
                <StatCard label="Visits" value={analytics.visits_summary?.total || 0}
                  sub={`${analytics.visits_summary?.completed || 0} completed · ${analytics.visits_summary?.completion_rate || 0}% rate`} />
                <StatCard label="Observations" value={analytics.observations_summary?.total || 0}
                  sub={`${analytics.observations_summary?.avg_per_visit || 0} avg per visit`} />
                <StatCard label="Reports" value={analytics.reports_summary?.total || 0}
                  sub={`${analytics.reports_summary?.approved || 0} approved · ${analytics.reports_summary?.draft || 0} draft`} />
                <StatCard label="Active users (30d)" value={analytics.active_users?.active_last_30d || 0}
                  sub={`${analytics.active_users?.active_last_7d || 0} in last 7 days`} />
                <StatCard label="GPS check-ins" value={analytics.feature_adoption?.gps_checkins || 0}
                  sub={`${analytics.feature_adoption?.photo_count || 0} photos captured`} />
              </div>

              {/* ── AI insights ── */}
              <div className="card">
                <div className="card-header">
                  <div className="card-title">✨ AI insights</div>
                  <button className="btn btn-sm btn-primary" onClick={loadInsights} disabled={insightsBusy}>
                    {insightsBusy ? 'Analyzing…' : insights ? 'Refresh' : 'Generate insights'}
                  </button>
                </div>
                <div className="card-body">
                  {insightsErr && (
                    <div style={{ background: '#fdecec', border: '1px solid #f5c2c2', color: '#a02020', padding: '9px 12px', borderRadius: 8, fontSize: 13, marginBottom: 12 }}>{insightsErr}</div>
                  )}
                  {!insights && !insightsBusy && !insightsErr && (
                    <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
                      Get an executive read of the last {analyticsDays} days — trends, risks, and recommended actions, generated from the data below.
                    </div>
                  )}
                  {insightsBusy && <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>Analyzing platform trends…</div>}
                  {insights && (
                    <>
                      {insights.summary && <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 14, color: 'var(--text-primary)' }}>{insights.summary}</div>}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {(insights.insights || []).map((it, i) => {
                          const c = it.severity === 'urgent' ? '#c0392b' : it.severity === 'watch' ? '#b8860b' : '#2D6A4F'
                          return (
                            <div key={i} style={{ borderLeft: `3px solid ${c}`, padding: '2px 0 2px 12px' }}>
                              <div style={{ fontSize: 14, fontWeight: 600 }}>
                                <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', color: c, marginRight: 8 }}>{it.severity}</span>
                                {it.title}
                              </div>
                              <div style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '3px 0' }}>{it.observation}</div>
                              <div style={{ fontSize: 13, color: 'var(--text-primary)' }}><strong>→</strong> {it.action}</div>
                            </div>
                          )
                        })}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 14 }}>AI-generated from platform data · review before acting.</div>
                    </>
                  )}
                </div>
              </div>

              {/* ── Visit Trend Chart (simple bar) ── */}
              <div className="card">
                <div className="card-header">
                  <div className="card-title">Visit volume — last {analyticsDays} days</div>
                </div>
                <div className="card-body" style={{ padding: '16px 20px' }}>
                  <VisitTrendChart data={analytics.daily_visits || []} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                {/* ── Feature Adoption ── */}
                <div className="card">
                  <div className="card-header">
                    <div className="card-title">Feature adoption</div>
                  </div>
                  <div className="card-body" style={{ padding: 0 }}>
                    <FeatureRow label="GPS check-in" value={analytics.feature_adoption?.gps_checkins || 0} icon="📍" />
                    <FeatureRow label="GPS check-out" value={analytics.feature_adoption?.gps_checkouts || 0} icon="🏁" />
                    <FeatureRow label="Quick flags" value={analytics.feature_adoption?.quick_flags || 0} icon="🚩" />
                    <FeatureRow label="Photo evidence" value={analytics.feature_adoption?.photo_count || 0} icon="📸" />
                    <FeatureRow label="Total observations" value={analytics.feature_adoption?.total_observations || 0} icon="📝" />
                  </div>
                </div>

                {/* ── Observation Breakdown ── */}
                <div className="card">
                  <div className="card-header">
                    <div className="card-title">Observation breakdown</div>
                  </div>
                  <div className="card-body" style={{ padding: 0 }}>
                    <FeatureRow label="Normal observations" value={analytics.observations_summary?.normal || 0} icon="✅" />
                    <FeatureRow label="Concerns flagged" value={analytics.observations_summary?.concerns || 0} icon="⚠️" />
                    <FeatureRow label="Critical incidents" value={analytics.observations_summary?.critical || 0} icon="🔴" />
                    <FeatureRow label="Avg per visit" value={analytics.observations_summary?.avg_per_visit || 0} icon="📊" />
                  </div>
                </div>
              </div>

              {/* ── Monitor Leaderboard ── */}
              <div className="card">
                <div className="card-header">
                  <div className="card-title">Monitor activity</div>
                  <span className="badge badge-blue">{(analytics.monitor_activity || []).length} monitors</span>
                </div>
                <div className="card-body-flush">
                  {(analytics.monitor_activity || []).length === 0 ? (
                    <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>No monitor activity in this period</div>
                  ) : (
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Monitor</th>
                          <th>Organization</th>
                          <th style={{ textAlign: 'right' }}>Visits</th>
                          <th style={{ textAlign: 'right' }}>Completed</th>
                          <th style={{ textAlign: 'right' }}>Observations</th>
                          <th>GPS</th>
                          <th>Last active</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(analytics.monitor_activity || []).map((m, i) => (
                          <tr key={i}
                            className={m.user_id ? 'admin-row-clickable' : ''}
                            style={m.user_id ? { cursor: 'pointer' } : undefined}
                            onClick={m.user_id ? () => { setTab('users'); loadUserDetail(m.user_id) } : undefined}>
                            <td className="cell-strong">{m.first_name} {m.last_name}</td>
                            <td>{m.org_name}</td>
                            <td style={{ textAlign: 'right' }}>{m.visit_count}</td>
                            <td style={{ textAlign: 'right' }}>{m.completed_visits}</td>
                            <td style={{ textAlign: 'right' }}>{m.observation_count}</td>
                            <td>{m.used_gps ? <span style={{ color: 'var(--success)' }}>✓</span> : <span style={{ color: 'var(--text-tertiary)' }}>—</span>}</td>
                            <td className="cell-muted">{fmtRelative(m.last_active_date)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

              {/* ── Org Usage Breakdown ── */}
              <div className="card">
                <div className="card-header">
                  <div className="card-title">Usage by organization</div>
                </div>
                <div className="card-body-flush">
                  {(analytics.org_usage || []).length === 0 ? (
                    <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>No organization data</div>
                  ) : (
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Organization</th>
                          <th style={{ textAlign: 'right' }}>Active monitors</th>
                          <th style={{ textAlign: 'right' }}>Total users</th>
                          <th style={{ textAlign: 'right' }}>Visits</th>
                          <th style={{ textAlign: 'right' }}>Completed</th>
                          <th>Last visit</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(analytics.org_usage || []).map((o, i) => (
                          <tr key={i}
                            className={o.org_id ? 'admin-row-clickable' : ''}
                            style={o.org_id ? { cursor: 'pointer' } : undefined}
                            onClick={o.org_id ? () => { setTab('organizations'); loadOrgDetail(o.org_id) } : undefined}>
                            <td className="cell-strong">{o.org_name}</td>
                            <td style={{ textAlign: 'right' }}>{o.active_monitors}</td>
                            <td style={{ textAlign: 'right' }}>{o.total_users}</td>
                            <td style={{ textAlign: 'right' }}>{o.visit_count}</td>
                            <td style={{ textAlign: 'right' }}>{o.completed_visits}</td>
                            <td className="cell-muted">{fmtRelative(o.last_visit_date)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

              {/* ── Active Users ── */}
              <div className="card">
                <div className="card-header">
                  <div className="card-title">User engagement</div>
                </div>
                <div className="card-body">
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
                    <div>
                      <div style={{ fontSize: 24, fontWeight: 600, color: 'var(--text-primary)' }}>{analytics.active_users?.total_users || 0}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>Total users</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 24, fontWeight: 600, color: 'var(--success)' }}>{analytics.active_users?.active_last_7d || 0}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>Active (7d)</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 24, fontWeight: 600, color: 'var(--accent)' }}>{analytics.active_users?.active_last_30d || 0}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>Active (30d)</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 24, fontWeight: 600, color: 'var(--error)' }}>{analytics.active_users?.never_logged_in || 0}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>Never logged in</div>
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-tertiary)' }}>
              <div style={{ fontSize: 14, marginBottom: 8 }}>Click to load usage analytics</div>
              <button className="btn btn-primary" onClick={() => loadAnalytics()}>Load analytics</button>
            </div>
          )}
        </div>
      )}

      {/* ============ ENGAGEMENT TAB ============ */}
      {tab === 'engagement' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Intro + filters */}
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Product-analytics view of what customers do after they sign up — north-star KPIs, retention, activation & time-to-value, feature adoption, and per-user activity. Metadata only; no case, report or visit contents.
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Period</span>
              {[7, 30, 60, 90].map(d => (
                <button key={d} className={`btn btn-sm ${engPeriod === d ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => { setEngPeriod(d); loadEngagement({ days: d }) }}>{d}d</button>
              ))}
            </div>
            <select className="form-input" value={engRole} style={{ height: 30, fontSize: 13, width: 150 }}
              onChange={e => { setEngRole(e.target.value); loadEngagement({ role: e.target.value }) }}>
              <option value="">All roles</option>
              {(engagement?.segments?.roles || []).map(r => (
                <option key={r.role} value={r.role}>{roleLabel(r.role)} ({r.n})</option>
              ))}
            </select>
            <select className="form-input" value={engOrg} style={{ height: 30, fontSize: 13, width: 190 }}
              onChange={e => { setEngOrg(e.target.value); loadEngagement({ org: e.target.value }) }}>
              <option value="">All organizations</option>
              {(engagement?.segments?.orgs || []).map(o => (
                <option key={o.org_id} value={o.org_id}>{o.name} ({o.members})</option>
              ))}
            </select>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer' }}>
              <input type="checkbox" checked={engExcludeInternal}
                onChange={e => { setEngExcludeInternal(e.target.checked); loadEngagement({ exclude: e.target.checked }) }} />
              Exclude staff / test accounts
            </label>
            <div style={{ flex: 1 }} />
            {engagement?.meta && (
              <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                {engagement.meta.universe_size} of {engagement.meta.total_users} users
                {engExcludeInternal && engagement.meta.internal_count > 0 ? ` · ${engagement.meta.internal_count} internal hidden` : ''}
              </span>
            )}
            <button className="btn btn-sm btn-secondary" onClick={() => loadEngagement()} disabled={engagementLoading}>
              {engagementLoading ? 'Loading…' : 'Refresh'}
            </button>
          </div>

          {engagementLoading && !engagement ? (
            <div className="loading" style={{ padding: 48 }}>Loading engagement…</div>
          ) : engagement ? (
            (engagement.meta?.universe_size || 0) === 0 ? (
              <div className="card"><div className="card-body">
                <EmptyState title="No users match these filters"
                  body="Try clearing the role or organization filter, or turn off staff exclusion."
                  action={<button className="btn btn-sm btn-secondary" onClick={() => { setEngRole(''); setEngOrg(''); setEngExcludeInternal(false); loadEngagement({ role: '', org: '', exclude: false }) }}>Clear filters</button>} />
              </div></div>
            ) : (
            <>
              {/* Low-N honesty caveat */}
              {(engagement.meta?.universe_size || 0) < 30 && (
                <div style={{ background: 'var(--warning-soft)', border: '1px solid #EAD9A8', color: '#7a5a08', padding: '9px 13px', borderRadius: 'var(--r)', fontSize: 12.5, display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: 14 }}>ℹ️</span>
                  Based on {engagement.meta.universe_size} {engagement.meta.universe_size === 1 ? 'user' : 'users'} — early-stage sample. Figures are shown as counts ("k of {engagement.meta.universe_size}"); percentages and trends are directional, not statistically significant.
                </div>
              )}

              {/* ── North-star KPI header ── */}
              <div className="stats-grid">
                <KpiCard label="Total users" k={engagement.kpis?.total_users} universe={engagement.meta?.universe_size}
                  suffixSub={`+${engagement.kpis?.total_users?.delta || 0} this period`} />
                <KpiCard label="New signups" k={engagement.kpis?.new_signups} periodDays={engagement.meta?.period_days} spark />
                <KpiCard label="Active users" k={engagement.kpis?.active_users} periodDays={engagement.meta?.period_days} spark />
                <KpiCard label="Activation rate" k={engagement.kpis?.activation_rate} isRate
                  suffixSub={`${engagement.kpis?.activation_rate?.activated || 0} of ${engagement.kpis?.activation_rate?.total || 0} activated`} />
                <KpiCard label="Stickiness (DAU/MAU)" k={engagement.kpis?.stickiness} isRate spark experimental />
              </div>

              {/* ── Funnel + Activation/TTV ── */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.15fr 1fr', gap: 20 }}>
                <div className="card">
                  <div className="card-header">
                    <div className="card-title">Signup → activation funnel</div>
                    <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>conversion & median time-to-convert</span>
                  </div>
                  <div className="card-body"><FunnelV2 funnel={engagement.funnel} /></div>
                </div>
                <div className="card">
                  <div className="card-header"><div className="card-title">Time to value</div></div>
                  <div className="card-body">
                    <TtvCards ttv={engagement.activation?.ttv} />
                    <div style={{ marginTop: 16, borderTop: '1px solid var(--border-subtle)', paddingTop: 14 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>Activation rate by signup week</div>
                      <ActivationCohorts cohorts={engagement.activation?.by_cohort} />
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Retention ── */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 20 }}>
                <div className="card">
                  <div className="card-header">
                    <div className="card-title">Retention cohorts</div>
                    <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>% of weekly signup cohort still active</span>
                  </div>
                  <div className="card-body" style={{ padding: '14px 16px', overflowX: 'auto' }}>
                    <RetentionGrid retention={engagement.retention} />
                  </div>
                </div>
                <div className="card">
                  <div className="card-header">
                    <div className="card-title">Retention curve</div>
                    <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>N-day (rolling)</span>
                  </div>
                  <div className="card-body" style={{ padding: '16px 20px' }}>
                    <RetentionCurve curve={engagement.retention?.curve} />
                  </div>
                </div>
              </div>

              {/* ── Stickiness / active users over time ── */}
              <div className="card">
                <div className="card-header">
                  <div className="card-title">Active users — DAU / WAU / MAU</div>
                  <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>last {engagement.meta?.period_days || 30} days</span>
                </div>
                <div className="card-body" style={{ padding: '16px 20px' }}>
                  <StickinessChart data={engagement.stickiness_series || []} />
                </div>
              </div>

              {/* ── Feature adoption + page areas ── */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                <div className="card">
                  <div className="card-header">
                    <div className="card-title">Feature adoption</div>
                    <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>of {engagement.meta?.universe_size} users</span>
                  </div>
                  <div className="card-body" style={{ padding: '6px 0' }}>
                    <FeatureAdoption features={engagement.feature_adoption} universe={engagement.meta?.universe_size} />
                  </div>
                </div>
                <div className="card">
                  <div className="card-header"><div className="card-title">Most-used areas</div></div>
                  <div className="card-body" style={{ padding: '6px 0' }}>
                    <PageAreas areas={engagement.page_areas} universe={engagement.meta?.universe_size} />
                  </div>
                </div>
              </div>

              {/* ── Daily activity trend ── */}
              <div className="card">
                <div className="card-header"><div className="card-title">Daily activity — last {engagement.meta?.period_days || 30} days</div></div>
                <div className="card-body" style={{ padding: '16px 20px' }}>
                  <EngagementTrend data={engagement.daily || []} />
                </div>
              </div>

              {/* ── Per-user activity table ── */}
              <div className="card">
                <div className="card-header">
                  <div className="card-title">Per-user activity</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer' }}>
                      <input type="checkbox" checked={engShowInternal} onChange={e => setEngShowInternal(e.target.checked)} />
                      Show staff / test
                    </label>
                    <input type="search" className="form-input" placeholder="Search users…" value={engSearch} onChange={e => setEngSearch(e.target.value)} style={{ width: 200, height: 30, fontSize: 13 }} />
                  </div>
                </div>
                <div className="card-body-flush">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>User</th><th>Role</th><th>Signed up</th><th>Last active</th>
                        <th style={{ textAlign: 'right' }}>Cases</th>
                        <th style={{ textAlign: 'right' }}>Visits</th>
                        <th style={{ textAlign: 'right' }}>Reports</th>
                        <th style={{ textAlign: 'right' }}>Academy</th>
                        <th style={{ textAlign: 'right' }}>Events</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(engagement.per_user || []).filter(u => {
                        if (!engShowInternal && u.is_internal) return false
                        if (!engSearch) return true
                        const q = engSearch.toLowerCase()
                        return (u.email || '').toLowerCase().includes(q) || (u.full_name || '').toLowerCase().includes(q) || (u.org_names || '').toLowerCase().includes(q)
                      }).map((u, i) => (
                        <tr key={u.user_id || i} className="admin-row-clickable" style={{ cursor: 'pointer' }} onClick={() => { setTab('users'); loadUserDetail(u.user_id) }}>
                          <td>
                            <div className="cell-strong">{u.full_name || u.email}{u.is_internal && <span className="badge badge-gray" style={{ marginLeft: 6, fontSize: 10 }}>staff</span>}</div>
                            <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{u.org_names || (u.full_name ? u.email : '—')}</div>
                          </td>
                          <td>{u.primary_role ? roleLabel(u.primary_role) : <span style={{ color: 'var(--text-tertiary)' }}>—</span>}</td>
                          <td className="cell-muted">{fmtDate(u.signup_at)}</td>
                          <td className="cell-muted">{fmtRelative(u.last_active || u.last_sign_in_at)}</td>
                          <td style={{ textAlign: 'right' }}>{u.n_cases}</td>
                          <td style={{ textAlign: 'right' }}>{u.n_visits}</td>
                          <td style={{ textAlign: 'right' }}>{u.n_reports}</td>
                          <td style={{ textAlign: 'right' }}>{u.n_academy}</td>
                          <td style={{ textAlign: 'right' }}>{u.n_events}</td>
                          <td><EngagementStatus u={u} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ padding: '10px 16px', fontSize: 11, color: 'var(--text-tertiary)' }}>
                  Activity metadata only — counts, timestamps and statuses. No case, report, or visit contents are shown here. Click a row for the full user detail and activity timeline.
                </div>
              </div>
            </>
            )
          ) : (
            <div style={{ padding: 48, textAlign: 'center' }}>
              <button className="btn btn-primary" onClick={() => loadEngagement()}>Load engagement</button>
            </div>
          )}
        </div>
      )}

      {/* Order check modal */}
      {orderCheckMonitor && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', overflowY: 'auto', padding: '24px 0' }} onClick={() => setOrderCheckMonitor(null)}>
          <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--r-lg)', padding: 24, maxWidth: 520, width: '92%', boxShadow: 'var(--shadow-pop)', margin: 'auto' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 16, fontWeight: 550, marginBottom: 4 }}>Order background check</h3>
            <p style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 16 }}>
              Submit details for {orderCheckMonitor.first_name} {orderCheckMonitor.last_name} to run a US criminal record check via Certn.
            </p>

            {/* Check type */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Check type</label>
              <select value={checkForm.check_type} onChange={e => setCheckForm(f => ({ ...f, check_type: e.target.value }))}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 'var(--r)', border: '1px solid var(--border)', background: 'var(--bg-page)', color: 'var(--text-primary)', fontSize: 13 }}>
                <option value="us_criminal_tier1">US Criminal - Tier 1 (National)</option>
                <option value="us_criminal_tier2">US Criminal - Tier 2 (County)</option>
                <option value="us_criminal_tier3">US Criminal - Tier 3 (Federal)</option>
                <option value="international_criminal">International Criminal</option>
              </select>
            </div>

            {/* Personal info row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Date of birth *</label>
                <input type="date" value={checkForm.date_of_birth} onChange={e => setCheckForm(f => ({ ...f, date_of_birth: e.target.value }))}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 'var(--r)', border: '1px solid var(--border)', background: 'var(--bg-page)', color: 'var(--text-primary)', fontSize: 13 }} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>SSN *</label>
                <input type="text" placeholder="XXX-XX-XXXX" maxLength={11} value={checkForm.sin_ssn} onChange={e => setCheckForm(f => ({ ...f, sin_ssn: e.target.value }))}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 'var(--r)', border: '1px solid var(--border)', background: 'var(--bg-page)', color: 'var(--text-primary)', fontSize: 13 }} />
              </div>
            </div>

            {/* Address */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Street address *</label>
              <input type="text" placeholder="123 Main St" value={checkForm.address} onChange={e => setCheckForm(f => ({ ...f, address: e.target.value }))}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 'var(--r)', border: '1px solid var(--border)', background: 'var(--bg-page)', color: 'var(--text-primary)', fontSize: 13 }} />
            </div>

            {/* City + State */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>City *</label>
                <input type="text" placeholder="Los Angeles" value={checkForm.city} onChange={e => setCheckForm(f => ({ ...f, city: e.target.value }))}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 'var(--r)', border: '1px solid var(--border)', background: 'var(--bg-page)', color: 'var(--text-primary)', fontSize: 13 }} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>State *</label>
                <input type="text" placeholder="CA" maxLength={2} value={checkForm.province_state} onChange={e => setCheckForm(f => ({ ...f, province_state: e.target.value.toUpperCase() }))}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 'var(--r)', border: '1px solid var(--border)', background: 'var(--bg-page)', color: 'var(--text-primary)', fontSize: 13 }} />
              </div>
            </div>

            {/* County + Zip */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>County *</label>
                <input type="text" placeholder="Los Angeles" value={checkForm.county} onChange={e => setCheckForm(f => ({ ...f, county: e.target.value }))}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 'var(--r)', border: '1px solid var(--border)', background: 'var(--bg-page)', color: 'var(--text-primary)', fontSize: 13 }} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>ZIP code *</label>
                <input type="text" placeholder="90001" maxLength={10} value={checkForm.postal_code} onChange={e => setCheckForm(f => ({ ...f, postal_code: e.target.value }))}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 'var(--r)', border: '1px solid var(--border)', background: 'var(--bg-page)', color: 'var(--text-primary)', fontSize: 13 }} />
              </div>
            </div>

            <div style={{ padding: '10px 12px', background: 'var(--bg-subtle)', borderRadius: 'var(--r)', marginBottom: 16, fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.5 }}>
              SSN and personal data are sent directly to Certn via encrypted connection and are not stored in KaNun Monitoring.
            </div>

            <div className="btn-group" style={{ justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => { setOrderCheckMonitor(null); setCheckForm({ date_of_birth: '', address: '', city: '', province_state: '', county: '', postal_code: '', sin_ssn: '', check_type: 'us_criminal_tier1' }) }}>Cancel</button>
              <button className="btn btn-primary" onClick={() => handleOrderCheck(orderCheckMonitor)} disabled={orderBusy}>
                {orderBusy ? 'Ordering...' : 'Order check'}
              </button>
            </div>
          </div>
        </div>
      )}

      {tab === 'feedback' && (() => {
        const fbRows = feedback || []
        const rated = fbRows.filter((f) => f.rating)
        const avg = rated.length ? (rated.reduce((s, f) => s + f.rating, 0) / rated.length).toFixed(1) : '—'
        const ev = usageEvents || []
        const activeTesters = new Set(ev.map((e) => e.user_id).filter(Boolean)).size
        const counts = {}; ev.forEach((e) => { counts[e.event] = (counts[e.event] || 0) + 1 })
        const topEvents = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8)
        const paths = {}; ev.filter((e) => e.event === 'page_view').forEach((e) => { paths[e.path] = (paths[e.path] || 0) + 1 })
        const topPaths = Object.entries(paths).sort((a, b) => b[1] - a[1]).slice(0, 8)
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {feedbackLoading ? <div className="loading" style={{ padding: 32 }}>Loading…</div> : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
                  <StatCard label="Feedback responses" value={fbRows.length} sub="most recent 100" />
                  <StatCard label="Avg rating" value={avg} sub="out of 5" />
                  <StatCard label="Activity events" value={ev.length} sub="most recent 300" />
                  <StatCard label="Active testers" value={activeTesters} sub="distinct users" />
                </div>

                <div className="card">
                  <div className="card-header">
                    <div className="card-title">Recent feedback</div>
                    <span className="badge badge-blue">{fbRows.length}</span>
                  </div>
                  <div className="card-body-flush">
                    {fbRows.length === 0 ? (
                      <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>
                        No feedback yet — testers are prompted in-app, non-invasively, as they use the platform.
                      </div>
                    ) : (
                      <table className="data-table">
                        <thead><tr><th>Rating</th><th>Prompt / comment</th><th>Where</th><th>When</th></tr></thead>
                        <tbody>
                          {fbRows.map((f) => (
                            <tr key={f.id}>
                              <td className="cell-strong">{f.rating ? `${f.rating}/5` : '—'}</td>
                              <td>
                                <div style={{ fontSize: 13 }}>{f.prompt}</div>
                                {f.comment && <div style={{ fontSize: 13, color: 'var(--text-secondary)', fontStyle: 'italic', marginTop: 2 }}>“{f.comment}”</div>}
                              </td>
                              <td className="cell-muted">{f.context?.path || '—'}</td>
                              <td className="cell-muted">{fmtRelative(f.created_at)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                  <div className="card">
                    <div className="card-header"><div className="card-title">Top actions</div></div>
                    <div className="card-body" style={{ padding: 0 }}>
                      {topEvents.length === 0
                        ? <div style={{ padding: 24, fontSize: 13, color: 'var(--text-tertiary)' }}>No activity captured yet</div>
                        : topEvents.map(([name, n]) => <FeatureRow key={name} label={name.replace(/_/g, ' ')} value={n} icon="•" />)}
                    </div>
                  </div>
                  <div className="card">
                    <div className="card-header"><div className="card-title">Most-visited pages</div></div>
                    <div className="card-body" style={{ padding: 0 }}>
                      {topPaths.length === 0
                        ? <div style={{ padding: 24, fontSize: 13, color: 'var(--text-tertiary)' }}>No page views yet</div>
                        : topPaths.map(([p, n]) => <FeatureRow key={p} label={p} value={n} icon="→" />)}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )
      })()}

      {userAction && (
        <div onClick={() => !userActionBusy && setUserAction(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(11,40,28,.45)', backdropFilter: 'blur(2px)', display: 'grid', placeItems: 'center', zIndex: 1000, padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: 16, padding: '24px 26px', maxWidth: 460, width: '100%', boxShadow: '0 24px 60px rgba(0,0,0,.3)' }}>
            <h3 style={{ margin: '0 0 8px', fontSize: 18 }}>
              {userAction.action === 'delete_account' ? 'Permanently delete account?' : 'Remove access?'}
            </h3>
            <p style={{ margin: '0 0 18px', fontSize: 14, lineHeight: 1.55, color: '#44564f' }}>
              {userAction.action === 'delete_account'
                ? <>This permanently deletes <strong>{userAction.name}</strong>'s account and login. It's only allowed if they have <strong>no</strong> visit records or reports — otherwise use “Remove access”. This cannot be undone.</>
                : <><strong>{userAction.name}</strong> will lose all access and their monitor profile will be deactivated. Their existing visits, observations and reports are <strong>preserved</strong>. You can re-invite them later.</>}
            </p>
            <div className="btn-group" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-sm btn-secondary" onClick={() => setUserAction(null)} disabled={userActionBusy}>Cancel</button>
              <button className="btn btn-sm" style={{ background: '#c0392b', color: '#fff' }} onClick={runUserAction} disabled={userActionBusy}>
                {userActionBusy ? 'Working…' : userAction.action === 'delete_account' ? 'Delete permanently' : 'Remove access'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className={`toast ${toast.kind === 'error' ? 'error' : ''}`}>{toast.message}</div>}
    </div>
  )
}

/* ---- Small components ---- */

function StatCard({ label, value, sub, onClick }) {
  return (
    <div className={`stat-card ${onClick ? 'stat-card-clickable' : ''}`} onClick={onClick} style={onClick ? { cursor: 'pointer' } : undefined}>
      <div className="stat-card-head"><div className="stat-label">{label}</div></div>
      <div className="stat-value">{value}</div>
      <div className="stat-sub">{sub}</div>
    </div>
  )
}

function MiniStat({ label, value }) {
  return (
    <div style={{ textAlign: 'center', minWidth: 48 }}>
      <div style={{ fontSize: 15, fontWeight: 550, color: 'var(--text-primary)', lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2 }}>{label}</div>
    </div>
  )
}

function DetailSection({ title, count, children }) {
  return (
    <div className="admin-detail-section">
      <div className="admin-detail-section-head">
        <span>{title}</span>
        {count !== undefined && <span style={{ color: 'var(--text-tertiary)' }}>{count}</span>}
      </div>
      {children}
    </div>
  )
}

function CompliancePill({ ok, label, full }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: full ? 12 : 11, fontWeight: 450,
      padding: full ? '3px 8px' : '2px 6px',
      borderRadius: 4,
      background: ok ? 'var(--success-soft)' : 'var(--error-soft)',
      color: ok ? 'var(--success)' : 'var(--error)',
    }}>
      {ok ? '✓' : '✗'} {label}
    </span>
  )
}

function KV({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, color: 'var(--text-primary)' }}>{value || '—'}</div>
    </div>
  )
}

function BgStatusBadge({ status }) {
  if (!status) return <span className="badge badge-gray">—</span>
  const map = { pending: 'gray', ordering: 'gray', submitted: 'blue', in_progress: 'blue', complete: 'green', COMPLETE: 'green', error: 'red' }
  return <span className={`badge badge-${map[status] || 'gray'}`}>{(status || '').replace(/_/g, ' ')}</span>
}

function BgResultBadge({ result }) {
  if (!result) return <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Pending</span>
  const map = { clear: 'green', CLEAR: 'green', review: 'yellow', REVIEW: 'yellow', fail: 'red', FAIL: 'red' }
  const color = map[result] || 'gray'
  return <span className={`badge badge-${color}`}>{result}</span>
}

/* ---- Analytics chart components ---- */

function VisitTrendChart({ data }) {
  if (!data || data.length === 0) {
    return <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>No visit data in this period</div>
  }
  const maxVal = Math.max(...data.map(d => d.total), 1)
  // Show at most last 30 data points
  const displayData = data.slice(-30)
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 120, overflow: 'hidden' }}>
      {displayData.map((d, i) => {
        const height = Math.max((d.total / maxVal) * 100, 2)
        const completedH = d.total > 0 ? (d.completed / d.total) * height : 0
        const cancelledH = d.total > 0 ? (d.cancelled / d.total) * height : 0
        const otherH = height - completedH - cancelledH
        const dayLabel = new Date(d.day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        return (
          <div key={i} style={{ flex: 1, minWidth: 8, maxWidth: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}
            title={`${dayLabel}: ${d.total} visits (${d.completed} completed)`}>
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 0 }}>
              {otherH > 0 && <div style={{ height: otherH, background: 'var(--accent-soft)', borderRadius: '2px 2px 0 0' }} />}
              {cancelledH > 0 && <div style={{ height: cancelledH, background: 'var(--error-soft)' }} />}
              {completedH > 0 && <div style={{ height: completedH, background: 'var(--success)', borderRadius: completedH === height ? '2px 2px 2px 2px' : '0 0 2px 2px', opacity: 0.7 }} />}
            </div>
            {displayData.length <= 14 && (
              <div style={{ fontSize: 9, color: 'var(--text-tertiary)', whiteSpace: 'nowrap', transform: 'rotate(-45deg)', transformOrigin: 'top center', marginTop: 4 }}>
                {new Date(d.day).getDate()}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

/* ---- Engagement components ---- */

/* Format a duration in days for time-to-value / time-to-convert. */
function fmtDays(d) {
  if (d === null || d === undefined) return '—'
  const n = Number(d)
  if (n <= 0) return '<1h'
  if (n < 1) return `${Math.round(n * 24)}h`
  if (n < 10) return `${n}d`
  return `${Math.round(n)}d`
}

/* Period-over-period delta. At low N we suppress % unless the prior base is
   meaningful (>=5) and fall back to an absolute delta ("+2"). */
function deltaInfo(value, prev) {
  if (prev === null || prev === undefined) return null
  const diff = (value || 0) - (prev || 0)
  const arrow = diff > 0 ? '▲' : diff < 0 ? '▼' : '·'
  const color = diff > 0 ? 'var(--success)' : diff < 0 ? 'var(--error)' : 'var(--text-tertiary)'
  const text = prev >= 5 ? `${diff >= 0 ? '+' : ''}${Math.round((100 * diff) / prev)}%` : `${diff >= 0 ? '+' : ''}${diff}`
  return { text, color, arrow }
}

function Sparkline({ data, color = 'var(--accent)', height = 26, width = 96 }) {
  if (!data || !data.length) return null
  const max = Math.max(...data, 1)
  const step = data.length > 1 ? width / (data.length - 1) : width
  const pts = data.map((v, i) => `${(i * step).toFixed(1)},${(height - (v / max) * (height - 3) - 1.5).toFixed(1)}`).join(' ')
  const allZero = data.every(v => !v)
  return (
    <svg width={width} height={height} style={{ display: 'block', overflow: 'visible' }}>
      {allZero
        ? <line x1="0" y1={height - 1.5} x2={width} y2={height - 1.5} stroke="var(--border-strong)" strokeWidth="1.5" />
        : <polyline points={pts} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />}
    </svg>
  )
}

function KpiCard({ label, k, spark, isRate, experimental, periodDays, suffixSub, universe }) {
  if (!k) return <div className="stat-card"><div className="stat-label">{label}</div><div className="stat-value">—</div></div>
  const d = deltaInfo(k.value, k.prev)
  return (
    <div className="stat-card">
      <div className="stat-card-head">
        <div className="stat-label">{label}{experimental && <span title="Volatile at low sample size" style={{ marginLeft: 5, fontSize: 9, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '.3px' }}>exp</span>}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <div className="stat-value">{k.value ?? 0}{isRate ? '%' : ''}</div>
        {spark && k.spark && <Sparkline data={k.spark} color={isRate ? 'var(--success)' : 'var(--accent)'} />}
      </div>
      <div className="stat-sub" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {d && <span style={{ color: d.color, fontWeight: 600 }}>{d.arrow} {d.text}</span>}
        <span>{suffixSub || (k.prev !== undefined ? `vs prior ${periodDays || 30}d` : '')}</span>
      </div>
    </div>
  )
}

function EmptyState({ title, body, action }) {
  return (
    <div style={{ padding: '28px 20px', textAlign: 'center' }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>{title}</div>
      {body && <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: action ? 14 : 0, maxWidth: 380, margin: '0 auto' }}>{body}</div>}
      {action && <div style={{ marginTop: 14 }}>{action}</div>}
    </div>
  )
}

function FunnelV2({ funnel }) {
  if (!funnel) return null
  const md = funnel.median_days || {}
  const steps = [
    { key: 'signed_up', label: 'Signed up', desc: 'Created an account' },
    { key: 'confirmed', label: 'Confirmed email', desc: 'Verified email', t: md.to_confirmed },
    { key: 'activated', label: 'Activated', desc: 'Logged in ≥ once', t: md.to_activated },
    { key: 'created_case', label: 'Created a case', desc: 'Started real work', t: md.to_case },
    { key: 'scheduled_visit', label: 'Scheduled a visit', desc: 'Booked a visit', t: md.to_visit },
    { key: 'submitted_report', label: 'Submitted a report', desc: 'Filed a report', t: md.to_report },
  ]
  const top = funnel.signed_up || 0
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      {steps.map((s, i) => {
        const val = funnel[s.key] || 0
        const prev = i === 0 ? val : (funnel[steps[i - 1].key] || 0)
        const pctOfTop = top ? Math.round((100 * val) / top) : 0
        const conv = i === 0 ? 100 : (prev ? Math.round((100 * val) / prev) : 0)
        const drop = prev - val
        return (
          <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 132, flexShrink: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 550 }}>{s.label}</div>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{s.desc}</div>
            </div>
            <div style={{ flex: 1, background: 'var(--bg-subtle)', borderRadius: 6, height: 28, position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: `${pctOfTop}%`, background: 'var(--accent)', opacity: 0.9, borderRadius: 6, transition: 'width .3s' }} />
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', paddingLeft: 10, fontSize: 12, fontWeight: 600, color: pctOfTop > 12 ? '#fff' : 'var(--text-primary)' }}>
                {val} of {top} · {pctOfTop}%
              </div>
            </div>
            <div style={{ width: 120, flexShrink: 0, textAlign: 'right', fontSize: 11 }}>
              {i > 0 ? (
                <>
                  <div style={{ color: drop > 0 ? 'var(--error)' : 'var(--success)' }}>{conv}% cont.{drop > 0 ? ` · −${drop}` : ''}</div>
                  {val > 0 && s.t !== undefined && s.t !== null && <div style={{ color: 'var(--text-tertiary)' }}>~{fmtDays(s.t)} to convert</div>}
                </>
              ) : <span style={{ color: 'var(--text-tertiary)' }}>entered</span>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function TtvCards({ ttv }) {
  if (!ttv) return null
  const items = [
    { key: 'login', label: 'First login' },
    { key: 'case', label: 'First case' },
    { key: 'visit', label: 'First visit' },
    { key: 'report', label: 'First report' },
  ]
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
      {items.map(it => {
        const m = ttv[it.key] || {}
        const has = m.n > 0
        return (
          <div key={it.key} style={{ background: 'var(--bg-subtle)', borderRadius: 'var(--r)', padding: '10px 12px' }}>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{it.label} (median)</div>
            <div style={{ fontSize: 18, fontWeight: 600, color: has ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>{has ? fmtDays(m.median_days) : '—'}</div>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{has ? `n = ${m.n}` : 'no data yet'}</div>
          </div>
        )
      })}
    </div>
  )
}

function ActivationCohorts({ cohorts }) {
  if (!cohorts || !cohorts.length) return <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>No signup cohorts yet.</div>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      {cohorts.map(c => (
        <div key={c.cohort_week} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 84, flexShrink: 0, fontSize: 11.5, color: 'var(--text-secondary)' }}>{fmtDate(c.cohort_week)}</div>
          <div style={{ flex: 1, background: 'var(--bg-subtle)', borderRadius: 4, height: 16, position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', inset: 0, left: 0, width: `${c.pct}%`, background: 'var(--success)', opacity: 0.85 }} />
          </div>
          <div style={{ width: 74, flexShrink: 0, textAlign: 'right', fontSize: 11.5, color: 'var(--text-secondary)' }}>{c.activated}/{c.size} · {c.pct}%</div>
        </div>
      ))}
    </div>
  )
}

/* Single-hue green sequential scale, globally anchored 0–100% (research: don't
   per-row normalize at low N). Returns a background + readable text color. */
function retColor(pct) {
  if (pct === null || pct === undefined) return { bg: 'var(--bg-subtle)', fg: 'var(--text-tertiary)' }
  const a = 0.10 + (pct / 100) * 0.85
  return { bg: `rgba(46,125,79,${a.toFixed(2)})`, fg: pct >= 55 ? '#fff' : 'var(--text-primary)' }
}

function RetentionGrid({ retention }) {
  const cohorts = retention?.cohorts || []
  if (!cohorts.length) {
    return <EmptyState title="No cohorts yet" body="Retention appears once users have signed up across multiple weeks." />
  }
  const maxWk = Math.max(0, ...cohorts.flatMap(c => (c.cells || []).map(cell => cell.wk)))
  const cols = Array.from({ length: maxWk + 1 }, (_, i) => i)
  return (
    <>
      <table style={{ borderCollapse: 'separate', borderSpacing: 3, fontSize: 11.5 }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', fontWeight: 600, color: 'var(--text-tertiary)', padding: '0 8px 4px 0' }}>Cohort</th>
            <th style={{ textAlign: 'right', fontWeight: 600, color: 'var(--text-tertiary)', padding: '0 8px 4px 0' }}>Users</th>
            {cols.map(w => <th key={w} style={{ fontWeight: 600, color: 'var(--text-tertiary)', padding: '0 0 4px', minWidth: 34 }}>W{w}</th>)}
          </tr>
        </thead>
        <tbody>
          {cohorts.map(c => {
            const lastWk = Math.max(0, ...(c.cells || []).map(cell => cell.wk))
            return (
              <tr key={c.cohort_week}>
                <td style={{ whiteSpace: 'nowrap', color: 'var(--text-secondary)', paddingRight: 8 }}>{fmtDate(c.cohort_week)}</td>
                <td style={{ textAlign: 'right', color: 'var(--text-secondary)', paddingRight: 8, fontWeight: 600 }}>{c.size}</td>
                {cols.map(w => {
                  const cell = (c.cells || []).find(x => x.wk === w)
                  if (!cell) return <td key={w} style={{ background: 'transparent' }} />
                  const col = retColor(cell.pct)
                  const inFlux = w === lastWk
                  return (
                    <td key={w} title={`${fmtDate(c.cohort_week)} · W${w}: ${cell.active} of ${c.size} active (${cell.pct}%)${inFlux ? ' — in progress' : ''}`}
                      style={{ background: col.bg, color: col.fg, textAlign: 'center', borderRadius: 4, padding: '5px 0', fontWeight: 600, position: 'relative', border: inFlux ? '1px dashed var(--border-strong)' : '1px solid transparent' }}>
                      {cell.active}{inFlux ? '*' : ''}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
      <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span>Cells show active users; shading = % of cohort. W0 = signup week.</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 12, height: 12, background: retColor(10).bg, borderRadius: 2, display: 'inline-block' }} />low
          <span style={{ width: 12, height: 12, background: retColor(90).bg, borderRadius: 2, display: 'inline-block', marginLeft: 4 }} />high
        </span>
        <span>* current week (in progress)</span>
      </div>
    </>
  )
}

function RetentionCurve({ curve }) {
  const pts = (curve || []).filter(p => p.eligible > 0)
  if (!pts.length) return <EmptyState title="Not enough tenure yet" body="The N-day curve fills in as users accumulate days since signup." />
  const W = 240, H = 120, padL = 26, padB = 22, padT = 8
  const xs = pts.map((_, i) => padL + (pts.length > 1 ? (i * (W - padL - 6)) / (pts.length - 1) : 0))
  const y = pct => padT + (1 - (pct || 0) / 100) * (H - padT - padB)
  const line = pts.map((p, i) => `${xs[i].toFixed(1)},${y(p.pct).toFixed(1)}`).join(' ')
  return (
    <div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
        {[0, 50, 100].map(g => (
          <g key={g}>
            <line x1={padL} y1={y(g)} x2={W - 6} y2={y(g)} stroke="var(--border-subtle)" strokeWidth="1" />
            <text x={padL - 5} y={y(g) + 3} textAnchor="end" fontSize="9" fill="var(--text-tertiary)">{g}</text>
          </g>
        ))}
        <polyline points={line} fill="none" stroke="var(--success)" strokeWidth="2" strokeLinejoin="round" />
        {pts.map((p, i) => (
          <g key={i}>
            <circle cx={xs[i]} cy={y(p.pct)} r="3" fill="var(--success)" />
            <text x={xs[i]} y={y(p.pct) - 7} textAnchor="middle" fontSize="9" fontWeight="600" fill="var(--text-primary)">{p.pct}%</text>
            <text x={xs[i]} y={H - 8} textAnchor="middle" fontSize="9" fill="var(--text-tertiary)">D{p.day}</text>
          </g>
        ))}
      </svg>
      <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-tertiary)' }}>
        {pts.map(p => `D${p.day}: ${p.retained}/${p.eligible}`).join('  ·  ')}
      </div>
    </div>
  )
}

function StickinessChart({ data }) {
  if (!data || !data.length) return <EmptyState title="No activity in this window" />
  const days = data.slice(-Math.min(data.length, 60))
  const series = [
    { key: 'dau', label: 'DAU', color: 'var(--accent)' },
    { key: 'wau', label: 'WAU', color: 'var(--success)' },
    { key: 'mau', label: 'MAU', color: 'var(--warning)' },
  ]
  const max = Math.max(1, ...days.flatMap(d => [d.dau, d.wau, d.mau]))
  const W = 720, H = 150, padL = 22, padB = 18, padT = 8
  const xs = i => padL + (days.length > 1 ? (i * (W - padL - 6)) / (days.length - 1) : 0)
  const y = v => padT + (1 - v / max) * (H - padT - padB)
  const last = days[days.length - 1] || {}
  return (
    <div>
      <div style={{ display: 'flex', gap: 16, marginBottom: 8, fontSize: 12 }}>
        {series.map(s => (
          <span key={s.key} style={{ color: 'var(--text-secondary)' }}>
            <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: s.color, marginRight: 6 }} />
            {s.label} <strong style={{ color: 'var(--text-primary)' }}>{last[s.key] ?? 0}</strong>
          </span>
        ))}
      </div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: 'block' }}>
        {[0, Math.round(max / 2), max].map((g, i) => (
          <line key={i} x1={padL} y1={y(g)} x2={W - 6} y2={y(g)} stroke="var(--border-subtle)" strokeWidth="1" />
        ))}
        {series.map(s => (
          <polyline key={s.key} fill="none" stroke={s.color} strokeWidth="1.8" strokeLinejoin="round"
            points={days.map((d, i) => `${xs(i).toFixed(1)},${y(d[s.key] || 0).toFixed(1)}`).join(' ')} />
        ))}
      </svg>
      <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-tertiary)' }}>Distinct active users on a rolling 1 / 7 / 30-day window. Shown as counts (more reliable than ratios at this scale).</div>
    </div>
  )
}

function FeatureAdoption({ features, universe }) {
  if (!features || !features.length) return <EmptyState title="No feature usage yet" />
  const N = universe || 0
  return (
    <div>
      {features.map(f => {
        const pct = N ? Math.round((100 * f.users) / N) : 0
        return (
          <div key={f.feature} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px' }}>
            <span style={{ flex: 1, fontSize: 13, color: 'var(--text-secondary)' }}>{f.feature}</span>
            <div style={{ width: 120, background: 'var(--bg-subtle)', borderRadius: 4, height: 8, overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: 'var(--accent)', opacity: 0.85 }} />
            </div>
            <span style={{ width: 74, textAlign: 'right', fontSize: 12.5, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
              {f.users} of {N} <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>· {pct}%</span>
            </span>
          </div>
        )
      })}
    </div>
  )
}

function PageAreas({ areas, universe }) {
  if (!areas || !areas.length) return <EmptyState title="No page views yet" body="Page-area usage appears as testers navigate the app." />
  const max = Math.max(1, ...areas.map(a => a.views))
  return (
    <div>
      {areas.slice(0, 12).map(a => (
        <div key={a.area} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '7px 16px' }}>
          <span style={{ flex: 1, fontSize: 13, color: 'var(--text-secondary)', textTransform: 'capitalize' }}>{a.area.replace(/-/g, ' ')}</span>
          <div style={{ width: 110, background: 'var(--bg-subtle)', borderRadius: 4, height: 8, overflow: 'hidden' }}>
            <div style={{ width: `${Math.round((100 * a.views) / max)}%`, height: '100%', background: 'var(--success)', opacity: 0.8 }} />
          </div>
          <span style={{ width: 96, textAlign: 'right', fontSize: 12, color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
            {a.views} views · {a.users}u
          </span>
        </div>
      ))}
    </div>
  )
}

/* Amplitude-style per-user activity feed — grouped by day, newest first. */
function UserTimeline({ events, loading }) {
  if (loading) return <div style={{ padding: '12px 16px', fontSize: 13, color: 'var(--text-tertiary)' }}>Loading activity…</div>
  if (!events || !events.length) return <div style={{ padding: '12px 16px', fontSize: 13, color: 'var(--text-tertiary)' }}>No recorded activity yet.</div>
  const dotColor = {
    signup: 'var(--success)', confirmed: 'var(--success)', last_login: 'var(--accent)', login: 'var(--accent)',
    case: 'var(--warning)', case_created: 'var(--warning)', visit: '#7048b6', visit_scheduled: '#7048b6',
    visit_checkin: '#0f9d8a', report: 'var(--error)', report_submitted: 'var(--error)', org_created: 'var(--success)',
    monitor_added: 'var(--accent)', quiz_started: '#b8860b', quiz_completed: '#b8860b', page_view: 'var(--text-tertiary)',
    feedback_submitted: '#1d6fb8',
  }
  // Group by day label
  const groups = []
  const byDay = {}
  events.forEach(e => {
    const key = new Date(e.ts).toDateString()
    if (!byDay[key]) { byDay[key] = []; groups.push(key) }
    byDay[key].push(e)
  })
  const dayLabel = (k) => {
    const t = new Date(); const y = new Date(); y.setDate(t.getDate() - 1)
    if (k === t.toDateString()) return 'Today'
    if (k === y.toDateString()) return 'Yesterday'
    return new Date(k).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }
  return (
    <div style={{ maxHeight: 340, overflowY: 'auto' }}>
      {groups.map(g => (
        <div key={g}>
          <div style={{ position: 'sticky', top: 0, background: 'var(--bg-card)', fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', padding: '8px 16px 4px', textTransform: 'uppercase', letterSpacing: '.3px' }}>{dayLabel(g)}</div>
          {byDay[g].map((e, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '5px 16px' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: dotColor[e.type] || 'var(--text-tertiary)', marginTop: 5, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: 'var(--text-primary)' }}>{e.label}</div>
              </div>
              <span style={{ fontSize: 11, color: 'var(--text-tertiary)', flexShrink: 0 }}>
                {new Date(e.ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

function EngagementTrend({ data }) {
  if (!data || !data.length) {
    return <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>No activity data in this period</div>
  }
  const series = [
    { key: 'signups', label: 'Signups', color: '#2D6A4F' },
    { key: 'active_users', label: 'Active users', color: '#1d6fb8' },
    { key: 'logins', label: 'Logins', color: '#0f9d8a' },
    { key: 'cases', label: 'Cases created', color: '#b8860b' },
    { key: 'visits', label: 'Visits scheduled', color: '#7048b6' },
    { key: 'reports', label: 'Reports submitted', color: '#c0392b' },
  ]
  const days = data.slice(-30)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {series.map(s => {
        const max = Math.max(...days.map(d => d[s.key] || 0), 1)
        const total = days.reduce((a, d) => a + (d[s.key] || 0), 0)
        return (
          <div key={s.key}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
              <span style={{ color: 'var(--text-secondary)' }}>
                <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: s.color, marginRight: 6 }} />{s.label}
              </span>
              <span style={{ color: 'var(--text-tertiary)' }}>{total} total</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 34 }}>
              {days.map((d, i) => {
                const v = d[s.key] || 0
                const h = v > 0 ? Math.max((v / max) * 34, 3) : 1
                return (
                  <div key={i}
                    title={`${new Date(d.day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}: ${v}`}
                    style={{ flex: 1, minWidth: 3, height: h, background: v > 0 ? s.color : 'var(--border-subtle, #e5e5e5)', opacity: v > 0 ? 0.8 : 0.5, borderRadius: '2px 2px 0 0' }} />
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function EngagementStatus({ u }) {
  const last = u.last_active || u.last_sign_in_at
  if (!last) return <span className="badge badge-gray">Never logged in</span>
  const days = (Date.now() - new Date(last).getTime()) / 86400000
  if (days <= 7) return <span className="badge badge-green">Active</span>
  if (days <= 30) return <span className="badge badge-blue">Recent</span>
  return <span className="badge badge-gray">Dormant</span>
}

function FeatureRow({ label, value, icon }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '10px 16px', borderBottom: '1px solid var(--border-subtle)',
      fontSize: 13,
    }}>
      <span style={{ fontSize: 16, width: 24, textAlign: 'center' }}>{icon}</span>
      <span style={{ flex: 1, color: 'var(--text-secondary)' }}>{label}</span>
      <span style={{ fontWeight: 550, fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)' }}>{value}</span>
    </div>
  )
}
