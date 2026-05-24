import React, { useEffect, useState } from 'react'
import { supabase } from '../supabase'

const QUALIFICATIONS = [
  { value: 'age_21_plus', label: '21 years of age or older' },
  { value: 'no_record_civil', label: 'No record of conviction for any offense relevant to child abuse' },
  { value: 'no_cps_findings', label: 'No CPS-substantiated findings of child abuse or neglect' },
  { value: 'no_restraining_orders', label: 'No current restraining or protective order' },
  { value: 'no_dv_convictions', label: 'No conviction for DV in the last 10 years' },
  { value: 'sexual_abuse_trained', label: 'Trained for sexual-abuse cases per Standard 5.20(m)' },
  { value: 'cpr_first_aid', label: 'Current CPR and First Aid certification' }
]

function fmtDate(s) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function yesNo(b) {
  if (b === true) return <span className="badge badge-green">Yes</span>
  if (b === false) return <span className="badge badge-red">No</span>
  return <span className="badge badge-gray">—</span>
}

const initialForm = {
  first_name: '',
  last_name: '',
  email: '',
  phone: '',
  hire_date: '',
  training_hours_completed: 0,
  livescan_completed: false,
  livescan_date: '',
  trustline_registered: false,
  trustline_date: '',
  kcm_certified: false,
  kcm_date: '',
  qualifications: [],
  active: true
}

export default function Monitors() {
  const [loading, setLoading] = useState(true)
  const [monitors, setMonitors] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(initialForm)
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState(null)

  useEffect(() => {
    load()
  }, [])

  function showToast(message, kind = 'success') {
    setToast({ message, kind })
    setTimeout(() => setToast(null), 3500)
  }

  async function load() {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('sv_monitors')
        .select('*')
        .order('last_name', { ascending: true })
      if (error) throw error
      setMonitors(data || [])
    } catch (err) {
      console.error('Monitors load error:', err)
    } finally {
      setLoading(false)
    }
  }

  function toggleQual(value) {
    setForm((f) => ({
      ...f,
      qualifications: f.qualifications.includes(value)
        ? f.qualifications.filter((q) => q !== value)
        : [...f.qualifications, value]
    }))
  }

  async function submit() {
    if (!form.first_name || !form.last_name) {
      showToast('First and last name required', 'error')
      return
    }
    setSubmitting(true)
    try {
      const payload = {
        ...form,
        hire_date: form.hire_date || null,
        livescan_date: form.livescan_date || null,
        trustline_date: form.trustline_date || null,
        kcm_date: form.kcm_date || null,
        training_hours_completed: Number(form.training_hours_completed) || 0
      }
      const { error } = await supabase.from('sv_monitors').insert([payload])
      if (error) throw error
      showToast('Monitor added')
      setForm(initialForm)
      setShowForm(false)
      load()
    } catch (err) {
      console.error('Add monitor error:', err)
      showToast(err.message || 'Failed to add monitor', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Monitors</h1>
          <div className="page-subtitle">Qualifications tracked per Standard 5.20(e)</div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm((s) => !s)}>
          {showForm ? 'Cancel' : '+ Add Monitor'}
        </button>
      </div>

      {showForm && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">New Monitor</div>
          </div>
          <div className="card-body">
            <div className="form-section">
              <h3 className="form-section-title">Contact</h3>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">First Name <span className="required">*</span></label>
                  <input
                    className="form-input"
                    value={form.first_name}
                    onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Last Name <span className="required">*</span></label>
                  <input
                    className="form-input"
                    value={form.last_name}
                    onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Email</label>
                  <input
                    type="email"
                    className="form-input"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Phone</label>
                  <input
                    type="tel"
                    className="form-input"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Hire Date</label>
                  <input
                    type="date"
                    className="form-input"
                    value={form.hire_date}
                    onChange={(e) => setForm({ ...form, hire_date: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Training Hours Completed</label>
                  <input
                    type="number"
                    min="0"
                    className="form-input"
                    value={form.training_hours_completed}
                    onChange={(e) => setForm({ ...form, training_hours_completed: e.target.value })}
                  />
                  <span className="form-help">Standard 5.20(f) requires 24 hours minimum.</span>
                </div>
              </div>
            </div>

            <div className="form-section">
              <h3 className="form-section-title">Background Clearances</h3>
              <div className="form-grid-3">
                <div className="form-group">
                  <label className="form-checkbox-label">
                    <input
                      type="checkbox"
                      checked={form.livescan_completed}
                      onChange={(e) => setForm({ ...form, livescan_completed: e.target.checked })}
                    />
                    <span><strong>LiveScan completed</strong></span>
                  </label>
                  <input
                    type="date"
                    className="form-input"
                    value={form.livescan_date}
                    onChange={(e) => setForm({ ...form, livescan_date: e.target.value })}
                    disabled={!form.livescan_completed}
                  />
                </div>
                <div className="form-group">
                  <label className="form-checkbox-label">
                    <input
                      type="checkbox"
                      checked={form.trustline_registered}
                      onChange={(e) => setForm({ ...form, trustline_registered: e.target.checked })}
                    />
                    <span><strong>TrustLine registered</strong></span>
                  </label>
                  <input
                    type="date"
                    className="form-input"
                    value={form.trustline_date}
                    onChange={(e) => setForm({ ...form, trustline_date: e.target.value })}
                    disabled={!form.trustline_registered}
                  />
                </div>
                <div className="form-group">
                  <label className="form-checkbox-label">
                    <input
                      type="checkbox"
                      checked={form.kcm_certified}
                      onChange={(e) => setForm({ ...form, kcm_certified: e.target.checked })}
                    />
                    <span><strong>KCM certified</strong></span>
                  </label>
                  <input
                    type="date"
                    className="form-input"
                    value={form.kcm_date}
                    onChange={(e) => setForm({ ...form, kcm_date: e.target.value })}
                    disabled={!form.kcm_certified}
                  />
                </div>
              </div>
            </div>

            <div className="form-section">
              <h3 className="form-section-title">Qualifications — Standard 5.20(e)</h3>
              <div className="form-checkbox-group">
                {QUALIFICATIONS.map((q) => (
                  <label key={q.value} className="form-checkbox-label">
                    <input
                      type="checkbox"
                      checked={form.qualifications.includes(q.value)}
                      onChange={() => toggleQual(q.value)}
                    />
                    <span>{q.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="btn-group right">
              <button className="btn btn-secondary" onClick={() => { setForm(initialForm); setShowForm(false) }} disabled={submitting}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={submit} disabled={submitting}>
                {submitting ? 'Saving…' : 'Save Monitor'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <div className="card-title">All Monitors</div>
          <div className="cell-muted">{monitors.length} total</div>
        </div>
        <div className="card-body-flush">
          {loading ? (
            <div className="loading">Loading monitors…</div>
          ) : monitors.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-title">No monitors yet</div>
              <div className="empty-state-desc">Add a monitor to begin assigning visits.</div>
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Training</th>
                  <th>LiveScan</th>
                  <th>TrustLine</th>
                  <th>KCM</th>
                  <th>Hired</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {monitors.map((m) => (
                  <tr key={m.id}>
                    <td className="cell-strong">{m.first_name} {m.last_name}</td>
                    <td className="cell-muted">{m.email || '—'}</td>
                    <td>
                      <span className={(m.training_hours_completed || 0) >= 24 ? 'badge badge-green' : 'badge badge-yellow'}>
                        {m.training_hours_completed || 0} hrs
                      </span>
                    </td>
                    <td>{yesNo(m.livescan_completed)}</td>
                    <td>{yesNo(m.trustline_registered)}</td>
                    <td>{yesNo(m.kcm_certified)}</td>
                    <td className="cell-muted">{fmtDate(m.hire_date)}</td>
                    <td>{m.active ? <span className="badge badge-green">Active</span> : <span className="badge badge-gray">Inactive</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {toast && (
        <div className={`toast ${toast.kind === 'error' ? 'error' : ''}`}>{toast.message}</div>
      )}
    </div>
  )
}
