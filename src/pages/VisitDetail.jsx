import React, { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../supabase'
import { useAuth } from '../auth/AuthContext'

const FLOW_STEPS = [
  { key: 'scheduled',        label: 'Scheduled' },
  { key: 'checked_in',       label: 'Checked in' },
  { key: 'in_progress',      label: 'In progress' },
  { key: 'completed',        label: 'Completed' },
  { key: 'report_pending',   label: 'Report pending' },
  { key: 'report_submitted', label: 'Report submitted' },
]

function fmtTime(t) {
  if (!t) return ''
  const [h, m] = t.split(':')
  const d = new Date(); d.setHours(Number(h), Number(m), 0, 0)
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}
function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}
function fmtDateTime(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
}

function getCurrentStepIndex(status) {
  const idx = FLOW_STEPS.findIndex((s) => s.key === status)
  return idx >= 0 ? idx : 0
}

async function tryGetPosition() {
  if (!('geolocation' in navigator)) return null
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 5000, maximumAge: 60000 },
    )
  })
}

export default function VisitDetail() {
  const { id } = useParams()
  const { activeOrgId, role, user } = useAuth()
  const isMonitor = role === 'monitor'
  const nav = useNavigate()
  const [loading, setLoading] = useState(true)
  const [visit, setVisit] = useState(null)
  const [observations, setObservations] = useState([])
  const [toast, setToast] = useState(null)
  const [busy, setBusy] = useState(false)
  const [myMonitorId, setMyMonitorId] = useState(null)

  useEffect(() => {
    if (!isMonitor || !activeOrgId || !user) { setMyMonitorId(null); return }
    supabase.from('sv_monitors').select('id')
      .eq('org_id', activeOrgId).eq('user_id', user.id).maybeSingle()
      .then(({ data }) => setMyMonitorId(data?.id || null))
  }, [isMonitor, activeOrgId, user?.id])
  const [draft, setDraft] = useState({
    child_behavior: '',
    parent_interaction: '',
    safety_concerns: '',
    environment: '',
    notes: '',
  })

  useEffect(() => { if (activeOrgId) load() }, [activeOrgId, id])

  function showToast(m, kind = 'success') { setToast({ m, kind }); setTimeout(() => setToast(null), 3000) }

  async function load() {
    setLoading(true)
    try {
      const [vRes, oRes] = await Promise.all([
        supabase.from('sv_visits').select(`*,
          case:case_id(id, case_number, preferred_location, court_name,
            custodial:custodial_party_id(first_name, last_name),
            noncustodial:noncustodial_party_id(first_name, last_name)),
          monitor:monitor_id(id, first_name, last_name)`)
          .eq('id', id).eq('org_id', activeOrgId).maybeSingle(),
        supabase.from('sv_visit_observations').select('*')
          .eq('visit_id', id).order('observed_at', { ascending: false }),
      ])
      if (vRes.error) throw vRes.error
      setVisit(vRes.data)
      setObservations(oRes.data || [])
    } catch (e) {
      console.error('VisitDetail load', e); showToast(e.message, 'error')
    } finally { setLoading(false) }
  }

  async function patchVisit(patch) {
    setBusy(true)
    try {
      const { error } = await supabase.from('sv_visits').update(patch).eq('id', visit.id)
      if (error) throw error
      await load()
    } catch (e) { showToast(e.message, 'error') }
    finally { setBusy(false) }
  }

  async function checkIn() {
    const pos = await tryGetPosition()
    const patch = {
      status: 'checked_in',
      checked_in_at: new Date().toISOString(),
      checkin_lat: pos?.lat ?? null,
      checkin_lng: pos?.lng ?? null,
      checkin_monitor_id: visit.monitor_id,
    }
    await patchVisit(patch)
    showToast(pos ? 'Checked in with GPS' : 'Checked in')
  }

  async function startVisit() {
    await patchVisit({ status: 'in_progress' })
  }

  async function checkOut() {
    const pos = await tryGetPosition()
    const now = new Date()
    const start = visit.checked_in_at ? new Date(visit.checked_in_at) : null
    const minutes = start ? Math.round((now - start) / 60000) : null
    const patch = {
      status: 'report_pending',
      checked_out_at: now.toISOString(),
      checkout_lat: pos?.lat ?? null,
      checkout_lng: pos?.lng ?? null,
      actual_duration_minutes: minutes,
    }
    await patchVisit(patch)
    showToast('Checked out · ready for report')
  }

  async function addObservation() {
    if (!draft.child_behavior && !draft.parent_interaction && !draft.safety_concerns && !draft.environment && !draft.notes) {
      showToast('Add at least one observation', 'error')
      return
    }
    setBusy(true)
    try {
      const { error } = await supabase.from('sv_visit_observations').insert({
        org_id: activeOrgId,
        visit_id: visit.id,
        monitor_id: visit.monitor_id,
        ...draft,
      })
      if (error) throw error
      setDraft({ child_behavior: '', parent_interaction: '', safety_concerns: '', environment: '', notes: '' })
      await load()
      showToast('Observation saved')
    } catch (e) { showToast(e.message, 'error') }
    finally { setBusy(false) }
  }

  if (loading) return <div className="loading">Loading visit…</div>
  if (!visit) return (
    <div className="empty-state" style={{ marginTop: 64 }}>
      <div className="empty-state-title">Visit not found</div>
      <Link to="/visits" className="btn btn-secondary" style={{ marginTop: 16 }}>Back to schedule</Link>
    </div>
  )
  if (isMonitor && myMonitorId && visit.monitor_id !== myMonitorId) return (
    <div className="empty-state" style={{ marginTop: 64 }}>
      <div className="empty-state-title">Not assigned to you</div>
      <div className="empty-state-desc">You can only access visits where you are the assigned monitor.</div>
      <Link to="/visits" className="btn btn-secondary" style={{ marginTop: 16 }}>Back to my visits</Link>
    </div>
  )

  const currentStep = getCurrentStepIndex(visit.status)
  const isCheckedIn = !!visit.checked_in_at
  const isCheckedOut = !!visit.checked_out_at

  return (
    <div>
      <div className="page-header">
        <div>
          <Link to="/visits" className="page-subtitle" style={{ display: 'inline-block', marginBottom: 6 }}>← Schedule</Link>
          <h1 className="page-title">{visit.case?.case_number || 'Visit'}</h1>
          <div className="page-subtitle">
            {fmtDate(visit.scheduled_date)} · {fmtTime(visit.scheduled_start_time)} – {fmtTime(visit.scheduled_end_time)} · {visit.location || 'No location'}
          </div>
        </div>
        <div className="btn-group">
          {visit.status === 'scheduled' && (
            <button className="btn btn-primary" onClick={checkIn} disabled={busy}>Check in</button>
          )}
          {visit.status === 'checked_in' && (
            <button className="btn btn-primary" onClick={startVisit} disabled={busy}>Begin visit</button>
          )}
          {visit.status === 'in_progress' && (
            <button className="btn btn-primary" onClick={checkOut} disabled={busy}>Check out</button>
          )}
          {(visit.status === 'report_pending' || visit.status === 'completed') && (
            <Link to={`/visits/${visit.id}/report`} className="btn btn-primary">Write report →</Link>
          )}
          {visit.status === 'report_submitted' && (
            <Link to={`/visits/${visit.id}/report`} className="btn btn-secondary">View report →</Link>
          )}
        </div>
      </div>

      {/* Flow visualization */}
      <div className="visit-flow-steps">
        {FLOW_STEPS.map((s, i) => {
          const done = i < currentStep
          const active = i === currentStep
          return (
            <React.Fragment key={s.key}>
              <div className={`visit-flow-step ${done ? 'done' : ''} ${active ? 'active' : ''}`}>
                <span className="visit-flow-step-dot" />
                <span>{s.label}</span>
              </div>
              {i < FLOW_STEPS.length - 1 && <span style={{ color: 'var(--gray-300)' }}>›</span>}
            </React.Fragment>
          )
        })}
      </div>

      <div className="case-grid">
        <div>
          {/* Observation log */}
          <div className="card">
            <div className="card-header">
              <div className="card-title">Add observation</div>
              <div className="cell-muted">Structured prompts make the report stronger</div>
            </div>
            <div className="card-body">
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Child behavior</label>
                  <textarea className="form-textarea" rows={3} value={draft.child_behavior}
                    onChange={(e) => setDraft({ ...draft, child_behavior: e.target.value })}
                    placeholder="Mood, engagement, age-appropriate reactions…" />
                </div>
                <div className="form-group">
                  <label className="form-label">Parent interaction</label>
                  <textarea className="form-textarea" rows={3} value={draft.parent_interaction}
                    onChange={(e) => setDraft({ ...draft, parent_interaction: e.target.value })}
                    placeholder="Tone, attentiveness, age-appropriate conversation…" />
                </div>
                <div className="form-group">
                  <label className="form-label">Safety concerns</label>
                  <textarea className="form-textarea" rows={3} value={draft.safety_concerns}
                    onChange={(e) => setDraft({ ...draft, safety_concerns: e.target.value })}
                    placeholder="Any 5.20(j) concerns, prohibited topics, boundary tests…" />
                </div>
                <div className="form-group">
                  <label className="form-label">Environment</label>
                  <textarea className="form-textarea" rows={3} value={draft.environment}
                    onChange={(e) => setDraft({ ...draft, environment: e.target.value })}
                    placeholder="Setting, distractions, presence of others…" />
                </div>
                <div className="form-group full">
                  <label className="form-label">Additional notes</label>
                  <textarea className="form-textarea" rows={3} value={draft.notes}
                    onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                    placeholder="Anything else worth recording…" />
                </div>
              </div>
              <div className="btn-group right">
                <button className="btn btn-secondary"
                  onClick={() => setDraft({ child_behavior: '', parent_interaction: '', safety_concerns: '', environment: '', notes: '' })}
                  disabled={busy}>Clear</button>
                <button className="btn btn-primary" onClick={addObservation} disabled={busy}>
                  {busy ? 'Saving…' : 'Save observation'}
                </button>
              </div>
            </div>
          </div>

          {/* Observation history */}
          <div className="card">
            <div className="card-header">
              <div className="card-title">Observation log</div>
              <div className="cell-muted">{observations.length} entr{observations.length === 1 ? 'y' : 'ies'}</div>
            </div>
            <div className="card-body">
              {observations.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-state-title">No observations yet</div>
                  <div className="empty-state-desc">Use the form above to log what you observe during the visit.</div>
                </div>
              ) : observations.map((o) => (
                <div key={o.id} className="observation-block">
                  <div className="observation-block-head">
                    <div className="cell-strong">{fmtDateTime(o.observed_at)}</div>
                    <span className="observation-block-time">#{o.id.slice(0, 6)}</span>
                  </div>
                  <div className="observation-block-grid">
                    {o.child_behavior && <ObsCell label="Child behavior" v={o.child_behavior} />}
                    {o.parent_interaction && <ObsCell label="Parent interaction" v={o.parent_interaction} />}
                    {o.safety_concerns && <ObsCell label="Safety concerns" v={o.safety_concerns} />}
                    {o.environment && <ObsCell label="Environment" v={o.environment} />}
                  </div>
                  {o.notes && <div className="obs-cell" style={{ marginTop: 10 }}>
                    <div className="obs-cell-label">Notes</div>
                    <div className="obs-cell-value">{o.notes}</div>
                  </div>}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div>
          {/* Visit info */}
          <div className="card">
            <div className="card-header"><div className="card-title">Visit info</div></div>
            <div className="card-body">
              <div className="kv-grid">
                <div className="full">
                  <div className="kv-label">Case</div>
                  <Link to={`/cases/${visit.case?.id}`} className="cell-link cell-mono">{visit.case?.case_number}</Link>
                </div>
                <div>
                  <div className="kv-label">Monitor</div>
                  <div>{visit.monitor ? `${visit.monitor.first_name} ${visit.monitor.last_name}` : '—'}</div>
                </div>
                <div>
                  <div className="kv-label">Status</div>
                  <div>{visit.status?.replace(/_/g, ' ')}</div>
                </div>
                <div>
                  <div className="kv-label">Checked in</div>
                  <div>{fmtDateTime(visit.checked_in_at)}</div>
                </div>
                <div>
                  <div className="kv-label">Checked out</div>
                  <div>{fmtDateTime(visit.checked_out_at)}</div>
                </div>
                <div className="full">
                  <div className="kv-label">Actual duration</div>
                  <div>{visit.actual_duration_minutes ? `${visit.actual_duration_minutes} min` : '—'}</div>
                </div>
                {(visit.checkin_lat && visit.checkin_lng) && (
                  <div className="full">
                    <div className="kv-label">Check-in GPS</div>
                    <div className="cell-mono">{Number(visit.checkin_lat).toFixed(5)}, {Number(visit.checkin_lng).toFixed(5)}</div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Parties (no contact info shown here, just names) */}
          <div className="card">
            <div className="card-header"><div className="card-title">Parties</div></div>
            <div className="card-body">
              <div className="kv-grid">
                <div>
                  <div className="kv-label">Custodial</div>
                  <div>{visit.case?.custodial ? `${visit.case.custodial.first_name} ${visit.case.custodial.last_name}` : '—'}</div>
                </div>
                <div>
                  <div className="kv-label">Noncustodial</div>
                  <div>{visit.case?.noncustodial ? `${visit.case.noncustodial.first_name} ${visit.case.noncustodial.last_name}` : '—'}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {toast && <div className={`toast ${toast.kind === 'error' ? 'error' : ''}`}>{toast.m}</div>}
    </div>
  )
}

function ObsCell({ label, v }) {
  return (
    <div className="obs-cell">
      <div className="obs-cell-label">{label}</div>
      <div className="obs-cell-value">{v}</div>
    </div>
  )
}
