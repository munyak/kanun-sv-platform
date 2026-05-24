import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabase'
import { useAuth } from '../auth/AuthContext'

function fmtDate(s) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtDateTime(s) {
  if (!s) return '—'
  return new Date(s).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function riskPill(level) {
  if (!level) return <span className="cell-muted">—</span>
  const cls = level === 'high' ? 'risk-high' : level === 'medium' ? 'risk-medium' : 'risk-low'
  return <span className={`risk-pill ${cls}`}>{level[0].toUpperCase() + level.slice(1)}</span>
}

function statusBadge(status) {
  if (!status) return <span className="badge badge-gray">—</span>
  const map = { active: 'badge-green', pending: 'badge-yellow', closed: 'badge-gray', scheduled: 'badge-blue', completed: 'badge-green', cancelled: 'badge-red', no_show: 'badge-red' }
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
  const [stats, setStats] = useState({ cases: 0, visits: 0, monitors: 0, todayVisits: 0 })
  const [recentCases, setRecentCases] = useState([])
  const [upcomingVisits, setUpcomingVisits] = useState([])

  useEffect(() => { if (activeOrgId) load() }, [activeOrgId])

  async function load() {
    setLoading(true)
    try {
      const today = new Date()
      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString()
      const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59).toISOString()
      const [casesRes, visitsRes, monitorsRes, todayRes] = await Promise.all([
        supabase.from('sv_cases').select('*', { count: 'exact', head: true }).eq('org_id', activeOrgId),
        supabase.from('sv_visits').select('*', { count: 'exact', head: true }).eq('org_id', activeOrgId),
        supabase.from('sv_monitors').select('*', { count: 'exact', head: true }).eq('org_id', activeOrgId),
        supabase.from('sv_visits').select('*', { count: 'exact', head: true }).eq('org_id', activeOrgId).gte('scheduled_at', startOfDay).lte('scheduled_at', endOfDay),
      ])
      setStats({
        cases: casesRes.count || 0,
        visits: visitsRes.count || 0,
        monitors: monitorsRes.count || 0,
        todayVisits: todayRes.count || 0,
      })

      const { data: recent } = await supabase
        .from('sv_cases')
        .select('id, case_number, status, risk_level, created_at, custodial:custodial_party_id(first_name, last_name), noncustodial:noncustodial_party_id(first_name, last_name)')
        .eq('org_id', activeOrgId)
        .order('created_at', { ascending: false })
        .limit(5)
      setRecentCases(recent || [])

      const { data: upcoming } = await supabase
        .from('sv_visits')
        .select('id, scheduled_at, status, location, case:case_id(case_number), monitor:monitor_id(first_name, last_name)')
        .eq('org_id', activeOrgId)
        .gte('scheduled_at', new Date().toISOString())
        .order('scheduled_at', { ascending: true })
        .limit(5)
      setUpcomingVisits(upcoming || [])
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
          <div className="page-subtitle">{org?.name} · operations overview</div>
        </div>
        <Link to="/intake" className="btn btn-primary">+ New Intake</Link>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Cases</div>
          <div className="stat-value">{stats.cases}</div>
          <div className="stat-sub">All cases in your org</div>
        </div>
        <div className="stat-card moss">
          <div className="stat-label">Visits</div>
          <div className="stat-value">{stats.visits}</div>
          <div className="stat-sub">Scheduled or completed</div>
        </div>
        <div className="stat-card blue">
          <div className="stat-label">Monitors</div>
          <div className="stat-value">{stats.monitors}</div>
          <div className="stat-sub">Per Standard 5.20(e)</div>
        </div>
        <div className="stat-card yellow">
          <div className="stat-label">Today’s visits</div>
          <div className="stat-value">{stats.todayVisits}</div>
          <div className="stat-sub">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</div>
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
                      <td className="cell-mono cell-strong">{c.case_number || '—'}</td>
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

      <div className="card">
        <div className="card-header">
          <div className="card-title">Upcoming visits</div>
          <Link to="/visits" className="btn btn-secondary btn-sm">View all</Link>
        </div>
        <div className="card-body-flush">
          {loading ? <div className="loading">Loading…</div>
            : upcomingVisits.length === 0 ? <Empty title="No upcoming visits" desc="Schedule a visit from the Visits page." />
            : (
              <table className="data-table">
                <thead><tr><th>When</th><th>Case #</th><th>Monitor</th><th>Location</th><th>Status</th></tr></thead>
                <tbody>
                  {upcomingVisits.map((v) => (
                    <tr key={v.id}>
                      <td className="cell-strong">{fmtDateTime(v.scheduled_at)}</td>
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
      // try to find this monitor's sv_monitors record by user_id
      const { data: m } = await supabase
        .from('sv_monitors')
        .select('id')
        .eq('org_id', activeOrgId)
        .eq('user_id', user.id)
        .maybeSingle()
      const mid = m?.id || null
      setMonitorId(mid)

      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
      const todayEnd = new Date();   todayEnd.setHours(23, 59, 59, 999)

      let qToday = supabase.from('sv_visits')
        .select('id, scheduled_at, location, status, case:case_id(case_number)')
        .eq('org_id', activeOrgId)
        .gte('scheduled_at', todayStart.toISOString())
        .lte('scheduled_at', todayEnd.toISOString())
        .order('scheduled_at', { ascending: true })
      if (mid) qToday = qToday.eq('monitor_id', mid)
      const { data: t } = await qToday
      setToday(t || [])

      let qUpcoming = supabase.from('sv_visits')
        .select('id, scheduled_at, location, status, case:case_id(case_number)')
        .eq('org_id', activeOrgId)
        .gt('scheduled_at', todayEnd.toISOString())
        .order('scheduled_at', { ascending: true })
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
          Your monitor profile isn’t linked to your account yet. Ask your agency owner to link your monitor record so your visits appear here.
        </div>
      )}

      <div className="card">
        <div className="card-header"><div className="card-title">Today’s visits</div></div>
        <div className="card-body-flush">
          {loading ? <div className="loading">Loading…</div>
            : today.length === 0 ? <Empty title="Nothing scheduled today" desc="Enjoy the breather." />
            : (
              <table className="data-table">
                <thead><tr><th>When</th><th>Case</th><th>Location</th><th>Status</th></tr></thead>
                <tbody>
                  {today.map((v) => (
                    <tr key={v.id}>
                      <td className="cell-strong">{fmtDateTime(v.scheduled_at)}</td>
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
            : upcoming.length === 0 ? <Empty title="No upcoming visits" desc="" />
            : (
              <table className="data-table">
                <thead><tr><th>When</th><th>Case</th><th>Location</th><th>Status</th></tr></thead>
                <tbody>
                  {upcoming.map((v) => (
                    <tr key={v.id}>
                      <td className="cell-strong">{fmtDateTime(v.scheduled_at)}</td>
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
