import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import { useAuth } from '../auth/AuthContext'

/* ============================================================
   Reports — full CRUD for agency owner / manager
   ------------------------------------------------------------
   - Filters: status, monitor, case, date range, search
   - Sort: newest, oldest, by case, by monitor
   - Bulk select → archive, delete, export PDF
   - Row click → /visits/:id/report
   - Confirmation modal on destructive actions
   ============================================================ */

const TABS = [
  { key: 'pending_review',    label: 'Pending review',    statuses: ['pending_review'] },
  { key: 'changes_requested', label: 'Changes requested', statuses: ['changes_requested'] },
  { key: 'approved',          label: 'Approved',          statuses: ['approved'] },
  { key: 'draft',             label: 'Drafts',            statuses: ['draft'] },
  { key: 'all',               label: 'All',               statuses: null },
  { key: 'archived',          label: 'Archived',          statuses: null, archived: true },
]

const SORT_OPTIONS = [
  { key: 'newest',  label: 'Newest first',  column: 'updated_at', asc: false },
  { key: 'oldest',  label: 'Oldest first',  column: 'updated_at', asc: true },
  { key: 'submitted', label: 'By submitted', column: 'submitted_at', asc: false },
  { key: 'approved',  label: 'By approved',  column: 'approved_at',  asc: false },
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
  if (d < 30) return `${d}d ago`
  return fmtDate(ts)
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
  const { activeOrgId, user } = useAuth()
  const nav = useNavigate()
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('pending_review')
  const [rows, setRows] = useState([])
  const [counts, setCounts] = useState({})
  const [monitors, setMonitors] = useState([])
  const [cases, setCases] = useState([])

  // Filters
  const [search, setSearch] = useState('')
  const [filterMonitor, setFilterMonitor] = useState('')
  const [filterCase, setFilterCase] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [sort, setSort] = useState('newest')
  const [showFilters, setShowFilters] = useState(false)

  const [selected, setSelected] = useState(() => new Set())
  const [confirm, setConfirm] = useState(null) // { kind, ids, label }
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState(null)

  function showToast(msg, kind = 'success') {
    setToast({ msg, kind })
    setTimeout(() => setToast(null), 2800)
  }

  useEffect(() => { if (activeOrgId) loadAux() }, [activeOrgId])
  useEffect(() => { if (activeOrgId) load() }, [activeOrgId, tab, sort, filterMonitor, filterCase, dateFrom, dateTo])

  async function loadAux() {
    const [mRes, cRes] = await Promise.all([
      supabase.from('sv_monitors').select('id, first_name, last_name').eq('org_id', activeOrgId).order('first_name'),
      supabase.from('sv_cases').select('id, case_number').eq('org_id', activeOrgId).order('created_at', { ascending: false }).limit(200),
    ])
    setMonitors(mRes.data || [])
    setCases(cRes.data || [])
  }

  async function load() {
    setLoading(true)
    setSelected(new Set())
    try {
      const tabDef = TABS.find((t) => t.key === tab)
      const sortDef = SORT_OPTIONS.find((s) => s.key === sort) || SORT_OPTIONS[0]
      let q = supabase.from('sv_reports').select(`
        id, status, submitted_at, approved_at, changes_requested_at, updated_at, created_at,
        archived_at, deleted_at, reviewer_notes, owner_edited_at,
        visit:visit_id(id, scheduled_date, scheduled_start_time, actual_duration_minutes),
        case:case_id(id, case_number, court_name),
        monitor:monitor_id(id, first_name, last_name)
      `).eq('org_id', activeOrgId)

      // Always hide deleted from normal views (only an admin recovery flow would see them)
      q = q.is('deleted_at', null)

      if (tabDef?.archived) {
        q = q.not('archived_at', 'is', null)
      } else {
        q = q.is('archived_at', null)
      }
      if (tabDef?.statuses) {
        q = q.in('status', tabDef.statuses)
      }
      if (filterMonitor) q = q.eq('monitor_id', filterMonitor)
      if (filterCase) q = q.eq('case_id', filterCase)
      if (dateFrom) q = q.gte('updated_at', dateFrom)
      if (dateTo) q = q.lte('updated_at', new Date(new Date(dateTo).getTime() + 86400000).toISOString().slice(0,10))

      q = q.order(sortDef.column, { ascending: sortDef.asc, nullsFirst: false })
      const { data, error } = await q
      if (error) throw error
      setRows(data || [])

      // Counts (active only, not archived/deleted)
      const { data: all } = await supabase.from('sv_reports')
        .select('status, archived_at, deleted_at').eq('org_id', activeOrgId)
      const cs = { archived: 0 }
      ;(all || []).forEach((r) => {
        if (r.deleted_at) return
        if (r.archived_at) { cs.archived = (cs.archived || 0) + 1; return }
        cs[r.status] = (cs[r.status] || 0) + 1
      })
      setCounts(cs)
    } catch (e) {
      console.error('Reports load', e); showToast(e.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  /* ----- Filtering (client-side text search) ----- */
  const filteredRows = useMemo(() => {
    if (!search.trim()) return rows
    const s = search.toLowerCase()
    return rows.filter((r) => {
      const blob = [
        r.case?.case_number,
        r.case?.court_name,
        r.monitor?.first_name, r.monitor?.last_name,
        r.reviewer_notes,
      ].filter(Boolean).join(' ').toLowerCase()
      return blob.includes(s)
    })
  }, [rows, search])

  function toggleSelect(id) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }
  function toggleSelectAll() {
    if (selected.size === filteredRows.length) setSelected(new Set())
    else setSelected(new Set(filteredRows.map((r) => r.id)))
  }
  const allSelected = filteredRows.length > 0 && selected.size === filteredRows.length

  /* ----- Bulk actions ----- */
  async function bulkArchive(ids) {
    setBusy(true)
    try {
      const { error } = await supabase.from('sv_reports').update({
        archived_at: new Date().toISOString(),
        archived_by: user?.id,
      }).in('id', ids)
      if (error) throw error
      showToast(`${ids.length} report${ids.length === 1 ? '' : 's'} archived`)
      await load()
    } catch (e) { showToast(e.message, 'error') }
    finally { setBusy(false); setConfirm(null) }
  }
  async function bulkUnarchive(ids) {
    setBusy(true)
    try {
      const { error } = await supabase.from('sv_reports').update({
        archived_at: null, archived_by: null,
      }).in('id', ids)
      if (error) throw error
      showToast(`${ids.length} report${ids.length === 1 ? '' : 's'} restored`)
      await load()
    } catch (e) { showToast(e.message, 'error') }
    finally { setBusy(false); setConfirm(null) }
  }
  async function bulkDelete(ids) {
    setBusy(true)
    try {
      const { error } = await supabase.from('sv_reports').update({
        deleted_at: new Date().toISOString(),
        deleted_by: user?.id,
      }).in('id', ids)
      if (error) throw error
      showToast(`${ids.length} report${ids.length === 1 ? '' : 's'} deleted`)
      await load()
    } catch (e) { showToast(e.message, 'error') }
    finally { setBusy(false); setConfirm(null) }
  }

  function exportSelected(ids) {
    // Open each approved report in a new tab; the report preview has Print/PDF.
    const reportsToExport = filteredRows.filter((r) => ids.includes(r.id) && r.visit?.id)
    if (reportsToExport.length === 0) { showToast('No exportable reports', 'error'); return }
    reportsToExport.forEach((r, i) => {
      setTimeout(() => window.open(`/visits/${r.visit.id}/report?print=1`, '_blank'), i * 200)
    })
  }

  const isArchivedTab = tab === 'archived'
  const hasFilters = filterMonitor || filterCase || dateFrom || dateTo || search

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Reports</h1>
          <div className="page-subtitle">Review, approve, archive and export visit reports</div>
        </div>
        <div className="btn-group">
          <button
            className={`btn btn-secondary ${showFilters ? 'btn-active' : ''}`}
            onClick={() => setShowFilters((s) => !s)}
          >
            Filters{hasFilters ? ` (${[filterMonitor, filterCase, dateFrom, dateTo, search].filter(Boolean).length})` : ''}
          </button>
          <select
            className="select-inline"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            aria-label="Sort reports"
          >
            {SORT_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        </div>
      </div>

      <div className="rq-tabs">
        {TABS.map((t) => {
          const n = t.key === 'archived' ? counts.archived
            : t.key === 'all' ? null
            : t.statuses ? (counts[t.statuses[0]] || 0) : 0
          return (
            <button
              key={t.key}
              type="button"
              className={`rq-tab ${tab === t.key ? 'active' : ''}`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
              {n != null && n > 0 && <span className="rq-tab-count">{n}</span>}
            </button>
          )
        })}
      </div>

      {showFilters && (
        <div className="filters-panel">
          <div className="filter-grid">
            <div>
              <label className="kv-label">Search</label>
              <input
                className="form-input"
                type="search"
                placeholder="Case #, monitor, notes…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div>
              <label className="kv-label">Monitor</label>
              <select className="form-input" value={filterMonitor} onChange={(e) => setFilterMonitor(e.target.value)}>
                <option value="">All monitors</option>
                {monitors.map((m) => (
                  <option key={m.id} value={m.id}>{m.first_name} {m.last_name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="kv-label">Case</label>
              <select className="form-input" value={filterCase} onChange={(e) => setFilterCase(e.target.value)}>
                <option value="">All cases</option>
                {cases.map((c) => <option key={c.id} value={c.id}>{c.case_number}</option>)}
              </select>
            </div>
            <div>
              <label className="kv-label">Updated after</label>
              <input className="form-input" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>
            <div>
              <label className="kv-label">Updated before</label>
              <input className="form-input" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
            <div className="filter-clear">
              {hasFilters && (
                <button className="btn btn-secondary btn-sm" onClick={() => {
                  setSearch(''); setFilterMonitor(''); setFilterCase(''); setDateFrom(''); setDateTo('')
                }}>Clear filters</button>
              )}
            </div>
          </div>
        </div>
      )}

      {selected.size > 0 && (
        <div className="bulk-bar">
          <div className="bulk-bar-info">
            <span className="bulk-bar-count">{selected.size}</span>
            <span>selected</span>
            <button className="bulk-bar-clear" onClick={() => setSelected(new Set())}>Clear</button>
          </div>
          <div className="btn-group">
            <button className="btn btn-sm btn-secondary" onClick={() => exportSelected([...selected])}>
              Export PDF
            </button>
            {isArchivedTab ? (
              <button className="btn btn-sm btn-secondary" onClick={() => setConfirm({ kind: 'unarchive', ids: [...selected] })}>
                Restore
              </button>
            ) : (
              <button className="btn btn-sm btn-secondary" onClick={() => setConfirm({ kind: 'archive', ids: [...selected] })}>
                Archive
              </button>
            )}
            <button className="btn btn-sm btn-danger" onClick={() => setConfirm({ kind: 'delete', ids: [...selected] })}>
              Delete
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <ReportListSkeleton />
      ) : filteredRows.length === 0 ? (
        <EmptyReports tab={tab} hasFilters={hasFilters} onClearFilters={() => {
          setSearch(''); setFilterMonitor(''); setFilterCase(''); setDateFrom(''); setDateTo('')
        }} />
      ) : (
        <div className="rq-list">
          <div className="rq-list-head">
            <label className="rq-checkbox">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleSelectAll}
                aria-label="Select all"
              />
              <span>{filteredRows.length} {filteredRows.length === 1 ? 'report' : 'reports'}</span>
            </label>
          </div>
          {filteredRows.map((r) => (
            <ReportRow
              key={r.id}
              row={r}
              selected={selected.has(r.id)}
              onToggle={() => toggleSelect(r.id)}
              onOpen={() => r.visit?.id && nav(`/visits/${r.visit.id}/report`)}
              onArchive={() => setConfirm({ kind: 'archive', ids: [r.id], label: r.case?.case_number })}
              onUnarchive={() => setConfirm({ kind: 'unarchive', ids: [r.id], label: r.case?.case_number })}
              onDelete={() => setConfirm({ kind: 'delete', ids: [r.id], label: r.case?.case_number })}
              isArchivedTab={isArchivedTab}
            />
          ))}
        </div>
      )}

      {confirm && (
        <ConfirmModal
          kind={confirm.kind}
          count={confirm.ids.length}
          label={confirm.label}
          busy={busy}
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            if (confirm.kind === 'archive') bulkArchive(confirm.ids)
            else if (confirm.kind === 'unarchive') bulkUnarchive(confirm.ids)
            else if (confirm.kind === 'delete') bulkDelete(confirm.ids)
          }}
        />
      )}

      {toast && <div className={`toast ${toast.kind === 'error' ? 'error' : ''}`}>{toast.msg}</div>}
    </div>
  )
}

/* ============================================================ */

function ReportRow({ row: r, selected, onToggle, onOpen, onArchive, onUnarchive, onDelete, isArchivedTab }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)
  useEffect(() => {
    function onDoc(e) { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false) }
    if (menuOpen) document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [menuOpen])

  return (
    <div className={`rq-row ${selected ? 'selected' : ''}`}>
      <label className="rq-row-check" onClick={(e) => e.stopPropagation()}>
        <input type="checkbox" checked={selected} onChange={onToggle} aria-label="Select report" />
      </label>
      <div className="rq-row-main" onClick={onOpen} role="button" tabIndex={0}
           onKeyDown={(e) => { if (e.key === 'Enter') onOpen() }}>
        <div className="rq-row-title">
          {r.case?.case_number || 'Unknown case'}
          <StatusBadge status={r.status} />
          {r.owner_edited_at && <span className="rb-status-badge tone-blue" title="Edited by owner">Edited</span>}
        </div>
        <div className="rq-row-sub">
          Visit {fmtDate(r.visit?.scheduled_date)}
          {r.monitor ? ` · ${r.monitor.first_name} ${r.monitor.last_name}` : ''}
          {r.visit?.actual_duration_minutes ? ` · ${r.visit.actual_duration_minutes} min` : ''}
        </div>
        {r.status === 'changes_requested' && r.reviewer_notes && (
          <div className="rq-row-note">↩ {r.reviewer_notes.slice(0, 140)}{r.reviewer_notes.length > 140 ? '…' : ''}</div>
        )}
      </div>
      <div className="rq-row-meta">
        <div className="rq-row-time">
          {r.status === 'pending_review' && r.submitted_at && `Submitted ${fmtRelative(r.submitted_at)}`}
          {r.status === 'approved' && r.approved_at && `Approved ${fmtRelative(r.approved_at)}`}
          {r.status === 'changes_requested' && r.changes_requested_at && `Returned ${fmtRelative(r.changes_requested_at)}`}
          {r.status === 'draft' && `Drafted ${fmtRelative(r.updated_at)}`}
          {r.archived_at && <> · <span className="cell-muted">Archived {fmtRelative(r.archived_at)}</span></>}
        </div>
        <div className="rq-row-actions" ref={menuRef}>
          <button
            className="icon-btn"
            onClick={(e) => { e.stopPropagation(); setMenuOpen((s) => !s) }}
            aria-label="More actions"
            title="More actions"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="5" r="1.2" /><circle cx="12" cy="12" r="1.2" /><circle cx="12" cy="19" r="1.2" />
            </svg>
          </button>
          {menuOpen && (
            <div className="row-menu" role="menu">
              <button className="row-menu-item" onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onOpen() }}>
                Open report
              </button>
              {r.visit?.id && (
                <Link to={`/visits/${r.visit.id}`} className="row-menu-item" onClick={() => setMenuOpen(false)}>
                  View visit
                </Link>
              )}
              {r.case?.id && (
                <Link to={`/cases/${r.case.id}`} className="row-menu-item" onClick={() => setMenuOpen(false)}>
                  View case
                </Link>
              )}
              <div className="row-menu-sep" />
              {isArchivedTab ? (
                <button className="row-menu-item" onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onUnarchive() }}>
                  Restore
                </button>
              ) : (
                <button className="row-menu-item" onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onArchive() }}>
                  Archive
                </button>
              )}
              <button className="row-menu-item danger" onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onDelete() }}>
                Delete
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ConfirmModal({ kind, count, label, busy, onCancel, onConfirm }) {
  const meta = {
    archive: {
      title: count > 1 ? `Archive ${count} reports?` : `Archive this report?`,
      body: 'Archived reports are hidden from the main list but can be restored later.',
      confirmLabel: 'Archive',
      confirmClass: 'btn-primary',
    },
    unarchive: {
      title: count > 1 ? `Restore ${count} reports?` : `Restore this report?`,
      body: 'Restored reports will return to their previous status.',
      confirmLabel: 'Restore',
      confirmClass: 'btn-primary',
    },
    delete: {
      title: count > 1 ? `Delete ${count} reports?` : `Delete this report?`,
      body: 'This cannot be undone. Deleted reports are removed from all views.',
      confirmLabel: 'Delete',
      confirmClass: 'btn-danger',
    },
  }[kind]

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="modal-title">{meta.title}</div>
        <div className="modal-body">
          {label && <div className="modal-target">{label}</div>}
          {meta.body}
        </div>
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onCancel} disabled={busy}>Cancel</button>
          <button className={`btn ${meta.confirmClass}`} onClick={onConfirm} disabled={busy}>
            {busy ? 'Working…' : meta.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

function ReportListSkeleton() {
  return (
    <div className="rq-list">
      {[1,2,3,4].map((i) => (
        <div key={i} className="rq-row skeleton">
          <div className="sk-line w40" />
          <div className="sk-line w60" />
        </div>
      ))}
    </div>
  )
}

function EmptyReports({ tab, hasFilters, onClearFilters }) {
  if (hasFilters) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" />
          </svg>
        </div>
        <div className="empty-state-title">No reports match your filters</div>
        <div className="empty-state-desc">Try adjusting or clearing your filters.</div>
        <button className="btn btn-secondary" style={{ marginTop: 12 }} onClick={onClearFilters}>
          Clear filters
        </button>
      </div>
    )
  }
  const labels = {
    pending_review:    'No reports waiting for review',
    changes_requested: 'No reports with requested changes',
    approved:          'No approved reports yet',
    draft:             'No drafts',
    all:               'No reports yet',
    archived:          'Nothing archived',
  }
  const descs = {
    pending_review: 'When monitors submit reports, they will appear here.',
    changes_requested: 'Reports you ask monitors to revise will show up here.',
    approved: 'Approved reports show up here and can be exported as PDF.',
    draft: 'In-progress reports show up here.',
    all: 'Reports are generated after visits are completed.',
    archived: 'Archived reports stay out of your main view but remain recoverable.',
  }
  return (
    <div className="empty-state">
      <div className="empty-state-icon">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 4h11l3 3v13a1 1 0 01-1 1H5a1 1 0 01-1-1V5a1 1 0 011-1z" />
          <path d="M9 10h6M9 14h6" />
        </svg>
      </div>
      <div className="empty-state-title">{labels[tab] || 'No reports'}</div>
      <div className="empty-state-desc">{descs[tab] || ''}</div>
    </div>
  )
}
