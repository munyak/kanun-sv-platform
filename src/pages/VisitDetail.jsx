import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../supabase'
import { useAuth } from '../auth/AuthContext'
import VisitPhotos from '../components/VisitPhotos'
import VoiceRecorder from '../components/VoiceRecorder'
import { useGpsTracker, GpsStatusBar } from '../components/GpsTracker'
import QuickFlags from '../components/QuickFlags'
import { readGeolocation } from '../lib/visitPhotos'

/* ============================================================
   Guided monitor visit workflow
   ------------------------------------------------------------
   Phases (mobile-first, one phase visible at a time):
     1. Pre-visit  — review case, run pre-flight checklist, "I'm on my way"
     2. Check-in   — capture arrival, who is present, environment
     3. Active     — real-time observation log + court-order compliance
     4. Check-out  — departure checklist + summary
     5. Report     — link out to /visits/:id/report (separate page)
     6. Submitted  — read-only summary
   ============================================================ */

const PHASES = [
  { key: 'preflight',  label: 'Pre-visit', short: 'Pre' },
  { key: 'arrival',    label: 'Check-in',  short: 'In'  },
  { key: 'active',     label: 'Visit',     short: 'Visit' },
  { key: 'closeout',   label: 'Check-out', short: 'Out' },
  { key: 'report',     label: 'Report',    short: 'Report' },
  { key: 'review',     label: 'Review',    short: 'Review' },
]

const OBSERVATION_CATEGORIES = [
  { key: 'parent_child_interaction', label: 'Parent–Child Interaction', tone: 'moss' },
  { key: 'communication',            label: 'Communication',            tone: 'blue' },
  { key: 'positive_observation',     label: 'Positive',                 tone: 'green' },
  { key: 'behavioral_note',          label: 'Behavioral',               tone: 'yellow' },
  { key: 'safety_concern',           label: 'Safety Concern',           tone: 'orange' },
  { key: 'incident',                 label: 'Incident',                 tone: 'red' },
]

const SEVERITIES = [
  { key: 'normal',   label: 'Normal',   tone: 'gray' },
  { key: 'concern',  label: 'Concern',  tone: 'orange' },
  { key: 'critical', label: 'Critical', tone: 'red' },
]

const QUICK_TEMPLATES = [
  { category: 'parent_child_interaction', severity: 'normal',  text: 'Parent arrived on time and greeted child warmly.' },
  { category: 'positive_observation',     severity: 'normal',  text: 'Child appeared comfortable and engaged with the parent.' },
  { category: 'positive_observation',     severity: 'normal',  text: 'Appropriate physical affection observed (hug, hand-holding).' },
  { category: 'parent_child_interaction', severity: 'normal',  text: 'Age-appropriate activity engaged in together.' },
  { category: 'communication',            severity: 'normal',  text: 'Parent and child communicated calmly throughout.' },
  { category: 'behavioral_note',          severity: 'concern', text: 'Child appeared withdrawn at start of visit.' },
  { category: 'safety_concern',           severity: 'concern', text: 'Verbal conflict between parties observed.' },
  { category: 'safety_concern',           severity: 'concern', text: 'Court case discussed in front of child — redirected.' },
  { category: 'incident',                 severity: 'critical',text: 'Inappropriate contact or language — visit interrupted.' },
  { category: 'positive_observation',     severity: 'normal',  text: 'Visit ended without incident.' },
]

const PREFLIGHT_ITEMS = [
  { key: 'court_order_reviewed',  label: 'I have reviewed the court order and special conditions.' },
  { key: 'id_ready',              label: 'I have my photo ID with me.' },
  { key: 'device_charged',        label: 'My device is charged (>40%).' },
  { key: 'familiar_with_case',    label: 'I am familiar with the case background and risk factors.' },
  { key: 'know_location',         label: 'I know the visit location and travel time.' },
  { key: 'agency_contact',        label: 'I have my agency contact for emergencies.' },
]

const DEPARTURE_ITEMS = [
  { key: 'all_parties_departed',    label: 'All parties have departed the location.' },
  { key: 'child_with_custodial',    label: 'Child is safely with the custodial parent.' },
  { key: 'staggered_departure',     label: 'Staggered departure was maintained (if required).' },
  { key: 'no_outstanding_incidents',label: 'No outstanding incidents require immediate escalation.' },
  { key: 'location_secured',        label: 'Visit location is secured / cleared.' },
]

/* ----------------- helpers ----------------- */

function fmtTime(t) {
  if (!t) return ''
  const [h, m] = String(t).split(':')
  const d = new Date(); d.setHours(Number(h), Number(m), 0, 0)
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}
function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}
function fmtClock(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}
function fmtRelative(ts) {
  if (!ts) return ''
  const diff = Date.now() - new Date(ts).getTime()
  const s = Math.floor(diff / 1000)
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  return `${h}h ${m % 60}m ago`
}
function fmtDuration(ms) {
  if (ms == null || ms < 0) ms = 0
  const total = Math.floor(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

// Geolocation reader lives in lib/visitPhotos so it can be reused by the
// photo uploader. Same `{lat, lng, accuracy}` shape used here.
const tryGetPosition = readGeolocation

function derivePhase(visit, report) {
  if (!visit) return 'preflight'
  if (report?.status && report.status !== 'draft') return 'review'
  if (visit.checked_out_at) return report ? 'report' : 'closeout'
  if (visit.status === 'in_progress') return 'active'
  if (visit.status === 'checked_in') return 'arrival'
  return 'preflight'
}

function categoryMeta(key) {
  return OBSERVATION_CATEGORIES.find((c) => c.key === key) || OBSERVATION_CATEGORIES[0]
}
function severityMeta(key) {
  return SEVERITIES.find((s) => s.key === key) || SEVERITIES[0]
}

function deriveCourtConditions(c) {
  if (!c) return []
  const items = []
  if (c.gifts_permitted === false)            items.push({ id: 'no_gifts',          label: 'No unauthorized gifts allowed' })
  if (c.photography_permitted === false)      items.push({ id: 'no_photography',    label: 'No photography or recording allowed' })
  if (c.physical_contact_permitted === false) items.push({ id: 'no_physical',       label: 'No physical contact allowed' })
  if (c.staggered_arrival)                    items.push({ id: 'staggered_arrival', label: `Staggered arrival required (${c.stagger_minutes || 15}m)` })
  if (c.special_conditions)                   items.push({ id: 'special',           label: c.special_conditions })
  if (Array.isArray(c.approved_activities) && c.approved_activities.length) {
    items.push({ id: 'approved_activities',   label: `Approved activities only: ${c.approved_activities.join(', ')}` })
  }
  return items
}

/* ============================================================
   Main page
   ============================================================ */

export default function VisitDetail() {
  const { id } = useParams()
  const { activeOrgId, role, user } = useAuth()
  const isMonitor = role === 'monitor'
  const nav = useNavigate()

  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [visit, setVisit] = useState(null)
  const [observations, setObservations] = useState([])
  const [report, setReport] = useState(null)
  const [myMonitorId, setMyMonitorId] = useState(null)
  const [toast, setToast] = useState(null)

  useEffect(() => {
    if (!isMonitor || !activeOrgId || !user) { setMyMonitorId(null); return }
    supabase.from('sv_monitors').select('id')
      .eq('org_id', activeOrgId).eq('user_id', user.id).maybeSingle()
      .then(({ data }) => setMyMonitorId(data?.id || null))
  }, [isMonitor, activeOrgId, user?.id])

  useEffect(() => { if (activeOrgId) load() }, [activeOrgId, id])

  function showToast(m, kind = 'success') { setToast({ m, kind }); setTimeout(() => setToast(null), 3000) }

  async function load() {
    setLoading(true)
    try {
      const [vRes, oRes, rRes] = await Promise.all([
        supabase.from('sv_visits').select('*').eq('id', id).eq('org_id', activeOrgId).maybeSingle(),
        supabase.from('sv_visit_observations').select('*').eq('visit_id', id).order('observed_at', { ascending: true }),
        supabase.from('sv_reports').select('*').eq('visit_id', id).maybeSingle(),
      ])
      if (vRes.error) throw vRes.error
      const visit = vRes.data
      if (visit && visit.case_id) {
        const { data: caseData } = await supabase.from('sv_cases').select('*').eq('id', visit.case_id).maybeSingle()
        if (caseData) {
          const [cpRes, npRes, chRes, monRes] = await Promise.all([
            caseData.custodial_party_id ? supabase.from('sv_parties').select('first_name, last_name, phone, email').eq('id', caseData.custodial_party_id).maybeSingle() : { data: null },
            caseData.noncustodial_party_id ? supabase.from('sv_parties').select('first_name, last_name, phone, email').eq('id', caseData.noncustodial_party_id).maybeSingle() : { data: null },
            supabase.from('sv_case_children').select('child_id').eq('case_id', caseData.id),
            visit.monitor_id ? supabase.from('sv_monitors').select('id, first_name, last_name').eq('id', visit.monitor_id).maybeSingle() : { data: null },
          ])
          caseData.custodial = cpRes.data
          caseData.noncustodial = npRes.data
          const childIds = (chRes.data || []).map(c => c.child_id).filter(Boolean)
          if (childIds.length) {
            const { data: kids } = await supabase.from('sv_children').select('id, first_name, last_name, date_of_birth').in('id', childIds)
            caseData.children = (kids || []).map(k => ({ child: k }))
          } else { caseData.children = [] }
          visit.case = caseData
          visit.monitor = monRes.data
        }
      }
      setVisit(visit)
      setObservations(oRes.data || [])
      setReport(rRes.data || null)
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
      return true
    } catch (e) { showToast(e.message, 'error'); return false }
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

  const phase = derivePhase(visit, report)
  const phaseIdx = PHASES.findIndex((p) => p.key === phase)
  const courtConditions = deriveCourtConditions(visit.case)

  return (
    <div className="vw">
      {/* Header */}
      <div className="vw-header">
        <Link to="/visits" className="vw-back">← Schedule</Link>
        <div className="vw-title-row">
          <h1 className="vw-title">{visit.case?.case_number || 'Visit'}</h1>
          <PhaseTag phase={phase} />
        </div>
        <div className="vw-subtitle">
          {fmtDate(visit.scheduled_date)} · {fmtTime(visit.scheduled_start_time)} – {fmtTime(visit.scheduled_end_time)}
          {visit.location ? ` · ${visit.location}` : ''}
        </div>
      </div>

      {/* Step indicator */}
      <div className="vw-stepper" role="tablist" aria-label="Visit workflow">
        {PHASES.map((p, i) => {
          const done = i < phaseIdx
          const active = i === phaseIdx
          return (
            <div key={p.key} className={`vw-step ${done ? 'done' : ''} ${active ? 'active' : ''}`}>
              <div className="vw-step-circle">{done ? '✓' : i + 1}</div>
              <div className="vw-step-label">{p.label}</div>
            </div>
          )
        })}
      </div>

      {/* Phase content */}
      {phase === 'preflight' && (
        <PreflightPhase
          visit={visit}
          busy={busy}
          courtConditions={courtConditions}
          onSaveChecklist={(items) => patchVisit({ pre_visit_checklist: items })}
          onOnMyWay={async () => {
            const ok = await patchVisit({ on_my_way_time: new Date().toISOString() })
            if (ok) showToast('Departure logged · safe travels')
          }}
          onCheckIn={async () => {
            const pos = await tryGetPosition()
            const ok = await patchVisit({
              status: 'checked_in',
              checked_in_at: new Date().toISOString(),
              checkin_lat: pos?.lat ?? null,
              checkin_lng: pos?.lng ?? null,
              checkin_accuracy_m: pos?.accuracy ?? null,
              checkin_monitor_id: visit.monitor_id,
            })
            if (ok) showToast(pos ? `Checked in · GPS ±${Math.round(pos.accuracy || 0)}m` : 'Checked in')
          }}
        />
      )}

      {phase === 'arrival' && (
        <ArrivalPhase
          visit={visit}
          busy={busy}
          onSavePartiesPresent={(parties) => patchVisit({ parties_present: parties })}
          onSaveArrivalNotes={(notes) => patchVisit({ arrival_notes: notes })}
          onPartyArrival={(role, ts) => {
            const patch = role === 'custodial'
              ? { custodial_arrival_time: ts }
              : { noncustodial_arrival_time: ts }
            return patchVisit(patch)
          }}
          onBegin={async () => {
            const ok = await patchVisit({
              status: 'in_progress',
              actual_start_time: visit.actual_start_time || new Date().toISOString(),
            })
            if (ok) showToast('Visit started')
          }}
        />
      )}

      {phase === 'active' && (
        <ActivePhase
          visit={visit}
          observations={observations}
          courtConditions={courtConditions}
          busy={busy}
          orgId={activeOrgId}
          userId={user?.id}
          onPhotoError={(m) => showToast(m, 'error')}
          onAddObservation={async (entry) => {
            try {
              const { error } = await supabase.from('sv_visit_observations').insert({
                org_id: activeOrgId,
                visit_id: visit.id,
                monitor_id: visit.monitor_id,
                observed_at: new Date().toISOString(),
                ...entry,
              })
              if (error) throw error
              await load()
              if (entry.severity === 'critical') showToast('⚠ Critical incident logged', 'error')
              return true
            } catch (e) { showToast(e.message, 'error'); return false }
          }}
          onSaveCompliance={(c) => patchVisit({ court_compliance: c })}
          onCheckOut={async () => {
            const pos = await tryGetPosition()
            const now = new Date()
            const start = visit.actual_start_time
              ? new Date(visit.actual_start_time)
              : (visit.checked_in_at ? new Date(visit.checked_in_at) : null)
            const minutes = start ? Math.round((now - start) / 60000) : null
            const ok = await patchVisit({
              status: 'report_pending',
              checked_out_at: now.toISOString(),
              actual_end_time: now.toISOString(),
              checkout_lat: pos?.lat ?? null,
              checkout_lng: pos?.lng ?? null,
              checkout_accuracy_m: pos?.accuracy ?? null,
              actual_duration_minutes: minutes,
            })
            if (ok) showToast('Visit ended · time to wrap up')
          }}
        />
      )}

      {phase === 'closeout' && (
        <CloseoutPhase
          visit={visit}
          observations={observations}
          busy={busy}
          orgId={activeOrgId}
          userId={user?.id}
          onPhotoError={(m) => showToast(m, 'error')}
          onSaveChecklist={(items) => patchVisit({ departure_checklist: items })}
          onPartyDeparture={(role, ts) => {
            const patch = role === 'custodial'
              ? { custodial_departure_time: ts }
              : { noncustodial_departure_time: ts }
            return patchVisit(patch)
          }}
          onSaveDepartureNotes={(notes) => patchVisit({ departure_notes: notes })}
          onWriteReport={() => nav(`/visits/${visit.id}/report`)}
        />
      )}

      {phase === 'report' && (
        <ReportInProgressPhase
          visit={visit}
          report={report}
          onContinue={() => nav(`/visits/${visit.id}/report`)}
        />
      )}

      {phase === 'review' && (
        <SubmittedPhase
          visit={visit}
          report={report}
          observations={observations}
          orgId={activeOrgId}
          userId={user?.id}
          onView={() => nav(`/visits/${visit.id}/report`)}
        />
      )}

      {toast && <div className={`toast ${toast.kind === 'error' ? 'error' : ''}`}>{toast.m}</div>}
    </div>
  )
}

/* ============================================================
   Tiny pieces
   ============================================================ */

function PhaseTag({ phase }) {
  const map = {
    preflight: { tone: 'gray',   label: 'Pre-visit' },
    arrival:   { tone: 'blue',   label: 'Checked in' },
    active:    { tone: 'moss',   label: 'In progress' },
    closeout:  { tone: 'yellow', label: 'Wrapping up' },
    report:    { tone: 'yellow', label: 'Report draft' },
    review:    { tone: 'moss',   label: 'Submitted' },
  }
  const m = map[phase] || map.preflight
  return <span className={`vw-phase-tag tone-${m.tone}`}>{m.label}</span>
}

function ChecklistRow({ checked, onToggle, children }) {
  return (
    <label className={`vw-check-row ${checked ? 'checked' : ''}`}>
      <span className="vw-check-box" aria-hidden="true">
        <input type="checkbox" checked={!!checked} onChange={onToggle} />
        <span className="vw-check-mark">{checked ? '✓' : ''}</span>
      </span>
      <span className="vw-check-label">{children}</span>
    </label>
  )
}

function StickyAction({ children }) {
  return <div className="vw-sticky-action">{children}</div>
}

function InfoTile({ label, value, mono }) {
  return (
    <div className="vw-tile">
      <div className="vw-tile-label">{label}</div>
      <div className={`vw-tile-value ${mono ? 'mono' : ''}`}>{value || '—'}</div>
    </div>
  )
}

/* ============================================================
   Phase 1 — Pre-visit
   ============================================================ */

function PreflightPhase({ visit, busy, courtConditions, onSaveChecklist, onOnMyWay, onCheckIn }) {
  const initial = (visit.pre_visit_checklist || {})
  const [items, setItems] = useState(initial)

  const saveTimer = useRef(null)
  function toggle(key) {
    const next = { ...items, [key]: !items[key] }
    setItems(next)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => onSaveChecklist(next), 500)
  }

  const allChecked = PREFLIGHT_ITEMS.every((i) => items[i.key])
  const c = visit.case
  const childrenList = (c?.children || []).map((cc) => cc.child).filter(Boolean)

  return (
    <div className="vw-body">
      <div className="vw-card">
        <div className="vw-card-head">
          <div className="vw-card-title">Case briefing</div>
          <div className="vw-card-sub">Review before you arrive</div>
        </div>
        <div className="vw-tiles">
          <InfoTile label="Case number" value={c?.case_number} mono />
          <InfoTile label="Court" value={c?.court_name} />
          <InfoTile label="Custodial party" value={c?.custodial ? `${c.custodial.first_name} ${c.custodial.last_name}` : '—'} />
          <InfoTile label="Noncustodial party" value={c?.noncustodial ? `${c.noncustodial.first_name} ${c.noncustodial.last_name}` : '—'} />
          <InfoTile label="Visit date" value={fmtDate(visit.scheduled_date)} />
          <InfoTile label="Scheduled" value={`${fmtTime(visit.scheduled_start_time)} – ${fmtTime(visit.scheduled_end_time)}`} />
          <InfoTile label="Location" value={visit.location || c?.preferred_location} />
          <InfoTile label="Risk level" value={c?.risk_level ? c.risk_level.toUpperCase() : '—'} />
        </div>

        {childrenList.length > 0 && (
          <div className="vw-section">
            <div className="vw-section-title">Children expected ({childrenList.length})</div>
            <div className="vw-chip-row">
              {childrenList.map((ch) => (
                <span key={ch.id} className="vw-info-chip">{ch.first_name} {ch.last_name}</span>
              ))}
            </div>
          </div>
        )}

        {(c?.special_conditions || courtConditions.length > 0) && (
          <div className="vw-section">
            <div className="vw-section-title">Special conditions / court order</div>
            {c?.special_conditions && (
              <div className="vw-note">{c.special_conditions}</div>
            )}
            {courtConditions.length > 0 && (
              <ul className="vw-condition-list">
                {courtConditions.map((cc) => (
                  <li key={cc.id}><span className="vw-condition-dot" />{cc.label}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {(c?.history_domestic_violence || c?.history_substance_abuse || c?.history_weapons || c?.has_protective_order) && (
          <div className="vw-warning">
            <strong>Risk factors on file:</strong>
            <ul>
              {c.has_protective_order && <li>Active protective order</li>}
              {c.history_domestic_violence && <li>History of domestic violence</li>}
              {c.history_substance_abuse && <li>History of substance abuse</li>}
              {c.history_weapons && <li>History of weapons</li>}
              {c.has_sexual_abuse_allegations && <li>Sexual abuse allegations</li>}
            </ul>
          </div>
        )}
      </div>

      <div className="vw-card">
        <div className="vw-card-head">
          <div className="vw-card-title">Pre-visit checklist</div>
          <div className="vw-card-sub">{Object.values(items).filter(Boolean).length} of {PREFLIGHT_ITEMS.length} complete</div>
        </div>
        <div className="vw-check-list">
          {PREFLIGHT_ITEMS.map((it) => (
            <ChecklistRow key={it.key} checked={!!items[it.key]} onToggle={() => toggle(it.key)}>
              {it.label}
            </ChecklistRow>
          ))}
        </div>
      </div>

      <StickyAction>
        {!visit.on_my_way_time ? (
          <button className="btn btn-secondary btn-xl" onClick={onOnMyWay} disabled={busy}>
            I'm on my way
          </button>
        ) : (
          <div className="vw-status-chip">
            <span className="vw-status-dot" /> En route since {fmtClock(visit.on_my_way_time)}
          </div>
        )}
        <button
          className="btn btn-primary btn-xl"
          onClick={onCheckIn}
          disabled={busy || !allChecked}
          title={!allChecked ? 'Complete the checklist first' : ''}
        >
          Check in at location →
        </button>
      </StickyAction>
    </div>
  )
}

/* ============================================================
   Phase 2 — Arrival
   ============================================================ */

function ArrivalPhase({ visit, busy, onSavePartiesPresent, onSaveArrivalNotes, onPartyArrival, onBegin }) {
  const c = visit.case
  const [parties, setParties] = useState(visit.parties_present || {})
  const [notes, setNotes] = useState(visit.arrival_notes || '')
  const saveTimer = useRef(null)

  function togglePartyPresent(key) {
    const next = { ...parties, [key]: !parties[key] }
    setParties(next)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => onSavePartiesPresent(next), 400)
  }

  function saveNotes(v) {
    setNotes(v)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => onSaveArrivalNotes(v), 600)
  }

  const childrenList = (c?.children || []).map((cc) => cc.child).filter(Boolean)

  return (
    <div className="vw-body">
      <div className="vw-card">
        <div className="vw-card-head">
          <div className="vw-card-title">Checked in</div>
          <div className="vw-card-sub">{fmtClock(visit.checked_in_at)} · {fmtRelative(visit.checked_in_at)}</div>
        </div>
        <div className="vw-tiles">
          <InfoTile label="Location" value={visit.location || c?.preferred_location} />
          {(visit.checkin_lat && visit.checkin_lng) && (
            <InfoTile
              label={visit.checkin_accuracy_m ? `GPS ±${Math.round(visit.checkin_accuracy_m)}m` : 'GPS'}
              value={`${Number(visit.checkin_lat).toFixed(4)}, ${Number(visit.checkin_lng).toFixed(4)}`}
              mono
            />
          )}
        </div>
      </div>

      <div className="vw-card">
        <div className="vw-card-head">
          <div className="vw-card-title">Party arrival</div>
          <div className="vw-card-sub">Tap to mark each party present</div>
        </div>
        <div className="vw-party-list">
          <PartyArrivalRow
            label="Custodial parent"
            name={c?.custodial ? `${c.custodial.first_name} ${c.custodial.last_name}` : 'Custodial parent'}
            arrivalTime={visit.custodial_arrival_time}
            onArrived={() => onPartyArrival('custodial', new Date().toISOString())}
            onUndo={() => onPartyArrival('custodial', null)}
            disabled={busy}
          />
          <PartyArrivalRow
            label="Noncustodial parent"
            name={c?.noncustodial ? `${c.noncustodial.first_name} ${c.noncustodial.last_name}` : 'Noncustodial parent'}
            arrivalTime={visit.noncustodial_arrival_time}
            onArrived={() => onPartyArrival('noncustodial', new Date().toISOString())}
            onUndo={() => onPartyArrival('noncustodial', null)}
            disabled={busy}
          />
        </div>

        {childrenList.length > 0 && (
          <div className="vw-section">
            <div className="vw-section-title">Children present</div>
            <div className="vw-chip-row">
              {childrenList.map((ch) => (
                <button
                  key={ch.id}
                  type="button"
                  className={`vw-chip-toggle ${parties[`child_${ch.id}`] ? 'on' : ''}`}
                  onClick={() => togglePartyPresent(`child_${ch.id}`)}
                >
                  {parties[`child_${ch.id}`] ? '✓ ' : ''}{ch.first_name} {ch.last_name}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="vw-section">
          <div className="vw-section-title">Other present</div>
          <div className="vw-chip-row">
            {['Attorney', 'Therapist', 'Interpreter', 'Other monitor', 'Family member'].map((label) => {
              const k = `other_${label.toLowerCase().replace(/\s+/g, '_')}`
              return (
                <button
                  key={k}
                  type="button"
                  className={`vw-chip-toggle ${parties[k] ? 'on' : ''}`}
                  onClick={() => togglePartyPresent(k)}
                >
                  {parties[k] ? '✓ ' : ''}{label}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      <div className="vw-card">
        <div className="vw-card-head">
          <div className="vw-card-title">Arrival notes</div>
          <div className="vw-card-sub">Environment, immediate concerns</div>
        </div>
        <textarea
          className="form-textarea vw-textarea"
          rows={4}
          value={notes}
          onChange={(e) => saveNotes(e.target.value)}
          placeholder="Setting, mood at arrival, anything unusual…"
        />
      </div>

      <StickyAction>
        <button
          className="btn btn-primary btn-xl"
          onClick={onBegin}
          disabled={busy || !visit.custodial_arrival_time || !visit.noncustodial_arrival_time}
          title={!visit.custodial_arrival_time || !visit.noncustodial_arrival_time ? 'Mark both parties arrived first' : ''}
        >
          Begin visit →
        </button>
      </StickyAction>
    </div>
  )
}

function PartyArrivalRow({ label, name, arrivalTime, onArrived, onUndo, disabled }) {
  return (
    <div className={`vw-party-row ${arrivalTime ? 'arrived' : ''}`}>
      <div className="vw-party-info">
        <div className="vw-party-label">{label}</div>
        <div className="vw-party-name">{name}</div>
      </div>
      {arrivalTime ? (
        <div className="vw-party-action">
          <div className="vw-party-time">Arrived {fmtClock(arrivalTime)}</div>
          <button className="vw-party-undo" onClick={onUndo} disabled={disabled}>Undo</button>
        </div>
      ) : (
        <button className="btn btn-primary btn-sm vw-party-mark" onClick={onArrived} disabled={disabled}>
          Mark arrived
        </button>
      )}
    </div>
  )
}

/* ============================================================
   Phase 3 — Active monitoring
   ============================================================ */

function ActivePhase({ visit, observations, courtConditions, busy, onAddObservation, onSaveCompliance, onCheckOut, orgId, userId, onPhotoError }) {
  const startedAt = visit.actual_start_time || visit.checked_in_at
  const [now, setNow] = useState(Date.now())
  const gps = useGpsTracker(30000)

  useEffect(() => {
    if (!gps.tracking) gps.startTracking()
    return () => { gps.stopTracking() }
  }, [])
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  const elapsedMs = startedAt ? now - new Date(startedAt).getTime() : 0

  const [showCompliance, setShowCompliance] = useState(false)
  const compliance = visit.court_compliance || {}
  function setComplianceFor(id, status) {
    onSaveCompliance({ ...compliance, [id]: { ...(compliance[id] || {}), status, observed_at: new Date().toISOString() } })
  }
  function setComplianceNote(id, note) {
    onSaveCompliance({ ...compliance, [id]: { ...(compliance[id] || {}), note } })
  }

  return (
    <div className="vw-body">
      {/* Timer */}
      <div className="vw-timer-card">
        <div className="vw-timer-label">Visit duration</div>
        <div className="vw-timer-value">{fmtDuration(elapsedMs)}</div>
        <div className="vw-timer-sub">
          Started {fmtClock(startedAt)} · {observations.length} observation{observations.length === 1 ? '' : 's'}
        </div>
      </div>

      {/* Court order compliance (collapsible) */}
      {courtConditions.length > 0 && (
        <div className="vw-card">
          <button
            type="button"
            className="vw-collapse-head"
            onClick={() => setShowCompliance((s) => !s)}
            aria-expanded={showCompliance}
          >
            <div>
              <div className="vw-card-title">Court order conditions</div>
              <div className="vw-card-sub">
                {Object.values(compliance).filter((v) => v?.status).length} of {courtConditions.length} marked
              </div>
            </div>
            <span className="vw-collapse-chevron">{showCompliance ? '▾' : '▸'}</span>
          </button>
          {showCompliance && (
            <div className="vw-condition-tracker">
              {courtConditions.map((cc) => {
                const cur = compliance[cc.id] || {}
                return (
                  <div key={cc.id} className="vw-condition-row">
                    <div className="vw-condition-label">{cc.label}</div>
                    <div className="vw-condition-actions">
                      {['observed', 'complied', 'violated'].map((s) => (
                        <button
                          key={s}
                          type="button"
                          className={`vw-condition-btn ${cur.status === s ? `active ${s}` : ''}`}
                          onClick={() => setComplianceFor(cc.id, cur.status === s ? null : s)}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                    {cur.status && (
                      <input
                        type="text"
                        className="vw-condition-note"
                        placeholder="Optional note"
                        defaultValue={cur.note || ''}
                        onBlur={(e) => setComplianceNote(cc.id, e.target.value)}
                      />
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Observation log (chat-style) */}
      <div className="vw-feed">
        {observations.length === 0 ? (
          <div className="vw-feed-empty">
            <div className="vw-feed-empty-title">No observations yet</div>
            <div className="vw-feed-empty-sub">Tap a template below or write your own. Each entry is timestamped automatically.</div>
          </div>
        ) : (
          observations.map((o) => <ObservationItem key={o.id} obs={o} />)
        )}
      </div>

      {/* Photo evidence */}
      <div className="vw-card">
        <div className="vw-card-head">
          <div className="vw-card-title">Photo evidence</div>
          <div className="vw-card-sub">Setting, parties, anything noteworthy</div>
        </div>
        <VisitPhotos
          orgId={orgId}
          visitId={visit.id}
          monitorId={visit.monitor_id}
          userId={userId}
          onError={onPhotoError}
        />
      </div>

      {/* GPS tracking status */}
      <GpsStatusBar tracking={gps.tracking} track={gps.track} currentPosition={gps.currentPosition} error={gps.error} />

      {/* Quick incident flags */}
      <QuickFlags onFlag={onAddObservation} busy={busy} />

      {/* Composer with voice input */}
      <ObservationComposer onSubmit={onAddObservation} busy={busy} />

      <StickyAction>
        <button className="btn btn-danger btn-xl vw-end-btn" onClick={onCheckOut} disabled={busy}>
          End visit
        </button>
      </StickyAction>
    </div>
  )
}

function ObservationItem({ obs }) {
  const cat = obs.category ? categoryMeta(obs.category) : null
  const sev = obs.severity ? severityMeta(obs.severity) : null
  const text = obs.description
    || obs.notes
    || obs.parent_interaction
    || obs.child_behavior
    || obs.safety_concerns
    || obs.environment
    || ''
  return (
    <div className={`vw-obs ${sev ? `sev-${sev.key}` : ''}`}>
      <div className="vw-obs-head">
        <div className="vw-obs-chips">
          {cat && <span className={`vw-cat-chip tone-${cat.tone}`}>{cat.label}</span>}
          {sev && sev.key !== 'normal' && (
            <span className={`vw-sev-chip tone-${sev.tone}`}>
              {sev.key === 'critical' && '⚠ '}{sev.label}
            </span>
          )}
        </div>
        <div className="vw-obs-time">{fmtClock(obs.observed_at)}</div>
      </div>
      <div className="vw-obs-text">{text}</div>
    </div>
  )
}

function ObservationComposer({ onSubmit, busy }) {
  const [text, setText] = useState('')
  const [category, setCategory] = useState('parent_child_interaction')
  const [severity, setSeverity] = useState('normal')
  const [showTemplates, setShowTemplates] = useState(false)
  const textareaRef = useRef(null)

  async function submit() {
    if (!text.trim()) return
    const ok = await onSubmit({
      category, severity, description: text.trim(),
    })
    if (ok) {
      setText('')
      setSeverity('normal')
    }
  }

  function applyTemplate(t) {
    setCategory(t.category)
    setSeverity(t.severity)
    setText(t.text)
    setShowTemplates(false)
    setTimeout(() => textareaRef.current?.focus(), 0)
  }

  return (
    <div className="vw-composer">
      <div className="vw-composer-tabs">
        {OBSERVATION_CATEGORIES.map((c) => (
          <button
            key={c.key}
            type="button"
            className={`vw-cat-pick tone-${c.tone} ${category === c.key ? 'active' : ''}`}
            onClick={() => setCategory(c.key)}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="vw-composer-input-wrap">
        <textarea
          ref={textareaRef}
          className="vw-composer-input"
          rows={2}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="What did you just observe? (Be specific. Use neutral, court-appropriate language.)"
        />
        <div className="vw-composer-row">
          <div className="vw-sev-picker">
            {SEVERITIES.map((s) => (
              <button
                key={s.key}
                type="button"
                className={`vw-sev-btn tone-${s.tone} ${severity === s.key ? 'active' : ''}`}
                onClick={() => setSeverity(s.key)}
              >
                {s.key === 'critical' && '⚠ '}{s.label}
              </button>
            ))}
          </div>
          <div className="vw-composer-actions">
            <VoiceRecorder onTranscript={(t) => setText((prev) => prev ? prev + ' ' + t : t)} disabled={busy} />
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setShowTemplates((s) => !s)}
            >
              Templates
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={submit}
              disabled={busy || !text.trim()}
            >
              {busy ? 'Saving…' : 'Add'}
            </button>
          </div>
        </div>

        {showTemplates && (
          <div className="vw-template-grid">
            {QUICK_TEMPLATES.map((t, i) => (
              <button key={i} type="button" className="vw-template-btn" onClick={() => applyTemplate(t)}>
                <div className={`vw-template-cat tone-${categoryMeta(t.category).tone}`}>{categoryMeta(t.category).label}</div>
                <div className="vw-template-text">{t.text}</div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/* ============================================================
   Phase 4 — Closeout
   ============================================================ */

function CloseoutPhase({ visit, observations, busy, onSaveChecklist, onPartyDeparture, onSaveDepartureNotes, onWriteReport, orgId, userId, onPhotoError }) {
  const initial = visit.departure_checklist || {}
  const [items, setItems] = useState(initial)
  const [notes, setNotes] = useState(visit.departure_notes || '')
  const saveTimer = useRef(null)

  function toggle(key) {
    const next = { ...items, [key]: !items[key] }
    setItems(next)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => onSaveChecklist(next), 500)
  }
  function saveNotes(v) {
    setNotes(v)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => onSaveDepartureNotes(v), 600)
  }

  const c = visit.case
  const critical = observations.filter((o) => o.severity === 'critical').length
  const concerns = observations.filter((o) => o.severity === 'concern').length

  return (
    <div className="vw-body">
      <div className="vw-card">
        <div className="vw-card-head">
          <div className="vw-card-title">Visit complete</div>
          <div className="vw-card-sub">
            {visit.actual_duration_minutes ? `${visit.actual_duration_minutes} minutes` : '—'}
            {' · '}{observations.length} observation{observations.length === 1 ? '' : 's'} logged
          </div>
        </div>
        <div className="vw-tiles">
          <InfoTile label="Started" value={fmtClock(visit.actual_start_time || visit.checked_in_at)} />
          <InfoTile label="Ended" value={fmtClock(visit.checked_out_at)} />
          <InfoTile label="Concerns" value={String(concerns)} />
          <InfoTile label="Critical" value={String(critical)} />
        </div>
      </div>

      <div className="vw-card">
        <div className="vw-card-head">
          <div className="vw-card-title">Party departure</div>
          <div className="vw-card-sub">Confirm who has left</div>
        </div>
        <div className="vw-party-list">
          <PartyArrivalRow
            label="Custodial parent"
            name={c?.custodial ? `${c.custodial.first_name} ${c.custodial.last_name}` : 'Custodial parent'}
            arrivalTime={visit.custodial_departure_time}
            onArrived={() => onPartyDeparture('custodial', new Date().toISOString())}
            onUndo={() => onPartyDeparture('custodial', null)}
            disabled={busy}
          />
          <PartyArrivalRow
            label="Noncustodial parent"
            name={c?.noncustodial ? `${c.noncustodial.first_name} ${c.noncustodial.last_name}` : 'Noncustodial parent'}
            arrivalTime={visit.noncustodial_departure_time}
            onArrived={() => onPartyDeparture('noncustodial', new Date().toISOString())}
            onUndo={() => onPartyDeparture('noncustodial', null)}
            disabled={busy}
          />
        </div>
      </div>

      <div className="vw-card">
        <div className="vw-card-head">
          <div className="vw-card-title">Departure checklist</div>
          <div className="vw-card-sub">{Object.values(items).filter(Boolean).length} of {DEPARTURE_ITEMS.length} complete</div>
        </div>
        <div className="vw-check-list">
          {DEPARTURE_ITEMS.map((it) => (
            <ChecklistRow key={it.key} checked={!!items[it.key]} onToggle={() => toggle(it.key)}>
              {it.label}
            </ChecklistRow>
          ))}
        </div>
      </div>

      <div className="vw-card">
        <div className="vw-card-head">
          <div className="vw-card-title">Quick departure summary</div>
          <div className="vw-card-sub">One-line takeaway (optional)</div>
        </div>
        <textarea
          className="form-textarea vw-textarea"
          rows={3}
          value={notes}
          onChange={(e) => saveNotes(e.target.value)}
          placeholder="Overall impression of how the visit went…"
        />
      </div>

      <div className="vw-card">
        <div className="vw-card-head">
          <div className="vw-card-title">Photos</div>
          <div className="vw-card-sub">Add any final photos before writing the report</div>
        </div>
        <VisitPhotos
          orgId={orgId}
          visitId={visit.id}
          monitorId={visit.monitor_id}
          userId={userId}
          onError={onPhotoError}
        />
      </div>

      <StickyAction>
        <button className="btn btn-primary btn-xl" onClick={onWriteReport} disabled={busy}>
          Write report →
        </button>
      </StickyAction>
    </div>
  )
}

/* ============================================================
   Phase 5 — Report in progress
   ============================================================ */

function ReportInProgressPhase({ visit, report, onContinue }) {
  return (
    <div className="vw-body">
      <div className="vw-card">
        <div className="vw-card-head">
          <div className="vw-card-title">Report in progress</div>
          <div className="vw-card-sub">Draft saved {report?.updated_at ? fmtRelative(report.updated_at) : ''}</div>
        </div>
        <p className="vw-paragraph">
          You have a draft report for this visit. Continue editing to submit it for agency review.
        </p>
      </div>
      <StickyAction>
        <button className="btn btn-primary btn-xl" onClick={onContinue}>
          Continue writing report →
        </button>
      </StickyAction>
    </div>
  )
}

/* ============================================================
   Phase 6 — Submitted / review
   ============================================================ */

function SubmittedPhase({ visit, report, observations, onView, orgId, userId }) {
  const statusLabel = {
    pending_review:    'Pending agency review',
    changes_requested: 'Changes requested by reviewer',
    approved:          'Approved',
    rejected:          'Rejected',
    submitted:         'Submitted',
    reviewed:          'Reviewed',
    filed:             'Filed with court',
    distributed:       'Distributed',
  }[report?.status] || 'Submitted'

  return (
    <div className="vw-body">
      <div className="vw-card">
        <div className="vw-card-head">
          <div className="vw-card-title">{statusLabel}</div>
          <div className="vw-card-sub">{report?.submitted_at ? `Submitted ${fmtRelative(report.submitted_at)}` : ''}</div>
        </div>
        {report?.status === 'changes_requested' && report?.reviewer_notes && (
          <div className="vw-warning">
            <strong>Reviewer requested changes:</strong>
            <div style={{ marginTop: 6 }}>{report.reviewer_notes}</div>
          </div>
        )}
        <div className="vw-tiles">
          <InfoTile label="Visit duration" value={visit.actual_duration_minutes ? `${visit.actual_duration_minutes} min` : '—'} />
          <InfoTile label="Observations" value={String(observations.length)} />
          <InfoTile label="Critical events" value={String(observations.filter((o) => o.severity === 'critical').length)} />
          <InfoTile label="Concerns" value={String(observations.filter((o) => o.severity === 'concern').length)} />
        </div>
      </div>

      <div className="vw-card">
        <div className="vw-card-head">
          <div className="vw-card-title">Photos</div>
          <div className="vw-card-sub">Captured during the visit</div>
        </div>
        <VisitPhotos
          orgId={orgId}
          visitId={visit.id}
          monitorId={visit.monitor_id}
          userId={userId}
          readOnly
        />
      </div>

      <StickyAction>
        <button className="btn btn-primary btn-xl" onClick={onView}>
          {report?.status === 'changes_requested' ? 'Address changes →' : 'View report →'}
        </button>
      </StickyAction>
    </div>
  )
}
