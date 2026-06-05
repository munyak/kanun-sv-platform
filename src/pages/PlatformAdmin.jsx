import React, { useEffect, useState, useCallback } from 'react'
import { supabase } from '../supabase'
import { useAuth, roleLabel } from '../auth/AuthContext'

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

  // Detail panels
  const [selectedOrg, setSelectedOrg] = useState(null)
  const [orgDetail, setOrgDetail] = useState(null)
  const [orgDetailLoading, setOrgDetailLoading] = useState(false)
  const [selectedUser, setSelectedUser] = useState(null)
  const [userDetail, setUserDetail] = useState(null)
  const [userDetailLoading, setUserDetailLoading] = useState(false)

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
    try {
      const { data, error } = await supabase.rpc('platform_admin_user_detail', { p_user_id: userId })
      if (error) throw error
      setUserDetail(data)
    } catch (e) { showToast(e.message, 'error') }
    finally { setUserDetailLoading(false) }
  }

  async function handleOrderCheck(monitor) {
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
          check_type: 'criminal_record',
        },
      })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      showToast(`Background check ordered for ${monitor.first_name} ${monitor.last_name}`)
      setOrderCheckMonitor(null)
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
                <p style={{ marginBottom: 12 }}>To activate background checks, you need a Certn API key. Sign up at <a href="https://certn.co" target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'underline' }}>certn.co</a> and add your API key to the Supabase Edge Function environment variables:</p>
                <div style={{ background: 'var(--bg-subtle)', padding: '12px 16px', borderRadius: 'var(--r)', fontFamily: 'var(--font-mono)', fontSize: 12, marginBottom: 12 }}>
                  CERTN_API_KEY=your_api_key_here<br/>
                  CERTN_BASE_URL=https://api.ca.certn.co
                </div>
                <p>Checks include: criminal record (CA DOJ + FBI), sex offender registry, identity verification, and global watchlist/sanctions screening. Results typically return in 1-3 business days.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Order check modal */}
      {orderCheckMonitor && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setOrderCheckMonitor(null)}>
          <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--r-lg)', padding: 24, maxWidth: 420, width: '90%', boxShadow: 'var(--shadow-pop)' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 16, fontWeight: 550, marginBottom: 4 }}>Order background check</h3>
            <p style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 16 }}>
              This will order a criminal record check, identity verification, and watchlist screening for {orderCheckMonitor.first_name} {orderCheckMonitor.last_name} via Certn.
            </p>
            <div className="admin-kv-grid" style={{ marginBottom: 16 }}>
              <KV label="Name" value={`${orderCheckMonitor.first_name} ${orderCheckMonitor.last_name}`} />
              <KV label="Email" value={orderCheckMonitor.email || '—'} />
            </div>
            <div className="btn-group" style={{ justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setOrderCheckMonitor(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={() => handleOrderCheck(orderCheckMonitor)} disabled={orderBusy}>
                {orderBusy ? 'Ordering...' : 'Order check ($13.99)'}
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
