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
  bolt: <Svg><path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z" /></Svg>,
  check: <Svg><path d="M5 12l5 5L20 7" /></Svg>,
  bell: <Svg><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 01-3.46 0" /></Svg>,
  play: <Svg><path d="M6 4l14 8-14 8V4z" /></Svg>,
  pencil: <Svg><path d="M12 20h9M16.5 3.5l4 4L7 21H3v-4L16.5 3.5z" /></Svg>,
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

function fmtRelative(ts) {
  if (!ts) return ''
  const diff = Date.now() - new Date(ts).getTime()
  const s = Math.floor(diff / 1000)
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
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

/* ============================================================
   OWNER COMMAND CENTER
   ============================================================ */

function OwnerDashboard({ org }) {
  const { activeOrgId } = useAuth()
  const [loading, setLoading] = useState(true)
  const [priorities, setPriorities] = useState({
    pendingReports: 0,
    changesRequested: 0,
    todayVisits: 0,
    activeMonitors: 0,
    unassignedCases: 0,
  })
  const [stats, setStats] = useState({ activeCases: 0, weekVisits: 0 })
  const [recentCases, setRecentCases] = useState([])
  const [todayVisitsList, setTodayVisitsList] = useState([])
  const [weekStrip, setWeekStrip] = useState([])
  const [activity, setActivity] = useState([])
  const [todoItems, setTodoItems] = useState([])
  // Onboarding checklist state — drives the empty-state guided flow for fresh
  // agencies. Each step flips to "done" automatically once its data exists,
  // so the checklist disappears as soon as the agency is fully set up.
  const [onboardCounts, setOnboardCounts] = useState({
    monitors: null,    // total monitors (incl. pending)
    cases: null,       // total cases (any status)
    visits: null,      // total visits (any status, all time)
    reportsWritten: 0, // any report ever submitted
  })

  useEffect(() => { if (activeOrgId) load() }, [activeOrgId])

  async function load() {
    setLoading(true)
    try {
      const today = new Date()
      const yyyymmdd = today.toISOString().slice(0, 10)
      const weekEnd = new Date(today); weekEnd.setDate(weekEnd.getDate() + 7)
      const weekEndStr = weekEnd.toISOString().slice(0, 10)

      const [
        pendingRes, changesRes, todayRes, monitorsRes, unassignedRes,
        activeCasesRes, weekRes, todayListRes,
      ] = await Promise.all([
        supabase.from('sv_reports').select('id', { count: 'exact', head: true })
          .eq('org_id', activeOrgId).eq('status', 'pending_review').is('archived_at', null).is('deleted_at', null),
        supabase.from('sv_reports').select('id', { count: 'exact', head: true })
          .eq('org_id', activeOrgId).eq('status', 'changes_requested').is('archived_at', null).is('deleted_at', null),
        supabase.from('sv_visits').select('id', { count: 'exact', head: true })
          .eq('org_id', activeOrgId).eq('scheduled_date', yyyymmdd),
        supabase.from('sv_monitors').select('id', { count: 'exact', head: true })
          .eq('org_id', activeOrgId).eq('active', true),
        supabase.from('sv_cases').select('id', { count: 'exact', head: true })
          .eq('org_id', activeOrgId).is('primary_monitor_id', null).neq('status', 'archived'),
        supabase.from('sv_cases').select('id', { count: 'exact', head: true })
          .eq('org_id', activeOrgId).eq('status', 'active'),
        supabase.from('sv_visits').select('id', { count: 'exact', head: true })
          .eq('org_id', activeOrgId).gte('scheduled_date', yyyymmdd).lte('scheduled_date', weekEndStr),
        supabase.from('sv_visits').select(`id, scheduled_start_time, scheduled_end_time, status, location,
                   case:case_id(id, case_number), monitor:monitor_id(first_name, last_name)`)
          .eq('org_id', activeOrgId).eq('scheduled_date', yyyymmdd)
          .order('scheduled_start_time', { ascending: true }),
      ])

      setPriorities({
        pendingReports:   pendingRes.count   || 0,
        changesRequested: changesRes.count   || 0,
        todayVisits:      todayRes.count     || 0,
        activeMonitors:   monitorsRes.count  || 0,
        unassignedCases:  unassignedRes.count || 0,
      })
      setStats({
        activeCases: activeCasesRes.count || 0,
        weekVisits: weekRes.count || 0,
      })
      setTodayVisitsList(todayListRes.data || [])

      // Week strip — number of visits per day for next 7 days
      const { data: weekData } = await supabase.from('sv_visits')
        .select('scheduled_date')
        .eq('org_id', activeOrgId)
        .gte('scheduled_date', yyyymmdd).lte('scheduled_date', weekEndStr)
      const dayCounts = {}
      ;(weekData || []).forEach((v) => { dayCounts[v.scheduled_date] = (dayCounts[v.scheduled_date] || 0) + 1 })
      const strip = []
      for (let i = 0; i < 7; i++) {
        const d = new Date(); d.setDate(d.getDate() + i)
        const ds = d.toISOString().slice(0, 10)
        strip.push({
          date: ds,
          dayName: d.toLocaleDateString('en-US', { weekday: 'short' }),
          dayNum: d.getDate(),
          count: dayCounts[ds] || 0,
          isToday: i === 0,
        })
      }
      setWeekStrip(strip)

      const { data: recent } = await supabase
        .from('sv_cases')
        .select(`id, case_number, status, risk_level, created_at,
                 custodial:custodial_party_id(first_name, last_name),
                 noncustodial:noncustodial_party_id(first_name, last_name)`)
        .eq('org_id', activeOrgId)
        .order('created_at', { ascending: false })
        .limit(5)
      setRecentCases(recent || [])

      // Activity feed: recent reports submitted + visits checked in/out + cases created
      const [recReports, recVisits, recCases] = await Promise.all([
        supabase.from('sv_reports').select(`id, status, submitted_at, approved_at, changes_requested_at,
                  case:case_id(id, case_number), monitor:monitor_id(first_name, last_name)`)
          .eq('org_id', activeOrgId).is('deleted_at', null)
          .order('updated_at', { ascending: false }).limit(8),
        supabase.from('sv_visits').select(`id, status, checked_in_at, checked_out_at, scheduled_date,
                  case:case_id(id, case_number), monitor:monitor_id(first_name, last_name)`)
          .eq('org_id', activeOrgId)
          .not('checked_in_at', 'is', null)
          .order('checked_in_at', { ascending: false }).limit(8),
        supabase.from('sv_cases').select('id, case_number, created_at, status')
          .eq('org_id', activeOrgId).order('created_at', { ascending: false }).limit(4),
      ])

      const events = []
      ;(recReports.data || []).forEach((r) => {
        const monitor = r.monitor ? `${r.monitor.first_name} ${r.monitor.last_name}` : 'A monitor'
        if (r.status === 'pending_review' && r.submitted_at) {
          events.push({
            id: 'rep-s-' + r.id,
            icon: ICON.note,
            text: `${monitor} submitted a report for ${r.case?.case_number || 'a case'}`,
            ts: r.submitted_at,
            link: `/reports`,
            tone: 'yellow',
          })
        } else if (r.status === 'approved' && r.approved_at) {
          events.push({
            id: 'rep-a-' + r.id,
            icon: ICON.check,
            text: `Report approved for ${r.case?.case_number || 'a case'}`,
            ts: r.approved_at,
            link: `/reports`,
            tone: 'moss',
          })
        } else if (r.status === 'changes_requested' && r.changes_requested_at) {
          events.push({
            id: 'rep-c-' + r.id,
            icon: ICON.pencil,
            text: `Changes requested on ${r.case?.case_number || 'a case'} report`,
            ts: r.changes_requested_at,
            link: `/reports`,
            tone: 'orange',
          })
        }
      })
      ;(recVisits.data || []).forEach((v) => {
        const monitor = v.monitor ? `${v.monitor.first_name} ${v.monitor.last_name}` : 'A monitor'
        if (v.checked_out_at) {
          events.push({
            id: 'v-out-' + v.id,
            icon: ICON.check,
            text: `${monitor} completed visit for ${v.case?.case_number || 'a case'}`,
            ts: v.checked_out_at,
            link: `/visits/${v.id}`,
            tone: 'moss',
          })
        } else if (v.checked_in_at) {
          events.push({
            id: 'v-in-' + v.id,
            icon: ICON.play,
            text: `${monitor} checked in for ${v.case?.case_number || 'a case'}`,
            ts: v.checked_in_at,
            link: `/visits/${v.id}`,
            tone: 'blue',
          })
        }
      })
      ;(recCases.data || []).forEach((c) => {
        events.push({
          id: 'c-' + c.id,
          icon: ICON.folder,
          text: `New case ${c.case_number || ''} created`,
          ts: c.created_at,
          link: `/cases/${c.id}`,
          tone: 'gray',
        })
      })
      events.sort((a, b) => new Date(b.ts) - new Date(a.ts))
      setActivity(events.slice(0, 10))

      // To-do list (carryover)
      const todos = []
      const [unassignedCases, expiringMonitors, intakeCases] = await Promise.all([
        supabase.from('sv_cases').select('id, case_number').eq('org_id', activeOrgId).is('primary_monitor_id', null).neq('status', 'archived').limit(8),
        supabase.from('sv_monitors').select('id, first_name, last_name, kcm_expiry_date, trustline_expiry').eq('org_id', activeOrgId),
        supabase.from('sv_cases').select('id, case_number, created_at').eq('org_id', activeOrgId).eq('status', 'intake').limit(8),
      ])
      ;(unassignedCases.data || []).forEach((c) => {
        todos.push({
          id: 'unass-' + c.id, icon: ICON.compass,
          title: `Assign a monitor to case ${c.case_number || c.id.slice(0,6)}`,
          link: `/cases/${c.id}`,
        })
      })
      ;(intakeCases.data || []).forEach((c) => {
        todos.push({
          id: 'intake-' + c.id, icon: ICON.note,
          title: `Move case ${c.case_number || c.id.slice(0,6)} out of intake`,
          link: `/cases/${c.id}`,
        })
      })
      const in60 = new Date(); in60.setDate(in60.getDate() + 60)
      ;(expiringMonitors.data || []).forEach((m) => {
        if (m.kcm_expiry_date && new Date(m.kcm_expiry_date) <= in60) {
          todos.push({
            id: 'kcm-' + m.id, icon: ICON.cert,
            title: `${m.first_name} ${m.last_name}'s KCM cert expires ${fmtDate(m.kcm_expiry_date)}`,
            link: `/monitors/${m.id}`,
          })
        }
        if (m.trustline_expiry && new Date(m.trustline_expiry) <= in60) {
          todos.push({
            id: 'tl-' + m.id, icon: ICON.shield,
            title: `${m.first_name} ${m.last_name}'s TrustLine expires ${fmtDate(m.trustline_expiry)}`,
            link: `/monitors/${m.id}`,
          })
        }
      })
      setTodoItems(todos.slice(0, 6))

      // Onboarding counts — fires last so the priority cards render even if
      // these queries are slow.
      const [monCount, caseAnyCount, visitAnyCount, reportCount] = await Promise.all([
        supabase.from('sv_monitors').select('id', { count: 'exact', head: true }).eq('org_id', activeOrgId),
        supabase.from('sv_cases').select('id', { count: 'exact', head: true }).eq('org_id', activeOrgId),
        supabase.from('sv_visits').select('id', { count: 'exact', head: true }).eq('org_id', activeOrgId),
        supabase.from('sv_reports').select('id', { count: 'exact', head: true }).eq('org_id', activeOrgId).not('submitted_at', 'is', null).is('deleted_at', null),
      ])
      setOnboardCounts({
        monitors: monCount.count || 0,
        cases: caseAnyCount.count || 0,
        visits: visitAnyCount.count || 0,
        reportsWritten: reportCount.count || 0,
      })
    } catch (err) {
      console.error('Dashboard load error:', err)
    } finally {
      setLoading(false)
    }
  }

  // Show the onboarding checklist until the agency has at least one monitor,
  // one case, one visit, and one submitted report — i.e. they've completed
  // the full end-to-end loop at least once.
  const onboarding = onboardCounts.monitors !== null && (
    onboardCounts.monitors === 0 ||
    onboardCounts.cases === 0 ||
    onboardCounts.visits === 0 ||
    onboardCounts.reportsWritten === 0
  )
  const onboardSteps = onboardCounts.monitors === null ? null : [
    {
      done: onboardCounts.monitors > 0,
      title: 'Add your first monitor',
      desc: 'Invite a 1099 monitor by email. They sign in on their phone and run visits.',
      cta: 'Add monitor',
      to: '/monitors',
    },
    {
      done: onboardCounts.cases > 0,
      title: 'Run your first intake',
      desc: 'Capture the case, parties, and child in a guided 5-step intake (CA 5.20 compliant).',
      cta: 'Start intake',
      to: '/intake',
    },
    {
      done: onboardCounts.visits > 0,
      title: 'Schedule the first visit',
      desc: 'Assign a monitor and time. Parents get a portal link automatically.',
      cta: 'Open a case',
      to: '/cases',
    },
    {
      done: onboardCounts.reportsWritten > 0,
      title: 'Complete a visit',
      desc: 'Monitor checks in, runs the 6-phase flow, writes the report — you review and ship to court.',
      cta: 'See workflow',
      to: '/visits',
    },
  ]

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Good {greetingTime()}{org?.name ? `,` : ''}</h1>
          <div className="page-subtitle">
            {org?.name} · {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </div>
        </div>
        <div className="btn-group">
          <Link to="/visits" className="btn btn-secondary">View calendar</Link>
          <Link to="/intake" className="btn btn-primary">New intake</Link>
        </div>
      </div>

      {/* Onboarding checklist — shown until the agency has run a full visit
          cycle end-to-end at least once. */}
      {onboarding && onboardSteps && <OnboardingChecklist steps={onboardSteps} />}

      {/* Priority Command Cards — clickable, action-oriented */}
      <div className="priority-grid">
        <PriorityCard
          to="/reports"
          tone="yellow"
          icon={ICON.note}
          n={priorities.pendingReports}
          label="reports pending review"
          urgent={priorities.pendingReports > 0}
        />
        <PriorityCard
          to="/visits"
          tone="moss"
          icon={ICON.calendar}
          n={priorities.todayVisits}
          label="visits today"
          urgent={priorities.todayVisits > 0}
        />
        <PriorityCard
          to="/reports?tab=changes_requested"
          tone="orange"
          icon={ICON.pencil}
          n={priorities.changesRequested}
          label="reports awaiting changes"
          urgent={priorities.changesRequested > 0}
        />
        <PriorityCard
          to="/monitors"
          tone="blue"
          icon={ICON.monitors}
          n={priorities.activeMonitors}
          label="active monitors"
        />
      </div>

      {/* Week strip */}
      <div className="card week-strip-card">
        <div className="card-header">
          <div className="card-title">Next 7 days</div>
          <Link to="/visits" className="cell-link cell-link-arrow">Open calendar →</Link>
        </div>
        <div className="week-strip">
          {weekStrip.map((d) => (
            <Link key={d.date} to={`/visits?date=${d.date}`} className={`week-day ${d.isToday ? 'today' : ''} ${d.count > 0 ? 'has' : ''}`}>
              <div className="week-day-name">{d.dayName}</div>
              <div className="week-day-num">{d.dayNum}</div>
              <div className="week-day-count">
                {d.count > 0 ? `${d.count} visit${d.count === 1 ? '' : 's'}` : <span className="cell-muted">—</span>}
              </div>
            </Link>
          ))}
        </div>
      </div>

      <div className="dashboard-2col">
        {/* Today's visits */}
        <div className="card">
          <div className="card-header">
            <div className="card-title">Today's visits</div>
            {todayVisitsList.length > 0 && <span className="cell-muted">{todayVisitsList.length}</span>}
          </div>
          <div className="card-body-flush">
            {loading ? <ListSkeleton rows={3} />
              : todayVisitsList.length === 0 ? <Empty title="Nothing scheduled today" desc="Quiet day. Want to plan ahead?" actionLabel="View calendar" actionTo="/visits" />
              : (
                <ul className="dash-visit-list">
                  {todayVisitsList.map((v) => (
                    <li key={v.id} className="dash-visit-item">
                      <div className="dash-visit-time">{fmtClock(v.scheduled_start_time)}</div>
                      <div className="dash-visit-main">
                        <Link to={`/visits/${v.id}`} className="dash-visit-case">{v.case?.case_number || 'Visit'}</Link>
                        <div className="dash-visit-sub">
                          {v.monitor ? `${v.monitor.first_name} ${v.monitor.last_name}` : 'Unassigned'}
                          {v.location ? ` · ${v.location}` : ''}
                        </div>
                      </div>
                      <div>{statusBadge(v.status)}</div>
                    </li>
                  ))}
                </ul>
              )}
          </div>
        </div>

        {/* Activity feed */}
        <div className="card">
          <div className="card-header">
            <div className="card-title">Recent activity</div>
          </div>
          <div className="card-body-flush">
            {loading ? <ListSkeleton rows={4} />
              : activity.length === 0 ? <Empty title="No activity yet" desc="When monitors check in or submit reports, you'll see updates here." />
              : (
                <ul className="activity-list">
                  {activity.map((e) => (
                    <li key={e.id} className="activity-item">
                      <Link to={e.link} className="activity-link">
                        <span className={`activity-icon tone-${e.tone}`}>{e.icon}</span>
                        <span className="activity-text">{e.text}</span>
                        <span className="activity-time">{fmtRelative(e.ts)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
          </div>
        </div>
      </div>

      {/* To-do items */}
      {todoItems.length > 0 && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">Action items</div>
            <span className="cell-muted">{todoItems.length} item{todoItems.length === 1 ? '' : 's'}</span>
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

      {/* Recent cases */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">Recent cases</div>
          <Link to="/cases" className="btn btn-secondary btn-sm">View all</Link>
        </div>
        <div className="card-body-flush">
          {loading ? <ListSkeleton rows={4} />
            : recentCases.length === 0 ? <Empty title="No cases yet" desc="Create your first intake to get started." actionLabel="New intake" actionTo="/intake" />
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

function greetingTime() {
  const h = new Date().getHours()
  if (h < 5) return 'evening'
  if (h < 12) return 'morning'
  if (h < 18) return 'afternoon'
  return 'evening'
}

function OnboardingChecklist({ steps }) {
  const completed = steps.filter((s) => s.done).length
  const total = steps.length
  const pct = Math.round((completed / total) * 100)
  // Pick the first incomplete step as the "next action" so we can highlight it.
  const nextIdx = steps.findIndex((s) => !s.done)
  return (
    <div className="onboard-card">
      <div className="onboard-head">
        <div>
          <div className="onboard-eyebrow">Get started</div>
          <div className="onboard-title">
            {completed === total
              ? "You're set up — nice work."
              : completed === 0
                ? "Let's get your agency running"
                : `${completed} of ${total} done — keep going`}
          </div>
        </div>
        <div className="onboard-progress" aria-label={`${pct}% complete`}>
          <div className="onboard-progress-bar"><div style={{ width: `${pct}%` }} /></div>
          <div className="onboard-progress-text">{pct}%</div>
        </div>
      </div>
      <ol className="onboard-steps">
        {steps.map((s, i) => (
          <li key={s.title} className={`onboard-step${s.done ? ' done' : ''}${i === nextIdx ? ' next' : ''}`}>
            <div className="onboard-step-check" aria-hidden="true">
              {s.done ? '✓' : i + 1}
            </div>
            <div className="onboard-step-body">
              <div className="onboard-step-title">{s.title}</div>
              <div className="onboard-step-desc">{s.desc}</div>
            </div>
            {!s.done && (
              <Link to={s.to} className={`btn btn-sm ${i === nextIdx ? 'btn-primary' : 'btn-secondary'}`}>
                {s.cta}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </div>
  )
}

function PriorityCard({ to, tone, icon, n, label, urgent }) {
  return (
    <Link to={to} className={`priority-card priority-${tone} ${urgent ? 'urgent' : ''}`}>
      <div className="priority-icon">{icon}</div>
      <div className="priority-body">
        <div className="priority-number">{n}</div>
        <div className="priority-label">{label}</div>
      </div>
      <div className="priority-arrow">{ICON.arrowRight}</div>
    </Link>
  )
}

function ListSkeleton({ rows = 3 }) {
  return (
    <div className="list-skeleton">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="sk-row">
          <div className="sk-line w30" />
          <div className="sk-line w60" />
        </div>
      ))}
    </div>
  )
}

/* ============================================================
   MONITOR — "My Day" portal
   ============================================================ */

function fmtTime(t) {
  if (!t) return ''
  const [h, m] = t.split(':')
  const d = new Date(); d.setHours(Number(h), Number(m), 0, 0)
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function fmtClock(t) { return fmtTime(t) }

function fmtRange(start, end) {
  if (!start) return '—'
  if (!end) return fmtTime(start)
  return `${fmtTime(start)} – ${fmtTime(end)}`
}

function partyName(p) {
  if (!p) return null
  return `${p.first_name || ''} ${p.last_name || ''}`.trim()
}

/**
 * Map visit status to the next action. Tone drives the CTA color:
 *   green  = upcoming
 *   blue   = in progress
 *   orange = action overdue / report due
 *   gray   = done / view only
 */
function nextActionForVisit(v) {
  switch (v.status) {
    case 'scheduled':
    case 'confirmed':
      return { label: 'Start pre-visit check', to: `/visits/${v.id}`, tone: 'green' }
    case 'checked_in':
      return { label: 'Continue monitoring', to: `/visits/${v.id}`, tone: 'blue' }
    case 'in_progress':
      return { label: 'Continue monitoring', to: `/visits/${v.id}`, tone: 'blue' }
    case 'report_pending':
      return { label: 'Write report', to: `/visits/${v.id}/report`, tone: 'orange' }
    case 'report_submitted':
      return { label: 'View report', to: `/visits/${v.id}/report`, tone: 'gray' }
    case 'completed':
      return { label: 'View summary', to: `/visits/${v.id}`, tone: 'gray' }
    default:
      return { label: 'View', to: `/visits/${v.id}`, tone: 'gray' }
  }
}

function MonitorDashboard({ user }) {
  const { activeOrgId } = useAuth()
  const [loading, setLoading] = useState(true)
  const [today, setToday] = useState([])
  const [upcoming, setUpcoming] = useState([])
  const [reportsPending, setReportsPending] = useState([])
  const [monitorId, setMonitorId] = useState(null)
  const [counts, setCounts] = useState({ activeCases: 0, weekVisits: 0, reportsDue: 0, weekHours: 0 })
  // Reports more than 24h past the visit checkout — these block payment and
  // court delivery, so we surface them as an overdue strip at the top.
  const [overdueReports, setOverdueReports] = useState([])

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

      const [tRes, uRes, weekCount, pendingRes, caseCount] = await Promise.all([
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
        supabase.from('sv_visits').select(selectCols)
          .eq('org_id', activeOrgId).eq('monitor_id', mid)
          .in('status', ['report_pending'])
          .order('scheduled_date', { ascending: true }),
        supabase.from('sv_cases').select('id', { count: 'exact', head: true })
          .eq('org_id', activeOrgId).eq('primary_monitor_id', mid)
          .neq('status', 'archived'),
      ])

      setToday(tRes.data || [])
      setUpcoming(uRes.data || [])
      setReportsPending(pendingRes.data || [])

      // Hours this week: sum scheduled durations across today + upcoming.
      // We use scheduled time (not actual) so monitors can plan their week.
      const allWeek = [...(tRes.data || []), ...(uRes.data || [])]
      const weekHours = allWeek.reduce((acc, v) => {
        if (!v.scheduled_start_time || !v.scheduled_end_time) return acc
        const [sh, sm] = v.scheduled_start_time.split(':').map(Number)
        const [eh, em] = v.scheduled_end_time.split(':').map(Number)
        const mins = (eh * 60 + em) - (sh * 60 + sm)
        return acc + (mins > 0 ? mins : 0)
      }, 0) / 60

      // Overdue = report_pending AND checked out > 24h ago. These should
      // already be submitted, so we surface them above today's visits.
      const cutoff = Date.now() - 24 * 3600 * 1000
      const overdue = (pendingRes.data || []).filter((v) =>
        v.checked_out_at && new Date(v.checked_out_at).getTime() < cutoff
      )
      setOverdueReports(overdue)

      setCounts({
        activeCases: caseCount.count || 0,
        weekVisits: weekCount.count || 0,
        reportsDue: (pendingRes.data || []).length,
        weekHours: Math.round(weekHours * 10) / 10,
      })
    } finally { setLoading(false) }
  }

  const nowVisit = today.find((v) => v.status === 'in_progress' || v.status === 'checked_in')
  const reportDueVisit = reportsPending[0] || today.find((v) => v.status === 'report_pending')
  const nextVisit = today.find((v) => v.status === 'scheduled' || v.status === 'confirmed')
  const focusVisit = nowVisit || reportDueVisit || nextVisit || today[0] || null

  const firstName = (user?.user_metadata?.full_name || user?.email || '').split(/[\s@.]/)[0] || ''
  const totalToday = today.length
  const todayHeadline = nowVisit
    ? 'You have a visit in progress'
    : reportDueVisit
      ? `You have ${counts.reportsDue} report${counts.reportsDue === 1 ? '' : 's'} to write`
      : totalToday > 0
        ? `You have ${totalToday} visit${totalToday === 1 ? '' : 's'} today`
        : 'No visits scheduled today'

  return (
    <div className="monitor-day">
      <div className="page-header monitor-header">
        <div>
          <h1 className="page-title">Good {greetingTime()}{firstName ? `, ${firstName}` : ''}</h1>
          <div className="page-subtitle">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</div>
        </div>
      </div>

      {!monitorId && (
        <div className="confidential-banner">
          Your monitor profile isn't linked to your account yet. Ask your agency owner to invite you again with this email so your visits appear here.
        </div>
      )}

      {monitorId && (
        <>
          {/* Overdue reports — most urgent. Shown above everything else so
              monitors can clear them before starting new visits. */}
          {overdueReports.length > 0 && (
            <div className="overdue-banner" role="alert">
              <div className="overdue-banner-icon">!</div>
              <div className="overdue-banner-body">
                <div className="overdue-banner-title">
                  {overdueReports.length} report{overdueReports.length === 1 ? ' is' : 's are'} overdue
                </div>
                <div className="overdue-banner-desc">
                  Reports more than 24 hours old delay payment and court delivery. Please finish them first.
                </div>
              </div>
              <Link to={`/visits/${overdueReports[0].id}/report`} className="btn btn-primary overdue-banner-btn">
                {overdueReports.length === 1 ? 'Finish report' : 'Finish oldest →'}
              </Link>
            </div>
          )}

          {/* Hero — the most important visit, with one clear next-action button */}
          <div className="monitor-hero">
            <div className="monitor-hero-headline">{todayHeadline}</div>
            {focusVisit ? (
              <MonitorFocusCard v={focusVisit} />
            ) : (
              <div className="monitor-hero-empty">
                <div className="empty-state-icon">{ICON.coffee}</div>
                <div>Enjoy the breather. Your next visit will show up here.</div>
              </div>
            )}
          </div>

          {/* "This week at a glance" — explicit expectations so monitors
              know what their week looks like before they even scroll. */}
          <div className="monitor-week-summary">
            <div className="monitor-week-summary-title">This week at a glance</div>
            <div className="monitor-stats">
              <Link to="/visits" className="monitor-stat">
                <div className="monitor-stat-n">{counts.weekVisits}</div>
                <div className="monitor-stat-l">Visits scheduled</div>
              </Link>
              <Link to="/visits" className="monitor-stat">
                <div className="monitor-stat-n">{counts.weekHours || 0}<span className="monitor-stat-unit">h</span></div>
                <div className="monitor-stat-l">Hours committed</div>
              </Link>
              <Link to="/cases" className="monitor-stat">
                <div className="monitor-stat-n">{counts.activeCases}</div>
                <div className="monitor-stat-l">Active cases</div>
              </Link>
              <Link to="/visits?status=report_pending" className={`monitor-stat ${counts.reportsDue > 0 ? 'urgent' : ''}`}>
                <div className="monitor-stat-n">{counts.reportsDue}</div>
                <div className="monitor-stat-l">Reports owed</div>
              </Link>
            </div>
          </div>

          {/* Reports due — surface above the visit list when present */}
          {reportsPending.length > 0 && (
            <div className="card">
              <div className="card-header">
                <div className="card-title">Reports to write</div>
                <span className="cell-muted">{reportsPending.length}</span>
              </div>
              <div className="card-body-flush">
                <ul className="monitor-visit-list">
                  {reportsPending.map((v) => (
                    <MonitorVisitRow key={v.id} v={v} showDate />
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Today */}
          <div className="card">
            <div className="card-header">
              <div className="card-title">Today's visits</div>
              {today.length > 0 && <span className="cell-muted">{today.length}</span>}
            </div>
            <div className="card-body-flush">
              {loading ? <ListSkeleton rows={2} />
                : today.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-state-icon">{ICON.coffee}</div>
                    <div className="empty-state-title">Nothing scheduled today</div>
                    <div className="empty-state-desc">Enjoy the breather.</div>
                  </div>
                )
                : (
                  <ul className="monitor-visit-list">
                    {today.map((v) => <MonitorVisitRow key={v.id} v={v} />)}
                  </ul>
                )}
            </div>
          </div>

          {/* Upcoming */}
          <div className="card">
            <div className="card-header">
              <div className="card-title">This week</div>
              {upcoming.length > 0 && <span className="cell-muted">{upcoming.length}</span>}
            </div>
            <div className="card-body-flush">
              {loading ? <ListSkeleton rows={3} />
                : upcoming.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-state-icon">{ICON.inbox}</div>
                    <div className="empty-state-title">No upcoming visits</div>
                    <div className="empty-state-desc">Your week looks open.</div>
                  </div>
                )
                : (
                  <ul className="monitor-visit-list">
                    {upcoming.map((v) => <MonitorVisitRow key={v.id} v={v} showDate />)}
                  </ul>
                )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function MonitorFocusCard({ v }) {
  const action = nextActionForVisit(v)
  return (
    <div className={`monitor-focus-card tone-${action.tone}`}>
      <div className="monitor-focus-time">{fmtRange(v.scheduled_start_time, v.scheduled_end_time)}</div>
      <Link to={`/cases/${v.case?.id}`} className="monitor-focus-case">
        {v.case?.case_number || 'Visit'}
      </Link>
      <div className="monitor-focus-parties">
        {[partyName(v.case?.custodial), partyName(v.case?.noncustodial)].filter(Boolean).join(' · ') || ''}
      </div>
      {v.location && <div className="monitor-focus-loc">{v.location}</div>}
      {v.case?.special_conditions && (
        <div className="monitor-focus-conditions">
          <strong>Special conditions:</strong> {v.case.special_conditions}
        </div>
      )}
      <Link to={action.to} className={`monitor-focus-cta cta-${action.tone}`}>
        {action.label}
        <span aria-hidden="true">→</span>
      </Link>
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
        <Link to={action.to} className={`btn btn-sm cta-${action.tone}`}>
          {action.label}
        </Link>
      </div>
    </li>
  )
}

function Empty({ title, desc, actionLabel, actionTo }) {
  return (
    <div className="empty-state">
      <div className="empty-state-title">{title}</div>
      {desc && <div className="empty-state-desc">{desc}</div>}
      {actionLabel && actionTo && (
        <Link to={actionTo} className="btn btn-secondary" style={{ marginTop: 12 }}>{actionLabel}</Link>
      )}
    </div>
  )
}
