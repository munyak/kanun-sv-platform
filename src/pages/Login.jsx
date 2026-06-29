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

  async function signInWithProvider(provider) {
    setErr(null); setMsg(null)
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: window.location.origin + '/auth/callback' },
      })
      // On success the browser is redirected to the provider, so nothing
      // runs after this unless there's an error.
      if (error) throw error
    } catch (e) {
      setErr(e.message || `Could not sign in with ${provider}.`)
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
            <div className="form-label-row">
              <label className="form-label">Password</label>
              <Link to="/forgot-password" className="form-label-link">Forgot password?</Link>
            </div>
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

        <div className="auth-divider"><span>or continue with</span></div>

        <div className="auth-social">
          <button type="button" className="btn-social" disabled={busy}
            onClick={() => signInWithProvider('google')}>
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
              <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"/>
              <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"/>
              <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z"/>
              <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"/>
            </svg>
            Google
          </button>
          <button type="button" className="btn-social" disabled={busy}
            onClick={() => signInWithProvider('facebook')}>
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
              <path fill="#1877F2" d="M18 9a9 9 0 1 0-10.41 8.89v-6.29H5.31V9h2.28V7.02c0-2.25 1.34-3.5 3.4-3.5.98 0 2.01.18 2.01.18v2.21h-1.13c-1.12 0-1.47.7-1.47 1.41V9h2.5l-.4 2.6h-2.1v6.29A9 9 0 0 0 18 9z"/>
            </svg>
            Facebook
          </button>
        </div>

        <div className="auth-footer">
          New here? <Link to="/apply">Request pilot access</Link>
        </div>
        <div className="auth-footer" style={{ marginTop: 4, fontSize: 11, opacity: 0.6 }}>
          <Link to="/terms">Terms of Service</Link> · <Link to="/privacy">Privacy Policy</Link>
        </div>
      </form>
    </AuthShell>
  )
}
