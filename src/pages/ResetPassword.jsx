import React, { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import AuthShell from '../components/AuthShell'

// Supabase emails a recovery link of the form
//   <redirectTo>?code=<pkce-code>  (current PKCE flow)
// or, for legacy projects,
//   <redirectTo>#access_token=...&type=recovery
// In both cases supabase-js (with detectSessionInUrl: true, the default) handles
// the exchange and fires onAuthStateChange. We just wait for the recovery
// session to be ready, then let the user submit a new password.
export default function ResetPassword() {
  const nav = useNavigate()
  const [ready, setReady] = useState(false)
  const [linkError, setLinkError] = useState(null)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [msg, setMsg] = useState(null)

  // Surface a useful error if the email link itself is broken/expired —
  // Supabase appends ?error=... or #error=... to the redirect URL.
  useEffect(() => {
    const params = new URLSearchParams(
      window.location.search || window.location.hash.replace(/^#/, '?'),
    )
    const errDesc = params.get('error_description') || params.get('error')
    if (errDesc) setLinkError(errDesc.replace(/\+/g, ' '))
  }, [])

  // Wait for the recovery session to be present before enabling the form.
  useEffect(() => {
    let cancelled = false
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return
      if (data.session) setReady(true)
    })
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return
      if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && session)) {
        setReady(true)
      }
    })
    return () => { cancelled = true; data?.subscription?.unsubscribe?.() }
  }, [])

  async function submit(e) {
    e.preventDefault()
    if (password.length < 8) { setErr('Password must be at least 8 characters.'); return }
    if (password !== confirm) { setErr('Passwords do not match.'); return }
    setBusy(true); setErr(null); setMsg(null)
    try {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error
      setMsg('Password updated. Redirecting…')
      setTimeout(() => nav('/', { replace: true }), 1000)
    } catch (e) {
      setErr(e.message || 'Could not update password.')
    } finally {
      setBusy(false)
    }
  }

  if (linkError) {
    return (
      <AuthShell title="Reset link error" subtitle="This password reset link can't be used.">
        <div className="auth-form">
          <div className="auth-error">{linkError}</div>
          <div className="auth-footer">
            <Link to="/forgot-password">Request a new reset link</Link>
          </div>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell title="Set a new password" subtitle="Choose a password to finish signing in.">
      <form onSubmit={submit} className="auth-form">
        <div className="form-group">
          <label className="form-label">New password</label>
          <input type="password" required minLength={8} className="form-input"
            value={password} onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password" autoFocus disabled={!ready || busy} />
          <span className="form-help">At least 8 characters.</span>
        </div>
        <div className="form-group">
          <label className="form-label">Confirm password</label>
          <input type="password" required minLength={8} className="form-input"
            value={confirm} onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password" disabled={!ready || busy} />
        </div>

        {!ready && !err && (
          <div className="auth-success">Verifying your reset link…</div>
        )}
        {err && <div className="auth-error">{err}</div>}
        {msg && <div className="auth-success">{msg}</div>}

        <button className="btn btn-primary auth-submit" disabled={!ready || busy}>
          {busy ? 'Updating…' : 'Update password'}
        </button>

        <div className="auth-footer">
          <Link to="/login">Back to sign in</Link>
        </div>
      </form>
    </AuthShell>
  )
}
