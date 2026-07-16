import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import { useAuth } from '../auth/AuthContext'

const AGENCY_STEPS = [
  { key: 'org',      label: 'Organization' },
  { key: 'services', label: 'Services' },
  { key: 'pricing',  label: 'Pricing' },
  { key: 'courts',   label: 'Courts' },
  { key: 'invite',   label: 'Invite monitor' },
  { key: 'case',     label: 'First case' },
]

// Solo monitors already have their 1-person org (created by solo-signup) and
// have no one to invite — they get practice-framed questions instead.
const SOLO_STEPS = [
  { key: 'org',      label: 'Your practice' },
  { key: 'services', label: 'Services' },
  { key: 'pricing',  label: 'Pricing' },
  { key: 'courts',   label: 'Courts' },
  { key: 'case',     label: 'First case' },
]

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM',
  'NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA',
  'WV','WI','WY',
]

const SERVICE_OPTIONS = [
  { value: 'supervised_visitation', title: 'Supervised visitation', desc: 'Court-ordered one-on-one or group visits with a neutral monitor.' },
  { value: 'monitored_exchange',    title: 'Monitored exchange',    desc: 'Safe handoff between parents without supervised time itself.' },
  { value: 'therapeutic',           title: 'Therapeutic supervision', desc: 'Clinician-led visits for reintroduction or trauma cases.' },
]

const LA_COURTS = [
  'Stanley Mosk Courthouse (Central)',
  'Antonio Villaraigosa Family Justice Center',
  "Edmund D. Edelman Children's Court",
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
  const [isSolo, setIsSolo] = useState(false)
  const [orgId, setOrgId] = useState(null)
  // ref mirrors state so that async handlers don't read a stale closure value
  const orgIdRef = useRef(null)
  function syncOrgId(v) {
    orgIdRef.current = v
    setOrgId(v)
  }

  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function init() {
      if (!user) return

      // If the user already has a role (e.g. they were an invited monitor who
      // accepted via accept_pending_invitations), skip onboarding entirely —
      // they don't need to create an org.
      if (hasOrg && activeOrgId) {
        const { data: roles } = await supabase
          .from('sv_user_roles')
          .select('role')
          .eq('user_id', user.id)
        if (cancelled) return
        const isOwnerTier = roles?.some(r =>
          ['platform_admin', 'agency_owner', 'agency_manager'].includes(r.role)
        )
        // Non-owner roles (monitors, attorneys, etc.) should never see
        // the agency-creation onboarding wizard — send them to dashboard.
        if (!isOwnerTier) {
          nav('/', { replace: true })
          return
        }
      }

      // Detect solo plans and prefill the form from the org the solo-signup
      // function already created (name, contact info, etc.).
      if (hasOrg && activeOrgId) {
        const { data: org } = await supabase
          .from('sv_organizations')
          .select('is_solo, plan, name, address_street, address_city, address_state, address_zip, license_number, service_areas, phone, email, website')
          .eq('id', activeOrgId)
          .maybeSingle()
        if (cancelled) return
        if (org) {
          if (org.is_solo || org.plan === 'solo') setIsSolo(true)
          setData((d) => ({
            ...d,
            org: {
              ...d.org,
              name: org.name || d.org.name,
              address_street: org.address_street || d.org.address_street,
              address_city: org.address_city || d.org.address_city,
              address_state: org.address_state || d.org.address_state,
              address_zip: org.address_zip || d.org.address_zip,
              license_number: org.license_number || d.org.license_number,
              service_areas: Array.isArray(org.service_areas) && org.service_areas.length
                ? org.service_areas.join(', ') : d.org.service_areas,
              phone: org.phone || d.org.phone,
              email: org.email || d.org.email,
              website: org.website || d.org.website,
            },
          }))
        }
      }

      const { data: row } = await supabase
        .from('sv_onboarding_progress')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle()
      if (cancelled) return
      if (row) {
        setProgress(row)
        setStep(Math.max(row.current_step || 1, 1))
        if (row.step_data) setData((d) => ({ ...d, ...row.step_data }))
        if (row.org_id) syncOrgId(row.org_id)
      }
      // If the row is stale (org_id missing) but the user already has an active
      // org via memberships, adopt it so subsequent steps post correctly.
      if (!orgIdRef.current && hasOrg && activeOrgId) {
        syncOrgId(activeOrgId)
      }
      if (hasOrg && activeOrgId && row?.completed) {
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

  const steps = isSolo ? SOLO_STEPS : AGENCY_STEPS

  async function persist(nextStep, completedSteps = null, extra = {}) {
    if (!user) return
    const payload = {
      user_id: user.id,
      org_id: orgIdRef.current,
      current_step: nextStep,
      completed_steps: completedSteps ?? progress?.completed_steps ?? [],
      step_data: data,
      completed: nextStep > steps.length,
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
      const s = steps[step - 1]
      const completed = Array.from(new Set([...(progress?.completed_steps || []), step]))

      if (s.key === 'org') {
        if (!data.org.name.trim()) throw new Error(isSolo ? 'Practice name is required.' : 'Organization name is required.')
        if (!orgIdRef.current) {
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
          syncOrgId(org.id)
          setActiveOrg(org.id)
          const { error: rErr } = await supabase.from('sv_user_roles').insert({
            user_id: user.id, org_id: org.id, role: 'agency_owner',
          })
          if (rErr && !String(rErr.message || '').includes('duplicate')) throw rErr
          await refresh()
        } else {
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
          }).eq('id', orgIdRef.current)
        }
      }

      const oid = orgIdRef.current

      if (s.key === 'services') {
        if (data.services.length === 0) throw new Error('Pick at least one service.')
        if (oid) await supabase.from('sv_organizations').update({ services: data.services }).eq('id', oid)
      }

      if (s.key === 'pricing' && oid) {
        await supabase.from('sv_organizations').update({ pricing: data.pricing }).eq('id', oid)
      }

      if (s.key === 'courts' && oid) {
        await supabase.from('sv_organizations').update({ court_affiliations: data.courts }).eq('id', oid)
      }

      if (s.key === 'invite' && data.invite.email.trim()) {
        if (!oid) throw new Error('Organization not created yet — go back to step 1.')
        const email = data.invite.email.trim().toLowerCase()
        let invited = false
        // For monitors, use the invite-monitor Edge Function so they also get
        // the onboarding email (how to sign up + install the app). Best-effort:
        // fall back to a plain invitation row if the function is unavailable so
        // onboarding never breaks.
        if (data.invite.role === 'monitor') {
          try {
            const { error: fnErr } = await supabase.functions.invoke('invite-monitor', {
              body: { org_id: oid, email },
            })
            if (!fnErr) invited = true
          } catch { /* fall through to direct insert */ }
        }
        if (!invited) {
          const { error: invErr } = await supabase.from('sv_invitations').insert({
            org_id: oid, email, role: data.invite.role, invited_by: user.id,
          })
          if (invErr && !String(invErr.message || '').includes('duplicate')) throw invErr
        }
      }

      if (s.key === 'case' && data.firstCase.case_number.trim()) {
        if (!oid) throw new Error('Organization not created yet — go back to step 1.')
        const cc = data.firstCase
        // Create the two parties (best-effort — they can be edited later in Cases)
        const partyInserts = []
        if (cc.custodial_first || cc.custodial_last) {
          partyInserts.push({
            first_name: cc.custodial_first || 'Custodial',
            last_name: cc.custodial_last || 'Parent',
            org_id: oid,
          })
        }
        if (cc.noncustodial_first || cc.noncustodial_last) {
          partyInserts.push({
            first_name: cc.noncustodial_first || 'Noncustodial',
            last_name: cc.noncustodial_last || 'Parent',
            org_id: oid,
          })
        }
        let custId = null, noncustId = null
        if (partyInserts.length > 0) {
          const { data: parties, error: pErr } = await supabase
            .from('sv_parties').insert(partyInserts).select()
          if (pErr) console.warn('party insert skipped:', pErr.message)
          if (parties?.[0]) custId = parties[0].id
          if (parties?.[1]) noncustId = parties[1].id
        }
        const caseInsert = {
          org_id: oid,
          case_number: cc.case_number,
          court_name: cc.court_name || 'TBD',
          status: 'intake',
          risk_level: 'medium',
          custodial_party_id: custId,
          noncustodial_party_id: noncustId,
        }
        const { error: caseErr } = await supabase.from('sv_cases').insert(caseInsert)
        if (caseErr) console.warn('first-case insert skipped:', caseErr.message)
      }

      const nextStep = step + 1
      await persist(nextStep, completed)
      if (nextStep > steps.length) {
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
    if (step + 1 > steps.length) {
      await refresh()
      nav('/', { replace: true })
    } else {
      setStep(step + 1)
    }
  }

  if (!loaded) return <div className="loading">Loading…</div>

  // Clamp in case a saved step index exceeds this flow's length (e.g. a solo
  // user whose progress row was written under the longer agency flow).
  const safeStep = Math.min(step, steps.length)
  const current = steps[safeStep - 1]

  return (
    <div className="shell-main" style={{ background: 'var(--gray-50)', minHeight: '100vh' }}>
      <div className="wizard-shell">
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Welcome to KaNun</div>
              <div className="page-subtitle">{isSolo ? "Let's set up your practice." : "Let's get your agency set up."}</div>
            </div>
            <div className="page-subtitle">Step {safeStep} of {steps.length}</div>
          </div>

          <div className="wizard-step-content">
            <div className="wizard-progress">
              {steps.map((s, i) => (
                <div
                  key={s.key}
                  className={`wizard-progress-step ${i + 1 === safeStep ? 'active' : ''} ${i + 1 < safeStep ? 'done' : ''}`}
                />
              ))}
            </div>

            <div className="wizard-step-meta">Step {safeStep} · {current.label}</div>
            {current.key === 'org' && <StepOrg data={data.org} update={(p) => update('org', p)} isSolo={isSolo} />}
            {current.key === 'services' && <StepServices data={data.services} setData={(v) => setData((d) => ({ ...d, services: v }))} isSolo={isSolo} />}
            {current.key === 'pricing' && <StepPricing data={data.pricing} update={(p) => update('pricing', p)} />}
            {current.key === 'courts' && <StepCourts data={data.courts} setData={(v) => setData((d) => ({ ...d, courts: v }))} orgState={data.org.address_state} />}
            {current.key === 'invite' && <StepInvite data={data.invite} update={(p) => update('invite', p)} />}
            {current.key === 'case' && <StepFirstCase data={data.firstCase} update={(p) => update('firstCase', p)} />}

            {err && <div className="auth-error" style={{ marginTop: 16 }}>{err}</div>}
          </div>

          <div className="wizard-buttons">
            <button className="btn btn-secondary" onClick={back} disabled={safeStep === 1 || busy}>← Back</button>
            <div className="btn-group">
              {safeStep > 1 && safeStep < steps.length && (
                <button className="btn btn-secondary" onClick={skip} disabled={busy}>Skip</button>
              )}
              <button className="btn btn-primary" onClick={next} disabled={busy}>
                {busy ? 'Saving…' : safeStep === steps.length ? 'Finish' : 'Continue →'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function StepOrg({ data, update, isSolo }) {
  return (
    <div>
      <h2 className="wizard-step-title">{isSolo ? 'Tell us about your practice' : 'Tell us about your agency'}</h2>
      <p className="wizard-step-desc">
        {isSolo
          ? 'This is the name clients and courts will see on your reports — many solo monitors simply use their own name.'
          : 'This is the organization name your clients and courts will see.'}
      </p>
      <div className="form-grid">
        <div className="form-group full">
          <label className="form-label">{isSolo ? 'Practice name' : 'Agency name'} <span className="required">*</span></label>
          <input className="form-input" value={data.name} onChange={(e) => update({ name: e.target.value })}
            placeholder={isSolo ? 'e.g. Jordan Rivera, Professional Monitor' : 'e.g. Riverside Family Connections'} />
        </div>
        <div className="form-group">
          <label className="form-label">{isSolo ? 'License / certification # (optional)' : 'License #'}</label>
          <input className="form-input" value={data.license_number} onChange={(e) => update({ license_number: e.target.value })} />
        </div>
        <div className="form-group">
          <label className="form-label">Service areas</label>
          <input className="form-input" value={data.service_areas} onChange={(e) => update({ service_areas: e.target.value })}
            placeholder={isSolo ? 'e.g. Maricopa County' : 'e.g. Los Angeles County, Orange County'} />
          <span className="form-help">Counties or regions you cover, comma-separated.</span>
        </div>
        {!isSolo && (
          <div className="form-group full">
            <label className="form-label">Street address</label>
            <input className="form-input" value={data.address_street} onChange={(e) => update({ address_street: e.target.value })} />
          </div>
        )}
        <div className="form-group">
          <label className="form-label">City</label>
          <input className="form-input" value={data.address_city} onChange={(e) => update({ address_city: e.target.value })} />
        </div>
        <div className="form-group">
          <label className="form-label">State</label>
          <select className="form-select" value={data.address_state} onChange={(e) => update({ address_state: e.target.value })}>
            {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        {!isSolo && (
          <div className="form-group">
            <label className="form-label">Zip</label>
            <input className="form-input" value={data.address_zip} onChange={(e) => update({ address_zip: e.target.value })} />
          </div>
        )}
        <div className="form-group">
          <label className="form-label">Phone</label>
          <input className="form-input" value={data.phone} onChange={(e) => update({ phone: e.target.value })} />
        </div>
        <div className="form-group">
          <label className="form-label">Public email</label>
          <input className="form-input" value={data.email} onChange={(e) => update({ email: e.target.value })} />
        </div>
        <div className="form-group full">
          <label className="form-label">Website (optional)</label>
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

function StepCourts({ data, setData, orgState }) {
  const [stateSel, setStateSel] = useState(US_STATES.includes(orgState) ? orgState : 'CA')
  const [custom, setCustom] = useState('')

  function toggle(c) {
    setData(data.includes(c) ? data.filter((x) => x !== c) : [...data, c])
  }
  function addCustom() {
    const name = custom.trim()
    if (!name) return
    if (!data.includes(name)) setData([...data, name])
    setCustom('')
  }

  const curated = stateSel === 'CA' ? LA_COURTS : []

  return (
    <div>
      <h2 className="wizard-step-title">Which courts do you serve?</h2>
      <p className="wizard-step-desc">This helps surface the right court on each new case. You can add more later.</p>

      <div className="form-grid" style={{ marginBottom: 16 }}>
        <div className="form-group">
          <label className="form-label">State</label>
          <select className="form-select" value={stateSel} onChange={(e) => setStateSel(e.target.value)}>
            {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {curated.length > 0 && (
        <>
          <p className="form-help" style={{ marginBottom: 10 }}>
            Los Angeles County courthouses — more counties coming. Don't see yours? Add it below.
          </p>
          <div className="choice-grid">
            {curated.map((c) => (
              <label key={c} className={`choice ${data.includes(c) ? 'checked' : ''}`}>
                <input type="checkbox" checked={data.includes(c)} onChange={() => toggle(c)} />
                <div><div className="choice-title">{c}</div></div>
              </label>
            ))}
          </div>
        </>
      )}

      <div className="form-grid" style={{ marginTop: 18 }}>
        <div className="form-group full">
          <label className="form-label">{curated.length > 0 ? 'Add another court' : `Add the courts you serve in ${stateSel}`}</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="form-input" value={custom}
              onChange={(e) => setCustom(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustom() } }}
              placeholder={`e.g. ${stateSel === 'CA' ? 'Orange County Superior Court' : 'your county family court'}`} />
            <button type="button" className="btn btn-secondary" onClick={addCustom}>Add</button>
          </div>
          <span className="form-help">Press Enter or Add after each court.</span>
        </div>
      </div>

      {data.filter((c) => !curated.includes(c)).length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          {data.filter((c) => !curated.includes(c)).map((c) => (
            <span key={c} className="badge" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 10px', border: '1px solid var(--gray-300, #d1d5db)', borderRadius: 6, fontSize: 13 }}>
              {c}
              <button type="button" onClick={() => toggle(c)} aria-label={`Remove ${c}`}
                style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function StepInvite({ data, update }) {
  return (
    <div>
      <h2 className="wizard-step-title">Invite your first monitor</h2>
      <p className="wizard-step-desc">They'll get access when they sign up with this email. (Optional — you can skip.)</p>
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
