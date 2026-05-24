import React, { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../supabase'
import AuthShell from '../components/AuthShell'

export default function Login() {
  const nav = useNavigate()
  const loc = useLocation()
  const [mode, setMode] = useState('password') // 'password' | 'magic'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [err, setErr] = useState(null)

  const redirectTo = loc.state?.from?.pathname || '/'

  async function submit(e) {
    e.preventDefault()
    setBusy(true); setErr(null); setMsg(null)
    try {
      if (mode === 'password') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        nav(redirectTo, { replace: true })
      } else {
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: window.location.origin + '/auth/callback' },
        })
        if (error) throw error
        setMsg('Check your email for the magic link.')
      }
    } catch (e) {
      setErr(e.message || 'Login failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell title="Sign in" subtitle="KaNun Supervised Visitation">
      <form onSubmit={submit} className="auth-form">
        <div className="auth-tabs">
          <button type="button"
            className={`auth-tab ${mode === 'password' ? 'active' : ''}`}
            onClick={() => setMode('password')}>Password</button>
          <button type="button"
            className={`auth-tab ${mode === 'magic' ? 'active' : ''}`}
            onClick={() => setMode('magic')}>Magic link</button>
        </div>

        <div className="form-group">
          <label className="form-label">Email</label>
          <input type="email" required className="form-input"
            value={email} onChange={(e) => setEmail(e.target.value)}
            autoComplete="email" />
        </div>

        {mode === 'password' && (
          <div className="form-group">
            <label className="form-label">Password</label>
            <input type="password" required className="form-input"
              value={password} onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password" />
          </div>
        )}

        {err && <div className="auth-error">{err}</div>}
        {msg && <div className="auth-success">{msg}</div>}

        <button className="btn btn-primary auth-submit" disabled={busy}>
          {busy ? 'Working…' : mode === 'password' ? 'Sign in' : 'Send magic link'}
        </button>

        <div className="auth-footer">
          New here? <Link to="/signup">Create an account</Link>
        </div>
      </form>
    </AuthShell>
  )
}
