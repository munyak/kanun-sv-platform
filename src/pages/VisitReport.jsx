import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../supabase'
import { useAuth } from '../auth/AuthContext'
import { OWNER_ROLES } from '../auth/ProtectedRoute'
import { logUsage } from '../lib/analytics'
import { complianceLine } from '../lib/courtStandards'

/* ============================================================
   Guided report builder + agency review
   ------------------------------------------------------------
   Section structure (auto-populated from visit + observations):
     1. Visit Summary           — from check-in/out timestamps
     2. Parties Present         — from arrival tracking + parties_present
     3. Observations            — grouped by category
     4. Court Order Compliance  — from court_compliance map
     5. Incidents               — pulled from critical/concern observations
     6. Monitor's Assessment    — free text

   Note: Supervised visitation monitors observe and document only; they do
   not issue recommendations. No recommendations section is collected,
   rendered, or exported. (Legacy `recommendations` data in sv_reports is
   left intact in the DB but is never surfaced.)

   Status flow:
     draft → pending_review → (changes_requested → pending_review)* → approved
                            \ rejected
   ============================================================ */

const OBSERVATION_CATEGORIES = [
  { key: 'parent_child_interaction', label: 'Parent–Child Interaction' },
  { key: 'communication',            label: 'Communication' },
  { key: 'positive_observation',     label: 'Positive Observation' },
  { key: 'behavioral_note',          label: 'Behavioral Note' },
  { key: 'safety_concern',           label: 'Safety Concern' },
  { key: 'incident',                 label: 'Incident' },
]

const STATUS_FLOW = [
  { key: 'draft',             label: 'Draft' },
  { key: 'pending_review',    label: 'Pending review' },
  { key: 'changes_requested', label: 'Changes requested' },
  { key: 'approved',          label: 'Approved' },
]

function fmtDate(s) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}
function fmtTime(t) {
  if (!t) return ''
  const [h, m] = String(t).split(':')
  const d = new Date(); d.setHours(Number(h), Number(m), 0, 0)
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}
function fmtClock(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}
function fmtDateTime(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
}

function categoryLabel(key) {
  return OBSERVATION_CATEGORIES.find((c) => c.key === key)?.label || 'Uncategorized'
}

function groupByCategory(observations) {
  const groups = {}
  for (const o of observations) {
    const k = o.category || 'uncategorized'
    if (!groups[k]) groups[k] = []
    groups[k].push(o)
  }
  return groups
}

function obsText(o) {
  return o.description
    || o.notes
    || o.parent_interaction
    || o.child_behavior
    || o.safety_concerns
    || o.environment
    || ''
}

function buildInitialSections(visit, observations) {
  const c = visit?.case || {}
  const start = visit?.actual_start_time || visit?.checked_in_at
  const end = visit?.actual_end_time || visit?.checked_out_at
  const duration = visit?.actual_duration_minutes
    ? `${visit.actual_duration_minutes} minutes`
    : (start && end ? `${Math.round((new Date(end) - new Date(start)) / 60000)} minutes` : '—')

  const summary = [
    `Visit conducted on ${fmtDate(visit?.scheduled_date)} at ${visit?.location || c.preferred_location || 'the agreed location'}.`,
    `Scheduled ${fmtTime(visit?.scheduled_start_time)} – ${fmtTime(visit?.scheduled_end_time)}.`,
    `Actual visit started ${fmtClock(start)} and ended ${fmtClock(end)} (${duration}).`,
    visit?.on_my_way_time ? `Monitor departed for site at ${fmtClock(visit.on_my_way_time)}.` : '',
  ].filter(Boolean).join(' ')

  const parties = []
  if (c.custodial) {
    parties.push(`Custodial parent ${c.custodial.first_name} ${c.custodial.last_name}` +
      (visit?.custodial_arrival_time ? ` arrived at ${fmtClock(visit.custodial_arrival_time)}` : '') +
      (visit?.custodial_departure_time ? ` and departed at ${fmtClock(visit.custodial_departure_time)}` : '') + '.')
  }
  if (c.noncustodial) {
    parties.push(`Noncustodial parent ${c.noncustodial.first_name} ${c.noncustodial.last_name}` +
      (visit?.noncustodial_arrival_time ? ` arrived at ${fmtClock(visit.noncustodial_arrival_time)}` : '') +
      (visit?.noncustodial_departure_time ? ` and departed at ${fmtClock(visit.noncustodial_departure_time)}` : '') + '.')
  }
  const childrenList = (c.children || []).map((cc) => cc.child).filter(Boolean)
  if (childrenList.length) {
    parties.push(`Children present: ${childrenList.map((ch) => `${ch.first_name} ${ch.last_name}`).join(', ')}.`)
  }

  const grouped = groupByCategory(observations)
  const orderedCats = [...OBSERVATION_CATEGORIES.map((c) => c.key), 'uncategorized']
  const obsByCategory = {}
  for (const k of orderedCats) {
    if (grouped[k]?.length) {
      obsByCategory[k] = grouped[k].map((o) => `[${fmtClock(o.observed_at)}] ${obsText(o)}`).join('\n')
    }
  }

  const compliance = visit?.court_compliance || {}
  const complianceLines = []
  for (const [id, v] of Object.entries(compliance)) {
    if (!v?.status) continue
    complianceLines.push(`• ${id.replace(/_/g, ' ')}: ${v.status}${v.note ? ` — ${v.note}` : ''}`)
  }

  const incidents = observations
    .filter((o) => o.severity === 'concern' || o.severity === 'critical')
    .map((o) => `[${fmtClock(o.observed_at)}] (${(o.severity || '').toUpperCase()}) ${obsText(o)}`)
    .join('\n')

  return {
    summary,
    parties: parties.join('\n'),
    observations_by_category: obsByCategory,
    court_compliance: complianceLines.join('\n') || 'No specific court order conditions were tracked for this visit.',
    incidents: incidents || 'No incidents or safety concerns were recorded during this visit.',
    assessment: '',
  }
}

/* ============================================================
   Main component
   ============================================================ */

export default function VisitReport() {
  const { id } = useParams()
  const { activeOrgId, role, user, org } = useAuth()
  const nav = useNavigate()
  const isOwner = OWNER_ROLES.includes(role)

  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [visit, setVisit] = useState(null)
  const [observations, setObservations] = useState([])
  const [report, setReport] = useState(null)
  const [mode, setMode] = useState('edit') // edit | preview
  const [toast, setToast] = useState(null)
  const [sections, setSections] = useState(null)
  const [comments, setComments] = useState([])
  const [showReviewerPanel, setShowReviewerPanel] = useState(false)
  const [reviewerNotes, setReviewerNotes] = useState('')

  useEffect(() => { if (activeOrgId) load() }, [activeOrgId, id])

  function showToast(m, kind = 'success') { setToast({ m, kind }); setTimeout(() => setToast(null), 3000) }

  async function load() {
    setLoading(true)
    try {
      const [vRes, oRes, rRes] = await Promise.all([
        supabase.from('sv_visits').select(`*,
          case:case_id(*,
            custodial:custodial_party_id(*),
            noncustodial:noncustodial_party_id(*),
            children:sv_case_children(child:child_id(id, first_name, last_name, date_of_birth))),
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
      const r = rRes.data
      setReport(r)
      if (r?.sections) {
        setSections(r.sections)
      } else {
        const initial = buildInitialSections(vRes.data, oRes.data || [])
        if (r) {
          if (r.observations) initial.observations_by_category.uncategorized = r.observations
          if (r.safety_concerns) initial.incidents = r.safety_concerns
          // Legacy `recommendations` intentionally not surfaced — monitors do not issue recommendations.
          if (r.interactions) initial.assessment = r.interactions
        }
        setSections(initial)
      }
      setReviewerNotes(r?.reviewer_notes || '')
      if (r) {
        const { data: cs } = await supabase.from('sv_report_comments').select('*')
          .eq('report_id', r.id).order('created_at', { ascending: true })
        setComments(cs || [])
      }
    } catch (e) {
      console.error('VisitReport load', e); showToast(e.message, 'error')
    } finally { setLoading(false) }
  }

  function updateSection(key, value) {
    setSections((s) => ({ ...s, [key]: value }))
  }
  function updateObservationCategory(catKey, value) {
    setSections((s) => ({
      ...s,
      observations_by_category: { ...(s.observations_by_category || {}), [catKey]: value },
    }))
  }

  function regenerate() {
    const fresh = buildInitialSections(visit, observations)
    setSections((s) => ({
      ...fresh,
      assessment: s?.assessment || '',
    }))
    showToast('Re-pulled from visit data')
  }

  async function saveDraft(silent = false) {
    setBusy(true)
    try {
      const observations_text = Object.entries(sections?.observations_by_category || {})
        .map(([k, v]) => `## ${categoryLabel(k)}\n${v || ''}`)
        .join('\n\n')
      // Monitors do not issue recommendations — never persist a recommendations
      // section. Strip any legacy key from the sections JSON before saving; the
      // dedicated `recommendations` DB column is intentionally left untouched.
      const { recommendations: _legacyRecs, ...sectionsToSave } = sections || {}
      const payload = {
        org_id: activeOrgId,
        case_id: visit.case_id,
        visit_id: visit.id,
        monitor_id: visit.monitor_id,
        report_type: 'visit_summary',
        sections: sectionsToSave,
        observations: observations_text,
        interactions: sections?.assessment || '',
        safety_concerns: sections?.incidents || '',
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
      // Track owner edits to non-draft reports
      if (report && isOwner && !monitorCanEdit) {
        payload.owner_edited_at = new Date().toISOString()
        payload.owner_edited_by = user?.id
      }
      let res
      if (report) {
        res = await supabase.from('sv_reports').update(payload).eq('id', report.id).select().single()
      } else {
        res = await supabase.from('sv_reports').insert({ ...payload, status: 'draft', created_by: user?.id }).select().single()
      }
      if (res.error) throw res.error
      setReport(res.data)
      if (!silent) showToast('Draft saved')
      return res.data
    } catch (e) { showToast(e.message, 'error'); return null }
    finally { setBusy(false) }
  }

  async function archiveReport() {
    if (!report) return
    setBusy(true)
    try {
      const { error } = await supabase.from('sv_reports').update({
        archived_at: new Date().toISOString(),
        archived_by: user?.id,
      }).eq('id', report.id)
      if (error) throw error
      showToast('Report archived')
      nav('/reports')
    } catch (e) { showToast(e.message, 'error') }
    finally { setBusy(false) }
  }

  async function deleteReport() {
    if (!report) return
    if (!window.confirm('Delete this report? This cannot be undone.')) return
    setBusy(true)
    try {
      const { error } = await supabase.from('sv_reports').update({
        deleted_at: new Date().toISOString(),
        deleted_by: user?.id,
      }).eq('id', report.id)
      if (error) throw error
      showToast('Report deleted')
      nav('/reports')
    } catch (e) { showToast(e.message, 'error') }
    finally { setBusy(false) }
  }

  async function submitForReview() {
    const saved = await saveDraft(true)
    if (!saved) return
    setBusy(true)
    try {
      const { error } = await supabase.from('sv_reports').update({
        status: 'pending_review',
        submitted_at: new Date().toISOString(),
      }).eq('id', saved.id)
      if (error) throw error
      logUsage('report_submitted', {})
      await supabase.from('sv_visits').update({ status: 'report_submitted' }).eq('id', visit.id)
      await load()
      showToast('Submitted for agency review')
    } catch (e) { showToast(e.message, 'error') }
    finally { setBusy(false) }
  }

  async function reviewAction(action) {
    if (!report) return
    setBusy(true)
    try {
      const stamp = { updated_at: new Date().toISOString() }
      if (action === 'approve') {
        stamp.status = 'approved'
        stamp.approved_at = new Date().toISOString()
        stamp.reviewer_id = user?.id
        stamp.reviewed_at = new Date().toISOString()
        stamp.reviewer_notes = reviewerNotes || null
      } else if (action === 'request_changes') {
        if (!reviewerNotes.trim()) { showToast('Add a note explaining what changes are needed', 'error'); setBusy(false); return }
        stamp.status = 'changes_requested'
        stamp.changes_requested_at = new Date().toISOString()
        stamp.reviewer_id = user?.id
        stamp.reviewer_notes = reviewerNotes
      } else if (action === 'reject') {
        if (!reviewerNotes.trim()) { showToast('Add a note explaining the rejection', 'error'); setBusy(false); return }
        stamp.status = 'rejected'
        stamp.reviewer_id = user?.id
        stamp.reviewed_at = new Date().toISOString()
        stamp.reviewer_notes = reviewerNotes
      }
      const { error } = await supabase.from('sv_reports').update(stamp).eq('id', report.id)
      if (error) throw error
      await load()
      showToast(`Report ${stamp.status.replace('_', ' ')}`)
    } catch (e) { showToast(e.message, 'error') }
    finally { setBusy(false) }
  }

  async function addSectionComment(sectionName, text) {
    if (!report || !text.trim()) return
    try {
      const { error } = await supabase.from('sv_report_comments').insert({
        org_id: activeOrgId,
        report_id: report.id,
        section_name: sectionName,
        comment: text.trim(),
        author_id: user?.id,
      })
      if (error) throw error
      const { data: cs } = await supabase.from('sv_report_comments').select('*')
        .eq('report_id', report.id).order('created_at', { ascending: true })
      setComments(cs || [])
      showToast('Comment added')
    } catch (e) { showToast(e.message, 'error') }
  }

  if (loading) return <div className="loading">Loading report…</div>
  if (!visit) return (
    <div className="empty-state" style={{ marginTop: 64 }}>
      <div className="empty-state-title">Visit not found</div>
      <Link to="/visits" className="btn btn-secondary" style={{ marginTop: 16 }}>Back to schedule</Link>
    </div>
  )

  const status = report?.status || 'draft'
  const monitorCanEdit = status === 'draft' || status === 'changes_requested'
  const isEditable = monitorCanEdit || isOwner
  const canReview = isOwner && (status === 'pending_review' || status === 'changes_requested')
  const canOwnerManage = isOwner && report && (status === 'approved' || status === 'rejected')
  const obsCategoryMap = sections?.observations_by_category || {}
  const usedCategories = OBSERVATION_CATEGORIES.filter((c) => obsCategoryMap[c.key] !== undefined)
  const unusedCategories = OBSERVATION_CATEGORIES.filter((c) => obsCategoryMap[c.key] === undefined)

  return (
    <div className="rb">
      <div className="rb-header">
        <Link to={`/visits/${visit.id}`} className="rb-back">← Back to visit</Link>
        <div className="rb-title-row">
          <h1 className="rb-title">Visit report</h1>
          <StatusBadge status={status} />
        </div>
        <div className="rb-subtitle">{visit.case?.case_number} · {fmtDate(visit.scheduled_date)}</div>
      </div>

      <div className="rb-status-flow">
        {STATUS_FLOW.map((s, i) => {
          const idx = STATUS_FLOW.findIndex((x) => x.key === status)
          const done = i < idx
          const active = i === idx
          return (
            <React.Fragment key={s.key}>
              <div className={`rb-status-step ${done ? 'done' : ''} ${active ? 'active' : ''}`}>
                <span className="rb-status-dot" />
                <span>{s.label}</span>
              </div>
              {i < STATUS_FLOW.length - 1 && <span className="rb-status-arrow">›</span>}
            </React.Fragment>
          )
        })}
      </div>

      {status === 'changes_requested' && report?.reviewer_notes && (
        <div className="rb-banner warn">
          <strong>Reviewer requested changes:</strong>
          <div style={{ marginTop: 4 }}>{report.reviewer_notes}</div>
        </div>
      )}
      {status === 'approved' && (
        <div className="rb-banner ok">
          ✓ Approved {report?.approved_at ? fmtDateTime(report.approved_at) : ''}.
        </div>
      )}
      {status === 'rejected' && report?.reviewer_notes && (
        <div className="rb-banner err">
          <strong>Rejected:</strong>
          <div style={{ marginTop: 4 }}>{report.reviewer_notes}</div>
        </div>
      )}

      <div className="rb-toolbar">
        <div className="segmented">
          <button className={`segmented-item ${mode === 'edit' ? 'active' : ''}`} onClick={() => setMode('edit')}>Edit</button>
          <button className={`segmented-item ${mode === 'preview' ? 'active' : ''}`} onClick={() => setMode('preview')}>Preview</button>
        </div>
        <div className="btn-group">
          {mode === 'edit' && monitorCanEdit && (
            <>
              <button className="btn btn-sm btn-secondary" onClick={regenerate} disabled={busy}>
                Re-pull from visit
              </button>
              <button className="btn btn-sm btn-secondary" onClick={() => saveDraft()} disabled={busy}>
                {busy ? 'Saving…' : 'Save draft'}
              </button>
              <button className="btn btn-sm btn-primary" onClick={submitForReview} disabled={busy}>
                Submit for review
              </button>
            </>
          )}
          {mode === 'preview' && (
            <button className="btn btn-sm btn-secondary" onClick={() => window.print()}>Print / PDF</button>
          )}
          {canReview && (
            <button className="btn btn-sm btn-primary" onClick={() => setShowReviewerPanel((s) => !s)}>
              {showReviewerPanel ? 'Hide review panel' : 'Review report'}
            </button>
          )}
          {canOwnerManage && (
            <>
              {mode === 'edit' && (
                <button className="btn btn-sm btn-secondary" onClick={() => saveDraft()} disabled={busy}>
                  {busy ? 'Saving…' : 'Save edits'}
                </button>
              )}
              <button className="btn btn-sm btn-secondary" onClick={archiveReport} disabled={busy}>
                Archive
              </button>
              <button className="btn btn-sm btn-danger" onClick={deleteReport} disabled={busy}>
                Delete
              </button>
            </>
          )}
        </div>
      </div>

      {report?.owner_edited_at && status === 'approved' && (
        <div className="rb-banner info">
          <strong>Owner edits:</strong> This approved report was edited by an owner on {fmtDateTime(report.owner_edited_at)}.
        </div>
      )}

      {canReview && showReviewerPanel && (
        <div className="rb-reviewer">
          <div className="rb-reviewer-head">
            <div className="rb-reviewer-title">Agency review</div>
            <div className="rb-reviewer-sub">Approve, request changes, or reject. Notes are visible to the monitor.</div>
          </div>
          <textarea
            className="form-textarea"
            rows={3}
            placeholder="Reviewer notes (required for changes or rejection)…"
            value={reviewerNotes}
            onChange={(e) => setReviewerNotes(e.target.value)}
          />
          <div className="btn-group right" style={{ marginTop: 12 }}>
            <button className="btn btn-danger" onClick={() => reviewAction('reject')} disabled={busy}>Reject</button>
            <button className="btn btn-secondary" onClick={() => reviewAction('request_changes')} disabled={busy}>Request changes</button>
            <button className="btn btn-primary" onClick={() => reviewAction('approve')} disabled={busy}>Approve</button>
          </div>
        </div>
      )}

      {mode === 'edit' && sections && (
        <div className="rb-sections">
          <Section
            title="1. Visit summary"
            sub="Auto-populated from check-in/out data"
            comments={comments.filter((c) => c.section_name === 'summary')}
            canComment={canReview}
            onComment={(t) => addSectionComment('summary', t)}
          >
            <textarea
              className="form-textarea" rows={5}
              value={sections.summary}
              disabled={!isEditable}
              onChange={(e) => updateSection('summary', e.target.value)}
            />
          </Section>

          <Section
            title="2. Parties present"
            sub="Auto-populated from arrival tracking"
            comments={comments.filter((c) => c.section_name === 'parties')}
            canComment={canReview}
            onComment={(t) => addSectionComment('parties', t)}
          >
            <textarea
              className="form-textarea" rows={4}
              value={sections.parties}
              disabled={!isEditable}
              onChange={(e) => updateSection('parties', e.target.value)}
            />
          </Section>

          <Section
            title="3. Observations"
            sub={`Grouped by category from ${observations.length} real-time entries`}
            comments={comments.filter((c) => c.section_name === 'observations')}
            canComment={canReview}
            onComment={(t) => addSectionComment('observations', t)}
          >
            {usedCategories.length === 0 && obsCategoryMap.uncategorized === undefined && (
              <div className="rb-empty">
                No observations were logged in real-time. You can still write narrative observations below.
              </div>
            )}
            {usedCategories.map((c) => (
              <div key={c.key} className="rb-obs-group">
                <div className="rb-obs-group-head">
                  <div className="rb-obs-group-title">{c.label}</div>
                </div>
                <textarea
                  className="form-textarea" rows={4}
                  value={obsCategoryMap[c.key] || ''}
                  disabled={!isEditable}
                  onChange={(e) => updateObservationCategory(c.key, e.target.value)}
                />
              </div>
            ))}
            {obsCategoryMap.uncategorized !== undefined && (
              <div className="rb-obs-group">
                <div className="rb-obs-group-head">
                  <div className="rb-obs-group-title">Uncategorized observations</div>
                </div>
                <textarea
                  className="form-textarea" rows={4}
                  value={obsCategoryMap.uncategorized || ''}
                  disabled={!isEditable}
                  onChange={(e) => updateObservationCategory('uncategorized', e.target.value)}
                />
              </div>
            )}
            {isEditable && unusedCategories.length > 0 && (
              <div className="rb-add-cat">
                <span className="rb-add-cat-label">Add category:</span>
                {unusedCategories.map((c) => (
                  <button key={c.key} type="button" className="btn btn-sm btn-secondary"
                          onClick={() => updateObservationCategory(c.key, '')}>
                    + {c.label}
                  </button>
                ))}
              </div>
            )}
          </Section>

          <Section
            title="4. Court order compliance"
            sub="Auto-populated from condition tracking"
            comments={comments.filter((c) => c.section_name === 'compliance')}
            canComment={canReview}
            onComment={(t) => addSectionComment('compliance', t)}
          >
            <textarea
              className="form-textarea" rows={4}
              value={sections.court_compliance}
              disabled={!isEditable}
              onChange={(e) => updateSection('court_compliance', e.target.value)}
            />
          </Section>

          <Section
            title="5. Incidents"
            sub="Pulled from flagged observations (concern / critical)"
            comments={comments.filter((c) => c.section_name === 'incidents')}
            canComment={canReview}
            onComment={(t) => addSectionComment('incidents', t)}
          >
            <textarea
              className="form-textarea" rows={4}
              value={sections.incidents}
              disabled={!isEditable}
              onChange={(e) => updateSection('incidents', e.target.value)}
            />
          </Section>

          <Section
            title="6. Monitor's assessment"
            sub="Your professional impression of the visit"
            comments={comments.filter((c) => c.section_name === 'assessment')}
            canComment={canReview}
            onComment={(t) => addSectionComment('assessment', t)}
          >
            <textarea
              className="form-textarea" rows={5}
              value={sections.assessment}
              disabled={!isEditable}
              onChange={(e) => updateSection('assessment', e.target.value)}
              placeholder="Use neutral, factual language. Note quality of interactions, child's apparent comfort, parent's responsiveness, etc."
            />
          </Section>

          {monitorCanEdit && (
            <div className="rb-footer-actions">
              <button className="btn btn-secondary" onClick={() => saveDraft()} disabled={busy}>
                {busy ? 'Saving…' : 'Save draft'}
              </button>
              <button className="btn btn-primary" onClick={submitForReview} disabled={busy}>
                Submit for review →
              </button>
            </div>
          )}
          {!monitorCanEdit && isOwner && (
            <div className="rb-footer-actions">
              <button className="btn btn-primary" onClick={() => saveDraft()} disabled={busy}>
                {busy ? 'Saving…' : 'Save owner edits'}
              </button>
            </div>
          )}
        </div>
      )}

      {mode === 'preview' && sections && (
        <ReportPreview visit={visit} report={report} sections={sections} status={status} orgState={org?.address_state} />
      )}

      {toast && <div className={`toast ${toast.kind === 'error' ? 'error' : ''}`}>{toast.m}</div>}
    </div>
  )
}

function Section({ title, sub, children, comments, canComment, onComment }) {
  const [showCmt, setShowCmt] = useState(false)
  const [newCmt, setNewCmt] = useState('')
  return (
    <div className="rb-section">
      <div className="rb-section-head">
        <div>
          <div className="rb-section-title">{title}</div>
          {sub && <div className="rb-section-sub">{sub}</div>}
        </div>
        {(comments?.length > 0 || canComment) && (
          <button type="button" className="rb-section-cmt-toggle" onClick={() => setShowCmt((s) => !s)}>
            💬 {comments?.length || 0}
          </button>
        )}
      </div>
      {children}
      {showCmt && (
        <div className="rb-comments">
          {comments?.map((c) => (
            <div key={c.id} className="rb-comment">
              <div className="rb-comment-meta">{fmtDateTime(c.created_at)}</div>
              <div className="rb-comment-text">{c.comment}</div>
            </div>
          ))}
          {canComment && (
            <div className="rb-comment-form">
              <input
                type="text"
                className="form-input rb-comment-input"
                placeholder="Comment on this section…"
                value={newCmt}
                onChange={(e) => setNewCmt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newCmt.trim()) { onComment(newCmt); setNewCmt('') }
                }}
              />
              <button className="btn btn-sm btn-secondary" onClick={() => { if (newCmt.trim()) { onComment(newCmt); setNewCmt('') } }}>
                Add
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
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
  }
  const m = map[status] || map.draft
  return <span className={`rb-status-badge tone-${m.tone}`}>{m.label}</span>
}

function ReportPreview({ visit, report, sections, status, orgState }) {
  const c = visit.case
  return (
    <div className="rb-preview" id="report-print">
      <h1>Supervised Visitation Report</h1>
      <div className="rb-preview-meta">
        Case {c?.case_number} · Visit date {fmtDate(visit.scheduled_date)}
      </div>

      <div className="rb-preview-kv">
        <div className="k">Case number</div><div>{c?.case_number}</div>
        <div className="k">Court</div><div>{c?.court_name || '—'}</div>
        <div className="k">Custodial party</div><div>{c?.custodial ? `${c.custodial.first_name} ${c.custodial.last_name}` : '—'}</div>
        <div className="k">Noncustodial party</div><div>{c?.noncustodial ? `${c.noncustodial.first_name} ${c.noncustodial.last_name}` : '—'}</div>
        <div className="k">Provider</div><div>{visit.monitor ? `${visit.monitor.first_name} ${visit.monitor.last_name}` : '—'}</div>
        <div className="k">Visit date</div><div>{fmtDate(visit.scheduled_date)}</div>
        <div className="k">Scheduled</div><div>{fmtTime(visit.scheduled_start_time)} – {fmtTime(visit.scheduled_end_time)}</div>
        <div className="k">Actual duration</div><div>{visit.actual_duration_minutes ? `${visit.actual_duration_minutes} minutes` : '—'}</div>
        <div className="k">Location</div><div>{visit.location || '—'}</div>
      </div>

      <h2>1. Visit summary</h2>
      <p>{sections.summary || '—'}</p>

      <h2>2. Parties present</h2>
      <p style={{ whiteSpace: 'pre-wrap' }}>{sections.parties || '—'}</p>

      <h2>3. Observations</h2>
      {OBSERVATION_CATEGORIES.map((c) => {
        const text = sections.observations_by_category?.[c.key]
        if (!text) return null
        return (
          <div key={c.key}>
            <h3>{c.label}</h3>
            <p style={{ whiteSpace: 'pre-wrap' }}>{text}</p>
          </div>
        )
      })}
      {sections.observations_by_category?.uncategorized && (
        <div>
          <h3>Additional observations</h3>
          <p style={{ whiteSpace: 'pre-wrap' }}>{sections.observations_by_category.uncategorized}</p>
        </div>
      )}

      <h2>4. Court order compliance</h2>
      <p style={{ whiteSpace: 'pre-wrap' }}>{sections.court_compliance || '—'}</p>

      <h2>5. Incidents</h2>
      <p style={{ whiteSpace: 'pre-wrap' }}>{sections.incidents || 'No incidents recorded.'}</p>

      <h2>6. Monitor's assessment</h2>
      <p style={{ whiteSpace: 'pre-wrap' }}>{sections.assessment || '—'}</p>

      <div className="rb-preview-foot">
        Report status: <strong>{status.replace('_', ' ')}</strong>
        {report?.submitted_at && <> · Submitted {fmtDate(report.submitted_at)}</>}
        {report?.approved_at && <> · Approved {fmtDate(report.approved_at)}</>}
        <br />
        {orgState === 'CA'
          ? 'Provided per California Rule of Court 5.20. This document contains confidential information protected by Family Code §3110.5.'
          : `${complianceLine(orgState)} This document contains confidential information — handle per the court order and applicable law.`}
      </div>
    </div>
  )
}
