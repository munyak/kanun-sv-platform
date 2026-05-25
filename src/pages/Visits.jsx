import React, { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import { useAuth } from '../auth/AuthContext'
import VisitForm from '../components/VisitForm'

function statusBadge(status) {
  if (!status) return <span className="badge badge-gray">—</span>
  const map = {
    scheduled: 'badge-blue',
    confirmed: 'badge-blue',
    in_progress: 'badge-yellow',
    completed: 'badge-green',
    canceled_custodial: 'badge-red',
    canceled_noncustodial: 'badge-red',
    canceled_provider: 'badge-red',
    no_show_custodial: 'badge-red',
    no_show_noncustodial: 'badge-red',
    interrupted: 'badge-red',
    terminated: 'badge-red',
  }
  const cls = map[status] || 'badge-gray'
  return <span className={`badge ${cls}`}>{status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</span>
}

function fmtTime(time) {
  if (!time) return ''
  const [h, m] = time.split(':')
  const d = new Date(); d.setHours(Number(h), Number(m), 0, 0)
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function fmtDateLong(date) {
  const d = new Date(date + 'T00:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function startOfWeek(d) {
  const x = new Date(d); x.setHours(0,0,0,0)
  const day = x.getDay()
  x.setDate(x.getDate() - day) // Sunday start
  return x
}

function addDays(d, n) {
  const x = new Date(d); x.setDate(x.getDate() + n); return x
}

function dateKey(d) {
  return d.toISOString().slice(0, 10)
}

export default function Visits() {
  const { activeOrgId } = useAuth()
  const nav = useNavigate()
  const [view, setView] = useState('week') // week | list
  const [loading, setLoading] = useState(true)
  const [visits, setVisits] = useState([])
  const [anchor, setAnchor] = useState(() => startOfWeek(new Date()))
  const [showForm, setShowForm] = useState(false)
  const [editVisit, setEditVisit] = useState(null)
  const [toast, setToast] = useState(null)

  useEffect(() => { if (activeOrgId) load() }, [activeOrgId, anchor])

  function showToast(message, kind = 'success') {
    setToast({ message, kind }); setTimeout(() => setToast(null), 3000)
  }

  async function load() {
    setLoading(true)
    try {
      const rangeStart = view === 'week' ? dateKey(anchor) : new Date().toISOString().slice(0, 10)
      const rangeEnd = view === 'week' ? dateKey(addDays(anchor, 7)) : dateKey(addDays(new Date(), 90))
      const { data, error } = await supabase
        .from('sv_visits')
        .select(`id, scheduled_date, scheduled_start_time, scheduled_end_time, status, location,
                 case:case_id(id, case_number),
                 monitor:monitor_id(id, first_name, last_name)`)
        .eq('org_id', activeOrgId)
        .gte('scheduled_date', rangeStart)
        .lte('scheduled_date', rangeEnd)
        .order('scheduled_date', { ascending: true })
        .order('scheduled_start_time', { ascending: true })
      if (error) throw error
      setVisits(data || [])
    } catch (err) {
      console.error('Visits load:', err); showToast(err.message, 'error')
    } finally { setLoading(false) }
  }

  function handleSaved() {
    setShowForm(false); setEditVisit(null); load()
    showToast('Visit saved')
  }

  const visitsByDay = useMemo(() => {
    const map = {}
    visits.forEach((v) => {
      ;(map[v.scheduled_date] = map[v.scheduled_date] || []).push(v)
    })
    return map
  }, [visits])

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(anchor, i))

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Schedule</h1>
          <div className="page-subtitle">
            {view === 'week'
              ? `Week of ${fmtDateLong(dateKey(anchor))}`
              : `Next 90 days · ${visits.length} visit${visits.length === 1 ? '' : 's'}`}
          </div>
        </div>
        <div className="btn-group">
          <div className="segmented">
            <button
              className={`segmented-item ${view === 'week' ? 'active' : ''}`}
              onClick={() => setView('week')}
            >Week</button>
            <button
              className={`segmented-item ${view === 'list' ? 'active' : ''}`}
              onClick={() => setView('list')}
            >List</button>
          </div>
          <button className="btn btn-primary" onClick={() => { setEditVisit(null); setShowForm(true) }}>Schedule visit</button>
        </div>
      </div>

      {view === 'week' && (
        <div className="card">
          <div className="card-header">
            <div className="btn-group">
              <button className="btn btn-sm btn-secondary" onClick={() => setAnchor(addDays(anchor, -7))}>← Prev</button>
              <button className="btn btn-sm btn-secondary" onClick={() => setAnchor(startOfWeek(new Date()))}>This week</button>
              <button className="btn btn-sm btn-secondary" onClick={() => setAnchor(addDays(anchor, 7))}>Next →</button>
            </div>
            <div className="cell-muted">{visits.length} visit{visits.length === 1 ? '' : 's'}</div>
          </div>
          <div className="calendar-week">
            {weekDays.map((d) => {
              const key = dateKey(d)
              const dayVisits = visitsByDay[key] || []
              const today = key === new Date().toISOString().slice(0, 10)
              return (
                <div key={key} className={`calendar-day ${today ? 'today' : ''}`}>
                  <div className="calendar-day-head">
                    <span className="calendar-day-dow">{d.toLocaleDateString('en-US', { weekday: 'short' })}</span>
                    <span className="calendar-day-num">{d.getDate()}</span>
                  </div>
                  <div className="calendar-day-body">
                    {dayVisits.length === 0 && <div className="calendar-empty">—</div>}
                    {dayVisits.map((v) => (
                      <button
                        key={v.id}
                        className={`calendar-visit calendar-visit-${(v.status || 'scheduled').split('_')[0]}`}
                        onClick={() => nav(`/visits/${v.id}`)}
                      >
                        <div className="calendar-visit-time">{fmtTime(v.scheduled_start_time)}</div>
                        <div className="calendar-visit-case">{v.case?.case_number || 'Case'}</div>
                        <div className="calendar-visit-monitor">
                          {v.monitor ? `${v.monitor.first_name} ${v.monitor.last_name}` : 'Unassigned'}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {view === 'list' && (
        <div className="card">
          <div className="card-header"><div className="card-title">Upcoming visits</div></div>
          <div className="card-body-flush">
            {loading ? <div className="loading">Loading…</div>
              : visits.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-state-title">No visits scheduled</div>
                  <div className="empty-state-desc">Click "Schedule visit" to add one.</div>
                </div>
              ) : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Time</th>
                      <th>Case</th>
                      <th>Monitor</th>
                      <th>Location</th>
                      <th>Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {visits.map((v) => (
                      <tr key={v.id}>
                        <td className="cell-strong">{fmtDateLong(v.scheduled_date)}</td>
                        <td>{fmtTime(v.scheduled_start_time)} – {fmtTime(v.scheduled_end_time)}</td>
                        <td className="cell-mono">{v.case?.case_number || '—'}</td>
                        <td>{v.monitor ? `${v.monitor.first_name} ${v.monitor.last_name}` : <span className="cell-muted">Unassigned</span>}</td>
                        <td>{v.location || <span className="cell-muted">—</span>}</td>
                        <td>{statusBadge(v.status)}</td>
                        <td className="btn-group">
                          <Link to={`/visits/${v.id}`} className="btn btn-sm btn-secondary">Open</Link>
                          <button className="btn btn-sm btn-ghost" onClick={() => { setEditVisit(v); setShowForm(true) }}>Edit</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
          </div>
        </div>
      )}

      {showForm && (
        <VisitForm
          orgId={activeOrgId}
          visit={editVisit}
          onClose={() => { setShowForm(false); setEditVisit(null) }}
          onSaved={handleSaved}
        />
      )}

      {toast && <div className={`toast ${toast.kind === 'error' ? 'error' : ''}`}>{toast.message}</div>}
    </div>
  )
}
