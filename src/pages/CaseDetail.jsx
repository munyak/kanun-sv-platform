import React, { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../supabase'
import { useAuth } from '../auth/AuthContext'
import VisitForm from '../components/VisitForm'
import SignatureDrawer from '../components/SignatureDrawer'
import { generatePortalToken } from '../lib/portal'

const CASE_STATUS = ['intake', 'active', 'suspended', 'terminated', 'completed', 'archived']
const RISK_LEVELS = ['low', 'medium', 'high', 'critical']
const REQUIRED_DOCS = [
  { key: 'service_agreement',  label: 'Service Agreement' },
  { key: 'confidentiality',    label: 'Confidentiality Acknowledgment' },
  { key: 'mandated_reporter',  label: 'Mandated Reporter Disclosure' },
]

function fmtDate(s) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
function fmtTime(t) {
  if (!t) return ''
  const [h, m] = t.split(':')
  const d = new Date(); d.setHours(Number(h), Number(m), 0, 0)
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}
function fmtVisitWhen(date, time) {
  if (!date) return '—'
  const d = new Date(`${date}T${(time || '00:00').slice(0,5)}:00`)
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) + ' · ' + fmtTime(time)
}
function statusBadge(status) {
  if (!status) return <span className="badge badge-gray">—</span>
  const map = { intake:'badge-yellow', active:'badge-green', suspended:'badge-yellow',
                terminated:'badge-red', completed:'badge-blue', archived:'badge-gray',
                scheduled:'badge-blue', confirmed:'badge-blue', in_progress:'badge-yellow',
                checked_in:'badge-yellow', report_pending:'badge-yellow', report_submitted:'badge-green' }
  const cls = map[status] || 'badge-gray'
  return <span className={`badge ${cls}`}>{status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</span>
}

export default function CaseDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const { activeOrgId, role } = useAuth()
  const isMonitor = role === 'monitor'
  const [loading, setLoading] = useState(true)
  const [c, setCase] = useState(null)
  const [children, setChildren] = useState([])
  const [visits, setVisits] = useState([])
  const [monitors, setMonitors] = useState([])
  const [signatures, setSignatures] = useState([])
  const [tokens, setTokens] = useState([])
  const [reminders, setReminders] = useState(null)
  const [invoices, setInvoices] = useState([])
  const [showVisit, setShowVisit] = useState(false)
  const [editVisit, setEditVisit] = useState(null)
  const [signOpen, setSignOpen] = useState(null) // { documentType, defaultName, signerRole, partyId }
  const [toast, setToast] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => { if (activeOrgId) load() }, [activeOrgId, id])

  async function load() {
    setLoading(true)
    try {
      const [cRes, vRes, mRes, sRes, tRes, remRes, invRes] = await Promise.all([
        supabase.from('sv_cases').select(`*,
          custodial:custodial_party_id(*),
          noncustodial:noncustodial_party_id(*),
          monitor:primary_monitor_id(id, first_name, last_name)`)
          .eq('id', id).eq('org_id', activeOrgId).maybeSingle(),
        supabase.from('sv_visits').select(`id, scheduled_date, scheduled_start_time, scheduled_end_time, location, status, actual_duration_minutes,
          monitor:monitor_id(id, first_name, last_name)`)
          .eq('case_id', id).eq('org_id', activeOrgId).order('scheduled_date', { ascending: false }),
        supabase.from('sv_monitors').select('id, first_name, last_name, active')
          .eq('org_id', activeOrgId).order('last_name'),
        supabase.from('sv_e_signatures').select('id, document_type, signer_name, signer_role, signed_at')
          .eq('case_id', id).order('signed_at', { ascending: false }),
        supabase.from('sv_portal_access_tokens').select('*').eq('case_id', id).order('created_at', { ascending: false }),
        supabase.from('sv_reminder_configs').select('*').eq('case_id', id).maybeSingle(),
        supabase.from('sv_invoices').select('*').eq('case_id', id).order('created_at', { ascending: false }),
      ])
      if (cRes.error) throw cRes.error
      setCase(cRes.data)
      setVisits(vRes.data || [])
      setMonitors((mRes.data || []).filter((x) => x.active !== false))
      setSignatures(sRes.data || [])
      setTokens(tRes.data || [])
      setReminders(remRes.data || null)
      setInvoices(invRes.data || [])

      if (cRes.data) {
        const { data: kids } = await supabase
          .from('sv_case_children')
          .select(`child:child_id(id, first_name, last_name, date_of_birth, chronic_health_conditions, allergies, medications, special_needs)`)
          .eq('case_id', id)
        setChildren((kids || []).map((k) => k.child).filter(Boolean))
      }
    } catch (e) {
      console.error('CaseDetail load', e)
      showToast(e.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  function showToast(message, kind = 'success') {
    setToast({ message, kind })
    setTimeout(() => setToast(null), 3000)
  }

  async function updateCase(patch) {
    if (!c) return
    const { error } = await supabase.from('sv_cases').update(patch).eq('id', c.id)
    if (error) showToast(error.message, 'error')
    else { showToast('Saved'); load() }
  }

  async function generateToken(kind, partyId, displayName, email) {
    setBusy(true)
    try {
      const token = generatePortalToken()
      const { error } = await supabase.from('sv_portal_access_tokens').insert({
        org_id: activeOrgId, case_id: c.id, party_id: partyId,
        token, portal_kind: kind, display_name: displayName || null, email: email || null,
      })
      if (error) throw error
      await load()
      const url = `${window.location.origin}/portal/${kind}/${token}`
      try { await navigator.clipboard.writeText(url) } catch {}
      showToast(`${kind === 'parent' ? 'Parent' : 'Attorney'} link copied to clipboard`)
    } catch (e) { showToast(e.message, 'error') }
    finally { setBusy(false) }
  }

  async function revokeToken(tokenId) {
    if (!confirm('Revoke this link?')) return
    const { error } = await supabase.from('sv_portal_access_tokens')
      .update({ revoked_at: new Date().toISOString() }).eq('id', tokenId)
    if (error) showToast(error.message, 'error')
    else { showToast('Revoked'); load() }
  }

  async function saveReminders(patch) {
    setBusy(true)
    try {
      const payload = {
        org_id: activeOrgId, case_id: c.id,
        ...(reminders || { reminder_72h: true, reminder_24h: true, reminder_2h: true,
                            channel_sms: true, channel_email: true,
                            notify_custodial: true, notify_noncustodial: true, notify_monitor: true }),
        ...patch,
        updated_at: new Date().toISOString(),
      }
      const { error } = reminders
        ? await supabase.from('sv_reminder_configs').update(payload).eq('id', reminders.id)
        : await supabase.from('sv_reminder_configs').insert(payload)
      if (error) throw error
      await load()
    } catch (e) { showToast(e.message, 'error') }
    finally { setBusy(false) }
  }

  async function generateInvoicesForVisits() {
    if (!c.rate_per_visit || Number(c.rate_per_visit) <= 0) {
      showToast('Set a rate per visit on this case first', 'error'); return
    }
    setBusy(true)
    try {
      const billable = visits.filter((v) =>
        ['completed', 'report_pending', 'report_submitted'].includes(v.status) &&
        !invoices.some((inv) => inv.visit_id === v.id))
      if (billable.length === 0) { showToast('Nothing new to invoice'); setBusy(false); return }
      const amount = Math.round(Number(c.rate_per_visit) * 100)
      const billTo = c.custodial?.id || c.noncustodial?.id || null
      const rows = billable.map((v) => ({
        org_id: activeOrgId, case_id: c.id, visit_id: v.id,
        invoice_number: `INV-${c.case_number || c.id.slice(0,6)}-${v.id.slice(0,6)}`.toUpperCase(),
        bill_to_party_id: billTo,
        amount_cents: amount,
        status: 'draft',
        notes: `Visit on ${v.scheduled_date}`,
      }))
      const { error } = await supabase.from('sv_invoices').insert(rows)
      if (error) throw error
      await load()
      showToast(`Drafted ${rows.length} invoice${rows.length === 1 ? '' : 's'}`)
    } catch (e) { showToast(e.message, 'error') }
    finally { setBusy(false) }
  }

  async function markInvoiceStatus(invId, status) {
    const patch = { status, updated_at: new Date().toISOString() }
    if (status === 'issued') patch.issued_at = new Date().toISOString()
    if (status === 'paid') patch.paid_at = new Date().toISOString()
    const { error } = await supabase.from('sv_invoices').update(patch).eq('id', invId)
    if (error) showToast(error.message, 'error')
    else { showToast('Updated'); load() }
  }

  const signedSet = useMemo(() => new Set(signatures.map((s) => s.document_type)), [signatures])
  const past = visits.filter((v) => v.scheduled_date < new Date().toISOString().slice(0, 10))
  const upcoming = visits.filter((v) => v.scheduled_date >= new Date().toISOString().slice(0, 10))

  if (loading) return <div className="loading">Loading case…</div>
  if (!c) return (
    <div className="empty-state" style={{ marginTop: 64 }}>
      <div className="empty-state-title">Case not found</div>
      <div className="empty-state-desc">It may belong to another organization, or has been archived.</div>
      <Link to="/cases" className="btn btn-secondary" style={{ marginTop: 16 }}>Back to cases</Link>
    </div>
  )

  return (
    <div>
      <div className="page-header">
        <div>
          <Link to="/cases" className="page-subtitle" style={{ display: 'inline-block', marginBottom: 6 }}>← Cases</Link>
          <h1 className="page-title cell-mono">{c.case_number || `Case ${c.id.slice(0, 6)}`}</h1>
          <div className="page-subtitle">{c.court_name || 'No court on file'} · opened {fmtDate(c.created_at)}</div>
        </div>
        {!isMonitor && (
          <div className="btn-group">
            <button className="btn btn-secondary" onClick={() => { setEditVisit(null); setShowVisit(true) }}>+ Schedule visit</button>
          </div>
        )}
      </div>

      {isMonitor && (
        <div className="confidential-banner">
          Case configuration is managed by your agency. You have read-only access here — use the visits below to check in and log observations.
        </div>
      )}

      <div className="case-grid">
        <div>
          {/* Overview card */}
          <div className="card">
            <div className="card-header"><div className="card-title">Overview</div></div>
            <div className="card-body">
              <div className="kv-grid">
                <div><div className="kv-label">Status</div><div>
                  {isMonitor ? statusBadge(c.status) : (
                    <select className="form-select" value={c.status || 'intake'}
                      onChange={(e) => updateCase({ status: e.target.value })}>
                      {CASE_STATUS.map((s) => (
                        <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                      ))}
                    </select>
                  )}
                </div></div>
                <div><div className="kv-label">Risk level</div><div>
                  {isMonitor ? <span>{(c.risk_level || '—').replace(/_/g, ' ')}</span> : (
                    <select className="form-select" value={c.risk_level || 'medium'}
                      onChange={(e) => updateCase({ risk_level: e.target.value })}>
                      {RISK_LEVELS.map((r) => (
                        <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
                      ))}
                    </select>
                  )}
                </div></div>
                <div><div className="kv-label">Supervision type</div><div>{c.supervision_type ? c.supervision_type.replace(/_/g, ' ') : '—'}</div></div>
                <div><div className="kv-label">Referral source</div><div>{c.referral_source || '—'}</div></div>
                <div><div className="kv-label">Visit cadence</div><div>{c.visit_frequency || '—'} · {c.visit_duration_minutes || 0} min</div></div>
                <div><div className="kv-label">Rate per visit</div><div>${c.rate_per_visit || 0}</div></div>
                <div className="full"><div className="kv-label">Preferred location</div><div>{c.preferred_location || '—'}</div></div>
                <div className="full"><div className="kv-label">Reasons for supervision</div>
                  <div>{(c.reason_for_supervision || []).join(', ') || '—'}</div></div>
                {c.risk_assessment_notes && (
                  <div className="full"><div className="kv-label">Risk assessment</div>
                    <div style={{ whiteSpace: 'pre-wrap' }}>{c.risk_assessment_notes}</div></div>
                )}
              </div>
            </div>
          </div>

          {/* Parties */}
          <div className="card">
            <div className="card-header"><div className="card-title">Parties</div></div>
            <div className="card-body">
              <div className="party-grid">
                <PartyBlock title="Custodial" p={c.custodial} caseId={c.id} onPortal={isMonitor ? null : (p) => generateToken('parent', p.id, `${p.first_name} ${p.last_name}`, p.email)} />
                <PartyBlock title="Noncustodial" p={c.noncustodial} caseId={c.id} onPortal={isMonitor ? null : (p) => generateToken('parent', p.id, `${p.first_name} ${p.last_name}`, p.email)} />
              </div>
            </div>
          </div>

          {/* Children */}
          <div className="card">
            <div className="card-header"><div className="card-title">Children</div></div>
            <div className="card-body">
              {children.length === 0 ? (
                <div className="empty-state-title">No children linked to this case.</div>
              ) : (
                <div className="party-grid">
                  {children.map((k) => (
                    <div key={k.id} className="party-block">
                      <div className="party-name">{k.first_name} {k.last_name}</div>
                      {k.date_of_birth && <div className="cell-muted">DOB {fmtDate(k.date_of_birth)}</div>}
                      {k.chronic_health_conditions && <div className="kv-line"><strong>Health:</strong> {k.chronic_health_conditions}</div>}
                      {k.medications && <div className="kv-line"><strong>Meds:</strong> {k.medications}</div>}
                      {k.allergies && <div className="kv-line"><strong>Allergies:</strong> {k.allergies}</div>}
                      {k.special_needs && <div className="kv-line"><strong>Special needs:</strong> {k.special_needs}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* E-signatures */}
          {!isMonitor && (
          <div className="card">
            <div className="card-header"><div className="card-title">Signatures &amp; agreements</div></div>
            <div className="card-body-flush">
              <ul className="plain-list">
                {REQUIRED_DOCS.map((d) => {
                  const sig = signatures.find((s) => s.document_type === d.key)
                  return (
                    <li key={d.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div>
                        <div className="cell-strong">{d.label}</div>
                        <div className="cell-muted">
                          {sig ? `Signed by ${sig.signer_name} on ${fmtDate(sig.signed_at)}` : 'Not yet signed'}
                        </div>
                      </div>
                      {sig
                        ? <span className="badge badge-green">Signed</span>
                        : <div className="btn-group">
                            {c.custodial && (
                              <button className="btn btn-sm btn-secondary" onClick={() => setSignOpen({
                                documentType: d.key, partyId: c.custodial.id,
                                defaultName: `${c.custodial.first_name} ${c.custodial.last_name}`,
                                defaultEmail: c.custodial.email, signerRole: 'custodial',
                              })}>Custodial</button>
                            )}
                            {c.noncustodial && (
                              <button className="btn btn-sm btn-secondary" onClick={() => setSignOpen({
                                documentType: d.key, partyId: c.noncustodial.id,
                                defaultName: `${c.noncustodial.first_name} ${c.noncustodial.last_name}`,
                                defaultEmail: c.noncustodial.email, signerRole: 'noncustodial',
                              })}>Noncustodial</button>
                            )}
                          </div>
                      }
                    </li>
                  )
                })}
              </ul>
            </div>
          </div>
          )}

          {/* Invoices */}
          {!isMonitor && (
          <div className="card">
            <div className="card-header">
              <div className="card-title">Invoices</div>
              <button className="btn btn-sm btn-secondary" onClick={generateInvoicesForVisits} disabled={busy}>
                Draft from completed visits
              </button>
            </div>
            <div className="card-body-flush">
              {invoices.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-state-title">No invoices yet</div>
                  <div className="empty-state-desc">Drafts are created from completed visits using the case's rate per visit (${c.rate_per_visit || 0}).</div>
                </div>
              ) : (
                <table className="data-table">
                  <thead><tr><th>Invoice #</th><th>Amount</th><th>Status</th><th>Notes</th><th /></tr></thead>
                  <tbody>
                    {invoices.map((inv) => (
                      <tr key={inv.id}>
                        <td className="cell-mono">{inv.invoice_number}</td>
                        <td>${(inv.amount_cents / 100).toFixed(2)}</td>
                        <td>{statusBadge(inv.status)}</td>
                        <td className="cell-muted">{inv.notes}</td>
                        <td className="btn-group">
                          {inv.status === 'draft' && <button className="btn btn-sm btn-secondary" onClick={() => markInvoiceStatus(inv.id, 'issued')}>Issue</button>}
                          {inv.status === 'issued' && <button className="btn btn-sm btn-primary" onClick={() => markInvoiceStatus(inv.id, 'paid')}>Mark paid</button>}
                          {inv.status !== 'void' && <button className="btn btn-sm btn-ghost" onClick={() => markInvoiceStatus(inv.id, 'void')}>Void</button>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
          )}
        </div>

        <div>
          {/* Monitor assignment */}
          {!isMonitor && (
          <div className="card">
            <div className="card-header"><div className="card-title">Primary monitor</div></div>
            <div className="card-body">
              <select className="form-select" value={c.primary_monitor_id || ''}
                onChange={(e) => updateCase({ primary_monitor_id: e.target.value || null })}>
                <option value="">Unassigned</option>
                {monitors.map((m) => (
                  <option key={m.id} value={m.id}>{m.first_name} {m.last_name}</option>
                ))}
              </select>
            </div>
          </div>
          )}

          {isMonitor && c.monitor && (
            <div className="card">
              <div className="card-header"><div className="card-title">Primary monitor</div></div>
              <div className="card-body">
                <div className="cell-strong">{c.monitor.first_name} {c.monitor.last_name}</div>
              </div>
            </div>
          )}

          {/* Reminders */}
          {!isMonitor && (
          <div className="card">
            <div className="card-header"><div className="card-title">Reminders</div></div>
            <div className="card-body">
              <div className="form-checkbox-group">
                <label className="form-checkbox-label">
                  <input type="checkbox" checked={reminders?.reminder_72h ?? true} onChange={(e) => saveReminders({ reminder_72h: e.target.checked })} />
                  <span>72 hours before</span>
                </label>
                <label className="form-checkbox-label">
                  <input type="checkbox" checked={reminders?.reminder_24h ?? true} onChange={(e) => saveReminders({ reminder_24h: e.target.checked })} />
                  <span>24 hours before</span>
                </label>
                <label className="form-checkbox-label">
                  <input type="checkbox" checked={reminders?.reminder_2h ?? true} onChange={(e) => saveReminders({ reminder_2h: e.target.checked })} />
                  <span>2 hours before</span>
                </label>
              </div>
              <div className="divider" />
              <div className="form-checkbox-group">
                <label className="form-checkbox-label">
                  <input type="checkbox" checked={reminders?.channel_sms ?? true} onChange={(e) => saveReminders({ channel_sms: e.target.checked })} />
                  <span>SMS</span>
                </label>
                <label className="form-checkbox-label">
                  <input type="checkbox" checked={reminders?.channel_email ?? true} onChange={(e) => saveReminders({ channel_email: e.target.checked })} />
                  <span>Email</span>
                </label>
              </div>
              <div className="form-help" style={{ marginTop: 12 }}>
                Delivery wiring (Twilio + email) is queued for the next phase. The schedule is saved now so it activates the moment the channels are connected.
              </div>
            </div>
          </div>
          )}

          {/* Portal links */}
          {!isMonitor && (
          <div className="card">
            <div className="card-header">
              <div className="card-title">Portal links</div>
              <button className="btn btn-sm btn-secondary" onClick={() => generateToken('attorney', null, 'Attorney of record', null)} disabled={busy}>
                + Attorney
              </button>
            </div>
            <div className="card-body-flush">
              {tokens.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-state-title">No links yet</div>
                  <div className="empty-state-desc">Generate parent links from the Parties section; attorney link from this card.</div>
                </div>
              ) : (
                <ul className="plain-list">
                  {tokens.map((t) => {
                    const url = `${window.location.origin}/portal/${t.portal_kind}/${t.token}`
                    const live = !t.revoked_at && (!t.expires_at || new Date(t.expires_at) > new Date())
                    return (
                      <li key={t.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div className="cell-strong">{t.portal_kind === 'parent' ? 'Parent' : 'Attorney'} · {t.display_name || '—'}</div>
                          <div className="cell-muted" style={{ wordBreak: 'break-all', fontSize: 11 }}>{url}</div>
                        </div>
                        <div className="btn-group">
                          {live ? <button className="btn btn-sm btn-secondary" onClick={() => { navigator.clipboard.writeText(url); showToast('Copied') }}>Copy</button>
                                : <span className="badge badge-gray">Revoked</span>}
                          {live && <button className="btn btn-sm btn-ghost" onClick={() => revokeToken(t.id)}>Revoke</button>}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </div>
          )}

          {/* Upcoming visits */}
          <div className="card">
            <div className="card-header">
              <div className="card-title">Upcoming</div>
              {!isMonitor && (
                <button className="btn btn-sm btn-primary" onClick={() => { setEditVisit(null); setShowVisit(true) }}>+ Add</button>
              )}
            </div>
            <div className="card-body-flush">
              {upcoming.length === 0 ? (
                <div className="empty-state"><div className="empty-state-title">No upcoming visits</div></div>
              ) : (
                <div className="timeline">
                  {upcoming.map((v) => (
                    <button key={v.id} className="timeline-item" onClick={() => nav(`/visits/${v.id}`)}>
                      <div className="timeline-dot" />
                      <div className="timeline-content">
                        <div className="cell-strong">{fmtVisitWhen(v.scheduled_date, v.scheduled_start_time)}</div>
                        <div className="cell-muted">{v.location || '—'}</div>
                        <div style={{ marginTop: 4 }}>{statusBadge(v.status)}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Past visits */}
          <div className="card">
            <div className="card-header"><div className="card-title">Past visits</div><div className="cell-muted">{past.length}</div></div>
            <div className="card-body-flush">
              {past.length === 0 ? (
                <div className="empty-state"><div className="empty-state-title">No past visits yet</div></div>
              ) : (
                <div className="timeline">
                  {past.slice(0, 8).map((v) => (
                    <button key={v.id} className="timeline-item" onClick={() => nav(`/visits/${v.id}`)}>
                      <div className="timeline-dot past" />
                      <div className="timeline-content">
                        <div className="cell-strong">{fmtVisitWhen(v.scheduled_date, v.scheduled_start_time)}</div>
                        <div className="cell-muted">{v.location || '—'}</div>
                        <div style={{ marginTop: 4 }}>{statusBadge(v.status)}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {showVisit && (
        <VisitForm
          orgId={activeOrgId}
          visit={editVisit ? editVisit : { case: { id: c.id, case_number: c.case_number }, location: c.preferred_location, monitor: c.primary_monitor_id ? { id: c.primary_monitor_id } : null }}
          onClose={() => { setShowVisit(false); setEditVisit(null) }}
          onSaved={() => { setShowVisit(false); setEditVisit(null); load(); showToast('Visit saved') }}
        />
      )}

      {signOpen && (
        <SignatureDrawer
          orgId={activeOrgId}
          caseId={c.id}
          partyId={signOpen.partyId}
          documentType={signOpen.documentType}
          signerRole={signOpen.signerRole}
          defaultName={signOpen.defaultName}
          defaultEmail={signOpen.defaultEmail}
          onClose={() => setSignOpen(null)}
          onSaved={() => { setSignOpen(null); load(); showToast('Signature recorded') }}
        />
      )}

      {toast && <div className={`toast ${toast.kind === 'error' ? 'error' : ''}`}>{toast.message}</div>}
    </div>
  )
}

function PartyBlock({ title, p, caseId, onPortal }) {
  if (!p) return (
    <div className="party-block">
      <div className="party-tag">{title}</div>
      <div className="cell-muted">No party on file</div>
    </div>
  )
  return (
    <div className="party-block">
      <div className="party-tag">{title}</div>
      <div className="party-name">{p.first_name} {p.last_name}</div>
      {p.phone_primary && <div className="kv-line"><strong>Phone:</strong> {p.phone_primary}</div>}
      {p.email && <div className="kv-line"><strong>Email:</strong> {p.email}</div>}
      {p.address_line1 && (
        <div className="kv-line confidential-line">
          <strong>Address (confidential):</strong> {p.address_line1}, {p.city}, {p.state} {p.zip}
        </div>
      )}
      {p.attorney_name && <div className="kv-line"><strong>Attorney:</strong> {p.attorney_name} {p.attorney_phone ? `· ${p.attorney_phone}` : ''}</div>}
      {p.emergency_contact_name && <div className="kv-line"><strong>Emergency:</strong> {p.emergency_contact_name} {p.emergency_contact_phone ? `· ${p.emergency_contact_phone}` : ''}</div>}
      {onPortal && (
        <div style={{ marginTop: 10 }}>
          <button className="btn btn-sm btn-secondary" onClick={() => onPortal?.(p)}>Generate parent portal link</button>
        </div>
      )}
    </div>
  )
}
