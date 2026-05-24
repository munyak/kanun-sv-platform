import React, { useEffect, useState } from 'react'
import { supabase } from '../supabase'

const STATUS_OPTIONS = [
  'scheduled', 'confirmed', 'in_progress', 'completed',
  'canceled_custodial', 'canceled_noncustodial', 'canceled_provider',
  'no_show_custodial', 'no_show_noncustodial', 'interrupted', 'terminated',
]

export default function VisitForm({ orgId, visit, onClose, onSaved }) {
  const isEdit = !!visit?.id
  const [cases, setCases] = useState([])
  const [monitors, setMonitors] = useState([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  const [form, setForm] = useState({
    case_id: visit?.case?.id || visit?.case_id || '',
    monitor_id: visit?.monitor?.id || visit?.monitor_id || '',
    scheduled_date: visit?.scheduled_date || new Date().toISOString().slice(0, 10),
    scheduled_start_time: (visit?.scheduled_start_time || '10:00').slice(0, 5),
    scheduled_end_time: (visit?.scheduled_end_time || '12:00').slice(0, 5),
    location: visit?.location || '',
    status: visit?.status || 'scheduled',
  })

  useEffect(() => {
    (async () => {
      const [c, m] = await Promise.all([
        supabase.from('sv_cases').select('id, case_number, status, preferred_location, primary_monitor_id').eq('org_id', orgId).order('created_at', { ascending: false }),
        supabase.from('sv_monitors').select('id, first_name, last_name, status, active').eq('org_id', orgId).order('last_name', { ascending: true }),
      ])
      setCases(c.data || [])
      setMonitors((m.data || []).filter((x) => x.active !== false))
    })()
  }, [orgId])

  // When a case is picked, prefill location/monitor from the case
  useEffect(() => {
    if (!form.case_id || isEdit) return
    const c = cases.find((x) => x.id === form.case_id)
    if (!c) return
    setForm((f) => ({
      ...f,
      location: f.location || c.preferred_location || '',
      monitor_id: f.monitor_id || c.primary_monitor_id || '',
    }))
  }, [form.case_id, cases, isEdit])

  async function save() {
    setBusy(true); setErr(null)
    try {
      if (!form.case_id) throw new Error('Pick a case.')
      if (!form.monitor_id) throw new Error('Pick a monitor.')
      if (!form.location) throw new Error('Location is required.')
      if (form.scheduled_end_time <= form.scheduled_start_time)
        throw new Error('End time must be after start time.')

      const payload = {
        org_id: orgId,
        case_id: form.case_id,
        monitor_id: form.monitor_id,
        scheduled_date: form.scheduled_date,
        scheduled_start_time: form.scheduled_start_time,
        scheduled_end_time: form.scheduled_end_time,
        location: form.location,
        status: form.status,
      }
      const { error } = isEdit
        ? await supabase.from('sv_visits').update(payload).eq('id', visit.id)
        : await supabase.from('sv_visits').insert(payload)
      if (error) throw error
      onSaved?.()
    } catch (e) {
      setErr(e.message || 'Could not save visit.')
    } finally { setBusy(false) }
  }

  async function remove() {
    if (!isEdit) return
    if (!confirm('Delete this visit?')) return
    setBusy(true); setErr(null)
    try {
      const { error } = await supabase.from('sv_visits').delete().eq('id', visit.id)
      if (error) throw error
      onSaved?.()
    } catch (e) {
      setErr(e.message); setBusy(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="card-title">{isEdit ? 'Edit visit' : 'Schedule visit'}</div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="form-grid">
            <div className="form-group full">
              <label className="form-label">Case <span className="required">*</span></label>
              <select className="form-select" value={form.case_id}
                onChange={(e) => setForm({ ...form, case_id: e.target.value })}>
                <option value="">Select a case…</option>
                {cases.map((c) => (
                  <option key={c.id} value={c.id}>{c.case_number} {c.status ? `(${c.status})` : ''}</option>
                ))}
              </select>
            </div>
            <div className="form-group full">
              <label className="form-label">Monitor <span className="required">*</span></label>
              <select className="form-select" value={form.monitor_id}
                onChange={(e) => setForm({ ...form, monitor_id: e.target.value })}>
                <option value="">Select a monitor…</option>
                {monitors.map((m) => (
                  <option key={m.id} value={m.id}>{m.first_name} {m.last_name}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Date</label>
              <input type="date" className="form-input" value={form.scheduled_date}
                onChange={(e) => setForm({ ...form, scheduled_date: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Status</label>
              <select className="form-select" value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>{s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Start time</label>
              <input type="time" className="form-input" value={form.scheduled_start_time}
                onChange={(e) => setForm({ ...form, scheduled_start_time: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">End time</label>
              <input type="time" className="form-input" value={form.scheduled_end_time}
                onChange={(e) => setForm({ ...form, scheduled_end_time: e.target.value })} />
            </div>
            <div className="form-group full">
              <label className="form-label">Location <span className="required">*</span></label>
              <input className="form-input" value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                placeholder="e.g. Cypress Park Library — Family Room" />
            </div>
          </div>
          {err && <div className="auth-error" style={{ marginTop: 12 }}>{err}</div>}
        </div>
        <div className="modal-foot">
          {isEdit && <button className="btn btn-secondary" style={{ color: 'var(--red-700)' }} onClick={remove} disabled={busy}>Delete</button>}
          <div className="btn-group" style={{ marginLeft: 'auto' }}>
            <button className="btn btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
            <button className="btn btn-primary" onClick={save} disabled={busy}>
              {busy ? 'Saving…' : isEdit ? 'Save changes' : 'Schedule'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
