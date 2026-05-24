import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabase'
import { useAuth } from '../auth/AuthContext'

function fmtDate(s) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtVisitTime(date, time) {
  if (!date) return '—'
  const d = new Date(`${date}T${(time || '00:00').slice(0, 5)}:00`)
  return d.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function riskPill(level) {
  if (!level) return <span className="cell-muted">—</span>
  const cls = level === 'critical' || level === 'high' ? 'risk-high' : level === 'medium' ? 'risk-medium' : 'risk-low'
  return <span className={`risk-pill ${cls}`}>{level[0].toUpperCase() + level.slice(1)}</span>
}

function statusBadge(status) {
  if (!status) return <span className="badge badge-gray">—</span>
  const map = {
    intake: 'badge-yellow', active: 'badge-green', suspended: 'badge-yellow',
    terminated: 'badge-red', completed: 'badge-blue', archived: 'badge-gray',
    scheduled: 'badge-blue', confirmed: 'badge-blue', in_progress: 'badge-yellow',
    canceled_custodial: 'badge-red', canceled_noncustodial: 'badge-red', canceled_provider: 'badge-red',
    no_show_custodial: 'badge-red', no_show_noncustodial: 'badge-red', interrupted: 'badge-red',
  }
  const cls = map[status] || 'badge-gray'
  return <span className={`badge ${cls}`}>{status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</span>
}

export default function Dashboard() {
  const { role, org, user } = useAuth()
  if (role === 'monitor') return <MonitorDashboard user={user} />
  return <OwnerDashboard org={org} role={role} />
}

function OwnerDashboard({ org }) {
  const { activeOrgId } = useAuth()
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({ cases: 0, activeCases: 0, monitors: 0, todayVisits: 0, weekVisits: 0, openInvites: 0 })
  const [recentCases, setRecentCases] = useState([])
  const [upcomingVisits, setUpcomingVisits] = useState([])
  const [todoItems, setTodoItems] = useState([])

  useEffect(() => { if (activeOrgId) load() }, [activeOrgId])

  async function load() {
    setLoading(true)
    try {
      const today = new Date()
      const yyyymmdd = today.toISOString().slice(0, 10)
      const weekEnd = new Date(today); weekEnd.setDate(weekEnd.getDate() + 7)
      const weekEndStr = weekEnd.toISOString().slice(0, 10)

      const [casesRes, activeCasesRes, monitorsRes, todayRes, weekRes, invitesRes] = await Promise.all([
        supabase.from('sv_cases').select('id', { count: 'exact', head: true }).eq('org_id', activeOrgId),
        supabase.from('sv_cases').select('id', { count: 'exact', head: true }).eq('org_id', activeOrgId).eq('status', 'active'),
        supabase.from('sv_monitors').select('id', { count: 'exact', head: true }).eq('org_id', activeOrgId).eq('active', true),
        supabase.from('sv_visits').select('id', { count: 'exact', head: true }).eq('org_id', activeOrgId).eq('scheduled_date', yyyymmdd),
        supabase.from('sv_visits').select('id', { count: 'exact', head: true }).eq('org_id', activeOrgId).gte('scheduled_date', yyyymmdd).lte('scheduled_date', weekEndStr),
        supabase.from('sv_invitations').select('id', { count: 'exact', head: true }).eq('org_id', activeOrgId).is('accepted_at', null),
      ])
      setStats({
        cases: casesRes.count || 0,
        activeCases: activeCasesRes.count || 0,
        monitors: monitorsRes.count || 0,
        todayVisits: todayRes.count || 0,
        weekVisits: weekRes.count || 0,
        openInvites: invitesRes.count || 0,
      })

      const { data: recent } = await supabase
        .from('sv_cases')
        .select(`id, case_number, status, risk_level, created_at,
                 custodial:custodial_party_id(first_name, last_name),
                 noncustodial:noncustodial_party_id(first_name, last_name)`)
        .eq('org_id', activeOrgId)
        .order('created_at', { ascending: false })
        .limit(5)
      setRecentCases(recent || [])

      const { data: upcoming } = await supabase
        .from('sv_visits')
        .select(`id, scheduled_date, scheduled_start_time, scheduled_end_time, status, location,
                 case:case_id(case_number),
                 monitor:monitor_id(first_name, last_name)`)
        .eq('org_id', activeOrgId)
        .gte('scheduled_date', yyyymmdd)
        .order('scheduled_date', { ascending: true })
        .order('scheduled_start_time', { ascending: true })
        .limit(6)
      setUpcomingVisits(upcoming || [])

      // Build a To-Do list of action items
      const todos = []
      const [unassignedCases, expiringMonitors, intakeCases] = await Promise.all([
        supabase.from('sv_cases').select('id, case_number').eq('org_id', activeOrgId).is('primary_monitor_id', null).neq('status', 'archived').limit(10),
        supabase.from('sv_monitors').select('id, first_name, last_name, kcm_expiry_date, trustline_expiry').eq('org_id', activeOrgId),
        supabase.from('sv_cases').select('id, case_number, created_at').eq('org_id', activeOrgId).eq('status', 'intake').limit(10),
      ])
      ;(unassignedCases.data || []).forEach((c) => {
        todos.push({
          id: 'unass-' + c.id,
          icon: '🧭',
          title: `Assign a monitor to case ${c.case_number || c.id.slice(0,6)}`,
          link: `/cases/${c.id}`,
        })
      })
      ;(intakeCases.data || []).forEach((c) => {
        todos.push({
          id: 'intake-' + c.id,
          icon: '📝',
          title: `Move case ${c.case_number || c.id.slice(0,6)} out of intake`,
          link: `/cases/${c.id}`,
        })
      })
      const now = new Date()
      const in60 = new Date(); in60.setDate(in60.getDate() + 60)
      ;(expiringMonitors.data || []).forEach((m) => {
        if (m.kcm_expiry_date) {
          const d = new Date(m.kcm_expiry_date)
          if (d <= in60) {
            todos.push({
              id: 'kcm-' + m.id,
              icon: '🎓',
              title: `${m.first_name} ${m.last_name}'s KCM cert expires ${fmtDate(m.kcm_expiry_date)}`,
              link: `/monitors/${m.id}`,
            })
          }
        }
        if (m.trustline_expiry) {
          const d = new Date(m.trustline_expiry)
          if (d <= in60) {
            todos.push({
              id: 'tl-' + m.id,
              icon: '🛡️',
              title: `${m.first_name} ${m.last_name}'s TrustLine expires ${fmtDate(m.trustline_expiry)}`,
              link: `/monitors/${m.id}`,
            })
          }
        }
      })
      setTodoItems(todos.slice(0, 6))
    } catch (err) {
      console.error('Dashboard load error:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <div className="page-subtitle">{org?.name} · {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</div>
        </div>
        <div className="btn-group">
          <Link to="/visits" className="btn btn-secondary">View calendar</Link>
          <Link to="/intake" className="btn btn-primary">+ New intake</Link>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Active cases</div>
          <div className="stat-value">{stats.activeCases}</div>
          <div className="stat-sub">{stats.cases} total</div>
        </div>
        <div className="stat-card moss">
          <div className="stat-label">This week's visits</div>
          <div className="stat-value">{stats.weekVisits}</div>
          <div className="stat-sub">{stats.todayVisits} scheduled today</div>
        </div>
        <div className="stat-card blue">
          <div className="stat-label">Active monitors</div>
          <div className="stat-value">{stats.monitors}</div>
          <div className="stat-sub">Per Standard 5.20(e)</div>
        </div>
        <div className="stat-card yellow">
          <div className="stat-label">Open invitations</div>
          <div className="stat-value">{stats.openInvites}</div>
          <div className="stat-sub">Pending acceptance</div>
        </div>
      </div>

      {todoItems.length > 0 && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">Action items</div>
            <div className="cell-muted">{todoItems.length} item{todoItems.length === 1 ? '' : 's'}</div>
          </div>
          <div className="todo-list">
            {todoItems.map((t) => (
              <Link key={t.id} to={t.link} className="todo-item">
                <span className="todo-icon">{t.icon}</span>
                <span className="todo-title">{t.title}</span>
                <span className="todo-arrow">→</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <div className="card-title">Upcoming visits</div>
          <Link to="/visits" className="btn btn-secondary btn-sm">View all</Link>
        </div>
        <div className="card-body-flush">
          {loading ? <div className="loading">Loading…</div>
            : upcomingVisits.length === 0 ? <Empty title="No upcoming visits" desc="Schedule a visit from a case." />
            : (
              <table className="data-table">
                <thead><tr><th>When</th><th>Case #</th><th>Monitor</th><th>Location</th><th>Status</th></tr></thead>
                <tbody>
                  {upcomingVisits.map((v) => (
                    <tr key={v.id}>
                      <td className="cell-strong">{fmtVisitTime(v.scheduled_date, v.scheduled_start_time)}</td>
                      <td className="cell-mono">{v.case?.case_number || '—'}</td>
                      <td>{v.monitor ? `${v.monitor.first_name} ${v.monitor.last_name}` : <span className="cell-muted">Unassigned</span>}</td>
                      <td>{v.location || <span className="cell-muted">—</span>}</td>
                      <td>{statusBadge(v.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div className="card-title">Recent cases</div>
          <Link to="/cases" className="btn btn-secondary btn-sm">View all</Link>
        </div>
        <div className="card-body-flush">
          {loading ? <div className="loading">Loading…</div>
            : recentCases.length === 0 ? <Empty title="No cases yet" desc="Create your first intake to get started." />
            : (
              <table className="data-table">
                <thead><tr><th>Case #</th><th>Custodial</th><th>Noncustodial</th><th>Risk</th><th>Status</th><th>Opened</th></tr></thead>
                <tbody>
                  {recentCases.map((c) => (
                    <tr key={c.id}>
                      <td className="cell-mono cell-strong">
                        <Link to={`/cases/${c.id}`} style={{ color: 'var(--forest)' }}>{c.case_number || '—'}</Link>
                      </td>
                      <td>{c.custodial ? `${c.custodial.first_name} ${c.custodial.last_name}` : '—'}</td>
                      <td>{c.noncustodial ? `${c.noncustodial.first_name} ${c.noncustodial.last_name}` : '—'}</td>
                      <td>{riskPill(c.risk_level)}</td>
                      <td>{statusBadge(c.status)}</td>
                      <td className="cell-muted">{fmtDate(c.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </div>
      </div>
    </div>
  )
}

function MonitorDashboard({ user }) {
  const { activeOrgId } = useAuth()
  const [loading, setLoading] = useState(true)
  const [today, setToday] = useState([])
  const [upcoming, setUpcoming] = useState([])
  const [monitorId, setMonitorId] = useState(null)

  useEffect(() => { if (activeOrgId) load() }, [activeOrgId])

  async function load() {
    setLoading(true)
    try {
      const { data: m } = await supabase
        .from('sv_monitors')
        .select('id')
        .eq('org_id', activeOrgId)
        .eq('user_id', user.id)
        .maybeSingle()
      const mid = m?.id || null
      setMonitorId(mid)

      const today = new Date().toISOString().slice(0, 10)

      let qToday = supabase.from('sv_visits')
        .select('id, scheduled_date, scheduled_start_time, scheduled_end_time, location, status, case:case_id(case_number)')
        .eq('org_id', activeOrgId)
        .eq('scheduled_date', today)
        .order('scheduled_start_time', { ascending: true })
      if (mid) qToday = qToday.eq('monitor_id', mid)
      const { data: t } = await qToday
      setToday(t || [])

      let qUpcoming = supabase.from('sv_visits')
        .select('id, scheduled_date, scheduled_start_time, scheduled_end_time, location, status, case:case_id(case_number)')
        .eq('org_id', activeOrgId)
        .gt('scheduled_date', today)
        .order('scheduled_date', { ascending: true })
        .order('scheduled_start_time', { ascending: true })
        .limit(10)
      if (mid) qUpcoming = qUpcoming.eq('monitor_id', mid)
      const { data: u } = await qUpcoming
      setUpcoming(u || [])
    } finally { setLoading(false) }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">My day</h1>
          <div className="page-subtitle">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</div>
        </div>
      </div>

      {!monitorId && (
        <div className="confidential-banner">
          Your monitor profile isn't linked to your account yet. Ask your agency owner to link your monitor record so your visits appear here.
        </div>
      )}

      <div className="card">
        <div className="card-header"><div className="card-title">Today's visits</div></div>
        <div className="card-body-flush">
          {loading ? <div className="loading">Loading…</div>
            : today.length === 0 ? <div className="empty-state"><div className="empty-state-title">Nothing scheduled today</div><div className="empty-state-desc">Enjoy the breather.</div></div>
            : (
              <table className="data-table">
                <thead><tr><th>When</th><th>Case</th><th>Location</th><th>Status</th></tr></thead>
                <tbody>
                  {today.map((v) => (
                    <tr key={v.id}>
                      <td className="cell-strong">{fmtVisitTime(v.scheduled_date, v.scheduled_start_time)}</td>
                      <td className="cell-mono">{v.case?.case_number || '—'}</td>
                      <td>{v.location || <span className="cell-muted">—</span>}</td>
                      <td>{statusBadge(v.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </div>
      </div>

      <div className="card">
        <div className="card-header"><div className="card-title">Upcoming</div></div>
        <div className="card-body-flush">
          {loading ? <div className="loading">Loading…</div>
            : upcoming.length === 0 ? <div className="empty-state"><div className="empty-state-title">No upcoming visits</div></div>
            : (
              <table className="data-table">
                <thead><tr><th>When</th><th>Case</th><th>Location</th><th>Status</th></tr></thead>
                <tbody>
                  {upcoming.map((v) => (
                    <tr key={v.id}>
                      <td className="cell-strong">{fmtVisitTime(v.scheduled_date, v.scheduled_start_time)}</td>
                      <td className="cell-mono">{v.case?.case_number || '—'}</td>
                      <td>{v.location || <span className="cell-muted">—</span>}</td>
                      <td>{statusBadge(v.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </div>
      </div>
    </div>
  )
}

function Empty({ title, desc }) {
  return (
    <div className="empty-state">
      <div className="empty-state-title">{title}</div>
      {desc && <div className="empty-state-desc">{desc}</div>}
    </div>
  )
}
