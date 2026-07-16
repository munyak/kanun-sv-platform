import React, { useEffect, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../supabase'
import { billingState, startSoloCheckout, SOLO_PRICE, SOLO_PRICE_SUFFIX, BILLING_LIVE } from '../lib/billing'

// /subscription — plan + subscription management for solo monitors. Also the
// success/cancel landing target from Stripe Checkout. On a successful return we
// poll refresh() a few times so the webhook has a moment to flip the org to
// 'active' before we render the confirmed state. After confirmation, solo monitors
// are redirected to /onboarding to complete their practice setup.
export default function Subscription() {
  const { org, refresh, user } = useAuth()
  const nav = useNavigate()
  const [params, setParams] = useSearchParams()
  const justPaid = params.get('status') === 'success'
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const s = billingState(org)

  useEffect(() => {
    if (!justPaid) return
    // Give the webhook time to record the subscription; refresh a few times.
    let n = 0
    const t = setInterval(() => { refresh(); if (++n >= 4) clearInterval(t) }, 1500)
    return () => clearInterval(t)
  }, [justPaid, refresh])

  useEffect(() => {
    // Once the org shows active, clear the ?status flag from the URL.
    if (justPaid && s.active) setParams({}, { replace: true })
  }, [justPaid, s.active, setParams])

  useEffect(() => {
    // After successful payment and org activation, redirect solo monitors to
    // /onboarding to complete their practice setup (services, pricing, courts, first case).
    if (justPaid && s.active && s.isSolo && user) {
      // Small delay to let the user see the success message
      const timer = setTimeout(() => {
        nav('/onboarding', { replace: true })
      }, 2000)
      return () => clearTimeout(timer)
    }
  }, [justPaid, s.active, s.isSolo, user, nav])

  async function subscribe() {
    setErr(null); setBusy(true)
    try { await startSoloCheckout(supabase) }
    catch (e) { setErr(e.message); setBusy(false) }
  }

  const statusLabel = s.active ? 'Active'
    : s.trialing ? (s.trialExpired ? 'Trial ended' : `Free trial — ${s.trialDaysLeft} day${s.trialDaysLeft === 1 ? '' : 's'} left`)
    : s.status === 'past_due' ? 'Payment past due'
    : s.status === 'canceled' ? 'Canceled'
    : '—'

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: '24px 4px' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 4px' }}>Subscription</h1>
      <p style={{ color: 'var(--text-secondary)', fontSize: 14, margin: '0 0 20px' }}>
        Manage your KaNun plan.
      </p>

      {justPaid && s.active && (
        <div className="card" style={{ padding: 16, marginBottom: 16, background: '#eef6ec', border: '1px solid #cfe6c9' }}>
          ✅ You’re subscribed — thank you! Your access is active.
        </div>
      )}

      <div className="card" style={{ padding: 24, display: 'grid', gap: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 16 }}>{s.isSolo ? 'Solo Monitor' : (org?.plan || 'Plan')}</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Status: {statusLabel}</div>
          </div>
          {s.isSolo && <div><strong style={{ fontSize: 20 }}>{SOLO_PRICE}</strong><span style={{ color: 'var(--text-tertiary)' }}>{SOLO_PRICE_SUFFIX}</span></div>}
        </div>

        {s.isSolo && !s.active && BILLING_LIVE && (
          <>
            <button className="btn btn-primary" onClick={subscribe} disabled={busy}>
              {busy ? 'Opening secure checkout…' : (s.status === 'past_due' ? 'Update payment' : `Subscribe — ${SOLO_PRICE}${SOLO_PRICE_SUFFIX}`)}
            </button>
            {err && <div style={{ color: '#a02020', fontSize: 13 }}>{err}</div>}
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Secure checkout by Stripe · cancel anytime.</div>
          </>
        )}

        {s.isSolo && !s.active && !BILLING_LIVE && (
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Your free trial is active. Paid plans ({SOLO_PRICE}{SOLO_PRICE_SUFFIX}) open shortly —
            we’ll email you before your trial ends so there’s no interruption.
          </div>
        )}

        {s.active && (
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Your subscription is active. To change or cancel, email{' '}
            <a href="mailto:munya@kanunmonitoring.com">munya@kanunmonitoring.com</a>.
          </div>
        )}

        {!s.isSolo && (
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            This organization is on an agency plan. Contact KaNun for billing details.
          </div>
        )}
      </div>
    </div>
  )
}
