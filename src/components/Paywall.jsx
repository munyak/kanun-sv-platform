import React, { useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../supabase'
import { startSoloCheckout, SOLO_PRICE, SOLO_PRICE_SUFFIX } from '../lib/billing'

// Full-screen paywall shown in place of the app when a solo monitor's trial has
// lapsed (or their subscription is canceled / past_due). Their data is untouched
// and preserved — subscribing restores access instantly. Sign-out stays available
// in the top bar, so this is never a dead end.
export default function Paywall({ status }) {
  const { user } = useAuth()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  async function subscribe() {
    setErr(null); setBusy(true)
    try { await startSoloCheckout(supabase) }
    catch (e) { setErr(e.message); setBusy(false) }
  }

  const canceled = status === 'canceled'
  const pastDue = status === 'past_due'
  const heading = canceled ? 'Your subscription was canceled'
    : pastDue ? 'There was a problem with your payment'
    : 'Your free trial has ended'
  const sub = pastDue
    ? 'Update your payment to restore access. Your reports and case history are safe.'
    : 'Subscribe to keep creating court-ready visit reports. Everything you’ve saved is safe and waiting.'

  return (
    <div style={{ maxWidth: 460, margin: '0 auto', padding: '56px 20px', textAlign: 'center' }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>🔒</div>
      <h1 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 8px' }}>{heading}</h1>
      <p style={{ color: 'var(--text-secondary)', fontSize: 15, lineHeight: 1.5, margin: '0 0 24px' }}>{sub}</p>

      <div className="card" style={{ padding: 24, textAlign: 'left', display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: 600, fontSize: 16 }}>Solo Monitor</span>
          <span><strong style={{ fontSize: 22 }}>{SOLO_PRICE}</strong><span style={{ color: 'var(--text-tertiary)' }}>{SOLO_PRICE_SUFFIX}</span></span>
        </div>
        <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.7 }}>
          <li>Unlimited court-ready visit reports</li>
          <li>Your cases, schedule, and history in one place</li>
          <li>Email your reports to any party in one click</li>
          <li>Cancel anytime</li>
        </ul>
        <button className="btn btn-primary" onClick={subscribe} disabled={busy} style={{ marginTop: 4 }}>
          {busy ? 'Opening secure checkout…' : (pastDue ? 'Update payment' : `Subscribe — ${SOLO_PRICE}${SOLO_PRICE_SUFFIX}`)}
        </button>
        {err && <div style={{ color: '#a02020', fontSize: 13 }}>{err}</div>}
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', textAlign: 'center' }}>
          Secure checkout by Stripe · signed in as {user?.email}
        </div>
      </div>

      <p style={{ fontSize: 12.5, color: 'var(--text-tertiary)', marginTop: 16 }}>
        Questions? Email <a href="mailto:munya@kanunmonitoring.com">munya@kanunmonitoring.com</a>.
      </p>
    </div>
  )
}
