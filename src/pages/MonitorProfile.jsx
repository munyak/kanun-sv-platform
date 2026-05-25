import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabase'
import { useAuth } from '../auth/AuthContext'

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function fmtDate(s) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function yesNo(b) {
  if (b === true) return <span className="badge badge-green">Yes</span>
  if (b === false) return <span className="badge badge-red">No</span>
  return <span className="badge badge-gray">—</span>
}

export default function MonitorProfile() {
  const { activeOrgId, user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [monitor, setMonitor] = useState(null)
  const [cases, setCases] = useState([])
  const [slots, setSlots] = useState([])
  const [savingProfile, setSavingProfile] = useState(false)
  const [toast, setToast] = useState(null)
  const [profile, setProfile] = useState({
    phone: '',
    languages: '',
    has_vehicle: false,
    max_travel_radius_miles: '',
    preferred_locations: '',
  })

  useEffect(() => { if (activeOrgId && user) load() }, [activeOrgId, user?.id])

  function showToast(message, kind = 'success') {
    setToast({ message, kind }); setTimeout(() => setToast(null), 3000)
  }

  async function load() {
    setLoading(true)
    try {
      const { data: m } = await supabase
        .from('sv_monitors').select('*')
        .eq('org_id', activeOrgId).eq('user_id', user.id).maybeSingle()
      setMonitor(m || null)
      if (!m) { setLoading(false); return }
      setProfile({
        phone: m.phone || '',
        languages: (m.languages || []).join(', '),
        has_vehicle: !!m.has_vehicle,
        max_travel_radius_miles: m.max_travel_radius_miles || '',
        preferred_locations: (m.preferred_locations || []).join(', '),
      })

      const [casesRes, slotsRes] = await Promise.all([
        supabase.from('sv_cases')
          .select('id, case_number, status, risk_level, special_conditions, visit_frequency')
          .eq('org_id', activeOrgId).eq('primary_monitor_id', m.id)
          .neq('status', 'archived')
          .order('case_number', { ascending: true }),
        supabase.from('sv_monitor_availability')
          .select('*').eq('monitor_id', m.id)
          .order('day_of_week').order('start_time'),
      ])
      setCases(casesRes.data || [])
      setSlots(slotsRes.data || [])
    } catch (err) {
      console.error('MonitorProfile load:', err)
      showToast(err.message || 'Could not load profile', 'error')
    } finally {
      setLoading(false)
    }
  }

  async function saveProfile() {
    if (!monitor) return
    setSavingProfile(true)
    try {
      const { error } = await supabase.from('sv_monitors').update({
        phone: profile.phone || null,
        languages: profile.languages.split(',').map((s) => s.trim()).filter(Boolean),
        has_vehicle: !!profile.has_vehicle,
        max_travel_radius_miles: profile.max_travel_radius_miles ? Number(profile.max_travel_radius_miles) : null,
        preferred_locations: profile.preferred_locations.split(',').map((s) => s.trim()).filter(Boolean),
        updated_at: new Date().toISOString(),
      }).eq('id', monitor.id)
      if (error) throw error
      showToast('Profile saved')
      load()
    } catch (err) {
      showToast(err.message || 'Save failed', 'error')
    } finally {
      setSavingProfile(false)
    }
  }

  async function addSlot(day_of_week) {
    if (!monitor) return
    const { error } = await supabase.from('sv_monitor_availability').insert({
      org_id: activeOrgId,
      monitor_id: monitor.id,
      day_of_week,
      start_time: '09:00',
      end_time: '17:00',
    })
    if (error) showToast(error.message, 'error')
    else load()
  }

  async function updateSlot(id, patch) {
    const { error } = await supabase.from('sv_monitor_availability').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) showToast(error.message, 'error')
    else setSlots((arr) => arr.map((s) => s.id === id ? { ...s, ...patch } : s))
  }

  async function deleteSlot(id) {
    const { error } = await supabase.from('sv_monitor_availability').delete().eq('id', id)
    if (error) showToast(error.message, 'error')
    else setSlots((arr) => arr.filter((s) => s.id !== id))
  }

  if (loading) return <div className="loading">Loading profile…</div>
  if (!monitor) return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">My profile</h1>
        </div>
      </div>
      <div className="confidential-banner">
        Your monitor profile isn't linked to your account yet. Ask your agency owner to invite you again with this email so we can connect your records.
      </div>
    </div>
  )

  const slotsByDay = {}
  slots.forEach((s) => { (slotsByDay[s.day_of_week] = slotsByDay[s.day_of_week] || []).push(s) })

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">My profile</h1>
          <div className="page-subtitle">{monitor.first_name} {monitor.last_name} · {monitor.email}</div>
        </div>
      </div>

      <div className="case-grid">
        <div>
          <div className="card">
            <div className="card-header">
              <div className="card-title">Contact & logistics</div>
              <button className="btn btn-sm btn-primary" onClick={saveProfile} disabled={savingProfile}>
                {savingProfile ? 'Saving…' : 'Save'}
              </button>
            </div>
            <div className="card-body">
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Phone</label>
                  <input type="tel" className="form-input" value={profile.phone}
                    onChange={(e) => setProfile({ ...profile, phone: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Languages (comma-separated)</label>
                  <input className="form-input" value={profile.languages}
                    onChange={(e) => setProfile({ ...profile, languages: e.target.value })}
                    placeholder="English, Spanish" />
                </div>
                <div className="form-group">
                  <label className="form-label">Max travel radius (miles)</label>
                  <input type="number" min="0" className="form-input" value={profile.max_travel_radius_miles}
                    onChange={(e) => setProfile({ ...profile, max_travel_radius_miles: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-checkbox-label" style={{ marginTop: 24 }}>
                    <input type="checkbox" checked={profile.has_vehicle}
                      onChange={(e) => setProfile({ ...profile, has_vehicle: e.target.checked })} />
                    <span>I have a vehicle for visits</span>
                  </label>
                </div>
                <div className="form-group full">
                  <label className="form-label">Preferred locations (comma-separated)</label>
                  <input className="form-input" value={profile.preferred_locations}
                    onChange={(e) => setProfile({ ...profile, preferred_locations: e.target.value })}
                    placeholder="Parks, community centers, libraries" />
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <div className="card-title">Weekly availability</div>
              <div className="cell-muted">When you can take visits</div>
            </div>
            <div className="card-body">
              {DAYS.map((dayLabel, dow) => (
                <div key={dow} className="availability-grid">
                  <div className="availability-day">{dayLabel}</div>
                  {(slotsByDay[dow] || []).length === 0 ? (
                    <>
                      <div className="cell-muted" style={{ gridColumn: '2 / span 2' }}>Unavailable</div>
                      <button className="btn btn-sm btn-secondary availability-remove" onClick={() => addSlot(dow)}>+ Add</button>
                    </>
                  ) : (
                    (slotsByDay[dow] || []).map((s) => (
                      <React.Fragment key={s.id}>
                        <input type="time" className="form-input" value={s.start_time?.slice(0, 5) || ''}
                          onChange={(e) => updateSlot(s.id, { start_time: e.target.value })} />
                        <input type="time" className="form-input" value={s.end_time?.slice(0, 5) || ''}
                          onChange={(e) => updateSlot(s.id, { end_time: e.target.value })} />
                        <div className="availability-remove" style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          <button className="btn btn-sm btn-ghost" onClick={() => addSlot(dow)}>+</button>
                          <button className="btn btn-sm btn-ghost" onClick={() => deleteSlot(s.id)}>Remove</button>
                        </div>
                      </React.Fragment>
                    ))
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <div className="card-title">My cases</div>
              <div className="cell-muted">{cases.length} active</div>
            </div>
            <div className="card-body-flush">
              {cases.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-state-title">No cases assigned</div>
                  <div className="empty-state-desc">When your agency assigns you as primary monitor, those cases appear here.</div>
                </div>
              ) : (
                <ul className="plain-list">
                  {cases.map((c) => (
                    <li key={c.id} style={{ padding: '10px 0' }}>
                      <Link to={`/cases/${c.id}`} className="cell-link cell-mono cell-strong">{c.case_number}</Link>
                      <span className="cell-muted" style={{ marginLeft: 8 }}>· {(c.status || '').replace(/_/g, ' ')}</span>
                      {c.special_conditions && <div className="cell-muted" style={{ fontSize: 13, marginTop: 4 }}>{c.special_conditions}</div>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        <div>
          <div className="card">
            <div className="card-header">
              <div className="card-title">Qualifications</div>
            </div>
            <div className="card-body">
              <p className="form-help" style={{ marginBottom: 12 }}>
                Your agency tracks these against California Standard 5.20(e). Contact them to update.
              </p>
              <div className="kv-grid">
                <div><div className="kv-label">Status</div><div>{(monitor.status || '').replace(/_/g, ' ') || '—'}</div></div>
                <div><div className="kv-label">21 or older</div><div>{yesNo(monitor.is_21_or_older)}</div></div>
                <div><div className="kv-label">LiveScan</div><div>{yesNo(monitor.livescan_completed)} {monitor.livescan_date ? `· ${fmtDate(monitor.livescan_date)}` : ''}</div></div>
                <div><div className="kv-label">TrustLine</div><div>{yesNo(monitor.trustline_registered)} {monitor.trustline_expiry ? `· exp ${fmtDate(monitor.trustline_expiry)}` : ''}</div></div>
                <div><div className="kv-label">KCM</div><div>{yesNo(monitor.kcm_certified)} {monitor.kcm_expiry_date ? `· exp ${fmtDate(monitor.kcm_expiry_date)}` : ''}</div></div>
                <div><div className="kv-label">Training hours</div><div>{monitor.training_hours_completed || 0} hrs</div></div>
                <div><div className="kv-label">FL-324(P) signed</div><div>{yesNo(monitor.fl324p_signed)} {monitor.fl324p_signed_date ? `· ${fmtDate(monitor.fl324p_signed_date)}` : ''}</div></div>
                <div><div className="kv-label">Mandated reporter</div><div>{monitor.mandated_reporter_training_date ? fmtDate(monitor.mandated_reporter_training_date) : '—'}</div></div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header"><div className="card-title">Account</div></div>
            <div className="card-body">
              <div className="kv-grid">
                <div className="full">
                  <div className="kv-label">Email</div>
                  <div>{monitor.email}</div>
                </div>
                <div className="full">
                  <div className="kv-label">Member since</div>
                  <div>{fmtDate(monitor.created_at)}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {toast && <div className={`toast ${toast.kind === 'error' ? 'error' : ''}`}>{toast.message}</div>}
    </div>
  )
}
