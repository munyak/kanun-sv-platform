import React, { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import Drawer from './Drawer'

const SUPERVISION_TYPES = ['supervised_visitation', 'monitored_exchange', 'therapeutic']
const RISK_LEVELS = ['low', 'medium', 'high', 'critical']

/**
 * Quick-create case form. For deeper intake (parties, children, full risk
 * assessment) the user can go to /intake. This drawer captures the minimum
 * needed to open a case file: case number, court, supervision type,
 * preferred location, cadence, and primary monitor.
 */
export default function CaseForm({ orgId, onClose, onSaved }) {
  const [monitors, setMonitors] = useState([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [form, setForm] = useState({
    case_number: '',
    court_name: '',
    referral_source: '',
    supervision_type: 'supervised_visitation',
    risk_level: 'medium',
    visit_frequency: 'weekly',
    visit_duration_minutes: 120,
    preferred_location: '',
    primary_monitor_id: '',
    rate_per_visit: 0,
    status: 'intake',
  })

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('sv_monitors')
        .select('id, first_name, last_name, active')
        .eq('org_id', orgId)
        .order('last_name')
      setMonitors((data || []).filter((m) => m.active !== false))
    })()
  }, [orgId])

  async function save() {
    setBusy(true); setErr(null)
    try {
      if (!form.case_number) throw new Error('Case number is required.')
      const payload = {
        org_id: orgId,
        case_number: form.case_number,
        court_name: form.court_name || null,
        referral_source: form.referral_source || null,
        supervision_type: form.supervision_type,
        risk_level: form.risk_level,
        visit_frequency: form.visit_frequency,
        visit_duration_minutes: Number(form.visit_duration_minutes) || 120,
        preferred_location: form.preferred_location || null,
        primary_monitor_id: form.primary_monitor_id || null,
        rate_per_visit: Number(form.rate_per_visit) || 0,
        status: form.status,
      }
      const { data, error } = await supabase
        .from('sv_cases')
        .insert(payload)
        .select('id')
        .single()
      if (error) throw error
      onSaved?.(data)
    } catch (e) {
      setErr(e.message || 'Could not create case.')
    } finally { setBusy(false) }
  }

  return (
    <Drawer
      open
      onClose={onClose}
      title="New case"
      subtitle="Open a case file. You can complete intake from the case detail page."
      width={600}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={busy}>
            {busy ? 'Saving…' : 'Create case'}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <div className="form-group">
          <label className="form-label">Case # <span className="required">*</span></label>
          <input className="form-input cell-mono" value={form.case_number}
            onChange={(e) => setForm({ ...form, case_number: e.target.value })}
            placeholder="e.g. 25STFL01234" />
        </div>
        <div className="form-group">
          <label className="form-label">Court</label>
          <input className="form-input" value={form.court_name}
            onChange={(e) => setForm({ ...form, court_name: e.target.value })}
            placeholder="LA Superior Court — Family" />
        </div>
        <div className="form-group">
          <label className="form-label">Referral source</label>
          <input className="form-input" value={form.referral_source}
            onChange={(e) => setForm({ ...form, referral_source: e.target.value })}
            placeholder="Attorney, court, self-referral…" />
        </div>
        <div className="form-group">
          <label className="form-label">Supervision type</label>
          <select className="form-select" value={form.supervision_type}
            onChange={(e) => setForm({ ...form, supervision_type: e.target.value })}>
            {SUPERVISION_TYPES.map((s) => (
              <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Risk level</label>
          <select className="form-select" value={form.risk_level}
            onChange={(e) => setForm({ ...form, risk_level: e.target.value })}>
            {RISK_LEVELS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Visit cadence</label>
          <input className="form-input" value={form.visit_frequency}
            onChange={(e) => setForm({ ...form, visit_frequency: e.target.value })}
            placeholder="weekly, biweekly…" />
        </div>
        <div className="form-group">
          <label className="form-label">Visit duration (min)</label>
          <input type="number" min="30" step="15" className="form-input" value={form.visit_duration_minutes}
            onChange={(e) => setForm({ ...form, visit_duration_minutes: e.target.value })} />
        </div>
        <div className="form-group">
          <label className="form-label">Rate per visit ($)</label>
          <input type="number" min="0" step="1" className="form-input" value={form.rate_per_visit}
            onChange={(e) => setForm({ ...form, rate_per_visit: e.target.value })} />
        </div>
        <div className="form-group full">
          <label className="form-label">Preferred location</label>
          <input className="form-input" value={form.preferred_location}
            onChange={(e) => setForm({ ...form, preferred_location: e.target.value })}
            placeholder="e.g. Cypress Park Library — Family Room" />
        </div>
        <div className="form-group full">
          <label className="form-label">Primary monitor</label>
          <select className="form-select" value={form.primary_monitor_id}
            onChange={(e) => setForm({ ...form, primary_monitor_id: e.target.value })}>
            <option value="">Unassigned</option>
            {monitors.map((m) => (
              <option key={m.id} value={m.id}>{m.first_name} {m.last_name}</option>
            ))}
          </select>
        </div>
      </div>
      {err && <div className="auth-error" style={{ marginTop: 12 }}>{err}</div>}
    </Drawer>
  )
}
