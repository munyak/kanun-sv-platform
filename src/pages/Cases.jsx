import React, { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import { useAuth } from '../auth/AuthContext'
import CaseForm from '../components/CaseForm'

function fmtDate(s) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function riskPill(level) {
  if (!level) return <span className="cell-muted">—</span>
  const cls = level === 'critical' ? 'risk-high' : level === 'high' ? 'risk-high' : level === 'medium' ? 'risk-medium' : 'risk-low'
  return <span className={`risk-pill ${cls}`}>{level.charAt(0).toUpperCase() + level.slice(1)}</span>
}

function statusBadge(status) {
  if (!status) return <span className="badge badge-gray">—</span>
  const map = {
    intake:     'badge-yellow',
    active:     'badge-green',
    suspended:  'badge-yellow',
    terminated: 'badge-red',
    completed:  'badge-blue',
    archived:   'badge-gray',
  }
  const cls = map[status] || 'badge-gray'
  return <span className={`badge ${cls}`}>{status.charAt(0).toUpperCase() + status.slice(1)}</span>
}

function PipelineStage({ label, sub, n, active, onClick, tone }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`pipeline-stage tone-${tone}${active ? ' active' : ''}`}
    >
      <div className="pipeline-stage-n">{n}</div>
      <div className="pipeline-stage-label">{label}</div>
      <div className="pipeline-stage-sub">{sub}</div>
    </button>
  )
}

function PipelineArrow() {
  return (
    <div className="pipeline-arrow" aria-hidden="true">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12h14M13 6l6 6-6 6" />
      </svg>
    </div>
  )
}

export default function Cases() {
  const { activeOrgId, role, user } = useAuth()
  const isMonitor = role === 'monitor'
  const nav = useNavigate()
  const [loading, setLoading] = useState(true)
  const [cases, setCases] = useState([])
  const [filter, setFilter] = useState(isMonitor ? 'active' : 'all')
  const [query, setQuery] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [monitorId, setMonitorId] = useState(null)

  useEffect(() => {
    if (!isMonitor || !activeOrgId || !user) { setMonitorId(null); return }
    supabase.from('sv_monitors').select('id')
      .eq('org_id', activeOrgId).eq('user_id', user.id).maybeSingle()
      .then(({ data }) => setMonitorId(data?.id || null))
  }, [isMonitor, activeOrgId, user?.id])

  useEffect(() => {
    if (!activeOrgId) return
    if (isMonitor && monitorId === null) return
    load()
  }, [activeOrgId, isMonitor, monitorId])

  async function load() {
    setLoading(true)
    try {
      let q = supabase
        .from('sv_cases')
        .select(`
          id, case_number, court_name, referral_source, supervision_type,
          risk_level, status, created_at, visit_frequency,
          custodial:custodial_party_id(first_name, last_name),
          noncustodial:noncustodial_party_id(first_name, last_name),
          monitor:primary_monitor_id(first_name, last_name)
        `)
        .eq('org_id', activeOrgId)
        .order('created_at', { ascending: false })
      if (isMonitor && monitorId) q = q.eq('primary_monitor_id', monitorId)
      const { data, error } = await q
      if (error) throw error
      setCases(data || [])
    } catch (err) {
      console.error('Cases load error:', err)
    } finally {
      setLoading(false)
    }
  }

  const filtered = cases
    .filter((c) => filter === 'all' ? true : c.status === filter)
    .filter((c) => {
      if (!query.trim()) return true
      const q = query.trim().toLowerCase()
      return [c.case_number, c.court_name,
              c.custodial?.first_name, c.custodial?.last_name,
              c.noncustodial?.first_name, c.noncustodial?.last_name]
        .filter(Boolean).some((v) => v.toLowerCase().includes(q))
    })

  // Pipeline stage counts — rendered as a workflow strip at the top so
  // owners can see their funnel at a glance and jump straight to a stage.
  // Order is the actual case lifecycle: intake → active → suspended → closed.
  const stageCounts = {
    intake:    cases.filter((c) => c.status === 'intake').length,
    active:    cases.filter((c) => c.status === 'active').length,
    suspended: cases.filter((c) => c.status === 'suspended').length,
    closed:    cases.filter((c) => c.status === 'completed' || c.status === 'terminated' || c.status === 'archived').length,
  }
  const unassignedCount = cases.filter((c) => !c.monitor && c.status !== 'archived' && c.status !== 'completed' && c.status !== 'terminated').length

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">{isMonitor ? 'My cases' : 'Cases'}</h1>
          <div className="page-subtitle">{cases.length} total · {filtered.length} shown</div>
        </div>
        {!isMonitor && (
          <div className="btn-group">
            <Link to="/intake" className="btn btn-secondary">Full intake</Link>
            <button className="btn btn-primary" onClick={() => setShowCreate(true)}>New case</button>
          </div>
        )}
      </div>

      {showCreate && (
        <CaseForm
          orgId={activeOrgId}
          onClose={() => setShowCreate(false)}
          onSaved={(c) => { setShowCreate(false); nav(`/cases/${c.id}`) }}
        />
      )}

      {!isMonitor && cases.length > 0 && (
        <div className="pipeline-strip">
          <PipelineStage
            label="Intake"
            sub="Awaiting setup"
            n={stageCounts.intake}
            active={filter === 'intake'}
            onClick={() => setFilter('intake')}
            tone="yellow"
          />
          <PipelineArrow />
          <PipelineStage
            label="Active"
            sub="Monitoring underway"
            n={stageCounts.active}
            active={filter === 'active'}
            onClick={() => setFilter('active')}
            tone="moss"
          />
          <PipelineArrow />
          <PipelineStage
            label="Suspended"
            sub="Paused, follow-up needed"
            n={stageCounts.suspended}
            active={filter === 'suspended'}
            onClick={() => setFilter('suspended')}
            tone="orange"
          />
          <PipelineArrow />
          <PipelineStage
            label="Closed"
            sub="Completed or terminated"
            n={stageCounts.closed}
            active={filter === 'completed' || filter === 'archived'}
            onClick={() => setFilter('completed')}
            tone="gray"
          />
          {unassignedCount > 0 && (
            <button
              type="button"
              className="pipeline-pill"
              onClick={() => setFilter('all')}
              title="Cases without a primary monitor assigned"
            >
              <span className="pipeline-pill-dot" />
              {unassignedCount} unassigned
            </button>
          )}
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <div className="card-title">{isMonitor ? 'Assigned to me' : 'All Cases'}</div>
          <div className="btn-group" style={{ gap: 12, flexWrap: 'wrap' }}>
            <input
              className="form-input"
              style={{ width: 240, height: 36 }}
              placeholder="Search cases…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="segmented">
              {['all','intake','active','suspended','completed','archived'].map((f) => (
                <button key={f}
                  className={`segmented-item ${filter === f ? 'active' : ''}`}
                  onClick={() => setFilter(f)}>
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="card-body-flush">
          {loading ? (
            <div className="loading">Loading cases…</div>
          ) : filtered.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-title">No cases match</div>
              <div className="empty-state-desc">{isMonitor ? 'When your agency assigns you as primary monitor, those cases appear here.' : 'Try a different filter or start a new intake.'}</div>
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Case #</th>
                  <th>Court</th>
                  <th>Custodial</th>
                  <th>Noncustodial</th>
                  <th>Cadence</th>
                  <th>Monitor</th>
                  <th>Risk</th>
                  <th>Status</th>
                  <th>Opened</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id}>
                    <td className="cell-mono cell-strong">
                      <Link to={`/cases/${c.id}`} className="cell-link">{c.case_number || '—'}</Link>
                    </td>
                    <td className="cell-muted">{c.court_name || '—'}</td>
                    <td>{c.custodial ? `${c.custodial.first_name} ${c.custodial.last_name}` : '—'}</td>
                    <td>{c.noncustodial ? `${c.noncustodial.first_name} ${c.noncustodial.last_name}` : '—'}</td>
                    <td className="cell-muted">{c.visit_frequency || '—'}</td>
                    <td>{c.monitor ? `${c.monitor.first_name} ${c.monitor.last_name}` : <span className="cell-muted">Unassigned</span>}</td>
                    <td>{riskPill(c.risk_level)}</td>
                    <td>{statusBadge(c.status)}</td>
                    <td className="cell-muted">{fmtDate(c.created_at)}</td>
                    <td><Link to={`/cases/${c.id}`} className="btn btn-sm btn-secondary">Open →</Link></td>
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
