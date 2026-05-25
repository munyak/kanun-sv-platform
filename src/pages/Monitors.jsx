import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabase'
import { useAuth } from '../auth/AuthContext'
import Drawer from '../components/Drawer'

// Maps to the real sv_monitors schema — booleans + status enum.
const QUALS = [
  { key: 'is_21_or_older',                 label: '21 years of age or older' },
  { key: 'no_crime_against_person',        label: 'No conviction for crime against a person' },
  { key: 'no_dui_5_years',                 label: 'No DUI in the last 5 years' },
  { key: 'no_probation_10_years',          label: 'No probation in the last 10 years' },
  { key: 'no_restraining_orders_10_years', label: 'No restraining order in the last 10 years' },
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

function statusBadge(s) {
  const map = {
    active: 'badge-green',
    inactive: 'badge-gray',
    pending_verification: 'badge-yellow',
    suspended: 'badge-red',
  }
  const cls = map[s] || 'badge-gray'
  const label = (s || 'unknown').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  return <span className={`badge ${cls}`}>{label}</span>
}

const initialForm = {
  first_name: '',
  last_name: '',
  email: '',
  phone: '',
  date_of_birth: '',
  status: 'pending_verification',
  is_21_or_older: false,
  no_crime_against_person: false,
  no_dui_5_years: false,
  no_probation_10_years: false,
  no_restraining_orders_10_years: false,
  livescan_completed: false,
  livescan_date: '',
  trustline_registered: false,
  trustline_number: '',
  trustline_expiry: '',
  training_hours_completed: 0,
  training_completed_date: '',
  mandated_reporter_training_date: '',
  kcm_certified: false,
  kcm_certification_date: '',
  kcm_expiry_date: '',
  fl324p_signed: false,
  fl324p_signed_date: '',
  has_vehicle: false,
  auto_insurance_verified: false,
  languages: 'English',
  active: true,
}

export default function Monitors() {
  const { activeOrgId } = useAuth()
  const [loading, setLoading] = useState(true)
  const [monitors, setMonitors] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(initialForm)
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState(null)

  useEffect(() => { if (activeOrgId) load() }, [activeOrgId])

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
        .eq('org_id', activeOrgId)
        .order('last_name', { ascending: true })
      if (error) throw error
      setMonitors(data || [])
    } catch (err) {
      console.error('Monitors load error:', err)
      showToast(err.message || 'Could not load monitors', 'error')
    } finally {
      setLoading(false)
    }
  }

  async function submit() {
    if (!form.first_name || !form.last_name) {
      showToast('First and last name required', 'error')
      return
    }
    if (!form.email) {
      showToast('Email required', 'error')
      return
    }
    setSubmitting(true)
    try {
      const payload = {
        org_id: activeOrgId,
        first_name: form.first_name,
        last_name: form.last_name,
        email: form.email,
        phone: form.phone || null,
        date_of_birth: form.date_of_birth || null,
        status: form.status,
        is_21_or_older: !!form.is_21_or_older,
        no_crime_against_person: !!form.no_crime_against_person,
        no_dui_5_years: !!form.no_dui_5_years,
        no_probation_10_years: !!form.no_probation_10_years,
        no_restraining_orders_10_years: !!form.no_restraining_orders_10_years,
        livescan_completed: !!form.livescan_completed,
        livescan_date: form.livescan_date || null,
        trustline_registered: !!form.trustline_registered,
        trustline_number: form.trustline_number || null,
        trustline_expiry: form.trustline_expiry || null,
        training_hours_completed: Number(form.training_hours_completed) || 0,
        training_completed_date: form.training_completed_date || null,
        mandated_reporter_training_date: form.mandated_reporter_training_date || null,
        kcm_certified: !!form.kcm_certified,
        kcm_certification_date: form.kcm_certification_date || null,
        kcm_expiry_date: form.kcm_expiry_date || null,
        fl324p_signed: !!form.fl324p_signed,
        fl324p_signed_date: form.fl324p_signed_date || null,
        has_vehicle: !!form.has_vehicle,
        auto_insurance_verified: !!form.auto_insurance_verified,
        languages: form.languages.split(',').map((s) => s.trim()).filter(Boolean),
        active: !!form.active,
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

  function trainingBadge(hours) {
    const h = Number(hours) || 0
    if (h >= 24) return <span className="badge badge-green">{h} hrs</span>
    return <span className="badge badge-yellow">{h} hrs</span>
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Monitors</h1>
          <div className="page-subtitle">Qualifications tracked per California Standard 5.20(e)</div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>
          + Add Monitor
        </button>
      </div>

      <Drawer
        open={showForm}
        onClose={() => { setForm(initialForm); setShowForm(false) }}
        title="New monitor"
        subtitle="Standard 5.20 qualifications & clearances"
        width={620}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => { setForm(initialForm); setShowForm(false) }} disabled={submitting}>Cancel</button>
            <button className="btn btn-primary" onClick={submit} disabled={submitting}>
              {submitting ? 'Saving…' : 'Save monitor'}
            </button>
          </>
        }
      >
        <div className="form-section">
              <h3 className="form-section-title">Contact</h3>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">First Name <span className="required">*</span></label>
                  <input className="form-input" value={form.first_name}
                    onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Last Name <span className="required">*</span></label>
                  <input className="form-input" value={form.last_name}
                    onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Email <span className="required">*</span></label>
                  <input type="email" className="form-input" value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Phone</label>
                  <input type="tel" className="form-input" value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Date of Birth</label>
                  <input type="date" className="form-input" value={form.date_of_birth}
                    onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Status</label>
                  <select className="form-select" value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value })}>
                    <option value="pending_verification">Pending verification</option>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="suspended">Suspended</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Languages (comma-separated)</label>
                  <input className="form-input" value={form.languages}
                    onChange={(e) => setForm({ ...form, languages: e.target.value })} />
                </div>
              </div>
            </div>

            <div className="form-section">
              <h3 className="form-section-title">Eligibility — Standard 5.20(e)</h3>
              <div className="form-checkbox-group">
                {QUALS.map((q) => (
                  <label key={q.key} className="form-checkbox-label">
                    <input type="checkbox" checked={form[q.key]}
                      onChange={(e) => setForm({ ...form, [q.key]: e.target.checked })} />
                    <span>{q.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="form-section">
              <h3 className="form-section-title">Background Clearances</h3>
              <div className="form-grid-3">
                <div className="form-group">
                  <label className="form-checkbox-label">
                    <input type="checkbox" checked={form.livescan_completed}
                      onChange={(e) => setForm({ ...form, livescan_completed: e.target.checked })} />
                    <span><strong>LiveScan completed</strong></span>
                  </label>
                  <input type="date" className="form-input" value={form.livescan_date}
                    disabled={!form.livescan_completed}
                    onChange={(e) => setForm({ ...form, livescan_date: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-checkbox-label">
                    <input type="checkbox" checked={form.trustline_registered}
                      onChange={(e) => setForm({ ...form, trustline_registered: e.target.checked })} />
                    <span><strong>TrustLine registered</strong></span>
                  </label>
                  <input className="form-input" placeholder="TrustLine #"
                    disabled={!form.trustline_registered}
                    value={form.trustline_number}
                    onChange={(e) => setForm({ ...form, trustline_number: e.target.value })} />
                  <input type="date" className="form-input" value={form.trustline_expiry}
                    disabled={!form.trustline_registered}
                    onChange={(e) => setForm({ ...form, trustline_expiry: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-checkbox-label">
                    <input type="checkbox" checked={form.kcm_certified}
                      onChange={(e) => setForm({ ...form, kcm_certified: e.target.checked })} />
                    <span><strong>KCM certified</strong></span>
                  </label>
                  <input type="date" className="form-input" value={form.kcm_certification_date}
                    disabled={!form.kcm_certified}
                    onChange={(e) => setForm({ ...form, kcm_certification_date: e.target.value })} />
                  <input type="date" className="form-input" value={form.kcm_expiry_date}
                    placeholder="Expiry"
                    disabled={!form.kcm_certified}
                    onChange={(e) => setForm({ ...form, kcm_expiry_date: e.target.value })} />
                </div>
              </div>
            </div>

            <div className="form-section">
              <h3 className="form-section-title">Training & Forms</h3>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Training hours completed</label>
                  <input type="number" min="0" step="0.5" className="form-input"
                    value={form.training_hours_completed}
                    onChange={(e) => setForm({ ...form, training_hours_completed: e.target.value })} />
                  <span className="form-help">Standard 5.20(f) requires 24 hours minimum.</span>
                </div>
                <div className="form-group">
                  <label className="form-label">Training completed on</label>
                  <input type="date" className="form-input" value={form.training_completed_date}
                    onChange={(e) => setForm({ ...form, training_completed_date: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Mandated reporter training date</label>
                  <input type="date" className="form-input" value={form.mandated_reporter_training_date}
                    onChange={(e) => setForm({ ...form, mandated_reporter_training_date: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-checkbox-label">
                    <input type="checkbox" checked={form.fl324p_signed}
                      onChange={(e) => setForm({ ...form, fl324p_signed: e.target.checked })} />
                    <span><strong>FL-324(P) signed</strong></span>
                  </label>
                  <input type="date" className="form-input" value={form.fl324p_signed_date}
                    disabled={!form.fl324p_signed}
                    onChange={(e) => setForm({ ...form, fl324p_signed_date: e.target.value })} />
                </div>
              </div>
            </div>

            <div className="form-section">
              <h3 className="form-section-title">Logistics</h3>
              <div className="form-grid-3">
                <label className="form-checkbox-label">
                  <input type="checkbox" checked={form.has_vehicle}
                    onChange={(e) => setForm({ ...form, has_vehicle: e.target.checked })} />
                  <span>Has a vehicle</span>
                </label>
                <label className="form-checkbox-label">
                  <input type="checkbox" checked={form.auto_insurance_verified}
                    onChange={(e) => setForm({ ...form, auto_insurance_verified: e.target.checked })} />
                  <span>Auto insurance verified</span>
                </label>
                <label className="form-checkbox-label">
                  <input type="checkbox" checked={form.active}
                    onChange={(e) => setForm({ ...form, active: e.target.checked })} />
                  <span>Currently active</span>
                </label>
              </div>
            </div>
      </Drawer>

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
                  <th>Status</th>
                  <th>Training</th>
                  <th>LiveScan</th>
                  <th>TrustLine</th>
                  <th>KCM</th>
                  <th>Vehicle</th>
                  <th>Joined</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {monitors.map((m) => (
                  <tr key={m.id}>
                    <td className="cell-strong">{m.first_name} {m.last_name}<div className="cell-muted">{m.email || ''}</div></td>
                    <td>{statusBadge(m.status)}</td>
                    <td>{trainingBadge(m.training_hours_completed)}</td>
                    <td>{yesNo(m.livescan_completed)}</td>
                    <td>{yesNo(m.trustline_registered)}</td>
                    <td>{yesNo(m.kcm_certified)}</td>
                    <td>{yesNo(m.has_vehicle)}</td>
                    <td className="cell-muted">{fmtDate(m.created_at)}</td>
                    <td><Link to={`/monitors/${m.id}`} className="btn btn-sm btn-secondary">View →</Link></td>
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
