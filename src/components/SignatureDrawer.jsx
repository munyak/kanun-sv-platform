import React, { useState } from 'react'
import { supabase } from '../supabase'
import Drawer from './Drawer'
import SignaturePad from './SignaturePad'

const DOC_TITLES = {
  service_agreement:  'Service Agreement',
  confidentiality:    'Confidentiality Acknowledgment',
  mandated_reporter:  'Mandated Reporter Disclosure',
  intake_ack:         'Intake Acknowledgment',
}
const DOC_BODIES = {
  service_agreement:
    'The signer agrees to participate in supervised visitation services in accordance with the court order and the schedule established. The signer agrees to follow the rules established by the monitor, including arriving on time, treating staff and the other party with respect, and refraining from any prohibited topic (custody, court proceedings, the other party). The signer understands visits may be terminated at the monitor’s discretion if the safety or well-being of the child is at risk.',
  confidentiality:
    'Information shared during supervised visitation is confidential except (1) when a court orders its release, (2) when the monitor is required by law to report suspected child abuse or neglect, or (3) when there is an imminent threat of harm. Information may be shared with attorneys of record and the court as required.',
  mandated_reporter:
    'California law requires the monitor to report any suspicion of child abuse or neglect to the appropriate authorities. The monitor cannot promise confidentiality regarding any information that triggers this reporting obligation.',
  intake_ack:
    'The signer confirms the information provided during intake is accurate and complete. Providing false or incomplete information may result in suspension or termination of services.',
}

/**
 * Drawer for capturing an in-person signature (e.g. monitor capturing a
 * parent's signature, or any signer at intake). Uses the SignaturePad.
 */
export default function SignatureDrawer({
  orgId,
  caseId,
  partyId,
  monitorId,
  documentType,
  signerRole,
  defaultName = '',
  defaultEmail = '',
  onClose,
  onSaved,
}) {
  const [name, setName] = useState(defaultName)
  const [email, setEmail] = useState(defaultEmail)
  const [data, setData] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  async function submit() {
    if (!data) { setErr('Please sign first'); return }
    if (!name) { setErr('Signer name is required'); return }
    setBusy(true); setErr(null)
    try {
      let ip = null
      try { const r = await fetch('https://api.ipify.org?format=json'); const j = await r.json(); ip = j.ip } catch {}
      const { error } = await supabase.from('sv_e_signatures').insert({
        org_id: orgId,
        case_id: caseId,
        party_id: partyId || null,
        monitor_id: monitorId || null,
        document_type: documentType,
        document_title: DOC_TITLES[documentType] || documentType,
        signer_name: name,
        signer_email: email || null,
        signer_role: signerRole || null,
        signature_data: data,
        ip_address: ip,
        user_agent: navigator.userAgent,
      })
      if (error) throw error
      onSaved?.()
    } catch (e) { setErr(e.message) }
    finally { setBusy(false) }
  }

  return (
    <Drawer
      open
      onClose={onClose}
      title={DOC_TITLES[documentType] || documentType}
      subtitle="Capture the signer's name, then have them sign below"
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={busy}>{busy ? 'Saving…' : 'Save signature'}</button>
        </>
      }
    >
      <div className="confidential-banner">
        <strong>By signing</strong>, the signer confirms they have read and agreed to this document. The signature is timestamped and recorded with the device IP address.
      </div>
      <div style={{ padding: 16, background: 'var(--bg-sunken)', borderRadius: 'var(--radius-md)', marginBottom: 16, fontSize: 13, lineHeight: 1.6, color: 'var(--gray-700)' }}>
        {DOC_BODIES[documentType] || ''}
      </div>
      <div className="form-grid">
        <div className="form-group">
          <label className="form-label">Signer name <span className="required">*</span></label>
          <input className="form-input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Signer email</label>
          <input type="email" className="form-input" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="form-group full">
          <label className="form-label">Signature <span className="required">*</span></label>
          <SignaturePad value={data} onChange={setData} />
        </div>
      </div>
      {err && <div className="auth-error" style={{ marginTop: 12 }}>{err}</div>}
    </Drawer>
  )
}
