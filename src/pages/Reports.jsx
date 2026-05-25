import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabase'
import { useAuth } from '../auth/AuthContext'

/* ============================================================
   Reports queue (agency owner / manager view)
   ------------------------------------------------------------
   - Tabs: Pending review | Changes requested | Approved | All
   - One row per report; click → /visits/:id/report
   ============================================================ */

const TABS = [
  { key: 'pending_review',    label: 'Pending review' },
  { key: 'changes_requested', label: 'Changes requested' },
  { key: 'approved',          label: 'Approved' },
  { key: 'all',               label: 'All' },
]

function fmtDate(s) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
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

function StatusBadge({ status }) {
  const map = {
    draft:             { tone: 'gray',   label: 'Draft' },
    pending_review:    { tone: 'yellow', label: 'Pending review' },
    changes_requested: { tone: 'orange', label: 'Changes requested' },
    approved:          { tone: 'moss',   label: 'Approved' },
    rejected:          { tone: 'red',    label: 'Rejected' },
    submitted:         { tone: 'yellow', label: 'Submitted' },
    reviewed:          { tone: 'moss',   label: 'Reviewed' },
    filed:             { tone: 'moss',   label: 'Filed' },
    distributed:       { tone: 'moss',   label: 'Distributed' },
  }
  const m = map[status] || map.draft
  return <span className={`rb-status-badge tone-${m.tone}`}>{m.label}</span>
}

export default function Reports() {
  const { activeOrgId } = useAuth()
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('pending_review')
  const [rows, setRows] = useState([])
  const [counts, setCounts] = useState({})

  useEffect(() => { if (activeOrgId) load() }, [activeOrgId, tab])

  async function load() {
    setLoading(true)
    try {
      let q = supabase.from('sv_reports').select(`
        id, status, submitted_at, approved_at, changes_requested_at, updated_at, created_at, reviewer_notes,
        visit:visit_id(id, scheduled_date, scheduled_start_time, actual_duration_minutes),
        case:case_id(case_number, court_name),
        monitor:monitor_id(first_name, last_name)
      `).eq('org_id', activeOrgId).order('updated_at', { ascending: false })
      if (tab !== 'all') q = q.eq('status', tab)
      const { data, error } = await q
      if (error) throw error
      setRows(data || [])
      // Count by status
      const { data: all } = await supabase.from('sv_reports').select('status').eq('org_id', activeOrgId)
      const cs = {}
      ;(all || []).forEach((r) => { cs[r.status] = (cs[r.status] || 0) + 1 })
      setCounts(cs)
    } catch (e) {
      console.error('Reports load', e)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Reports</h1>
          <div className="page-subtitle">Review and approve visit reports submitted by monitors</div>
        </div>
      </div>

      <div className="rq-tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`rq-tab ${tab === t.key ? 'active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
            {t.key !== 'all' && counts[t.key] > 0 && (
              <span className="rq-tab-count">{counts[t.key]}</span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="loading">Loading reports…</div>
      ) : rows.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-title">No {tab === 'all' ? '' : tab.replace('_', ' ')} reports</div>
          <div className="empty-state-desc">
            {tab === 'pending_review'
              ? 'When monitors submit reports, they will appear here for review.'
              : 'Nothing here right now.'}
          </div>
        </div>
      ) : (
        <div className="rq-list">
          {rows.map((r) => (
            <Link
              key={r.id}
              to={`/visits/${r.visit?.id}/report`}
              className="rq-row"
            >
              <div className="rq-row-main">
                <div className="rq-row-title">
                  {r.case?.case_number || 'Unknown case'}
                  <StatusBadge status={r.status} />
                </div>
                <div className="rq-row-sub">
                  Visit {fmtDate(r.visit?.scheduled_date)}
                  {r.monitor ? ` · Monitor: ${r.monitor.first_name} ${r.monitor.last_name}` : ''}
                  {r.visit?.actual_duration_minutes ? ` · ${r.visit.actual_duration_minutes} min` : ''}
                </div>
                {r.status === 'changes_requested' && r.reviewer_notes && (
                  <div className="rq-row-note">↩ {r.reviewer_notes.slice(0, 120)}{r.reviewer_notes.length > 120 ? '…' : ''}</div>
                )}
              </div>
              <div className="rq-row-meta">
                <div className="rq-row-time">
                  {r.status === 'pending_review' && r.submitted_at && `Submitted ${fmtRelative(r.submitted_at)}`}
                  {r.status === 'approved' && r.approved_at && `Approved ${fmtRelative(r.approved_at)}`}
                  {r.status === 'changes_requested' && r.changes_requested_at && `Returned ${fmtRelative(r.changes_requested_at)}`}
                  {r.status === 'draft' && `Drafted ${fmtRelative(r.updated_at)}`}
                </div>
                <div className="rq-row-chev">›</div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
