import React, { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../supabase'
import { trackEvent } from '../lib/analytics'
import AuthShell from '../components/AuthShell'

export default function Signup() {
  const nav = useNavigate()
  const [searchParams] = useSearchParams()
  const prefilledEmail = searchParams.get('email') || ''
  const [name, setName] = useState('')
  const [email, setEmail] = useState(prefilledEmail)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [msg, setMsg] = useState(null)

  async function submit(e) {
    e.preventDefault()
    setBusy(true); setErr(null); setMsg(null)
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: name },
          emailRedirectTo: window.location.origin + '/auth/callback',
        },
      })
      if (error) throw error
      trackEvent('sign_up', { method: 'password' })
      if (data.session) {
        nav('/onboarding', { replace: true })
      } else {
        setMsg('Check your email to confirm your account, then sign in.')
      }
    } catch (e) {
      setErr(e.message || 'Signup failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell title="Create your account" subtitle="Get your agency set up in minutes.">
      <form onSubmit={submit} className="auth-form">
        <div className="form-group">
          <label className="form-label">Your name</label>
          <input className="form-input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
        </div>
        <div className="form-group">
          <label className="form-label">Email</label>
          <input type="email" required className="form-input" value={email}
            onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </div>
        <div className="form-group">
          <label className="form-label">Password</label>
          <input type="password" required minLength={8} className="form-input" value={password}
            onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
          <span className="form-help">At least 8 characters.</span>
        </div>

        {err && <div className="auth-error">{err}</div>}
        {msg && <div className="auth-success">{msg}</div>}

        <button className="btn btn-primary auth-submit" disabled={busy}>
          {busy ? 'Creating…' : 'Create account'}
        </button>

        <div className="auth-footer">
          Already have an account? <Link to="/login">Sign in</Link>
        </div>
      </form>
    </AuthShell>
  )
}
