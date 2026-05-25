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

export default function Cases() {
  const { activeOrgId } = useAuth()
  const nav = useNavigate()
  const [loading, setLoading] = useState(true)
  const [cases, setCases] = useState([])
  const [filter, setFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [showCreate, setShowCreate] = useState(false)

  useEffect(() => { if (activeOrgId) load() }, [activeOrgId])

  async function load() {
    setLoading(true)
    try {
      const { data, error } = await supabase
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

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Cases</h1>
          <div className="page-subtitle">{cases.length} total · {filtered.length} shown</div>
        </div>
        <div className="btn-group">
          <Link to="/intake" className="btn btn-secondary">Full intake →</Link>
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>+ New case</button>
        </div>
      </div>

      {showCreate && (
        <CaseForm
          orgId={activeOrgId}
          onClose={() => setShowCreate(false)}
          onSaved={(c) => { setShowCreate(false); nav(`/cases/${c.id}`) }}
        />
      )}

      <div className="card">
        <div className="card-header">
          <div className="card-title">All Cases</div>
          <div className="btn-group" style={{ gap: 8, flexWrap: 'wrap' }}>
            <input
              className="form-input"
              style={{ width: 220 }}
              placeholder="Search…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {['all','intake','active','suspended','completed','archived'].map((f) => (
              <button key={f}
                className={`btn btn-sm ${filter === f ? 'btn-moss' : 'btn-secondary'}`}
                onClick={() => setFilter(f)}>
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <div className="card-body-flush">
          {loading ? (
            <div className="loading">Loading cases…</div>
          ) : filtered.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-title">No cases match</div>
              <div className="empty-state-desc">Try a different filter or start a new intake.</div>
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
                      <Link to={`/cases/${c.id}`} style={{ color: 'var(--forest)' }}>{c.case_number || '—'}</Link>
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
