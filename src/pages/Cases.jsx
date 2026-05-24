import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabase'
import { useAuth } from '../auth/AuthContext'

function fmtDate(s) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
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
    on_hold: 'badge-yellow'
  }
  const cls = map[status] || 'badge-gray'
  const label = status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  return <span className={`badge ${cls}`}>{label}</span>
}

export default function Cases() {
  const { activeOrgId } = useAuth()
  const [loading, setLoading] = useState(true)
  const [cases, setCases] = useState([])
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    if (activeOrgId) load()
  }, [activeOrgId])

  async function load() {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('sv_cases')
        .select(`
          id,
          case_number,
          court_name,
          referral_source,
          supervision_type,
          risk_level,
          status,
          created_at,
          custodial:custodial_party_id(first_name, last_name),
          noncustodial:noncustodial_party_id(first_name, last_name),
          monitor:assigned_monitor_id(first_name, last_name)
        `)
        .eq('org_id', activeOrgId)
        .order('created_at', { ascending: false })
      if (error) throw error
      setCases(data || [])
    } catch (err) {
      console.error('Cases load error:', err)
    } finally {
      setLoading(false)
    }
  }

  const filtered = filter === 'all' ? cases : cases.filter((c) => c.status === filter)

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Cases</h1>
          <div className="page-subtitle">{cases.length} total · {filtered.length} shown</div>
        </div>
        <Link to="/intake" className="btn btn-primary">+ New Intake</Link>
      </div>

      <div className="card">
        <div className="card-header">
          <div className="card-title">All Cases</div>
          <div className="btn-group">
            <button className={`btn btn-sm ${filter === 'all' ? 'btn-moss' : 'btn-secondary'}`} onClick={() => setFilter('all')}>All</button>
            <button className={`btn btn-sm ${filter === 'active' ? 'btn-moss' : 'btn-secondary'}`} onClick={() => setFilter('active')}>Active</button>
            <button className={`btn btn-sm ${filter === 'pending' ? 'btn-moss' : 'btn-secondary'}`} onClick={() => setFilter('pending')}>Pending</button>
            <button className={`btn btn-sm ${filter === 'closed' ? 'btn-moss' : 'btn-secondary'}`} onClick={() => setFilter('closed')}>Closed</button>
          </div>
        </div>
        <div className="card-body-flush">
          {loading ? (
            <div className="loading">Loading cases…</div>
          ) : filtered.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-title">No cases match this filter</div>
              <div className="empty-state-desc">Try a different filter or create a new intake.</div>
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Case #</th>
                  <th>Court</th>
                  <th>Custodial</th>
                  <th>Noncustodial</th>
                  <th>Supervision</th>
                  <th>Monitor</th>
                  <th>Risk</th>
                  <th>Status</th>
                  <th>Opened</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id}>
                    <td className="cell-mono cell-strong">{c.case_number || '—'}</td>
                    <td className="cell-muted">{c.court_name || '—'}</td>
                    <td>{c.custodial ? `${c.custodial.first_name} ${c.custodial.last_name}` : '—'}</td>
                    <td>{c.noncustodial ? `${c.noncustodial.first_name} ${c.noncustodial.last_name}` : '—'}</td>
                    <td className="cell-muted">{c.supervision_type ? c.supervision_type.replace(/_/g, ' ') : '—'}</td>
                    <td>{c.monitor ? `${c.monitor.first_name} ${c.monitor.last_name}` : <span className="cell-muted">Unassigned</span>}</td>
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
