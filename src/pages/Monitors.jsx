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
  const { activeOrgId, user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [monitors, setMonitors] = useState([])
  const [pendingInvites, setPendingInvites] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(initialForm)
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState(null)

  const [showInvite, setShowInvite] = useState(false)
  const [inviteForm, setInviteForm] = useState({ first_name: '', last_name: '', email: '', phone: '' })
  const [inviting, setInviting] = useState(false)
  const [inviteLink, setInviteLink] = useState(null)

  useEffect(() => { if (activeOrgId) load() }, [activeOrgId])

  function showToast(message, kind = 'success') {
    setToast({ message, kind })
    setTimeout(() => setToast(null), 3500)
  }

  async function load() {
    setLoading(true)
    try {
      const [mRes, invRes] = await Promise.all([
        supabase.from('sv_monitors').select('*').eq('org_id', activeOrgId).order('last_name', { ascending: true }),
        supabase.from('sv_invitations')
          .select('id, email, role, expires_at, accepted_at, created_at')
          .eq('org_id', activeOrgId)
          .eq('role', 'monitor')
          .is('accepted_at', null)
          .order('created_at', { ascending: false }),
      ])
      if (mRes.error) throw mRes.error
      setMonitors(mRes.data || [])
      setPendingInvites(invRes.data || [])
    } catch (err) {
      console.error('Monitors load error:', err)
      showToast(err.message || 'Could not load monitors', 'error')
    } finally {
      setLoading(false)
    }
  }

  async function sendInvite() {
    const email = (inviteForm.email || '').trim().toLowerCase()
    if (!inviteForm.first_name.trim() || !inviteForm.last_name.trim()) {
      showToast('First and last name required', 'error'); return
    }
    if (!email) { showToast('Email required', 'error'); return }
    setInviting(true)
    setInviteLink(null)
    try {
      // 1) Placeholder monitor record so the new hire appears in the list
      //    even before they accept. status=pending_verification, active=false.
      const { data: existing } = await supabase
        .from('sv_monitors').select('id, user_id, email')
        .eq('org_id', activeOrgId).ilike('email', email).maybeSingle()
      if (!existing) {
        const { error: mErr } = await supabase.from('sv_monitors').insert({
          org_id: activeOrgId,
          first_name: inviteForm.first_name.trim(),
          last_name: inviteForm.last_name.trim(),
          email,
          phone: inviteForm.phone || null,
          status: 'pending_verification',
          active: false,
        })
        if (mErr) throw mErr
      }

      // 2) Invitation row — the auth.users trigger will assign role +
      //    link sv_monitors.user_id when the invitee signs up.
      const { error: invErr } = await supabase.from('sv_invitations').insert({
        org_id: activeOrgId,
        email,
        role: 'monitor',
        invited_by: user?.id || null,
      })
      if (invErr && !String(invErr.message || '').includes('duplicate')) throw invErr

      // 3) Show a signup link the owner can share if email delivery isn't
      //    set up yet. We can't send a real magic link from the browser
      //    without the service role key.
      const link = `${window.location.origin}/signup?email=${encodeURIComponent(email)}`
      setInviteLink(link)
      showToast('Invitation created')
      setInviteForm({ first_name: '', last_name: '', email: '', phone: '' })
      load()
    } catch (err) {
      console.error('Invite monitor error:', err)
      showToast(err.message || 'Failed to invite monitor', 'error')
    } finally {
      setInviting(false)
    }
  }

  async function revokeInvite(id) {
    if (!confirm('Revoke this invitation?')) return
    const { error } = await supabase.from('sv_invitations').delete().eq('id', id)
    if (error) showToast(error.message, 'error')
    else { showToast('Invitation revoked'); load() }
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
        <div className="btn-group">
          <button className="btn btn-secondary" onClick={() => { setInviteLink(null); setShowInvite(true) }}>
            Invite monitor
          </button>
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>
            Add monitor
          </button>
        </div>
      </div>

      <Drawer
        open={showInvite}
        onClose={() => { setInviteLink(null); setShowInvite(false) }}
        title="Invite a monitor"
        subtitle="Send a signup link so they can join your agency"
        width={520}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => { setInviteLink(null); setShowInvite(false) }} disabled={inviting}>Close</button>
            {!inviteLink && (
              <button className="btn btn-primary" onClick={sendInvite} disabled={inviting}>
                {inviting ? 'Inviting…' : 'Create invitation'}
              </button>
            )}
          </>
        }
      >
        <div className="form-section">
          <p className="form-help" style={{ marginBottom: 16 }}>
            We'll create a placeholder monitor record and an invitation tied to this email.
            When they sign up, they're automatically linked to your agency as a monitor.
          </p>
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">First Name <span className="required">*</span></label>
              <input className="form-input" value={inviteForm.first_name}
                onChange={(e) => setInviteForm({ ...inviteForm, first_name: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Last Name <span className="required">*</span></label>
              <input className="form-input" value={inviteForm.last_name}
                onChange={(e) => setInviteForm({ ...inviteForm, last_name: e.target.value })} />
            </div>
            <div className="form-group full">
              <label className="form-label">Email <span className="required">*</span></label>
              <input type="email" className="form-input" value={inviteForm.email}
                onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                placeholder="monitor@example.com" />
            </div>
            <div className="form-group full">
              <label className="form-label">Phone</label>
              <input type="tel" className="form-input" value={inviteForm.phone}
                onChange={(e) => setInviteForm({ ...inviteForm, phone: e.target.value })} />
            </div>
          </div>
        </div>

        {inviteLink && (
          <div className="form-section">
            <h3 className="form-section-title">Signup link ready</h3>
            <p className="form-help">Send this link to your new monitor. When they create an account with the same email, they'll join your agency automatically.</p>
            <div className="card" style={{ marginTop: 12, background: 'var(--accent-faint)', border: '1px solid var(--accent-soft)' }}>
              <div className="card-body" style={{ wordBreak: 'break-all' }}>
                <div className="cell-mono" style={{ fontSize: 13 }}>{inviteLink}</div>
              </div>
            </div>
            <div className="btn-group" style={{ marginTop: 12 }}>
              <button className="btn btn-secondary"
                onClick={() => { navigator.clipboard.writeText(inviteLink); showToast('Link copied') }}>
                Copy link
              </button>
            </div>
          </div>
        )}
      </Drawer>

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

      {pendingInvites.length > 0 && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">Pending invitations</div>
            <div className="cell-muted">{pendingInvites.length}</div>
          </div>
          <div className="card-body-flush">
            <table className="data-table">
              <thead><tr><th>Email</th><th>Invited</th><th>Expires</th><th /></tr></thead>
              <tbody>
                {pendingInvites.map((i) => (
                  <tr key={i.id}>
                    <td className="cell-strong">{i.email}</td>
                    <td className="cell-muted">{fmtDate(i.created_at)}</td>
                    <td className="cell-muted">{fmtDate(i.expires_at)}</td>
                    <td>
                      <div className="btn-group">
                        <button className="btn btn-sm btn-secondary"
                          onClick={() => {
                            const url = `${window.location.origin}/signup?email=${encodeURIComponent(i.email)}`
                            navigator.clipboard.writeText(url)
                            showToast('Signup link copied')
                          }}>
                          Copy link
                        </button>
                        <button className="btn btn-sm btn-secondary" onClick={() => revokeInvite(i.id)}>
                          Revoke
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
