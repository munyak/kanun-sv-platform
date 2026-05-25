import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../supabase'
import { loadPortalToken } from '../lib/portal'
import PortalShell from '../components/PortalShell'

function fmtDate(s) { if (!s) return '—'; return new Date(s).toLocaleDateString('en-US', { dateStyle: 'medium' }) }
function fmtDateLong(d) { if (!d) return '—'; return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric' }) }

function statusBadge(s) {
  const map = { scheduled: 'badge-blue', in_progress: 'badge-yellow', completed: 'badge-green',
                report_submitted: 'badge-green', report_pending: 'badge-yellow' }
  const cls = map[s] || 'badge-gray'
  return <span className={`badge ${cls}`}>{(s || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}</span>
}

export default function AttorneyPortal() {
  const { token } = useParams()
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)
  const [tokenRow, setTokenRow] = useState(null)
  const [cases, setCases] = useState([])
  const [visits, setVisits] = useState([])
  const [reports, setReports] = useState([])
  const [selectedCase, setSelectedCase] = useState(null)

  useEffect(() => { load() }, [token])

  async function load() {
    setLoading(true); setErr(null)
    try {
      const row = await loadPortalToken(token, 'attorney')
      setTokenRow(row)
      // Pull cases this attorney's token covers. Right now token.case_id ties
      // it to a single case; future iterations can support multi-case attorneys.
      let caseIds = row.case_id ? [row.case_id] : []
      if (!caseIds.length) {
        const { data } = await supabase.from('sv_cases').select('id').eq('org_id', row.org_id).limit(0)
        caseIds = (data || []).map((c) => c.id)
      }
      const [cRes, vRes, rRes] = await Promise.all([
        supabase.from('sv_cases')
          .select(`id, case_number, court_name, supervision_type, status, visit_frequency, court_order_date,
            custodial:custodial_party_id(first_name, last_name),
            noncustodial:noncustodial_party_id(first_name, last_name),
            monitor:primary_monitor_id(first_name, last_name)`)
          .in('id', caseIds),
        supabase.from('sv_visits')
          .select('id, case_id, scheduled_date, scheduled_start_time, scheduled_end_time, status, location, actual_duration_minutes')
          .in('case_id', caseIds).order('scheduled_date', { ascending: false }).limit(200),
        supabase.from('sv_reports')
          .select('id, case_id, visit_id, status, approved_at, submitted_at, visit_details')
          .in('case_id', caseIds).order('created_at', { ascending: false }).limit(100),
      ])
      setCases(cRes.data || [])
      setVisits(vRes.data || [])
      setReports(rRes.data || [])
      if ((cRes.data || []).length === 1) setSelectedCase(cRes.data[0].id)
    } catch (e) {
      setErr(e.message || 'Could not load this portal.')
    } finally { setLoading(false) }
  }

  if (loading) return <PortalShell><div className="loading">Loading…</div></PortalShell>
  if (err) return (
    <PortalShell>
      <div className="card" style={{ maxWidth: 480, margin: '64px auto' }}>
        <div className="card-body" style={{ textAlign: 'center' }}>
          <div className="empty-state-title">Link not available</div>
          <div className="empty-state-desc" style={{ marginTop: 8 }}>{err}</div>
        </div>
      </div>
    </PortalShell>
  )

  const activeCase = selectedCase ? cases.find((c) => c.id === selectedCase) : null
  const caseVisits = activeCase ? visits.filter((v) => v.case_id === activeCase.id) : []
  const caseReports = activeCase ? reports.filter((r) => r.case_id === activeCase.id) : []
  const completedVisits = caseVisits.filter((v) => ['completed', 'report_pending', 'report_submitted'].includes(v.status)).length
  const totalVisits = caseVisits.length

  return (
    <PortalShell orgName={tokenRow?.org?.name} portalKind="attorney" signerName={tokenRow?.display_name}>
      <div className="portal-hero">
        <div className="portal-hero-eyebrow">Attorney access</div>
        <div className="portal-hero-title">Case overview &amp; compliance</div>
        <div className="portal-hero-text">
          Read-only view of supervised visitation activity for the cases you represent.
        </div>
      </div>

      <div className="portal-section-title">Your cases</div>
      <div className="card" style={{ marginBottom: 24 }}>
        {cases.length === 0 ? (
          <div className="portal-empty">No cases linked to this token.</div>
        ) : (
          <table className="data-table">
            <thead><tr><th>Case</th><th>Court</th><th>Parties</th><th>Status</th><th /></tr></thead>
            <tbody>
              {cases.map((c) => (
                <tr key={c.id}>
                  <td className="cell-mono cell-strong">{c.case_number || '—'}</td>
                  <td className="cell-muted">{c.court_name || '—'}</td>
                  <td>
                    {c.custodial && `${c.custodial.first_name} ${c.custodial.last_name}`}
                    {c.custodial && c.noncustodial && ' v. '}
                    {c.noncustodial && `${c.noncustodial.first_name} ${c.noncustodial.last_name}`}
                  </td>
                  <td>{statusBadge(c.status)}</td>
                  <td><button className="btn btn-sm btn-secondary" onClick={() => setSelectedCase(c.id)}>{selectedCase === c.id ? 'Selected' : 'View'}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {activeCase && (
        <>
          <div className="portal-section-title">Compliance summary — {activeCase.case_number}</div>
          <div className="compliance-grid">
            <div className="compliance-card">
              <div className="compliance-card-label">Visits completed</div>
              <div className="compliance-card-value">{completedVisits}</div>
              <div className="compliance-card-sub">of {totalVisits} scheduled</div>
            </div>
            <div className="compliance-card">
              <div className="compliance-card-label">Approved reports</div>
              <div className="compliance-card-value">{caseReports.filter((r) => r.status === 'approved').length}</div>
              <div className="compliance-card-sub">downloadable below</div>
            </div>
            <div className="compliance-card">
              <div className="compliance-card-label">Visit cadence</div>
              <div className="compliance-card-value" style={{ fontSize: 16, paddingTop: 4 }}>{activeCase.visit_frequency || '—'}</div>
              <div className="compliance-card-sub">Per court order</div>
            </div>
            <div className="compliance-card">
              <div className="compliance-card-label">Monitor</div>
              <div className="compliance-card-value" style={{ fontSize: 15, paddingTop: 4 }}>
                {activeCase.monitor ? `${activeCase.monitor.first_name} ${activeCase.monitor.last_name}` : 'Unassigned'}
              </div>
            </div>
          </div>

          <div className="portal-section-title">Visit history</div>
          <div className="card" style={{ marginBottom: 24 }}>
            {caseVisits.length === 0 ? (
              <div className="portal-empty">No visits on file.</div>
            ) : (
              <table className="data-table">
                <thead><tr><th>Date</th><th>Location</th><th>Status</th><th>Actual duration</th></tr></thead>
                <tbody>
                  {caseVisits.map((v) => (
                    <tr key={v.id}>
                      <td className="cell-strong">{fmtDateLong(v.scheduled_date)}</td>
                      <td className="cell-muted">{v.location || '—'}</td>
                      <td>{statusBadge(v.status)}</td>
                      <td className="cell-muted">{v.actual_duration_minutes ? `${v.actual_duration_minutes} min` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="portal-section-title">Reports</div>
          <div className="card">
            {caseReports.length === 0 ? (
              <div className="portal-empty">No reports yet.</div>
            ) : (
              <ul className="plain-list">
                {caseReports.map((r) => (
                  <li key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <div className="cell-strong">Visit on {fmtDateLong(r.visit_details?.scheduled_date || '')}</div>
                      <div className="cell-muted">
                        {r.status === 'approved'
                          ? `Approved ${fmtDate(r.approved_at)}`
                          : r.status === 'submitted' ? `Submitted ${fmtDate(r.submitted_at)}` : 'Draft'}
                      </div>
                    </div>
                    <span className={`badge ${r.status === 'approved' ? 'badge-green' : r.status === 'submitted' ? 'badge-blue' : 'badge-gray'}`}>
                      {r.status}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </PortalShell>
  )
}
