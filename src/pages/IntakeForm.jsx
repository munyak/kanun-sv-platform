import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'

const LA_COURTS = [
  'Stanley Mosk Courthouse (Central)',
  'Antonio Villaraigosa Family Justice Center',
  'Edmund D. Edelman Children\'s Court',
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
  'Court order',
  'Attorney referral',
  'DCFS / Child welfare',
  'Self-referral',
  'Mediator',
  'Therapist / Mental health',
  'Other'
]

const SUPERVISION_TYPES = [
  { value: 'one_on_one', label: 'One-on-one (single family)' },
  { value: 'group', label: 'Group (multiple families, one site)' },
  { value: 'therapeutic', label: 'Therapeutic supervised visitation' },
  { value: 'monitored_exchange', label: 'Monitored exchange only' }
]

const REASONS = [
  { value: 'domestic_violence', label: 'Domestic violence allegations' },
  { value: 'substance_abuse', label: 'Substance abuse concerns' },
  { value: 'mental_health', label: 'Mental health concerns' },
  { value: 'physical_abuse', label: 'Physical abuse allegations' },
  { value: 'sexual_abuse', label: 'Sexual abuse allegations (Standard 5.20(m))' },
  { value: 'neglect', label: 'Neglect concerns' },
  { value: 'parental_kidnapping', label: 'Parental kidnapping / abduction risk' },
  { value: 'reintroduction', label: 'Reintroduction after long absence' },
  { value: 'high_conflict', label: 'High-conflict separation' },
  { value: 'other', label: 'Other (specify in notes)' }
]

const STEPS = ['Case Info', 'Custodial Parent', 'Noncustodial Parent', 'Child', 'Review']

const initialCase = {
  case_number: '',
  court_name: '',
  referral_source: '',
  supervision_type: '',
  risk_level: 'medium',
  reasons: [],
  reasons_notes: '',
  sexual_abuse_protocol_acknowledged: false
}

const initialParty = {
  first_name: '',
  last_name: '',
  date_of_birth: '',
  phone: '',
  email: '',
  address_street: '',
  address_city: '',
  address_state: 'CA',
  address_zip: '',
  attorney_name: '',
  attorney_phone: '',
  emergency_contact_name: '',
  emergency_contact_phone: ''
}

const initialChild = {
  first_name: '',
  last_name: '',
  date_of_birth: '',
  gender: '',
  school: '',
  grade: '',
  health_conditions: '',
  medications: '',
  allergies: '',
  special_needs: ''
}

const initialAcks = {
  acknowledged_confidentiality: false,
  acknowledged_neutrality: false,
  acknowledged_safety_protocols: false,
  acknowledged_reporting_obligations: false
}

export default function IntakeForm() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState(null)

  const [caseData, setCaseData] = useState(initialCase)
  const [custodial, setCustodial] = useState({ ...initialParty })
  const [noncustodial, setNoncustodial] = useState({ ...initialParty })
  const [child, setChild] = useState({ ...initialChild })
  const [acks, setAcks] = useState(initialAcks)

  function showToast(message, kind = 'success') {
    setToast({ message, kind })
    setTimeout(() => setToast(null), 3500)
  }

  function toggleReason(value) {
    setCaseData((c) => ({
      ...c,
      reasons: c.reasons.includes(value) ? c.reasons.filter((r) => r !== value) : [...c.reasons, value]
    }))
  }

  function next() {
    if (step < STEPS.length - 1) setStep(step + 1)
  }
  function prev() {
    if (step > 0) setStep(step - 1)
  }

  function canProceed() {
    if (step === 0) {
      if (!caseData.court_name || !caseData.referral_source || !caseData.supervision_type) return false
      if (caseData.reasons.includes('sexual_abuse') && !caseData.sexual_abuse_protocol_acknowledged) return false
      return true
    }
    if (step === 1) return custodial.first_name && custodial.last_name
    if (step === 2) return noncustodial.first_name && noncustodial.last_name
    if (step === 3) return child.first_name && child.last_name
    return true
  }

  function allAcksChecked() {
    return Object.values(acks).every(Boolean)
  }

  async function submit() {
    if (!allAcksChecked()) {
      showToast('All acknowledgments are required', 'error')
      return
    }
    setSubmitting(true)
    try {
      const { data: custData, error: custErr } = await supabase
        .from('sv_parties')
        .insert([{ ...custodial, party_role: 'custodial' }])
        .select()
        .single()
      if (custErr) throw custErr

      const { data: noncustData, error: noncustErr } = await supabase
        .from('sv_parties')
        .insert([{ ...noncustodial, party_role: 'noncustodial' }])
        .select()
        .single()
      if (noncustErr) throw noncustErr

      const { data: childData, error: childErr } = await supabase
        .from('sv_children')
        .insert([child])
        .select()
        .single()
      if (childErr) throw childErr

      const casePayload = {
        case_number: caseData.case_number || null,
        court_name: caseData.court_name,
        referral_source: caseData.referral_source,
        supervision_type: caseData.supervision_type,
        risk_level: caseData.risk_level,
        reasons: caseData.reasons,
        reasons_notes: caseData.reasons_notes || null,
        custodial_party_id: custData.id,
        noncustodial_party_id: noncustData.id,
        status: 'pending',
        intake_completed_at: new Date().toISOString(),
        acknowledged_confidentiality: acks.acknowledged_confidentiality,
        acknowledged_neutrality: acks.acknowledged_neutrality,
        acknowledged_safety_protocols: acks.acknowledged_safety_protocols,
        acknowledged_reporting_obligations: acks.acknowledged_reporting_obligations
      }

      const { data: caseRow, error: caseErr } = await supabase
        .from('sv_cases')
        .insert([casePayload])
        .select()
        .single()
      if (caseErr) throw caseErr

      const { error: linkErr } = await supabase
        .from('sv_case_children')
        .insert([{ case_id: caseRow.id, child_id: childData.id }])
      if (linkErr) throw linkErr

      showToast('Intake submitted successfully')
      setTimeout(() => navigate('/cases'), 1000)
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
            <CaseInfoStep
              data={caseData}
              setData={setCaseData}
              toggleReason={toggleReason}
            />
          )}
          {step === 1 && (
            <PartyStep
              title="Custodial Parent / Guardian"
              data={custodial}
              setData={setCustodial}
            />
          )}
          {step === 2 && (
            <PartyStep
              title="Noncustodial Parent"
              data={noncustodial}
              setData={setNoncustodial}
            />
          )}
          {step === 3 && (
            <ChildStep data={child} setData={setChild} />
          )}
          {step === 4 && (
            <ReviewStep
              caseData={caseData}
              custodial={custodial}
              noncustodial={noncustodial}
              child={child}
              acks={acks}
              setAcks={setAcks}
            />
          )}

          <div className="btn-group right">
            {step > 0 && (
              <button className="btn btn-secondary" onClick={prev} disabled={submitting}>
                ← Back
              </button>
            )}
            {step < STEPS.length - 1 ? (
              <button className="btn btn-primary" onClick={next} disabled={!canProceed()}>
                Continue →
              </button>
            ) : (
              <button
                className="btn btn-primary"
                onClick={submit}
                disabled={submitting || !allAcksChecked()}
              >
                {submitting ? 'Submitting…' : 'Submit Intake'}
              </button>
            )}
          </div>
        </div>
      </div>

      {toast && (
        <div className={`toast ${toast.kind === 'error' ? 'error' : ''}`}>{toast.message}</div>
      )}
    </div>
  )
}

function CaseInfoStep({ data, setData, toggleReason }) {
  const showSexualAbuseProtocol = data.reasons.includes('sexual_abuse')

  return (
    <>
      <div className="form-section">
        <h3 className="form-section-title">Case Information</h3>
        <div className="form-grid">
          <div className="form-group">
            <label className="form-label">Case Number</label>
            <input
              className="form-input"
              value={data.case_number}
              onChange={(e) => setData({ ...data, case_number: e.target.value })}
              placeholder="Will be auto-assigned if blank"
            />
          </div>

          <div className="form-group">
            <label className="form-label">
              Court <span className="required">*</span>
            </label>
            <select
              className="form-select"
              value={data.court_name}
              onChange={(e) => setData({ ...data, court_name: e.target.value })}
            >
              <option value="">Select a court…</option>
              {LA_COURTS.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">
              Referral Source <span className="required">*</span>
            </label>
            <select
              className="form-select"
              value={data.referral_source}
              onChange={(e) => setData({ ...data, referral_source: e.target.value })}
            >
              <option value="">Select…</option>
              {REFERRAL_SOURCES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">
              Supervision Type <span className="required">*</span>
            </label>
            <select
              className="form-select"
              value={data.supervision_type}
              onChange={(e) => setData({ ...data, supervision_type: e.target.value })}
            >
              <option value="">Select…</option>
              {SUPERVISION_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Risk Level</label>
            <select
              className="form-select"
              value={data.risk_level}
              onChange={(e) => setData({ ...data, risk_level: e.target.value })}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
            <span className="form-help">Per intake assessment, can be revised after first visit.</span>
          </div>
        </div>
      </div>

      <div className="form-section">
        <h3 className="form-section-title">Reasons for Supervision</h3>
        <p className="form-section-desc">Select all that apply. Sexual-abuse cases trigger additional protocol per Standard 5.20(m).</p>
        <div className="form-checkbox-group">
          {REASONS.map((r) => (
            <label key={r.value} className="form-checkbox-label">
              <input
                type="checkbox"
                checked={data.reasons.includes(r.value)}
                onChange={() => toggleReason(r.value)}
              />
              <span>{r.label}</span>
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
              <input
                type="checkbox"
                checked={data.sexual_abuse_protocol_acknowledged}
                onChange={(e) => setData({ ...data, sexual_abuse_protocol_acknowledged: e.target.checked })}
              />
              <span><strong>I acknowledge the Standard 5.20(m) protocol</strong> and will assign only a monitor trained for sexual-abuse cases.</span>
            </label>
          </div>
        )}

        <div className="form-group" style={{ marginTop: 16 }}>
          <label className="form-label">Additional notes</label>
          <textarea
            className="form-textarea"
            value={data.reasons_notes}
            onChange={(e) => setData({ ...data, reasons_notes: e.target.value })}
            placeholder="Any context the monitor should know (court orders, restraining orders in place, etc.)"
          />
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
            <input
              className="form-input"
              value={data.first_name}
              onChange={(e) => setData({ ...data, first_name: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Last Name <span className="required">*</span></label>
            <input
              className="form-input"
              value={data.last_name}
              onChange={(e) => setData({ ...data, last_name: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Date of Birth</label>
            <input
              type="date"
              className="form-input"
              value={data.date_of_birth}
              onChange={(e) => setData({ ...data, date_of_birth: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Phone</label>
            <input
              type="tel"
              className="form-input"
              value={data.phone}
              onChange={(e) => setData({ ...data, phone: e.target.value })}
              placeholder="(555) 555-1234"
            />
          </div>
          <div className="form-group full">
            <label className="form-label">Email</label>
            <input
              type="email"
              className="form-input"
              value={data.email}
              onChange={(e) => setData({ ...data, email: e.target.value })}
            />
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
            <label className="form-label">
              Street <span className="confidential">Confidential</span>
            </label>
            <input
              className="form-input"
              value={data.address_street}
              onChange={(e) => setData({ ...data, address_street: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label className="form-label">City</label>
            <input
              className="form-input"
              value={data.address_city}
              onChange={(e) => setData({ ...data, address_city: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label className="form-label">State</label>
            <input
              className="form-input"
              value={data.address_state}
              onChange={(e) => setData({ ...data, address_state: e.target.value })}
              maxLength={2}
            />
          </div>
          <div className="form-group">
            <label className="form-label">ZIP</label>
            <input
              className="form-input"
              value={data.address_zip}
              onChange={(e) => setData({ ...data, address_zip: e.target.value })}
            />
          </div>
        </div>
      </div>

      <div className="form-section">
        <h3 className="form-section-title">Attorney</h3>
        <div className="form-grid">
          <div className="form-group">
            <label className="form-label">Attorney Name</label>
            <input
              className="form-input"
              value={data.attorney_name}
              onChange={(e) => setData({ ...data, attorney_name: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Attorney Phone</label>
            <input
              type="tel"
              className="form-input"
              value={data.attorney_phone}
              onChange={(e) => setData({ ...data, attorney_phone: e.target.value })}
            />
          </div>
        </div>
      </div>

      <div className="form-section">
        <h3 className="form-section-title">Emergency Contact</h3>
        <div className="form-grid">
          <div className="form-group">
            <label className="form-label">Name</label>
            <input
              className="form-input"
              value={data.emergency_contact_name}
              onChange={(e) => setData({ ...data, emergency_contact_name: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Phone</label>
            <input
              type="tel"
              className="form-input"
              value={data.emergency_contact_phone}
              onChange={(e) => setData({ ...data, emergency_contact_phone: e.target.value })}
            />
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
            <input
              className="form-input"
              value={data.first_name}
              onChange={(e) => setData({ ...data, first_name: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Last Name <span className="required">*</span></label>
            <input
              className="form-input"
              value={data.last_name}
              onChange={(e) => setData({ ...data, last_name: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Date of Birth</label>
            <input
              type="date"
              className="form-input"
              value={data.date_of_birth}
              onChange={(e) => setData({ ...data, date_of_birth: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Gender</label>
            <select
              className="form-select"
              value={data.gender}
              onChange={(e) => setData({ ...data, gender: e.target.value })}
            >
              <option value="">Prefer not to say</option>
              <option value="female">Female</option>
              <option value="male">Male</option>
              <option value="nonbinary">Nonbinary</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">School</label>
            <input
              className="form-input"
              value={data.school}
              onChange={(e) => setData({ ...data, school: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Grade</label>
            <input
              className="form-input"
              value={data.grade}
              onChange={(e) => setData({ ...data, grade: e.target.value })}
            />
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
            <textarea
              className="form-textarea"
              value={data.health_conditions}
              onChange={(e) => setData({ ...data, health_conditions: e.target.value })}
              placeholder="Asthma, diabetes, seizure disorder, etc."
            />
          </div>
          <div className="form-group">
            <label className="form-label">Medications</label>
            <textarea
              className="form-textarea"
              value={data.medications}
              onChange={(e) => setData({ ...data, medications: e.target.value })}
              placeholder="Name, dose, schedule, who administers"
            />
          </div>
          <div className="form-group">
            <label className="form-label">Allergies</label>
            <textarea
              className="form-textarea"
              value={data.allergies}
              onChange={(e) => setData({ ...data, allergies: e.target.value })}
              placeholder="Food, environmental, medication"
            />
          </div>
          <div className="form-group full">
            <label className="form-label">Special Needs / Accommodations</label>
            <textarea
              className="form-textarea"
              value={data.special_needs}
              onChange={(e) => setData({ ...data, special_needs: e.target.value })}
              placeholder="IEP/504 considerations, sensory needs, communication preferences"
            />
          </div>
        </div>
      </div>
    </>
  )
}

function ReviewStep({ caseData, custodial, noncustodial, child, acks, setAcks }) {
  return (
    <>
      <div className="form-section">
        <h3 className="form-section-title">Review</h3>
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
            <div>{caseData.risk_level}</div>
          </div>
          <div className="form-group full">
            <label className="form-label">Reasons</label>
            <div>{caseData.reasons.length > 0 ? caseData.reasons.join(', ') : '—'}</div>
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
        </div>
      </div>

      <div className="form-section">
        <h3 className="form-section-title">Required Acknowledgments — Standard 5.20</h3>
        <div className="form-checkbox-group">
          <label className="form-checkbox-label">
            <input
              type="checkbox"
              checked={acks.acknowledged_confidentiality}
              onChange={(e) => setAcks({ ...acks, acknowledged_confidentiality: e.target.checked })}
            />
            <span>
              <strong>Confidentiality.</strong> I acknowledge that all information collected, including
              party addresses, is confidential per Standard 5.20(g)(3)(D), and will not be released
              except as required by law or court order.
            </span>
          </label>
          <label className="form-checkbox-label">
            <input
              type="checkbox"
              checked={acks.acknowledged_neutrality}
              onChange={(e) => setAcks({ ...acks, acknowledged_neutrality: e.target.checked })}
            />
            <span>
              <strong>Neutrality.</strong> I acknowledge that the provider shall remain neutral and
              shall not act as an advocate for any party, as required by Standard 5.20(d).
            </span>
          </label>
          <label className="form-checkbox-label">
            <input
              type="checkbox"
              checked={acks.acknowledged_safety_protocols}
              onChange={(e) => setAcks({ ...acks, acknowledged_safety_protocols: e.target.checked })}
            />
            <span>
              <strong>Safety protocols.</strong> I acknowledge the safety rules, including separate
              arrival/departure times, prohibited items, and termination criteria per Standard 5.20(j).
            </span>
          </label>
          <label className="form-checkbox-label">
            <input
              type="checkbox"
              checked={acks.acknowledged_reporting_obligations}
              onChange={(e) => setAcks({ ...acks, acknowledged_reporting_obligations: e.target.checked })}
            />
            <span>
              <strong>Mandated reporting.</strong> I acknowledge that the provider is a mandated reporter
              under California law and will report suspected child abuse per Standard 5.20(g)(3)(F).
            </span>
          </label>
        </div>
      </div>
    </>
  )
}
