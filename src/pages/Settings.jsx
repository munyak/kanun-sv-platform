import React, { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { useAuth } from '../auth/AuthContext'

export default function Settings() {
  const { activeOrgId, org, refresh, role } = useAuth()
  const [form, setForm] = useState(null)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState(null)
  const readOnly = !['agency_owner', 'agency_manager', 'platform_admin'].includes(role)

  useEffect(() => {
    if (!activeOrgId) return
    supabase.from('sv_organizations').select('*').eq('id', activeOrgId).single()
      .then(({ data }) => setForm(data))
  }, [activeOrgId])

  function showToast(message, kind = 'success') {
    setToast({ message, kind }); setTimeout(() => setToast(null), 3000)
  }

  async function save() {
    if (readOnly) return
    setBusy(true)
    try {
      const { error } = await supabase.from('sv_organizations').update({
        name: form.name,
        address_street: form.address_street,
        address_city: form.address_city,
        address_state: form.address_state,
        address_zip: form.address_zip,
        license_number: form.license_number,
        service_areas: form.service_areas,
        services: form.services,
        pricing: form.pricing,
        court_affiliations: form.court_affiliations,
        phone: form.phone,
        email: form.email,
        website: form.website,
        updated_at: new Date().toISOString(),
      }).eq('id', activeOrgId)
      if (error) throw error
      showToast('Saved.')
      refresh()
    } catch (e) {
      showToast(e.message || 'Save failed', 'error')
    } finally {
      setBusy(false)
    }
  }

  if (!form) return <div className="loading">Loading settings…</div>

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Settings</h1>
          <div className="page-subtitle">{org?.name}</div>
        </div>
        {!readOnly && <button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>}
      </div>

      {readOnly && (
        <div className="confidential-banner">
          You have read-only access to organization settings.
        </div>
      )}

      <div className="card">
        <div className="card-header"><div className="card-title">Organization</div></div>
        <div className="card-body">
          <div className="form-grid">
            <div className="form-group full">
              <label className="form-label">Name</label>
              <input className="form-input" disabled={readOnly} value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">License #</label>
              <input className="form-input" disabled={readOnly} value={form.license_number || ''} onChange={(e) => setForm({ ...form, license_number: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Phone</label>
              <input className="form-input" disabled={readOnly} value={form.phone || ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Public email</label>
              <input className="form-input" disabled={readOnly} value={form.email || ''} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Website</label>
              <input className="form-input" disabled={readOnly} value={form.website || ''} onChange={(e) => setForm({ ...form, website: e.target.value })} />
            </div>
            <div className="form-group full">
              <label className="form-label">Street address</label>
              <input className="form-input" disabled={readOnly} value={form.address_street || ''} onChange={(e) => setForm({ ...form, address_street: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">City</label>
              <input className="form-input" disabled={readOnly} value={form.address_city || ''} onChange={(e) => setForm({ ...form, address_city: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">State</label>
              <input className="form-input" disabled={readOnly} value={form.address_state || ''} onChange={(e) => setForm({ ...form, address_state: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Zip</label>
              <input className="form-input" disabled={readOnly} value={form.address_zip || ''} onChange={(e) => setForm({ ...form, address_zip: e.target.value })} />
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><div className="card-title">Default pricing</div></div>
        <div className="card-body">
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">Hourly rate</label>
              <input type="number" className="form-input" disabled={readOnly}
                value={form.pricing?.hourly_rate ?? 0}
                onChange={(e) => setForm({ ...form, pricing: { ...(form.pricing || {}), hourly_rate: Number(e.target.value) } })} />
            </div>
            <div className="form-group">
              <label className="form-label">Min duration (min)</label>
              <input type="number" className="form-input" disabled={readOnly}
                value={form.pricing?.minimum_duration ?? 60}
                onChange={(e) => setForm({ ...form, pricing: { ...(form.pricing || {}), minimum_duration: Number(e.target.value) } })} />
            </div>
            <div className="form-group">
              <label className="form-label">Cancellation fee</label>
              <input type="number" className="form-input" disabled={readOnly}
                value={form.pricing?.cancellation_fee ?? 0}
                onChange={(e) => setForm({ ...form, pricing: { ...(form.pricing || {}), cancellation_fee: Number(e.target.value) } })} />
            </div>
          </div>
        </div>
      </div>

      {toast && <div className={`toast ${toast.kind === 'error' ? 'error' : ''}`}>{toast.message}</div>}
    </div>
  )
}
