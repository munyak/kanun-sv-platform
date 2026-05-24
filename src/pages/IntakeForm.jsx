import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import { useAuth } from '../auth/AuthContext'

const LA_COURTS = [
  'Stanley Mosk Courthouse (Central)',
  'Antonio Villaraigosa Family Justice Center',
  "Edmund D. Edelman Children's Court",
  'Lancaster Courthouse',
  'Long Beach Courthouse (Governor George Deukmejian)',
  'Pasadena Courthouse',
  'Pomona Courthouse South',
  'Santa Monica Courthouse',
  'Torrance Courthouse',
  'Van Nuys Courthouse East',
  'Compton Courthouse',
  'Inglewood Juvenile Courthouse',
  'Norwalk Courthouse',
  'Eastlake Juvenile Courthouse',
  'Sylmar Juvenile Courthouse'
]

const REFERRAL_SOURCES = [
  { value: 'court',     label: 'Court order' },
  { value: 'attorney',  label: 'Attorney referral' },
  { value: 'dcfs',      label: 'DCFS / Child welfare' },
  { value: 'self',      label: 'Self-referral' },
  { value: 'therapist', label: 'Therapist / Mental health' },
  { value: 'other',     label: 'Other' },
]

const SUPERVISION_TYPES = [
  { value: 'supervised_visitation', label: 'Supervised visitation' },
  { value: 'monitored_exchange',    label: 'Monitored exchange only' },
  { value: 'both',                  label: 'Both supervision + exchange' },
]

const REASONS = [
  'Domestic violence allegations',
  'Substance abuse concerns',
  'Mental health concerns',
  'Physical abuse allegations',
  'Sexual abuse allegations (Standard 5.20(m))',
  'Neglect concerns',
  'Parental kidnapping / abduction risk',
  'Reintroduction after long absence',
  'High-conflict separation',
  'Other',
]

const STEPS = ['Case Info', 'Custodial Parent', 'Noncustodial Parent', 'Child', 'Review']

const initialCase = {
  case_number: '',
  court_name: '',
  court_order_date: '',
  referral_source: '',
  supervision_type: '',
  risk_level: 'medium',
  reason_for_supervision: [],
  risk_assessment_notes: '',
  has_protective_order: false,
  has_sexual_abuse_allegations: false,
  history_domestic_violence: false,
  history_substance_abuse: false,
  history_weapons: false,
  visit_frequency: '2x per month',
  visit_duration_minutes: 120,
  rate_per_visit: 85,
  special_conditions: '',
  preferred_location: '',
  sexual_abuse_protocol_acknowledged: false,
}

const initialParty = {
  first_name: '',
  last_name: '',
  preferred_name: '',
  date_of_birth: '',
  phone_primary: '',
  email: '',
  address_line1: '',
  address_line2: '',
  city: '',
  state: 'CA',
  zip: '',
  primary_language: 'English',
  attorney_name: '',
  attorney_phone: '',
  attorney_email: '',
  emergency_contact_name: '',
  emergency_contact_phone: '',
  emergency_contact_relationship: '',
}

const initialChild = {
  first_name: '',
  last_name: '',
  date_of_birth: '',
  gender: '',
  primary_language: 'English',
  school_name: '',
  grade: '',
  chronic_health_conditions: '',
  medications: '',
  allergies: '',
  special_needs: '',
  dietary_restrictions: '',
}

export default function IntakeForm() {
  const navigate = useNavigate()
  const { activeOrgId } = useAuth()
  const [step, setStep] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState(null)

  const [caseData, setCaseData] = useState(initialCase)
  const [custodial, setCustodial] = useState({ ...initialParty })
  const [noncustodial, setNoncustodial] = useState({ ...initialParty })
  const [child, setChild] = useState({ ...initialChild })

  function showToast(message, kind = 'success') {
    setToast({ message, kind })
    setTimeout(() => setToast(null), 3500)
  }

  function toggleReason(value) {
    setCaseData((c) => ({
      ...c,
      reason_for_supervision: c.reason_for_supervision.includes(value)
        ? c.reason_for_supervision.filter((r) => r !== value)
        : [...c.reason_for_supervision, value],
      // also flip the structured boolean for sexual-abuse so we can tag it
      has_sexual_abuse_allegations: value.toLowerCase().includes('sexual abuse')
        ? !c.has_sexual_abuse_allegations
        : c.has_sexual_abuse_allegations,
    }))
  }

  function next() { if (step < STEPS.length - 1) setStep(step + 1) }
  function prev() { if (step > 0) setStep(step - 1) }

  function canProceed() {
    if (step === 0) {
      if (!caseData.court_name || !caseData.referral_source || !caseData.supervision_type) return false
      if (caseData.reason_for_supervision.some((r) => r.toLowerCase().includes('sexual abuse'))
          && !caseData.sexual_abuse_protocol_acknowledged) return false
      return true
    }
    if (step === 1) return custodial.first_name && custodial.last_name
    if (step === 2) return noncustodial.first_name && noncustodial.last_name
    if (step === 3) return child.first_name && child.last_name
    return true
  }

  function partyPayload(p) {
    return {
      first_name: p.first_name,
      last_name: p.last_name,
      preferred_name: p.preferred_name || null,
      date_of_birth: p.date_of_birth || null,
      phone_primary: p.phone_primary || null,
      email: p.email || null,
      address_line1: p.address_line1 || null,
      address_line2: p.address_line2 || null,
      city: p.city || null,
      state: p.state || null,
      zip: p.zip || null,
      primary_language: p.primary_language || 'English',
      attorney_name: p.attorney_name || null,
      attorney_phone: p.attorney_phone || null,
      attorney_email: p.attorney_email || null,
      emergency_contact_name: p.emergency_contact_name || null,
      emergency_contact_phone: p.emergency_contact_phone || null,
      emergency_contact_relationship: p.emergency_contact_relationship || null,
      org_id: activeOrgId,
    }
  }

  async function submit() {
    setSubmitting(true)
    try {
      const { data: custData, error: custErr } = await supabase
        .from('sv_parties')
        .insert([partyPayload(custodial)])
        .select()
        .single()
      if (custErr) throw custErr

      const { data: noncustData, error: noncustErr } = await supabase
        .from('sv_parties')
        .insert([partyPayload(noncustodial)])
        .select()
        .single()
      if (noncustErr) throw noncustErr

      const { data: childData, error: childErr } = await supabase
        .from('sv_children')
        .insert([{
          first_name: child.first_name,
          last_name: child.last_name,
          date_of_birth: child.date_of_birth || null,
          gender: child.gender || null,
          primary_language: child.primary_language || 'English',
          school_name: child.school_name || null,
          grade: child.grade || null,
          chronic_health_conditions: child.chronic_health_conditions || null,
          medications: child.medications || null,
          allergies: child.allergies || null,
          special_needs: child.special_needs || null,
          dietary_restrictions: child.dietary_restrictions || null,
          org_id: activeOrgId,
        }])
        .select()
        .single()
      if (childErr) throw childErr

      const casePayload = {
        org_id: activeOrgId,
        case_number: caseData.case_number || `INT-${Date.now()}`,
        court_name: caseData.court_name,
        court_order_date: caseData.court_order_date || null,
        referral_source: caseData.referral_source,
        supervision_type: caseData.supervision_type,
        risk_level: caseData.risk_level,
        reason_for_supervision: caseData.reason_for_supervision,
        risk_assessment_notes: caseData.risk_assessment_notes || null,
        has_protective_order: !!caseData.has_protective_order,
        has_sexual_abuse_allegations: !!caseData.has_sexual_abuse_allegations,
        history_domestic_violence: !!caseData.history_domestic_violence,
        history_substance_abuse: !!caseData.history_substance_abuse,
        history_weapons: !!caseData.history_weapons,
        visit_frequency: caseData.visit_frequency || 'as scheduled',
        visit_duration_minutes: Number(caseData.visit_duration_minutes) || 120,
        rate_per_visit: Number(caseData.rate_per_visit) || 0,
        special_conditions: caseData.special_conditions || null,
        preferred_location: caseData.preferred_location || null,
        custodial_party_id: custData.id,
        noncustodial_party_id: noncustData.id,
        status: 'intake',
      }

      const { data: caseRow, error: caseErr } = await supabase
        .from('sv_cases')
        .insert([casePayload])
        .select()
        .single()
      if (caseErr) throw caseErr

      const { error: linkErr } = await supabase
        .from('sv_case_children')
        .insert([{ case_id: caseRow.id, child_id: childData.id, org_id: activeOrgId }])
      if (linkErr) throw linkErr

      showToast('Intake submitted successfully')
      setTimeout(() => navigate(`/cases/${caseRow.id}`), 800)
    } catch (err) {
      console.error('Submit error:', err)
      showToast(err.message || 'Failed to submit intake', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">New Intake</h1>
          <div className="page-subtitle">Per California Rule of Court — Standard 5.20</div>
        </div>
      </div>

      <div className="card">
        <div className="wizard-steps">
          {STEPS.map((label, i) => (
            <React.Fragment key={label}>
              <div className={`wizard-step ${i === step ? 'active' : ''} ${i < step ? 'done' : ''}`}>
                <span className="wizard-step-num">{i + 1}</span>
                <span>{label}</span>
              </div>
              {i < STEPS.length - 1 && <div className="wizard-step-divider" />}
            </React.Fragment>
          ))}
        </div>

        <div className="card-body">
          {step === 0 && (
            <CaseInfoStep data={caseData} setData={setCaseData} toggleReason={toggleReason} />
          )}
          {step === 1 && (
            <PartyStep title="Custodial Parent / Guardian" data={custodial} setData={setCustodial} />
          )}
          {step === 2 && (
            <PartyStep title="Noncustodial Parent" data={noncustodial} setData={setNoncustodial} />
          )}
          {step === 3 && <ChildStep data={child} setData={setChild} />}
          {step === 4 && (
            <ReviewStep caseData={caseData} custodial={custodial} noncustodial={noncustodial} child={child} />
          )}

          <div className="btn-group right">
            {step > 0 && (
              <button className="btn btn-secondary" onClick={prev} disabled={submitting}>← Back</button>
            )}
            {step < STEPS.length - 1 ? (
              <button className="btn btn-primary" onClick={next} disabled={!canProceed()}>
                Continue →
              </button>
            ) : (
              <button className="btn btn-primary" onClick={submit} disabled={submitting}>
                {submitting ? 'Submitting…' : 'Submit Intake'}
              </button>
            )}
          </div>
        </div>
      </div>

      {toast && <div className={`toast ${toast.kind === 'error' ? 'error' : ''}`}>{toast.message}</div>}
    </div>
  )
}

function CaseInfoStep({ data, setData, toggleReason }) {
  const showSexualAbuseProtocol = data.reason_for_supervision.some((r) => r.toLowerCase().includes('sexual abuse'))
  return (
    <>
      <div className="form-section">
        <h3 className="form-section-title">Case Information</h3>
        <div className="form-grid">
          <div className="form-group">
            <label className="form-label">Case Number</label>
            <input className="form-input" value={data.case_number}
              onChange={(e) => setData({ ...data, case_number: e.target.value })}
              placeholder="Auto-assigned if blank" />
          </div>
          <div className="form-group">
            <label className="form-label">Court Order Date</label>
            <input type="date" className="form-input" value={data.court_order_date}
              onChange={(e) => setData({ ...data, court_order_date: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label">Court <span className="required">*</span></label>
            <select className="form-select" value={data.court_name}
              onChange={(e) => setData({ ...data, court_name: e.target.value })}>
              <option value="">Select a court…</option>
              {LA_COURTS.map((c) => (<option key={c} value={c}>{c}</option>))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Referral Source <span className="required">*</span></label>
            <select className="form-select" value={data.referral_source}
              onChange={(e) => setData({ ...data, referral_source: e.target.value })}>
              <option value="">Select…</option>
              {REFERRAL_SOURCES.map((s) => (<option key={s.value} value={s.value}>{s.label}</option>))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Supervision Type <span className="required">*</span></label>
            <select className="form-select" value={data.supervision_type}
              onChange={(e) => setData({ ...data, supervision_type: e.target.value })}>
              <option value="">Select…</option>
              {SUPERVISION_TYPES.map((t) => (<option key={t.value} value={t.value}>{t.label}</option>))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Risk Level</label>
            <select className="form-select" value={data.risk_level}
              onChange={(e) => setData({ ...data, risk_level: e.target.value })}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
            <span className="form-help">Revisable after first visit.</span>
          </div>
          <div className="form-group">
            <label className="form-label">Visit frequency</label>
            <input className="form-input" value={data.visit_frequency}
              onChange={(e) => setData({ ...data, visit_frequency: e.target.value })}
              placeholder="e.g. weekly, 2x per month" />
          </div>
          <div className="form-group">
            <label className="form-label">Visit duration (minutes)</label>
            <input type="number" min="30" step="15" className="form-input"
              value={data.visit_duration_minutes}
              onChange={(e) => setData({ ...data, visit_duration_minutes: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label">Rate per visit (USD)</label>
            <input type="number" min="0" className="form-input"
              value={data.rate_per_visit}
              onChange={(e) => setData({ ...data, rate_per_visit: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label">Preferred location</label>
            <input className="form-input" value={data.preferred_location}
              onChange={(e) => setData({ ...data, preferred_location: e.target.value })}
              placeholder="e.g. Cypress Park Library — Family Room" />
          </div>
        </div>
      </div>

      <div className="form-section">
        <h3 className="form-section-title">Reasons for Supervision</h3>
        <p className="form-section-desc">Select all that apply. Sexual-abuse cases trigger additional protocol per Standard 5.20(m).</p>
        <div className="form-checkbox-group">
          {REASONS.map((r) => (
            <label key={r} className="form-checkbox-label">
              <input type="checkbox" checked={data.reason_for_supervision.includes(r)}
                onChange={() => toggleReason(r)} />
              <span>{r}</span>
            </label>
          ))}
        </div>

        {showSexualAbuseProtocol && (
          <div style={{ marginTop: 16 }}>
            <div className="confidential-banner">
              <strong>Standard 5.20(m) — Sexual Abuse Cases:</strong> Provider must use a monitor trained
              specifically in handling sexual-abuse allegations. No private bathroom visits, no shared
              changing, no physical contact initiated by the child without monitor in immediate proximity.
              All statements made by the child must be documented verbatim.
            </div>
            <label className="form-checkbox-label" style={{ marginTop: 12 }}>
              <input type="checkbox" checked={data.sexual_abuse_protocol_acknowledged}
                onChange={(e) => setData({ ...data, sexual_abuse_protocol_acknowledged: e.target.checked })} />
              <span><strong>I acknowledge the Standard 5.20(m) protocol</strong> and will assign only a monitor trained for sexual-abuse cases.</span>
            </label>
          </div>
        )}

        <div className="form-grid-3" style={{ marginTop: 16 }}>
          <label className="form-checkbox-label">
            <input type="checkbox" checked={data.has_protective_order}
              onChange={(e) => setData({ ...data, has_protective_order: e.target.checked })} />
            <span>Restraining/protective order in place</span>
          </label>
          <label className="form-checkbox-label">
            <input type="checkbox" checked={data.history_domestic_violence}
              onChange={(e) => setData({ ...data, history_domestic_violence: e.target.checked })} />
            <span>History of domestic violence</span>
          </label>
          <label className="form-checkbox-label">
            <input type="checkbox" checked={data.history_substance_abuse}
              onChange={(e) => setData({ ...data, history_substance_abuse: e.target.checked })} />
            <span>History of substance abuse</span>
          </label>
          <label className="form-checkbox-label">
            <input type="checkbox" checked={data.history_weapons}
              onChange={(e) => setData({ ...data, history_weapons: e.target.checked })} />
            <span>History of weapons</span>
          </label>
        </div>

        <div className="form-group" style={{ marginTop: 16 }}>
          <label className="form-label">Risk-assessment notes</label>
          <textarea className="form-textarea" value={data.risk_assessment_notes}
            onChange={(e) => setData({ ...data, risk_assessment_notes: e.target.value })}
            placeholder="Any context the monitor should know (court orders, restraining orders in place, prior incidents)." />
        </div>
      </div>
    </>
  )
}

function PartyStep({ title, data, setData }) {
  return (
    <>
      <div className="form-section">
        <h3 className="form-section-title">{title} — Contact</h3>
        <div className="form-grid">
          <div className="form-group">
            <label className="form-label">First Name <span className="required">*</span></label>
            <input className="form-input" value={data.first_name}
              onChange={(e) => setData({ ...data, first_name: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label">Last Name <span className="required">*</span></label>
            <input className="form-input" value={data.last_name}
              onChange={(e) => setData({ ...data, last_name: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label">Preferred Name</label>
            <input className="form-input" value={data.preferred_name}
              onChange={(e) => setData({ ...data, preferred_name: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label">Date of Birth</label>
            <input type="date" className="form-input" value={data.date_of_birth}
              onChange={(e) => setData({ ...data, date_of_birth: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label">Phone</label>
            <input type="tel" className="form-input" value={data.phone_primary}
              onChange={(e) => setData({ ...data, phone_primary: e.target.value })}
              placeholder="(555) 555-1234" />
          </div>
          <div className="form-group">
            <label className="form-label">Email</label>
            <input type="email" className="form-input" value={data.email}
              onChange={(e) => setData({ ...data, email: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label">Primary language</label>
            <input className="form-input" value={data.primary_language}
              onChange={(e) => setData({ ...data, primary_language: e.target.value })} />
          </div>
        </div>
      </div>

      <div className="form-section">
        <h3 className="form-section-title">Address</h3>
        <div className="confidential-banner">
          <strong>CONFIDENTIAL:</strong> Per Standard 5.20(g)(3)(D), address information is not shared
          with the opposing party and is restricted to authorized staff only.
        </div>
        <div className="form-grid">
          <div className="form-group full">
            <label className="form-label">Street <span className="confidential">Confidential</span></label>
            <input className="form-input" value={data.address_line1}
              onChange={(e) => setData({ ...data, address_line1: e.target.value })} />
          </div>
          <div className="form-group full">
            <label className="form-label">Apt / Unit</label>
            <input className="form-input" value={data.address_line2}
              onChange={(e) => setData({ ...data, address_line2: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label">City</label>
            <input className="form-input" value={data.city}
              onChange={(e) => setData({ ...data, city: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label">State</label>
            <input className="form-input" value={data.state}
              onChange={(e) => setData({ ...data, state: e.target.value })} maxLength={2} />
          </div>
          <div className="form-group">
            <label className="form-label">ZIP</label>
            <input className="form-input" value={data.zip}
              onChange={(e) => setData({ ...data, zip: e.target.value })} />
          </div>
        </div>
      </div>

      <div className="form-section">
        <h3 className="form-section-title">Attorney</h3>
        <div className="form-grid">
          <div className="form-group">
            <label className="form-label">Attorney Name</label>
            <input className="form-input" value={data.attorney_name}
              onChange={(e) => setData({ ...data, attorney_name: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label">Attorney Phone</label>
            <input type="tel" className="form-input" value={data.attorney_phone}
              onChange={(e) => setData({ ...data, attorney_phone: e.target.value })} />
          </div>
          <div className="form-group full">
            <label className="form-label">Attorney Email</label>
            <input type="email" className="form-input" value={data.attorney_email}
              onChange={(e) => setData({ ...data, attorney_email: e.target.value })} />
          </div>
        </div>
      </div>

      <div className="form-section">
        <h3 className="form-section-title">Emergency Contact</h3>
        <div className="form-grid">
          <div className="form-group">
            <label className="form-label">Name</label>
            <input className="form-input" value={data.emergency_contact_name}
              onChange={(e) => setData({ ...data, emergency_contact_name: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label">Phone</label>
            <input type="tel" className="form-input" value={data.emergency_contact_phone}
              onChange={(e) => setData({ ...data, emergency_contact_phone: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label">Relationship</label>
            <input className="form-input" value={data.emergency_contact_relationship}
              onChange={(e) => setData({ ...data, emergency_contact_relationship: e.target.value })}
              placeholder="e.g. sister, neighbor" />
          </div>
        </div>
      </div>
    </>
  )
}

function ChildStep({ data, setData }) {
  return (
    <>
      <div className="form-section">
        <h3 className="form-section-title">Child Information</h3>
        <div className="form-grid">
          <div className="form-group">
            <label className="form-label">First Name <span className="required">*</span></label>
            <input className="form-input" value={data.first_name}
              onChange={(e) => setData({ ...data, first_name: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label">Last Name <span className="required">*</span></label>
            <input className="form-input" value={data.last_name}
              onChange={(e) => setData({ ...data, last_name: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label">Date of Birth</label>
            <input type="date" className="form-input" value={data.date_of_birth}
              onChange={(e) => setData({ ...data, date_of_birth: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label">Gender</label>
            <select className="form-select" value={data.gender}
              onChange={(e) => setData({ ...data, gender: e.target.value })}>
              <option value="">Prefer not to say</option>
              <option value="female">Female</option>
              <option value="male">Male</option>
              <option value="nonbinary">Nonbinary</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">School</label>
            <input className="form-input" value={data.school_name}
              onChange={(e) => setData({ ...data, school_name: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label">Grade</label>
            <input className="form-input" value={data.grade}
              onChange={(e) => setData({ ...data, grade: e.target.value })} />
          </div>
        </div>
      </div>

      <div className="form-section">
        <h3 className="form-section-title">Health & Special Needs</h3>
        <p className="form-section-desc">
          Per Standard 5.20(g)(3)(E), the provider must know of any health condition, medication, or
          special need that may arise during a visit.
        </p>
        <div className="form-grid">
          <div className="form-group full">
            <label className="form-label">Health Conditions</label>
            <textarea className="form-textarea" value={data.chronic_health_conditions}
              onChange={(e) => setData({ ...data, chronic_health_conditions: e.target.value })}
              placeholder="Asthma, diabetes, seizure disorder, etc." />
          </div>
          <div className="form-group">
            <label className="form-label">Medications</label>
            <textarea className="form-textarea" value={data.medications}
              onChange={(e) => setData({ ...data, medications: e.target.value })}
              placeholder="Name, dose, schedule, who administers" />
          </div>
          <div className="form-group">
            <label className="form-label">Allergies</label>
            <textarea className="form-textarea" value={data.allergies}
              onChange={(e) => setData({ ...data, allergies: e.target.value })}
              placeholder="Food, environmental, medication" />
          </div>
          <div className="form-group">
            <label className="form-label">Dietary restrictions</label>
            <textarea className="form-textarea" value={data.dietary_restrictions}
              onChange={(e) => setData({ ...data, dietary_restrictions: e.target.value })} />
          </div>
          <div className="form-group full">
            <label className="form-label">Special Needs / Accommodations</label>
            <textarea className="form-textarea" value={data.special_needs}
              onChange={(e) => setData({ ...data, special_needs: e.target.value })}
              placeholder="IEP/504 considerations, sensory needs, communication preferences" />
          </div>
        </div>
      </div>
    </>
  )
}

function ReviewStep({ caseData, custodial, noncustodial, child }) {
  return (
    <>
      <div className="form-section">
        <h3 className="form-section-title">Review & Submit</h3>
        <div className="form-grid">
          <div className="form-group">
            <label className="form-label">Court</label>
            <div>{caseData.court_name || '—'}</div>
          </div>
          <div className="form-group">
            <label className="form-label">Referral Source</label>
            <div>{caseData.referral_source || '—'}</div>
          </div>
          <div className="form-group">
            <label className="form-label">Supervision Type</label>
            <div>{caseData.supervision_type ? caseData.supervision_type.replace(/_/g, ' ') : '—'}</div>
          </div>
          <div className="form-group">
            <label className="form-label">Risk Level</label>
            <div style={{ textTransform: 'capitalize' }}>{caseData.risk_level}</div>
          </div>
          <div className="form-group full">
            <label className="form-label">Reasons</label>
            <div>{caseData.reason_for_supervision.length > 0 ? caseData.reason_for_supervision.join(', ') : '—'}</div>
          </div>
          <div className="form-group">
            <label className="form-label">Custodial Parent</label>
            <div>{custodial.first_name} {custodial.last_name}</div>
          </div>
          <div className="form-group">
            <label className="form-label">Noncustodial Parent</label>
            <div>{noncustodial.first_name} {noncustodial.last_name}</div>
          </div>
          <div className="form-group full">
            <label className="form-label">Child</label>
            <div>{child.first_name} {child.last_name} {child.date_of_birth ? `· DOB ${child.date_of_birth}` : ''}</div>
          </div>
          <div className="form-group">
            <label className="form-label">Visit cadence</label>
            <div>{caseData.visit_frequency || '—'} · {caseData.visit_duration_minutes || 0} min</div>
          </div>
          <div className="form-group">
            <label className="form-label">Rate per visit</label>
            <div>${caseData.rate_per_visit || 0}</div>
          </div>
        </div>
        <div className="confidential-banner" style={{ marginTop: 16 }}>
          By submitting, you confirm the information above is accurate and that confidentiality,
          neutrality, safety, and mandated-reporting obligations under Standard 5.20 apply to this case.
        </div>
      </div>
    </>
  )
}
