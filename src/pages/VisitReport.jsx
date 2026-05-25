import React, { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../supabase'
import { useAuth } from '../auth/AuthContext'

/**
 * Visit Report — court-ready FL-324(P) attachment style.
 *
 *  - Pulls the visit + all observations
 *  - "Generate from observations" stitches structured observation prompts
 *    into a coherent narrative draft (rule-based, deterministic).
 *  - Status flow: draft → submitted → reviewed → approved.
 *  - Toggle preview/edit modes; preview prints clean.
 */

const STATUS_FLOW = [
  { key: 'draft',     label: 'Draft' },
  { key: 'submitted', label: 'Submitted' },
  { key: 'reviewed',  label: 'Reviewed' },
  { key: 'approved',  label: 'Approved' },
]

function fmtDate(s) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}
function fmtTime(t) {
  if (!t) return ''
  const [h, m] = t.split(':')
  const d = new Date(); d.setHours(Number(h), Number(m), 0, 0)
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function joinNarrative(items) {
  return items.filter(Boolean).map((s) => s.trim()).join('\n\n')
}

function generateNarrative(observations) {
  if (!observations.length) return { observations: '', interactions: '', safety: '', recs: '' }

  const childLines = observations.map((o) => o.child_behavior).filter(Boolean)
  const parentLines = observations.map((o) => o.parent_interaction).filter(Boolean)
  const safetyLines = observations.map((o) => o.safety_concerns).filter(Boolean)
  const envLines = observations.map((o) => o.environment).filter(Boolean)
  const noteLines = observations.map((o) => o.notes).filter(Boolean)

  return {
    observations: joinNarrative([
      childLines.length ? `Child behavior throughout the visit: ${childLines.join(' ')}` : '',
      envLines.length ? `Visit environment: ${envLines.join(' ')}` : '',
      noteLines.length ? `Additional observations: ${noteLines.join(' ')}` : '',
    ]),
    interactions: parentLines.length
      ? `Parent–child interactions observed: ${parentLines.join(' ')}`
      : '',
    safety: safetyLines.length
      ? `Safety considerations: ${safetyLines.join(' ')}`
      : 'No safety concerns were observed during this visit.',
    recs: safetyLines.length
      ? 'Continued supervised visitation is recommended, with ongoing attention to the safety considerations noted above.'
      : 'Continued supervised visitation is recommended on the current schedule.',
  }
}

export default function VisitReport() {
  const { id } = useParams()
  const { activeOrgId, user } = useAuth()
  const nav = useNavigate()
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [visit, setVisit] = useState(null)
  const [observations, setObservations] = useState([])
  const [report, setReport] = useState(null)
  const [mode, setMode] = useState('edit') // edit | preview
  const [toast, setToast] = useState(null)
  const [form, setForm] = useState({
    observations: '',
    interactions: '',
    safety_concerns: '',
    recommendations: '',
  })

  useEffect(() => { if (activeOrgId) load() }, [activeOrgId, id])

  function showToast(m, kind = 'success') { setToast({ m, kind }); setTimeout(() => setToast(null), 3000) }

  async function load() {
    setLoading(true)
    try {
      const [vRes, oRes, rRes] = await Promise.all([
        supabase.from('sv_visits').select(`*,
          case:case_id(*,
            custodial:custodial_party_id(*),
            noncustodial:noncustodial_party_id(*)),
          monitor:monitor_id(*)`)
          .eq('id', id).eq('org_id', activeOrgId).maybeSingle(),
        supabase.from('sv_visit_observations').select('*')
          .eq('visit_id', id).order('observed_at', { ascending: true }),
        supabase.from('sv_reports').select('*')
          .eq('visit_id', id).maybeSingle(),
      ])
      if (vRes.error) throw vRes.error
      setVisit(vRes.data)
      setObservations(oRes.data || [])
      if (rRes.data) {
        setReport(rRes.data)
        setForm({
          observations: rRes.data.observations || '',
          interactions: rRes.data.interactions || '',
          safety_concerns: rRes.data.safety_concerns || '',
          recommendations: rRes.data.recommendations || '',
        })
      }
    } catch (e) {
      console.error('VisitReport load', e); showToast(e.message, 'error')
    } finally { setLoading(false) }
  }

  function autoGenerate() {
    const drafted = generateNarrative(observations)
    setForm({
      observations: drafted.observations,
      interactions: drafted.interactions,
      safety_concerns: drafted.safety,
      recommendations: drafted.recs,
    })
    showToast('Drafted from observations')
  }

  async function saveDraft() {
    setBusy(true)
    try {
      const payload = {
        org_id: activeOrgId,
        case_id: visit.case_id,
        visit_id: visit.id,
        monitor_id: visit.monitor_id,
        report_type: 'visit_summary',
        observations: form.observations,
        interactions: form.interactions,
        safety_concerns: form.safety_concerns,
        recommendations: form.recommendations,
        visit_details: {
          scheduled_date: visit.scheduled_date,
          scheduled_start_time: visit.scheduled_start_time,
          scheduled_end_time: visit.scheduled_end_time,
          checked_in_at: visit.checked_in_at,
          checked_out_at: visit.checked_out_at,
          actual_duration_minutes: visit.actual_duration_minutes,
          location: visit.location,
        },
        updated_at: new Date().toISOString(),
      }
      let res
      if (report) {
        res = await supabase.from('sv_reports').update(payload).eq('id', report.id).select().single()
      } else {
        res = await supabase.from('sv_reports').insert({ ...payload, status: 'draft', created_by: user?.id }).select().single()
      }
      if (res.error) throw res.error
      setReport(res.data)
      showToast('Draft saved')
    } catch (e) { showToast(e.message, 'error') }
    finally { setBusy(false) }
  }

  async function setStatus(newStatus) {
    if (!report) { showToast('Save the draft first', 'error'); return }
    setBusy(true)
    try {
      const stamp = { updated_at: new Date().toISOString() }
      if (newStatus === 'submitted') stamp.submitted_at = new Date().toISOString()
      if (newStatus === 'reviewed') { stamp.reviewed_at = new Date().toISOString(); stamp.reviewer_id = user?.id }
      if (newStatus === 'approved') stamp.approved_at = new Date().toISOString()
      const { error } = await supabase.from('sv_reports')
        .update({ status: newStatus, ...stamp }).eq('id', report.id)
      if (error) throw error
      if (newStatus === 'submitted') {
        await supabase.from('sv_visits').update({ status: 'report_submitted' }).eq('id', visit.id)
      }
      await load()
      showToast(`Marked ${newStatus}`)
    } catch (e) { showToast(e.message, 'error') }
    finally { setBusy(false) }
  }

  if (loading) return <div className="loading">Loading report…</div>
  if (!visit) return (
    <div className="empty-state" style={{ marginTop: 64 }}>
      <div className="empty-state-title">Visit not found</div>
      <Link to="/visits" className="btn btn-secondary" style={{ marginTop: 16 }}>Back to schedule</Link>
    </div>
  )

  const status = report?.status || 'draft'

  return (
    <div>
      <div className="page-header">
        <div>
          <Link to={`/visits/${visit.id}`} className="page-subtitle" style={{ display: 'inline-block', marginBottom: 6 }}>← Visit</Link>
          <h1 className="page-title">Visit report</h1>
          <div className="page-subtitle">{visit.case?.case_number} · {fmtDate(visit.scheduled_date)}</div>
        </div>
        <div className="btn-group">
          <div className="segmented">
            <button className={`segmented-item ${mode === 'edit' ? 'active' : ''}`} onClick={() => setMode('edit')}>Edit</button>
            <button className={`segmented-item ${mode === 'preview' ? 'active' : ''}`} onClick={() => setMode('preview')}>Preview</button>
          </div>
          {mode === 'preview' && (
            <button className="btn btn-secondary" onClick={() => window.print()}>Print</button>
          )}
        </div>
      </div>

      {/* Status flow */}
      <div className="visit-flow-steps">
        {STATUS_FLOW.map((s, i) => {
          const currentIdx = STATUS_FLOW.findIndex((x) => x.key === status)
          const done = i < currentIdx
          const active = i === currentIdx
          return (
            <React.Fragment key={s.key}>
              <div className={`visit-flow-step ${done ? 'done' : ''} ${active ? 'active' : ''}`}>
                <span className="visit-flow-step-dot" />
                <span>{s.label}</span>
              </div>
              {i < STATUS_FLOW.length - 1 && <span style={{ color: 'var(--gray-300)' }}>›</span>}
            </React.Fragment>
          )
        })}
      </div>

      {mode === 'edit' && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">Compose</div>
            <div className="btn-group">
              <button className="btn btn-sm btn-secondary" onClick={autoGenerate} disabled={busy || observations.length === 0}>
                Draft from {observations.length} observation{observations.length === 1 ? '' : 's'}
              </button>
              <button className="btn btn-sm btn-primary" onClick={saveDraft} disabled={busy}>
                {busy ? 'Saving…' : 'Save draft'}
              </button>
            </div>
          </div>
          <div className="card-body">
            <div className="form-section">
              <h3 className="form-section-title">Visit details</h3>
              <div className="kv-grid">
                <div><div className="kv-label">Case</div><div className="cell-mono">{visit.case?.case_number}</div></div>
                <div><div className="kv-label">Date</div><div>{fmtDate(visit.scheduled_date)}</div></div>
                <div><div className="kv-label">Scheduled</div><div>{fmtTime(visit.scheduled_start_time)} – {fmtTime(visit.scheduled_end_time)}</div></div>
                <div><div className="kv-label">Actual duration</div><div>{visit.actual_duration_minutes ? `${visit.actual_duration_minutes} min` : '—'}</div></div>
                <div className="full"><div className="kv-label">Location</div><div>{visit.location || '—'}</div></div>
              </div>
            </div>

            <div className="form-section">
              <h3 className="form-section-title">Observations narrative</h3>
              <textarea className="form-textarea" rows={6} value={form.observations}
                onChange={(e) => setForm({ ...form, observations: e.target.value })}
                placeholder="Narrative of what the monitor observed during the visit…" />
            </div>

            <div className="form-section">
              <h3 className="form-section-title">Parent–child interactions</h3>
              <textarea className="form-textarea" rows={5} value={form.interactions}
                onChange={(e) => setForm({ ...form, interactions: e.target.value })}
                placeholder="Quality and tone of interactions…" />
            </div>

            <div className="form-section">
              <h3 className="form-section-title">Safety concerns</h3>
              <textarea className="form-textarea" rows={4} value={form.safety_concerns}
                onChange={(e) => setForm({ ...form, safety_concerns: e.target.value })}
                placeholder="Any 5.20(j) concerns or none observed…" />
            </div>

            <div className="form-section">
              <h3 className="form-section-title">Recommendations</h3>
              <textarea className="form-textarea" rows={4} value={form.recommendations}
                onChange={(e) => setForm({ ...form, recommendations: e.target.value })}
                placeholder="Recommendations for continued supervision, adjustments, etc." />
            </div>

            <div className="btn-group right">
              <button className="btn btn-secondary" onClick={() => setStatus('submitted')} disabled={busy || !report || status !== 'draft'}>Submit</button>
              <button className="btn btn-secondary" onClick={() => setStatus('reviewed')} disabled={busy || !report || status !== 'submitted'}>Mark reviewed</button>
              <button className="btn btn-primary" onClick={() => setStatus('approved')} disabled={busy || !report || status !== 'reviewed'}>Approve</button>
            </div>
          </div>
        </div>
      )}

      {mode === 'preview' && (
        <div className="report-preview" id="report-print">
          <h1>Supervised Visitation Report</h1>
          <div className="report-meta">
            FL-324(P) Attachment · Case {visit.case?.case_number} · {fmtDate(visit.scheduled_date)}
          </div>

          <div className="report-kv">
            <div className="k">Case number</div><div>{visit.case?.case_number}</div>
            <div className="k">Court</div><div>{visit.case?.court_name || '—'}</div>
            <div className="k">Custodial party</div><div>{visit.case?.custodial ? `${visit.case.custodial.first_name} ${visit.case.custodial.last_name}` : '—'}</div>
            <div className="k">Noncustodial party</div><div>{visit.case?.noncustodial ? `${visit.case.noncustodial.first_name} ${visit.case.noncustodial.last_name}` : '—'}</div>
            <div className="k">Provider</div><div>{visit.monitor ? `${visit.monitor.first_name} ${visit.monitor.last_name}` : '—'}</div>
            <div className="k">Visit date</div><div>{fmtDate(visit.scheduled_date)}</div>
            <div className="k">Scheduled</div><div>{fmtTime(visit.scheduled_start_time)} – {fmtTime(visit.scheduled_end_time)}</div>
            <div className="k">Actual duration</div><div>{visit.actual_duration_minutes ? `${visit.actual_duration_minutes} minutes` : '—'}</div>
            <div className="k">Location</div><div>{visit.location || '—'}</div>
          </div>

          <h2>Observations</h2>
          <p>{form.observations || '—'}</p>

          <h2>Parent–child interactions</h2>
          <p>{form.interactions || '—'}</p>

          <h2>Safety concerns</h2>
          <p>{form.safety_concerns || 'No safety concerns observed.'}</p>

          <h2>Recommendations</h2>
          <p>{form.recommendations || '—'}</p>

          <div className="report-foot">
            Report status: <strong>{status}</strong>
            {report?.submitted_at && <> · Submitted {fmtDate(report.submitted_at)}</>}
            {report?.reviewed_at && <> · Reviewed {fmtDate(report.reviewed_at)}</>}
            {report?.approved_at && <> · Approved {fmtDate(report.approved_at)}</>}
            <br />
            Provided per California Rule of Court 5.20. This document contains
            confidential information protected by Family Code §3110.5.
          </div>
        </div>
      )}

      {toast && <div className={`toast ${toast.kind === 'error' ? 'error' : ''}`}>{toast.m}</div>}
    </div>
  )
}
