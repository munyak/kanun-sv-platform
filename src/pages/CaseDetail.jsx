import React, { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../supabase'
import { useAuth } from '../auth/AuthContext'
import VisitForm from '../components/VisitForm'

const CASE_STATUS = ['intake', 'active', 'suspended', 'terminated', 'completed', 'archived']
const RISK_LEVELS = ['low', 'medium', 'high', 'critical']

function fmtDate(s) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
function fmtTime(t) {
  if (!t) return ''
  const [h, m] = t.split(':')
  const d = new Date(); d.setHours(Number(h), Number(m), 0, 0)
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}
function fmtVisitWhen(date, time) {
  if (!date) return '—'
  const d = new Date(`${date}T${(time || '00:00').slice(0,5)}:00`)
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) + ' · ' + fmtTime(time)
}
function statusBadge(status) {
  if (!status) return <span className="badge badge-gray">—</span>
  const map = { intake:'badge-yellow', active:'badge-green', suspended:'badge-yellow',
                terminated:'badge-red', completed:'badge-blue', archived:'badge-gray',
                scheduled:'badge-blue', confirmed:'badge-blue', in_progress:'badge-yellow' }
  const cls = map[status] || 'badge-gray'
  return <span className={`badge ${cls}`}>{status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</span>
}

export default function CaseDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const { activeOrgId } = useAuth()
  const [loading, setLoading] = useState(true)
  const [c, setCase] = useState(null)
  const [children, setChildren] = useState([])
  const [visits, setVisits] = useState([])
  const [monitors, setMonitors] = useState([])
  const [showVisit, setShowVisit] = useState(false)
  const [editVisit, setEditVisit] = useState(null)
  const [toast, setToast] = useState(null)

  useEffect(() => { if (activeOrgId) load() }, [activeOrgId, id])

  async function load() {
    setLoading(true)
    try {
      const [cRes, vRes, mRes] = await Promise.all([
        supabase.from('sv_cases').select(`*,
          custodial:custodial_party_id(*),
          noncustodial:noncustodial_party_id(*),
          monitor:primary_monitor_id(id, first_name, last_name)`)
          .eq('id', id).eq('org_id', activeOrgId).maybeSingle(),
        supabase.from('sv_visits').select(`id, scheduled_date, scheduled_start_time, scheduled_end_time, location, status,
          monitor:monitor_id(id, first_name, last_name)`)
          .eq('case_id', id).eq('org_id', activeOrgId).order('scheduled_date', { ascending: false }),
        supabase.from('sv_monitors').select('id, first_name, last_name, active')
          .eq('org_id', activeOrgId).order('last_name'),
      ])
      if (cRes.error) throw cRes.error
      setCase(cRes.data)
      setVisits(vRes.data || [])
      setMonitors((mRes.data || []).filter((x) => x.active !== false))

      if (cRes.data) {
        const { data: kids } = await supabase
          .from('sv_case_children')
          .select(`child:child_id(id, first_name, last_name, date_of_birth, chronic_health_conditions, allergies, medications, special_needs)`)
          .eq('case_id', id)
        setChildren((kids || []).map((k) => k.child).filter(Boolean))
      }
    } catch (e) {
      console.error('CaseDetail load', e)
      showToast(e.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  function showToast(message, kind = 'success') {
    setToast({ message, kind })
    setTimeout(() => setToast(null), 3000)
  }

  async function updateCase(patch) {
    if (!c) return
    const { error } = await supabase.from('sv_cases').update(patch).eq('id', c.id)
    if (error) showToast(error.message, 'error')
    else { showToast('Saved'); load() }
  }

  if (loading) return <div className="loading">Loading case…</div>
  if (!c) return (
    <div className="empty-state" style={{ marginTop: 64 }}>
      <div className="empty-state-title">Case not found</div>
      <div className="empty-state-desc">It may belong to another organization, or has been archived.</div>
      <Link to="/cases" className="btn btn-secondary" style={{ marginTop: 16 }}>Back to cases</Link>
    </div>
  )

  const past = visits.filter((v) => v.scheduled_date < new Date().toISOString().slice(0, 10))
  const upcoming = visits.filter((v) => v.scheduled_date >= new Date().toISOString().slice(0, 10))

  return (
    <div>
      <div className="page-header">
        <div>
          <Link to="/cases" className="page-subtitle" style={{ display: 'inline-block', marginBottom: 6 }}>← Cases</Link>
          <h1 className="page-title cell-mono">{c.case_number || `Case ${c.id.slice(0, 6)}`}</h1>
          <div className="page-subtitle">{c.court_name || 'No court on file'} · opened {fmtDate(c.created_at)}</div>
        </div>
        <div className="btn-group">
          <button className="btn btn-secondary" onClick={() => { setEditVisit(null); setShowVisit(true) }}>+ Schedule visit</button>
        </div>
      </div>

      <div className="case-grid">
        <div>
          {/* Overview card */}
          <div className="card">
            <div className="card-header"><div className="card-title">Overview</div></div>
            <div className="card-body">
              <div className="kv-grid">
                <div><div className="kv-label">Status</div><div>
                  <select className="form-select" value={c.status || 'intake'}
                    onChange={(e) => updateCase({ status: e.target.value })}>
                    {CASE_STATUS.map((s) => (
                      <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                    ))}
                  </select>
                </div></div>
                <div><div className="kv-label">Risk level</div><div>
                  <select className="form-select" value={c.risk_level || 'medium'}
                    onChange={(e) => updateCase({ risk_level: e.target.value })}>
                    {RISK_LEVELS.map((r) => (
                      <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
                    ))}
                  </select>
                </div></div>
                <div><div className="kv-label">Supervision type</div><div>{c.supervision_type ? c.supervision_type.replace(/_/g, ' ') : '—'}</div></div>
                <div><div className="kv-label">Referral source</div><div>{c.referral_source || '—'}</div></div>
                <div><div className="kv-label">Visit cadence</div><div>{c.visit_frequency || '—'} · {c.visit_duration_minutes || 0} min</div></div>
                <div><div className="kv-label">Rate per visit</div><div>${c.rate_per_visit || 0}</div></div>
                <div className="full"><div className="kv-label">Preferred location</div><div>{c.preferred_location || '—'}</div></div>
                <div className="full"><div className="kv-label">Reasons for supervision</div>
                  <div>{(c.reason_for_supervision || []).join(', ') || '—'}</div></div>
                {c.risk_assessment_notes && (
                  <div className="full"><div className="kv-label">Risk assessment</div>
                    <div style={{ whiteSpace: 'pre-wrap' }}>{c.risk_assessment_notes}</div></div>
                )}
              </div>
            </div>
          </div>

          {/* Parties */}
          <div className="card">
            <div className="card-header"><div className="card-title">Parties</div></div>
            <div className="card-body">
              <div className="party-grid">
                <PartyBlock title="Custodial" p={c.custodial} />
                <PartyBlock title="Noncustodial" p={c.noncustodial} />
              </div>
            </div>
          </div>

          {/* Children */}
          <div className="card">
            <div className="card-header"><div className="card-title">Children</div></div>
            <div className="card-body">
              {children.length === 0 ? (
                <div className="empty-state-title">No children linked to this case.</div>
              ) : (
                <div className="party-grid">
                  {children.map((k) => (
                    <div key={k.id} className="party-block">
                      <div className="party-name">{k.first_name} {k.last_name}</div>
                      {k.date_of_birth && <div className="cell-muted">DOB {fmtDate(k.date_of_birth)}</div>}
                      {k.chronic_health_conditions && <div className="kv-line"><strong>Health:</strong> {k.chronic_health_conditions}</div>}
                      {k.medications && <div className="kv-line"><strong>Meds:</strong> {k.medications}</div>}
                      {k.allergies && <div className="kv-line"><strong>Allergies:</strong> {k.allergies}</div>}
                      {k.special_needs && <div className="kv-line"><strong>Special needs:</strong> {k.special_needs}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div>
          {/* Monitor assignment */}
          <div className="card">
            <div className="card-header"><div className="card-title">Primary monitor</div></div>
            <div className="card-body">
              <select className="form-select" value={c.primary_monitor_id || ''}
                onChange={(e) => updateCase({ primary_monitor_id: e.target.value || null })}>
                <option value="">Unassigned</option>
                {monitors.map((m) => (
                  <option key={m.id} value={m.id}>{m.first_name} {m.last_name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Upcoming visits */}
          <div className="card">
            <div className="card-header">
              <div className="card-title">Upcoming</div>
              <button className="btn btn-sm btn-primary" onClick={() => { setEditVisit(null); setShowVisit(true) }}>+ Add</button>
            </div>
            <div className="card-body-flush">
              {upcoming.length === 0 ? (
                <div className="empty-state"><div className="empty-state-title">No upcoming visits</div></div>
              ) : (
                <div className="timeline">
                  {upcoming.map((v) => (
                    <button key={v.id} className="timeline-item" onClick={() => { setEditVisit(v); setShowVisit(true) }}>
                      <div className="timeline-dot" />
                      <div className="timeline-content">
                        <div className="cell-strong">{fmtVisitWhen(v.scheduled_date, v.scheduled_start_time)}</div>
                        <div className="cell-muted">{v.location || '—'}</div>
                        <div style={{ marginTop: 4 }}>{statusBadge(v.status)}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Past visits */}
          <div className="card">
            <div className="card-header"><div className="card-title">Past visits</div><div className="cell-muted">{past.length}</div></div>
            <div className="card-body-flush">
              {past.length === 0 ? (
                <div className="empty-state"><div className="empty-state-title">No past visits yet</div></div>
              ) : (
                <div className="timeline">
                  {past.slice(0, 8).map((v) => (
                    <div key={v.id} className="timeline-item">
                      <div className="timeline-dot past" />
                      <div className="timeline-content">
                        <div className="cell-strong">{fmtVisitWhen(v.scheduled_date, v.scheduled_start_time)}</div>
                        <div className="cell-muted">{v.location || '—'}</div>
                        <div style={{ marginTop: 4 }}>{statusBadge(v.status)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {showVisit && (
        <VisitForm
          orgId={activeOrgId}
          visit={editVisit ? editVisit : { case: { id: c.id, case_number: c.case_number }, location: c.preferred_location, monitor: c.primary_monitor_id ? { id: c.primary_monitor_id } : null }}
          onClose={() => { setShowVisit(false); setEditVisit(null) }}
          onSaved={() => { setShowVisit(false); setEditVisit(null); load(); showToast('Visit saved') }}
        />
      )}

      {toast && <div className={`toast ${toast.kind === 'error' ? 'error' : ''}`}>{toast.message}</div>}
    </div>
  )
}

function PartyBlock({ title, p }) {
  if (!p) return (
    <div className="party-block">
      <div className="party-tag">{title}</div>
      <div className="cell-muted">No party on file</div>
    </div>
  )
  return (
    <div className="party-block">
      <div className="party-tag">{title}</div>
      <div className="party-name">{p.first_name} {p.last_name}</div>
      {p.phone_primary && <div className="kv-line"><strong>Phone:</strong> {p.phone_primary}</div>}
      {p.email && <div className="kv-line"><strong>Email:</strong> {p.email}</div>}
      {p.address_line1 && (
        <div className="kv-line confidential-line">
          <strong>Address (confidential):</strong> {p.address_line1}, {p.city}, {p.state} {p.zip}
        </div>
      )}
      {p.attorney_name && <div className="kv-line"><strong>Attorney:</strong> {p.attorney_name} {p.attorney_phone ? `· ${p.attorney_phone}` : ''}</div>}
      {p.emergency_contact_name && <div className="kv-line"><strong>Emergency:</strong> {p.emergency_contact_name} {p.emergency_contact_phone ? `· ${p.emergency_contact_phone}` : ''}</div>}
    </div>
  )
}
