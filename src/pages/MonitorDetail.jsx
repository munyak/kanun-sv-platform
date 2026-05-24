import React, { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../supabase'
import { useAuth } from '../auth/AuthContext'

function fmtDate(s) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function statusBadge(s) {
  const map = { active: 'badge-green', inactive: 'badge-gray', pending_verification: 'badge-yellow', suspended: 'badge-red' }
  const cls = map[s] || 'badge-gray'
  return <span className={`badge ${cls}`}>{(s || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</span>
}

function yesNo(b) {
  if (b === true) return <span className="badge badge-green">Yes</span>
  if (b === false) return <span className="badge badge-red">No</span>
  return <span className="badge badge-gray">—</span>
}

export default function MonitorDetail() {
  const { id } = useParams()
  const { activeOrgId } = useAuth()
  const [m, setM] = useState(null)
  const [cases, setCases] = useState([])
  const [visits, setVisits] = useState([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState(null)

  useEffect(() => { if (activeOrgId) load() }, [activeOrgId, id])

  async function load() {
    setLoading(true)
    try {
      const [mRes, cRes, vRes] = await Promise.all([
        supabase.from('sv_monitors').select('*').eq('id', id).eq('org_id', activeOrgId).maybeSingle(),
        supabase.from('sv_cases').select('id, case_number, status, risk_level').eq('org_id', activeOrgId).eq('primary_monitor_id', id),
        supabase.from('sv_visits').select('id, scheduled_date, scheduled_start_time, status, location, case:case_id(case_number)')
          .eq('org_id', activeOrgId).eq('monitor_id', id)
          .order('scheduled_date', { ascending: false })
          .limit(20),
      ])
      setM(mRes.data); setCases(cRes.data || []); setVisits(vRes.data || [])
    } catch (e) {
      console.error(e); setToast({ message: e.message, kind: 'error' })
    } finally { setLoading(false) }
  }

  async function update(patch) {
    const { error } = await supabase.from('sv_monitors').update(patch).eq('id', id)
    if (error) setToast({ message: error.message, kind: 'error' })
    else { setToast({ message: 'Saved' }); load() }
    setTimeout(() => setToast(null), 2500)
  }

  if (loading) return <div className="loading">Loading monitor…</div>
  if (!m) return (
    <div className="empty-state" style={{ marginTop: 64 }}>
      <div className="empty-state-title">Monitor not found</div>
      <Link to="/monitors" className="btn btn-secondary" style={{ marginTop: 16 }}>Back to monitors</Link>
    </div>
  )

  return (
    <div>
      <div className="page-header">
        <div>
          <Link to="/monitors" className="page-subtitle" style={{ display: 'inline-block', marginBottom: 6 }}>← Monitors</Link>
          <h1 className="page-title">{m.first_name} {m.last_name}</h1>
          <div className="page-subtitle">{m.email} {m.phone ? `· ${m.phone}` : ''}</div>
        </div>
        <div>{statusBadge(m.status)}</div>
      </div>

      <div className="case-grid">
        <div>
          <div className="card">
            <div className="card-header"><div className="card-title">Eligibility</div></div>
            <div className="card-body">
              <div className="kv-grid">
                <div><div className="kv-label">21 or older</div><div>{yesNo(m.is_21_or_older)}</div></div>
                <div><div className="kv-label">No crime against person</div><div>{yesNo(m.no_crime_against_person)}</div></div>
                <div><div className="kv-label">No DUI (5 yrs)</div><div>{yesNo(m.no_dui_5_years)}</div></div>
                <div><div className="kv-label">No probation (10 yrs)</div><div>{yesNo(m.no_probation_10_years)}</div></div>
                <div><div className="kv-label">No restraining order (10 yrs)</div><div>{yesNo(m.no_restraining_orders_10_years)}</div></div>
                <div><div className="kv-label">Has vehicle</div><div>{yesNo(m.has_vehicle)}</div></div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header"><div className="card-title">Clearances</div></div>
            <div className="card-body">
              <div className="kv-grid">
                <div><div className="kv-label">LiveScan</div><div>{yesNo(m.livescan_completed)} {m.livescan_date ? `· ${fmtDate(m.livescan_date)}` : ''}</div></div>
                <div><div className="kv-label">TrustLine</div><div>{yesNo(m.trustline_registered)} {m.trustline_expiry ? `· exp ${fmtDate(m.trustline_expiry)}` : ''}</div></div>
                <div><div className="kv-label">KCM</div><div>{yesNo(m.kcm_certified)} {m.kcm_expiry_date ? `· exp ${fmtDate(m.kcm_expiry_date)}` : ''}</div></div>
                <div><div className="kv-label">Training hours</div><div>{m.training_hours_completed || 0} hrs</div></div>
                <div><div className="kv-label">Mandated reporter training</div><div>{m.mandated_reporter_training_date ? fmtDate(m.mandated_reporter_training_date) : '—'}</div></div>
                <div><div className="kv-label">FL-324(P) signed</div><div>{yesNo(m.fl324p_signed)} {m.fl324p_signed_date ? `· ${fmtDate(m.fl324p_signed_date)}` : ''}</div></div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header"><div className="card-title">Recent visits</div></div>
            <div className="card-body-flush">
              {visits.length === 0 ? <div className="empty-state"><div className="empty-state-title">No visits yet</div></div> : (
                <table className="data-table">
                  <thead><tr><th>Date</th><th>Case</th><th>Location</th><th>Status</th></tr></thead>
                  <tbody>
                    {visits.map((v) => (
                      <tr key={v.id}>
                        <td className="cell-strong">{fmtDate(v.scheduled_date)}</td>
                        <td className="cell-mono">{v.case?.case_number || '—'}</td>
                        <td>{v.location || '—'}</td>
                        <td>{statusBadge(v.status)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>

        <div>
          <div className="card">
            <div className="card-header"><div className="card-title">Quick controls</div></div>
            <div className="card-body">
              <div className="form-group">
                <label className="form-label">Status</label>
                <select className="form-select" value={m.status || 'pending_verification'}
                  onChange={(e) => update({ status: e.target.value })}>
                  <option value="pending_verification">Pending verification</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="suspended">Suspended</option>
                </select>
              </div>
              <div className="form-group" style={{ marginTop: 12 }}>
                <label className="form-checkbox-label">
                  <input type="checkbox" checked={!!m.active}
                    onChange={(e) => update({ active: e.target.checked })} />
                  <span>Currently available for assignments</span>
                </label>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header"><div className="card-title">Assigned cases</div><div className="cell-muted">{cases.length}</div></div>
            <div className="card-body-flush">
              {cases.length === 0 ? (
                <div className="empty-state"><div className="empty-state-title">Not assigned to any case</div></div>
              ) : (
                <ul className="plain-list">
                  {cases.map((c) => (
                    <li key={c.id}>
                      <Link to={`/cases/${c.id}`} className="cell-mono cell-strong" style={{ color: 'var(--forest)' }}>{c.case_number}</Link>
                      <span className="cell-muted" style={{ marginLeft: 8 }}>· {c.status}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>

      {toast && <div className={`toast ${toast.kind === 'error' ? 'error' : ''}`}>{toast.message}</div>}
    </div>
  )
}
