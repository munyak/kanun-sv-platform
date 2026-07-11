import React, { useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../supabase'
import { billingState, startSoloCheckout, BILLING_LIVE } from '../lib/billing'

// Slim banner shown to solo monitors during their active free trial. Counts
// down the days left and offers a one-click upgrade. Renders nothing for
// agencies, paid subscribers, or expired trials (the Paywall takes over then).
export default function TrialBanner() {
  const { org } = useAuth()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const s = billingState(org)
  if (!s.showTrialBanner) return null

  async function upgrade() {
    setErr(null); setBusy(true)
    try { await startSoloCheckout(supabase) }
    catch (e) { setErr(e.message); setBusy(false) }
  }

  const d = s.trialDaysLeft
  return (
    <div className="trial-banner" role="status" style={{
      display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
      padding: '10px 16px', margin: '0 0 16px', borderRadius: 10,
      background: '#f4f0e6', border: '1px solid #e4dcc4', fontSize: 14,
    }}>
      <span style={{ fontWeight: 600 }}>
        {d === 0 ? 'Your free trial ends today.' : `${d} day${d === 1 ? '' : 's'} left in your free trial.`}
      </span>
      {BILLING_LIVE ? (
        <>
          <span style={{ color: 'var(--text-secondary)' }}>Subscribe to keep your reports and case history.</span>
          <button className="btn btn-primary" onClick={upgrade} disabled={busy}
                  style={{ marginLeft: 'auto', padding: '6px 14px', fontSize: 13 }}>
            {busy ? 'Opening…' : 'Subscribe'}
          </button>
          {err && <span style={{ color: '#a02020', width: '100%', fontSize: 13 }}>{err}</span>}
        </>
      ) : (
        <span style={{ color: 'var(--text-secondary)', marginLeft: 'auto' }}>
          Paid plans open soon — enjoy full access in the meantime.
        </span>
      )}
    </div>
  )
}
