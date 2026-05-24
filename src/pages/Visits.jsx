import React, { useEffect, useState } from 'react'
import { supabase } from '../supabase'

function fmtDateTime(s) {
  if (!s) return '—'
  return new Date(s).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}

function statusBadge(status) {
  if (!status) return <span className="badge badge-gray">—</span>
  const map = {
    scheduled: 'badge-blue',
    in_progress: 'badge-yellow',
    completed: 'badge-green',
    cancelled: 'badge-red',
    no_show: 'badge-red',
    terminated: 'badge-red'
  }
  const cls = map[status] || 'badge-gray'
  const label = status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  return <span className={`badge ${cls}`}>{label}</span>
}

export default function Visits() {
  const [loading, setLoading] = useState(true)
  const [visits, setVisits] = useState([])
  const [filter, setFilter] = useState('upcoming')

  useEffect(() => {
    load()
  }, [filter])

  async function load() {
    setLoading(true)
    try {
      let q = supabase
        .from('sv_visits')
        .select(`
          id,
          scheduled_at,
          duration_minutes,
          location,
          status,
          notes,
          case:case_id(case_number),
          monitor:monitor_id(first_name, last_name)
        `)

      const now = new Date().toISOString()
      if (filter === 'upcoming') q = q.gte('scheduled_at', now).order('scheduled_at', { ascending: true })
      else if (filter === 'past') q = q.lt('scheduled_at', now).order('scheduled_at', { ascending: false })
      else q = q.order('scheduled_at', { ascending: false })

      const { data, error } = await q
      if (error) throw error
      setVisits(data || [])
    } catch (err) {
      console.error('Visits load error:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Visits</h1>
          <div className="page-subtitle">{visits.length} {filter} visit{visits.length === 1 ? '' : 's'}</div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div className="card-title">All Visits</div>
          <div className="btn-group">
            <button className={`btn btn-sm ${filter === 'upcoming' ? 'btn-moss' : 'btn-secondary'}`} onClick={() => setFilter('upcoming')}>Upcoming</button>
            <button className={`btn btn-sm ${filter === 'past' ? 'btn-moss' : 'btn-secondary'}`} onClick={() => setFilter('past')}>Past</button>
            <button className={`btn btn-sm ${filter === 'all' ? 'btn-moss' : 'btn-secondary'}`} onClick={() => setFilter('all')}>All</button>
          </div>
        </div>
        <div className="card-body-flush">
          {loading ? (
            <div className="loading">Loading visits…</div>
          ) : visits.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-title">No visits to show</div>
              <div className="empty-state-desc">Visits are scheduled from the case detail page.</div>
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Duration</th>
                  <th>Case #</th>
                  <th>Monitor</th>
                  <th>Location</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {visits.map((v) => (
                  <tr key={v.id}>
                    <td className="cell-strong">{fmtDateTime(v.scheduled_at)}</td>
                    <td className="cell-muted">{v.duration_minutes ? `${v.duration_minutes} min` : '—'}</td>
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
