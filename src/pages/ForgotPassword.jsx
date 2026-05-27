import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabase'
import AuthShell from '../components/AuthShell'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [err, setErr] = useState(null)

  async function submit(e) {
    e.preventDefault()
    setBusy(true); setErr(null); setMsg(null)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + '/reset-password',
      })
      if (error) throw error
      setMsg('Check your email for a link to reset your password.')
    } catch (e) {
      setErr(e.message || 'Could not send reset email.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell title="Reset your password" subtitle="We'll email you a link to set a new password.">
      <form onSubmit={submit} className="auth-form">
        <div className="form-group">
          <label className="form-label">Email</label>
          <input type="email" required className="form-input"
            value={email} onChange={(e) => setEmail(e.target.value)}
            autoComplete="email" autoFocus />
        </div>

        {err && <div className="auth-error">{err}</div>}
        {msg && <div className="auth-success">{msg}</div>}

        <button className="btn btn-primary auth-submit" disabled={busy}>
          {busy ? 'Sending…' : 'Send reset link'}
        </button>

        <div className="auth-footer">
          Remembered it? <Link to="/login">Back to sign in</Link>
        </div>
      </form>
    </AuthShell>
  )
}
