import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import { useAuth } from '../auth/AuthContext'

const STEPS = [
  { n: 1, key: 'org',      label: 'Organization' },
  { n: 2, key: 'services', label: 'Services' },
  { n: 3, key: 'pricing',  label: 'Pricing' },
  { n: 4, key: 'courts',   label: 'Courts' },
  { n: 5, key: 'invite',   label: 'Invite monitor' },
  { n: 6, key: 'case',     label: 'First case' },
]

const SERVICE_OPTIONS = [
  { value: 'supervised_visitation', title: 'Supervised visitation', desc: 'Court-ordered one-on-one or group visits with a neutral monitor.' },
  { value: 'monitored_exchange',    title: 'Monitored exchange',    desc: 'Safe handoff between parents without supervised time itself.' },
  { value: 'therapeutic',           title: 'Therapeutic supervision', desc: 'Clinician-led visits for reintroduction or trauma cases.' },
]

const LA_COURTS = [
  'Stanley Mosk Courthouse (Central)',
  'Antonio Villaraigosa Family Justice Center',
  'Edmund D. Edelman Children\'s Court',
  'Lancaster Courthouse',
  'Long Beach Courthouse',
  'Pasadena Courthouse',
  'Pomona Courthouse South',
  'Santa Monica Courthouse',
  'Torrance Courthouse',
  'Van Nuys Courthouse East',
  'Compton Courthouse',
  'Inglewood Juvenile Courthouse',
  'Norwalk Courthouse',
  'Eastlake Juvenile Courthouse',
  'Sylmar Juvenile Courthouse',
]

const emptyData = {
  org: {
    name: '', address_street: '', address_city: '', address_state: 'CA', address_zip: '',
    license_number: '', service_areas: 'Los Angeles County', phone: '', email: '', website: '',
  },
  services: ['supervised_visitation'],
  pricing: { hourly_rate: 85, minimum_duration: 60, cancellation_fee: 50, sliding_scale: false },
  courts: [],
  invite: { email: '', role: 'monitor' },
  firstCase: { case_number: '', court_name: '', custodial_first: '', custodial_last: '', noncustodial_first: '', noncustodial_last: '' },
}

export default function Onboarding() {
  const { user, refresh, hasOrg, activeOrgId, setActiveOrg } = useAuth()
  const nav = useNavigate()
  const [progress, setProgress] = useState(null)
  const [step, setStep] = useState(1)
  const [data, setData] = useState(emptyData)
  const [orgId, setOrgId] = useState(null)
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState(false)

  // hydrate progress on mount
  useEffect(() => {
    let cancelled = false
    async function init() {
      if (!user) return
      const { data: row } = await supabase
        .from('sv_onboarding_progress')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle()
      if (cancelled) return
      if (row) {
        setProgress(row)
        setStep(Math.min(Math.max(row.current_step || 1, 1), STEPS.length))
        if (row.step_data) setData((d) => ({ ...d, ...row.step_data }))
        if (row.org_id) setOrgId(row.org_id)
      } else if (hasOrg && activeOrgId) {
        // already part of an org via invite — skip wizard
        nav('/', { replace: true })
        return
      }
      setLoaded(true)
    }
    init()
    return () => { cancelled = true }
  }, [user, hasOrg, activeOrgId, nav])

  function update(stepKey, patch) {
    setData((d) => ({ ...d, [stepKey]: typeof patch === 'function' ? patch(d[stepKey]) : { ...d[stepKey], ...patch } }))
  }

  async function persist(nextStep, completedSteps = null, extra = {}) {
    if (!user) return
    const payload = {
      user_id: user.id,
      org_id: orgId,
      current_step: nextStep,
      completed_steps: completedSteps ?? progress?.completed_steps ?? [],
      step_data: data,
      completed: nextStep > STEPS.length,
      updated_at: new Date().toISOString(),
      ...extra,
    }
    const { data: row, error } = await supabase
      .from('sv_onboarding_progress')
      .upsert(payload, { onConflict: 'user_id' })
      .select()
      .single()
    if (error) console.error('persist error', error)
    else setProgress(row)
  }

  async function next() {
    setErr(null); setBusy(true)
    try {
      const s = STEPS[step - 1]
      const completed = Array.from(new Set([...(progress?.completed_steps || []), step]))

      // Step 1: create org if not yet created
      if (s.key === 'org') {
        if (!data.org.name.trim()) throw new Error('Organization name is required.')
        if (!orgId) {
          const insert = {
            name: data.org.name.trim(),
            address_street: data.org.address_street || null,
            address_city: data.org.address_city || null,
            address_state: data.org.address_state || null,
            address_zip: data.org.address_zip || null,
            license_number: data.org.license_number || null,
            service_areas: (data.org.service_areas || '').split(',').map((s) => s.trim()).filter(Boolean),
            phone: data.org.phone || null,
            email: data.org.email || null,
            website: data.org.website || null,
            created_by: user.id,
          }
          const { data: org, error } = await supabase.from('sv_organizations').insert(insert).select().single()
          if (error) throw error
          // claim ownership
          const { error: rErr } = await supabase.from('sv_user_roles').insert({
            user_id: user.id, org_id: org.id, role: 'agency_owner',
          })
          if (rErr && !String(rErr.message || '').includes('duplicate')) throw rErr
          setOrgId(org.id)
          setActiveOrg(org.id)
          await refresh()
        } else {
          // update on subsequent visits to step 1
          await supabase.from('sv_organizations').update({
            name: data.org.name.trim(),
            address_street: data.org.address_street || null,
            address_city: data.org.address_city || null,
            address_state: data.org.address_state || null,
            address_zip: data.org.address_zip || null,
            license_number: data.org.license_number || null,
            service_areas: (data.org.service_areas || '').split(',').map((s) => s.trim()).filter(Boolean),
            phone: data.org.phone || null,
            email: data.org.email || null,
            website: data.org.website || null,
            updated_at: new Date().toISOString(),
          }).eq('id', orgId)
        }
      }

      if (s.key === 'services') {
        if (data.services.length === 0) throw new Error('Pick at least one service.')
        await supabase.from('sv_organizations').update({ services: data.services }).eq('id', orgId)
      }

      if (s.key === 'pricing') {
        await supabase.from('sv_organizations').update({ pricing: data.pricing }).eq('id', orgId)
      }

      if (s.key === 'courts') {
        await supabase.from('sv_organizations').update({ court_affiliations: data.courts }).eq('id', orgId)
      }

      if (s.key === 'invite' && data.invite.email.trim()) {
        const email = data.invite.email.trim().toLowerCase()
        const { error: invErr } = await supabase.from('sv_invitations').insert({
          org_id: orgId, email, role: data.invite.role, invited_by: user.id,
        })
        if (invErr && !String(invErr.message || '').includes('duplicate')) throw invErr
      }

      if (s.key === 'case' && data.firstCase.case_number.trim()) {
        // best-effort: try a minimal sv_cases row. If schema requires more, we just skip silently.
        const cc = data.firstCase
        const caseInsert = {
          org_id: orgId,
          case_number: cc.case_number,
          court_name: cc.court_name || null,
          status: 'pending',
          risk_level: 'medium',
        }
        const { error: caseErr } = await supabase.from('sv_cases').insert(caseInsert)
        if (caseErr) console.warn('first-case insert skipped:', caseErr.message)
      }

      const nextStep = step + 1
      await persist(nextStep, completed)
      if (nextStep > STEPS.length) {
        await refresh()
        nav('/', { replace: true })
      } else {
        setStep(nextStep)
      }
    } catch (e) {
      setErr(e.message || 'Could not save this step.')
    } finally {
      setBusy(false)
    }
  }

  async function back() {
    if (step <= 1) return
    setStep((s) => s - 1)
    await persist(step - 1)
  }

  async function skip() {
    await persist(step + 1, Array.from(new Set([...(progress?.completed_steps || []), step])))
    if (step + 1 > STEPS.length) {
      await refresh()
      nav('/', { replace: true })
    } else {
      setStep(step + 1)
    }
  }

  if (!loaded) return <div className="loading">Loading…</div>

  const current = STEPS[step - 1]

  return (
    <div className="shell-main" style={{ background: 'var(--gray-50)', minHeight: '100vh' }}>
      <div className="wizard-shell">
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Welcome to KaNun</div>
              <div className="page-subtitle">Let’s get your agency set up.</div>
            </div>
            <div className="page-subtitle">Step {step} of {STEPS.length}</div>
          </div>

          <div className="wizard-step-content">
            <div className="wizard-progress">
              {STEPS.map((s) => (
                <div
                  key={s.n}
                  className={`wizard-progress-step ${s.n === step ? 'active' : ''} ${s.n < step ? 'done' : ''}`}
                />
              ))}
            </div>

            <div className="wizard-step-meta">Step {step} · {current.label}</div>
            {step === 1 && <StepOrg data={data.org} update={(p) => update('org', p)} />}
            {step === 2 && <StepServices data={data.services} setData={(v) => setData((d) => ({ ...d, services: v }))} />}
            {step === 3 && <StepPricing data={data.pricing} update={(p) => update('pricing', p)} />}
            {step === 4 && <StepCourts data={data.courts} setData={(v) => setData((d) => ({ ...d, courts: v }))} />}
            {step === 5 && <StepInvite data={data.invite} update={(p) => update('invite', p)} />}
            {step === 6 && <StepFirstCase data={data.firstCase} update={(p) => update('firstCase', p)} />}

            {err && <div className="auth-error" style={{ marginTop: 16 }}>{err}</div>}
          </div>

          <div className="wizard-buttons">
            <button className="btn btn-secondary" onClick={back} disabled={step === 1 || busy}>← Back</button>
            <div className="btn-group">
              {step > 1 && step < STEPS.length && (
                <button className="btn btn-secondary" onClick={skip} disabled={busy}>Skip</button>
              )}
              <button className="btn btn-primary" onClick={next} disabled={busy}>
                {busy ? 'Saving…' : step === STEPS.length ? 'Finish' : 'Continue →'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function StepOrg({ data, update }) {
  return (
    <div>
      <h2 className="wizard-step-title">Tell us about your agency</h2>
      <p className="wizard-step-desc">This is the organization name your clients and courts will see.</p>
      <div className="form-grid">
        <div className="form-group full">
          <label className="form-label">Agency name <span className="required">*</span></label>
          <input className="form-input" value={data.name} onChange={(e) => update({ name: e.target.value })} placeholder="e.g. Riverside Family Connections" />
        </div>
        <div className="form-group">
          <label className="form-label">License #</label>
          <input className="form-input" value={data.license_number} onChange={(e) => update({ license_number: e.target.value })} />
        </div>
        <div className="form-group">
          <label className="form-label">Service areas</label>
          <input className="form-input" value={data.service_areas} onChange={(e) => update({ service_areas: e.target.value })} placeholder="Los Angeles County, Orange County" />
          <span className="form-help">Comma-separated.</span>
        </div>
        <div className="form-group full">
          <label className="form-label">Street address</label>
          <input className="form-input" value={data.address_street} onChange={(e) => update({ address_street: e.target.value })} />
        </div>
        <div className="form-group">
          <label className="form-label">City</label>
          <input className="form-input" value={data.address_city} onChange={(e) => update({ address_city: e.target.value })} />
        </div>
        <div className="form-group">
          <label className="form-label">State</label>
          <input className="form-input" value={data.address_state} onChange={(e) => update({ address_state: e.target.value })} />
        </div>
        <div className="form-group">
          <label className="form-label">Zip</label>
          <input className="form-input" value={data.address_zip} onChange={(e) => update({ address_zip: e.target.value })} />
        </div>
        <div className="form-group">
          <label className="form-label">Phone</label>
          <input className="form-input" value={data.phone} onChange={(e) => update({ phone: e.target.value })} />
        </div>
        <div className="form-group">
          <label className="form-label">Public email</label>
          <input className="form-input" value={data.email} onChange={(e) => update({ email: e.target.value })} />
        </div>
        <div className="form-group full">
          <label className="form-label">Website</label>
          <input className="form-input" value={data.website} onChange={(e) => update({ website: e.target.value })} />
        </div>
      </div>
    </div>
  )
}

function StepServices({ data, setData }) {
  function toggle(v) {
    setData(data.includes(v) ? data.filter((x) => x !== v) : [...data, v])
  }
  return (
    <div>
      <h2 className="wizard-step-title">Which services do you offer?</h2>
      <p className="wizard-step-desc">Pick all that apply. You can change this later in Settings.</p>
      <div className="choice-grid">
        {SERVICE_OPTIONS.map((s) => (
          <label key={s.value} className={`choice ${data.includes(s.value) ? 'checked' : ''}`}>
            <input type="checkbox" checked={data.includes(s.value)} onChange={() => toggle(s.value)} />
            <div>
              <div className="choice-title">{s.title}</div>
              <div className="choice-desc">{s.desc}</div>
            </div>
          </label>
        ))}
      </div>
    </div>
  )
}

function StepPricing({ data, update }) {
  return (
    <div>
      <h2 className="wizard-step-title">Set your default pricing</h2>
      <p className="wizard-step-desc">These are your defaults — you can override per case.</p>
      <div className="form-grid">
        <div className="form-group">
          <label className="form-label">Hourly rate (USD)</label>
          <input type="number" min="0" className="form-input"
            value={data.hourly_rate}
            onChange={(e) => update({ hourly_rate: Number(e.target.value) })} />
        </div>
        <div className="form-group">
          <label className="form-label">Minimum visit duration (minutes)</label>
          <input type="number" min="15" step="15" className="form-input"
            value={data.minimum_duration}
            onChange={(e) => update({ minimum_duration: Number(e.target.value) })} />
        </div>
        <div className="form-group">
          <label className="form-label">Cancellation fee (USD)</label>
          <input type="number" min="0" className="form-input"
            value={data.cancellation_fee}
            onChange={(e) => update({ cancellation_fee: Number(e.target.value) })} />
        </div>
        <div className="form-group">
          <label className="form-checkbox-label" style={{ marginTop: 28 }}>
            <input type="checkbox" checked={data.sliding_scale}
              onChange={(e) => update({ sliding_scale: e.target.checked })} />
            <span><strong>Offer sliding-scale fees</strong> based on income.</span>
          </label>
        </div>
      </div>
    </div>
  )
}

function StepCourts({ data, setData }) {
  function toggle(c) {
    setData(data.includes(c) ? data.filter((x) => x !== c) : [...data, c])
  }
  return (
    <div>
      <h2 className="wizard-step-title">Which courts do you serve?</h2>
      <p className="wizard-step-desc">This helps surface the right court on each new case. You can add more later.</p>
      <div className="choice-grid">
        {LA_COURTS.map((c) => (
          <label key={c} className={`choice ${data.includes(c) ? 'checked' : ''}`}>
            <input type="checkbox" checked={data.includes(c)} onChange={() => toggle(c)} />
            <div><div className="choice-title">{c}</div></div>
          </label>
        ))}
      </div>
    </div>
  )
}

function StepInvite({ data, update }) {
  return (
    <div>
      <h2 className="wizard-step-title">Invite your first monitor</h2>
      <p className="wizard-step-desc">They’ll get access when they sign up with this email. (Optional — you can skip.)</p>
      <div className="form-grid">
        <div className="form-group">
          <label className="form-label">Email</label>
          <input type="email" className="form-input" value={data.email}
            onChange={(e) => update({ email: e.target.value })} placeholder="monitor@example.com" />
        </div>
        <div className="form-group">
          <label className="form-label">Role</label>
          <select className="form-select" value={data.role}
            onChange={(e) => update({ role: e.target.value })}>
            <option value="monitor">Monitor</option>
            <option value="agency_manager">Agency manager</option>
            <option value="agency_owner">Agency owner</option>
          </select>
        </div>
      </div>
    </div>
  )
}

function StepFirstCase({ data, update }) {
  return (
    <div>
      <h2 className="wizard-step-title">Create your first case</h2>
      <p className="wizard-step-desc">A lightweight stub — you can fill in the full intake later.</p>
      <div className="form-grid">
        <div className="form-group">
          <label className="form-label">Case number</label>
          <input className="form-input" value={data.case_number} onChange={(e) => update({ case_number: e.target.value })} placeholder="e.g. 26FL00123" />
        </div>
        <div className="form-group">
          <label className="form-label">Court</label>
          <input className="form-input" value={data.court_name} onChange={(e) => update({ court_name: e.target.value })} />
        </div>
        <div className="form-group">
          <label className="form-label">Custodial first name</label>
          <input className="form-input" value={data.custodial_first} onChange={(e) => update({ custodial_first: e.target.value })} />
        </div>
        <div className="form-group">
          <label className="form-label">Custodial last name</label>
          <input className="form-input" value={data.custodial_last} onChange={(e) => update({ custodial_last: e.target.value })} />
        </div>
        <div className="form-group">
          <label className="form-label">Noncustodial first name</label>
          <input className="form-input" value={data.noncustodial_first} onChange={(e) => update({ noncustodial_first: e.target.value })} />
        </div>
        <div className="form-group">
          <label className="form-label">Noncustodial last name</label>
          <input className="form-input" value={data.noncustodial_last} onChange={(e) => update({ noncustodial_last: e.target.value })} />
        </div>
      </div>
    </div>
  )
}
