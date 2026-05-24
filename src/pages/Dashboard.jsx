import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabase'

function fmtDate(s) {
  if (!s) return '—'
  const d = new Date(s)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtDateTime(s) {
  if (!s) return '—'
  const d = new Date(s)
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function riskPill(level) {
  if (!level) return <span className="cell-muted">—</span>
  const cls = level === 'high' ? 'risk-high' : level === 'medium' ? 'risk-medium' : 'risk-low'
  return <span className={`risk-pill ${cls}`}>{level.charAt(0).toUpperCase() + level.slice(1)}</span>
}

function statusBadge(status) {
  if (!status) return <span className="badge badge-gray">—</span>
  const map = {
    active: 'badge-green',
    pending: 'badge-yellow',
    closed: 'badge-gray',
    scheduled: 'badge-blue',
    completed: 'badge-green',
    cancelled: 'badge-red',
    'no-show': 'badge-red'
  }
  const cls = map[status] || 'badge-gray'
  const label = status.charAt(0).toUpperCase() + status.slice(1)
  return <span className={`badge ${cls}`}>{label}</span>
}

export default function Dashboard() {
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({ cases: 0, visits: 0, monitors: 0, todayVisits: 0 })
  const [recentCases, setRecentCases] = useState([])
  const [upcomingVisits, setUpcomingVisits] = useState([])

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    try {
      const today = new Date()
      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString()
      const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59).toISOString()

      const [casesRes, visitsRes, monitorsRes, todayRes] = await Promise.all([
        supabase.from('sv_cases').select('*', { count: 'exact', head: true }),
        supabase.from('sv_visits').select('*', { count: 'exact', head: true }),
        supabase.from('sv_monitors').select('*', { count: 'exact', head: true }),
        supabase
          .from('sv_visits')
          .select('*', { count: 'exact', head: true })
          .gte('scheduled_at', startOfDay)
          .lte('scheduled_at', endOfDay)
      ])

      setStats({
        cases: casesRes.count || 0,
        visits: visitsRes.count || 0,
        monitors: monitorsRes.count || 0,
        todayVisits: todayRes.count || 0
      })

      const { data: recent } = await supabase
        .from('sv_cases')
        .select(`
          id,
          case_number,
          status,
          risk_level,
          created_at,
          custodial:custodial_party_id(first_name, last_name),
          noncustodial:noncustodial_party_id(first_name, last_name)
        `)
        .order('created_at', { ascending: false })
        .limit(5)
      setRecentCases(recent || [])

      const { data: upcoming } = await supabase
        .from('sv_visits')
        .select(`
          id,
          scheduled_at,
          status,
          location,
          case:case_id(case_number),
          monitor:monitor_id(first_name, last_name)
        `)
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
          <div className="page-subtitle">Operations overview</div>
        </div>
        <Link to="/intake" className="btn btn-primary">+ New Intake</Link>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Total Cases</div>
          <div className="stat-value">{stats.cases}</div>
          <div className="stat-sub">All time</div>
        </div>
        <div className="stat-card moss">
          <div className="stat-label">Total Visits</div>
          <div className="stat-value">{stats.visits}</div>
          <div className="stat-sub">Scheduled or completed</div>
        </div>
        <div className="stat-card blue">
          <div className="stat-label">Active Monitors</div>
          <div className="stat-value">{stats.monitors}</div>
          <div className="stat-sub">Per Standard 5.20(e)</div>
        </div>
        <div className="stat-card yellow">
          <div className="stat-label">Today's Visits</div>
          <div className="stat-value">{stats.todayVisits}</div>
          <div className="stat-sub">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div className="card-title">Recent Cases</div>
          <Link to="/cases" className="btn btn-secondary btn-sm">View All</Link>
        </div>
        <div className="card-body-flush">
          {loading ? (
            <div className="loading">Loading…</div>
          ) : recentCases.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-title">No cases yet</div>
              <div className="empty-state-desc">Create your first intake to get started.</div>
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Case #</th>
                  <th>Custodial Parent</th>
                  <th>Noncustodial Parent</th>
                  <th>Risk</th>
                  <th>Status</th>
                  <th>Opened</th>
                </tr>
              </thead>
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
          <div className="card-title">Upcoming Visits</div>
          <Link to="/visits" className="btn btn-secondary btn-sm">View All</Link>
        </div>
        <div className="card-body-flush">
          {loading ? (
            <div className="loading">Loading…</div>
          ) : upcomingVisits.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-title">No upcoming visits</div>
              <div className="empty-state-desc">Schedule a visit from the Visits page.</div>
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Case #</th>
                  <th>Monitor</th>
                  <th>Location</th>
                  <th>Status</th>
                </tr>
              </thead>
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
