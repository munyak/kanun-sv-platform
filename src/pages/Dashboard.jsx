import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabase'
import { useAuth } from '../auth/AuthContext'

/* ----- Lucide-style icon helpers ----- */
const Svg = ({ size = 18, children }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
       stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
       aria-hidden="true">
    {children}
  </svg>
)

const ICON = {
  folder: <Svg><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" /></Svg>,
  calendar: <Svg><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></Svg>,
  monitors: <Svg><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0113 0" /><circle cx="17" cy="9" r="2.5" /><path d="M22 18a4.5 4.5 0 00-6-4.25" /></Svg>,
  mail: <Svg><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></Svg>,
  compass: <Svg><circle cx="12" cy="12" r="9" /><path d="M15.5 8.5l-2 5-5 2 2-5 5-2z" /></Svg>,
  note: <Svg><path d="M5 4h11l3 3v13a1 1 0 01-1 1H5a1 1 0 01-1-1V5a1 1 0 011-1z" /><path d="M9 10h6M9 14h6" /></Svg>,
  cert: <Svg><circle cx="12" cy="10" r="5" /><path d="M9 14l-1 6 4-2 4 2-1-6" /></Svg>,
  shield: <Svg><path d="M12 3l8 3v6a9 9 0 01-8 9 9 9 0 01-8-9V6l8-3z" /></Svg>,
  arrowRight: <Svg size={16}><path d="M5 12h14M13 6l6 6-6 6" /></Svg>,
  inbox: <Svg size={28}><path d="M3 12l4-8h10l4 8M3 12v6a2 2 0 002 2h14a2 2 0 002-2v-6M3 12h5a3 3 0 016 0h5" /></Svg>,
  coffee: <Svg size={28}><path d="M4 8h12v6a4 4 0 01-4 4H8a4 4 0 01-4-4V8z" /><path d="M16 10h2a2 2 0 010 4h-2M5 3v2M9 3v2M13 3v2" /></Svg>,
}

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
          icon: ICON.compass,
          title: `Assign a monitor to case ${c.case_number || c.id.slice(0,6)}`,
          link: `/cases/${c.id}`,
        })
      })
      ;(intakeCases.data || []).forEach((c) => {
        todos.push({
          id: 'intake-' + c.id,
          icon: ICON.note,
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
              icon: ICON.cert,
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
              icon: ICON.shield,
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
          <Link to="/intake" className="btn btn-primary">New intake</Link>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-card-head">
            <div className="stat-card-icon">{ICON.folder}</div>
            <div className="stat-label">Active cases</div>
          </div>
          <div className="stat-value">{stats.activeCases}</div>
          <div className="stat-sub">{stats.cases} total</div>
        </div>
        <div className="stat-card moss">
          <div className="stat-card-head">
            <div className="stat-card-icon">{ICON.calendar}</div>
            <div className="stat-label">This week's visits</div>
          </div>
          <div className="stat-value">{stats.weekVisits}</div>
          <div className="stat-sub">{stats.todayVisits} scheduled today</div>
        </div>
        <div className="stat-card blue">
          <div className="stat-card-head">
            <div className="stat-card-icon">{ICON.monitors}</div>
            <div className="stat-label">Active monitors</div>
          </div>
          <div className="stat-value">{stats.monitors}</div>
          <div className="stat-sub">Per Standard 5.20(e)</div>
        </div>
        <div className="stat-card yellow">
          <div className="stat-card-head">
            <div className="stat-card-icon">{ICON.mail}</div>
            <div className="stat-label">Open invitations</div>
          </div>
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
                <span className="todo-arrow">{ICON.arrowRight}</span>
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
                        <Link to={`/cases/${c.id}`} className="cell-link">{c.case_number || '—'}</Link>
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

function fmtTime(t) {
  if (!t) return ''
  const [h, m] = t.split(':')
  const d = new Date(); d.setHours(Number(h), Number(m), 0, 0)
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function fmtRange(start, end) {
  if (!start) return '—'
  if (!end) return fmtTime(start)
  return `${fmtTime(start)} – ${fmtTime(end)}`
}

function partyName(p) {
  if (!p) return null
  return `${p.first_name || ''} ${p.last_name || ''}`.trim()
}

function nextActionForVisit(v) {
  switch (v.status) {
    case 'scheduled':
    case 'confirmed':       return { label: 'Check in',     to: `/visits/${v.id}`, kind: 'primary' }
    case 'checked_in':      return { label: 'Begin visit',  to: `/visits/${v.id}`, kind: 'primary' }
    case 'in_progress':     return { label: 'Check out',    to: `/visits/${v.id}`, kind: 'primary' }
    case 'report_pending':  return { label: 'Start report', to: `/visits/${v.id}/report`, kind: 'primary' }
    case 'report_submitted':return { label: 'View',         to: `/visits/${v.id}`, kind: 'secondary' }
    case 'completed':       return { label: 'View',         to: `/visits/${v.id}`, kind: 'secondary' }
    default:                return { label: 'View',         to: `/visits/${v.id}`, kind: 'secondary' }
  }
}

function MonitorDashboard({ user }) {
  const { activeOrgId } = useAuth()
  const [loading, setLoading] = useState(true)
  const [today, setToday] = useState([])
  const [upcoming, setUpcoming] = useState([])
  const [monitorId, setMonitorId] = useState(null)
  const [counts, setCounts] = useState({ activeCases: 0, weekVisits: 0, reportsDue: 0 })

  useEffect(() => { if (activeOrgId && user) load() }, [activeOrgId, user?.id])

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
      if (!mid) { setLoading(false); return }

      const today = new Date().toISOString().slice(0, 10)
      const weekEnd = new Date(); weekEnd.setDate(weekEnd.getDate() + 7)
      const weekEndStr = weekEnd.toISOString().slice(0, 10)

      const selectCols = `id, scheduled_date, scheduled_start_time, scheduled_end_time,
                          location, status, checked_in_at, checked_out_at,
                          case:case_id(id, case_number, special_conditions,
                            custodial:custodial_party_id(first_name, last_name),
                            noncustodial:noncustodial_party_id(first_name, last_name))`

      const [tRes, uRes, weekCount, reportsCount, caseCount] = await Promise.all([
        supabase.from('sv_visits').select(selectCols)
          .eq('org_id', activeOrgId).eq('monitor_id', mid)
          .eq('scheduled_date', today)
          .order('scheduled_start_time', { ascending: true }),
        supabase.from('sv_visits').select(selectCols)
          .eq('org_id', activeOrgId).eq('monitor_id', mid)
          .gt('scheduled_date', today).lte('scheduled_date', weekEndStr)
          .order('scheduled_date', { ascending: true })
          .order('scheduled_start_time', { ascending: true })
          .limit(20),
        supabase.from('sv_visits').select('id', { count: 'exact', head: true })
          .eq('org_id', activeOrgId).eq('monitor_id', mid)
          .gte('scheduled_date', today).lte('scheduled_date', weekEndStr),
        supabase.from('sv_visits').select('id', { count: 'exact', head: true })
          .eq('org_id', activeOrgId).eq('monitor_id', mid)
          .eq('status', 'report_pending'),
        supabase.from('sv_cases').select('id', { count: 'exact', head: true })
          .eq('org_id', activeOrgId).eq('primary_monitor_id', mid)
          .neq('status', 'archived'),
      ])

      setToday(tRes.data || [])
      setUpcoming(uRes.data || [])
      setCounts({
        activeCases: caseCount.count || 0,
        weekVisits: weekCount.count || 0,
        reportsDue: reportsCount.count || 0,
      })
    } finally { setLoading(false) }
  }

  const nowVisit = today.find((v) => v.status === 'in_progress' || v.status === 'checked_in')
  const nextVisit = today.find((v) => v.status === 'scheduled' || v.status === 'confirmed')
  const focusVisit = nowVisit || nextVisit || today[0] || null

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
          Your monitor profile isn't linked to your account yet. Ask your agency owner to invite you again with this email so your visits appear here.
        </div>
      )}

      {monitorId && (
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-card-head">
              <div className="stat-card-icon">{ICON.folder}</div>
              <div className="stat-label">My cases</div>
            </div>
            <div className="stat-value">{counts.activeCases}</div>
            <div className="stat-sub">Active assignments</div>
          </div>
          <div className="stat-card moss">
            <div className="stat-card-head">
              <div className="stat-card-icon">{ICON.calendar}</div>
              <div className="stat-label">This week</div>
            </div>
            <div className="stat-value">{counts.weekVisits}</div>
            <div className="stat-sub">{today.length} today</div>
          </div>
          <div className="stat-card yellow">
            <div className="stat-card-head">
              <div className="stat-card-icon">{ICON.note}</div>
              <div className="stat-label">Reports due</div>
            </div>
            <div className="stat-value">{counts.reportsDue}</div>
            <div className="stat-sub">Waiting on you</div>
          </div>
        </div>
      )}

      {focusVisit && (
        <div className="card monitor-focus">
          <div className="card-header">
            <div className="card-title">
              {nowVisit ? 'In progress' : 'Up next'}
            </div>
            <div className="cell-muted">{fmtRange(focusVisit.scheduled_start_time, focusVisit.scheduled_end_time)}</div>
          </div>
          <div className="card-body">
            <div className="monitor-focus-grid">
              <div>
                <div className="kv-label">Case</div>
                <Link to={`/cases/${focusVisit.case?.id}`} className="cell-link cell-mono cell-strong">
                  {focusVisit.case?.case_number || '—'}
                </Link>
              </div>
              <div>
                <div className="kv-label">Location</div>
                <div className="cell-strong">{focusVisit.location || '—'}</div>
              </div>
              <div>
                <div className="kv-label">Custodial</div>
                <div>{partyName(focusVisit.case?.custodial) || <span className="cell-muted">—</span>}</div>
              </div>
              <div>
                <div className="kv-label">Noncustodial</div>
                <div>{partyName(focusVisit.case?.noncustodial) || <span className="cell-muted">—</span>}</div>
              </div>
              {focusVisit.case?.special_conditions && (
                <div className="full">
                  <div className="kv-label">Special conditions</div>
                  <div>{focusVisit.case.special_conditions}</div>
                </div>
              )}
            </div>
            <div className="quick-actions">
              <Link to={`/visits/${focusVisit.id}`} className={`btn ${nextActionForVisit(focusVisit).kind === 'primary' ? 'btn-primary' : 'btn-secondary'}`}>
                {nextActionForVisit(focusVisit).label}
              </Link>
              {focusVisit.status === 'report_pending' && (
                <Link to={`/visits/${focusVisit.id}/report`} className="btn btn-secondary">Start report</Link>
              )}
              <Link to={`/cases/${focusVisit.case?.id}`} className="btn btn-secondary">Case info</Link>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-header"><div className="card-title">Today's visits</div>{today.length > 0 && <div className="cell-muted">{today.length}</div>}</div>
        <div className="card-body-flush">
          {loading ? <div className="loading">Loading…</div>
            : today.length === 0 ? <div className="empty-state"><div className="empty-state-icon">{ICON.coffee}</div><div className="empty-state-title">Nothing scheduled today</div><div className="empty-state-desc">Enjoy the breather.</div></div>
            : (
              <ul className="monitor-visit-list">
                {today.map((v) => (
                  <MonitorVisitRow key={v.id} v={v} />
                ))}
              </ul>
            )}
        </div>
      </div>

      <div className="card">
        <div className="card-header"><div className="card-title">This week</div>{upcoming.length > 0 && <div className="cell-muted">{upcoming.length}</div>}</div>
        <div className="card-body-flush">
          {loading ? <div className="loading">Loading…</div>
            : upcoming.length === 0 ? <div className="empty-state"><div className="empty-state-icon">{ICON.inbox}</div><div className="empty-state-title">No upcoming visits</div></div>
            : (
              <ul className="monitor-visit-list">
                {upcoming.map((v) => (
                  <MonitorVisitRow key={v.id} v={v} showDate />
                ))}
              </ul>
            )}
        </div>
      </div>
    </div>
  )
}

function MonitorVisitRow({ v, showDate }) {
  const action = nextActionForVisit(v)
  return (
    <li className="monitor-visit-item">
      <div className="monitor-visit-time">
        {showDate && (
          <div className="monitor-visit-date">
            {new Date(v.scheduled_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
          </div>
        )}
        <div className="monitor-visit-clock">{fmtRange(v.scheduled_start_time, v.scheduled_end_time)}</div>
      </div>
      <div className="monitor-visit-main">
        <Link to={`/visits/${v.id}`} className="monitor-visit-case">
          {v.case?.case_number || 'Visit'}
        </Link>
        <div className="monitor-visit-sub">
          {[partyName(v.case?.custodial), partyName(v.case?.noncustodial)].filter(Boolean).join(' · ') || ''}
        </div>
        <div className="monitor-visit-meta">
          {v.location && <span>{v.location}</span>}
          {statusBadge(v.status)}
        </div>
      </div>
      <div className="monitor-visit-action">
        <Link to={action.to} className={`btn btn-sm ${action.kind === 'primary' ? 'btn-primary' : 'btn-secondary'}`}>
          {action.label}
        </Link>
      </div>
    </li>
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
