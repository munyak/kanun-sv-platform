import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../supabase'
import { loadPortalToken } from '../lib/portal'
import PortalShell from '../components/PortalShell'
import SignaturePad from '../components/SignaturePad'

function fmtDateLong(d) {
  if (!d) return ''
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}
function fmtTime(t) {
  if (!t) return ''
  const [h, m] = t.split(':')
  const d = new Date(); d.setHours(Number(h), Number(m), 0, 0)
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}
function monthLabel(d) { return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short' }) }
function dayNum(d)     { return new Date(d + 'T00:00:00').getDate() }

export default function ParentPortal() {
  const { token } = useParams()
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)
  const [tokenRow, setTokenRow] = useState(null)
  const [caseRow, setCaseRow] = useState(null)
  const [party, setParty] = useState(null)
  const [visits, setVisits] = useState([])
  const [reports, setReports] = useState([])
  const [signatures, setSignatures] = useState([])
  const [showSign, setShowSign] = useState(null) // document_type
  const [signing, setSigning] = useState({ name: '', email: '', data: null })
  const [toast, setToast] = useState(null)

  useEffect(() => { load() }, [token])

  function showToast(m, kind = 'success') { setToast({ m, kind }); setTimeout(() => setToast(null), 3000) }

  async function load() {
    setLoading(true); setErr(null)
    try {
      const row = await loadPortalToken(token, 'parent')
      setTokenRow(row)
      // Pull case + party + visits + reports + signatures
      const [cRes, pRes, vRes, rRes, sRes] = await Promise.all([
        supabase.from('sv_cases').select('id, case_number, court_name, preferred_location, visit_frequency, visit_duration_minutes, status').eq('id', row.case_id).maybeSingle(),
        row.party_id ? supabase.from('sv_parties').select('*').eq('id', row.party_id).maybeSingle() : Promise.resolve({ data: null }),
        supabase.from('sv_visits')
          .select('id, scheduled_date, scheduled_start_time, scheduled_end_time, location, status')
          .eq('case_id', row.case_id)
          .gte('scheduled_date', new Date().toISOString().slice(0, 10))
          .order('scheduled_date', { ascending: true }).limit(20),
        // Only show approved reports to parents
        supabase.from('sv_reports')
          .select('id, status, approved_at, visit_id, visit_details')
          .eq('case_id', row.case_id).eq('status', 'approved')
          .order('approved_at', { ascending: false }).limit(20),
        row.party_id ? supabase.from('sv_e_signatures').select('id, document_type, signed_at').eq('case_id', row.case_id).eq('party_id', row.party_id) : Promise.resolve({ data: [] }),
      ])
      setCaseRow(cRes.data)
      setParty(pRes.data)
      setVisits(vRes.data || [])
      setReports(rRes.data || [])
      setSignatures(sRes.data || [])
      if (!signing.name && row.display_name) setSigning((s) => ({ ...s, name: row.display_name, email: row.email || '' }))
    } catch (e) {
      setErr(e.message || 'Could not load this portal.')
    } finally { setLoading(false) }
  }

  async function submitSignature() {
    if (!signing.data) { showToast('Please sign first', 'error'); return }
    if (!signing.name) { showToast('Your name is required', 'error'); return }
    try {
      let ip = null
      try {
        const r = await fetch('https://api.ipify.org?format=json')
        const j = await r.json()
        ip = j.ip
      } catch {}
      const { error } = await supabase.from('sv_e_signatures').insert({
        org_id: tokenRow.org_id,
        case_id: tokenRow.case_id,
        party_id: tokenRow.party_id,
        document_type: showSign,
        document_title: DOC_TITLES[showSign],
        signer_name: signing.name,
        signer_email: signing.email || null,
        signer_role: party?.party_type === 'noncustodial' ? 'noncustodial' : 'custodial',
        signature_data: signing.data,
        ip_address: ip,
        user_agent: navigator.userAgent,
      })
      if (error) throw error
      setShowSign(null)
      setSigning({ name: signing.name, email: signing.email, data: null })
      await load()
      showToast('Signature recorded')
    } catch (e) { showToast(e.message, 'error') }
  }

  if (loading) return <PortalShell><div className="loading">Loading…</div></PortalShell>
  if (err) return (
    <PortalShell>
      <div className="card" style={{ maxWidth: 480, margin: '64px auto' }}>
        <div className="card-body" style={{ textAlign: 'center' }}>
          <div className="empty-state-title">Link not available</div>
          <div className="empty-state-desc" style={{ marginTop: 8 }}>{err}</div>
        </div>
      </div>
    </PortalShell>
  )

  const required = ['service_agreement', 'confidentiality', 'mandated_reporter']
  const signedTypes = new Set(signatures.map((s) => s.document_type))

  return (
    <PortalShell orgName={tokenRow?.org?.name} portalKind="parent" signerName={tokenRow?.display_name || party?.first_name}>
      <div className="portal-hero">
        <div className="portal-hero-eyebrow">Welcome</div>
        <div className="portal-hero-title">
          Hi {tokenRow?.display_name || party?.first_name || 'there'}. Here's what's coming up.
        </div>
        <div className="portal-hero-text">
          You can review upcoming visits, complete intake forms, and download
          approved visit summaries. Only your own information is shown here —
          the other party's details remain confidential.
        </div>
      </div>

      {/* Upcoming visits */}
      <div className="portal-section-title">Upcoming visits</div>
      <div style={{ marginBottom: 28 }}>
        {visits.length === 0 ? (
          <div className="card"><div className="portal-empty">No visits scheduled.</div></div>
        ) : visits.map((v) => (
          <div key={v.id} className="portal-visit-card">
            <div className="portal-visit-date">
              <div className="portal-visit-date-mon">{monthLabel(v.scheduled_date)}</div>
              <div className="portal-visit-date-num">{dayNum(v.scheduled_date)}</div>
            </div>
            <div className="portal-visit-meta">
              <div className="portal-visit-time">
                {fmtDateLong(v.scheduled_date)} · {fmtTime(v.scheduled_start_time)} – {fmtTime(v.scheduled_end_time)}
              </div>
              <div className="portal-visit-loc">{v.location || caseRow?.preferred_location || '—'}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Required signatures */}
      <div className="portal-section-title">Forms to complete</div>
      <div className="card" style={{ marginBottom: 28 }}>
        <ul className="plain-list">
          {required.map((d) => {
            const done = signedTypes.has(d)
            return (
              <li key={d} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div className="cell-strong">{DOC_TITLES[d]}</div>
                  <div className="cell-muted">{DOC_DESCS[d]}</div>
                </div>
                {done
                  ? <span className="badge badge-green">Signed</span>
                  : <button className="btn btn-sm btn-primary" onClick={() => setShowSign(d)}>Sign</button>}
              </li>
            )
          })}
        </ul>
      </div>

      {/* Approved visit summaries */}
      <div className="portal-section-title">Visit summaries</div>
      <div className="card">
        {reports.length === 0 ? (
          <div className="portal-empty">No approved summaries yet. You'll see them here once they're finalized.</div>
        ) : (
          <ul className="plain-list">
            {reports.map((r) => (
              <li key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div className="cell-strong">Visit on {fmtDateLong(r.visit_details?.scheduled_date || '')}</div>
                  <div className="cell-muted">Approved {new Date(r.approved_at).toLocaleDateString('en-US', { dateStyle: 'medium' })}</div>
                </div>
                <span className="badge badge-green">Approved</span>
              </li>
            ))}
          </ul>
        )}
        <div className="portal-empty" style={{ fontSize: 12 }}>
          Detailed monitor notes are confidential and provided to the court only.
        </div>
      </div>

      {/* Signature modal as drawer */}
      {showSign && (
        <div className="drawer-overlay" onClick={() => setShowSign(null)}>
          <div className="drawer-panel" style={{ width: 560 }} onClick={(e) => e.stopPropagation()}>
            <div className="drawer-head">
              <div className="drawer-head-text">
                <div className="drawer-title">{DOC_TITLES[showSign]}</div>
                <div className="drawer-subtitle">Please read and sign below</div>
              </div>
              <button className="drawer-close" onClick={() => setShowSign(null)}>×</button>
            </div>
            <div className="drawer-body">
              <div className="confidential-banner">
                <strong>By signing</strong>, you confirm you have read and agreed to this document.
                Your signature is timestamped and recorded with your IP address.
              </div>
              <div style={{ padding: 16, background: 'var(--bg-sunken)', borderRadius: 'var(--radius-md)', marginBottom: 16, fontSize: 13, lineHeight: 1.6, color: 'var(--gray-700)' }}>
                {DOC_BODIES[showSign]}
              </div>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Your full name <span className="required">*</span></label>
                  <input className="form-input" value={signing.name}
                    onChange={(e) => setSigning({ ...signing, name: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Email</label>
                  <input type="email" className="form-input" value={signing.email}
                    onChange={(e) => setSigning({ ...signing, email: e.target.value })} />
                </div>
                <div className="form-group full">
                  <label className="form-label">Signature <span className="required">*</span></label>
                  <SignaturePad value={signing.data} onChange={(d) => setSigning({ ...signing, data: d })} />
                </div>
              </div>
            </div>
            <div className="drawer-foot">
              <button className="btn btn-secondary" onClick={() => setShowSign(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={submitSignature}>Sign and submit</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className={`toast ${toast.kind === 'error' ? 'error' : ''}`}>{toast.m}</div>}
    </PortalShell>
  )
}

const DOC_TITLES = {
  service_agreement:  'Service Agreement',
  confidentiality:    'Confidentiality Acknowledgment',
  mandated_reporter:  'Mandated Reporter Disclosure',
  intake_ack:         'Intake Acknowledgment',
}
const DOC_DESCS = {
  service_agreement:  'Terms of supervised visitation service.',
  confidentiality:    'How your information is protected and shared.',
  mandated_reporter:  'Notice that monitors must report suspected abuse.',
  intake_ack:         'Confirmation that you have provided accurate intake info.',
}
const DOC_BODIES = {
  service_agreement:
    'I agree to participate in supervised visitation services provided by this organization, in accordance with the court order and the schedule established. I agree to follow the rules established by the monitor, including arriving on time, treating staff and the other party with respect, and refraining from any prohibited topic (custody, court proceedings, the other party). I understand visits may be terminated at the monitor’s discretion if the safety or well-being of the child is at risk.',
  confidentiality:
    'I understand that information shared during supervised visitation is confidential except in three circumstances: (1) when a court orders its release, (2) when the monitor is required by law to report suspected child abuse or neglect, or (3) when there is an imminent threat of harm. I understand that information I provide may be shared with attorneys of record and the court as required.',
  mandated_reporter:
    'I acknowledge that California law requires the monitor to report any suspicion of child abuse or neglect to the appropriate authorities. I understand the monitor cannot promise confidentiality regarding any information that triggers this reporting obligation.',
  intake_ack:
    'I confirm that the information I have provided during intake is accurate and complete to the best of my knowledge. I understand that providing false or incomplete information may result in suspension or termination of services.',
}
