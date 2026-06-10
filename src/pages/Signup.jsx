import React, { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../supabase'
import { trackEvent } from '../lib/analytics'
import AuthShell from '../components/AuthShell'

export default function Signup() {
  const nav = useNavigate()
  const [searchParams] = useSearchParams()
  const prefilledEmail = searchParams.get('email') || ''
  // If the URL has ?email=, this person was invited — they're joining, not creating an agency.
  const isInvited = !!prefilledEmail
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
        // Check if this user has a pending invitation (i.e. they were invited
        // as a monitor, attorney, etc.). If so, accept the invitation and go
        // straight to the dashboard — skip the agency-owner onboarding.
        const { data: accepted } = await supabase.rpc('accept_pending_invitations')
        if (accepted && accepted > 0) {
          // Invitation accepted — they now have a role + org. Go to dashboard.
          nav('/', { replace: true })
        } else {
          // No invitation — new agency owner. Run the onboarding wizard.
          nav('/onboarding', { replace: true })
        }
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
    <AuthShell
      title={isInvited ? 'Join your team' : 'Create your account'}
      subtitle={isInvited
        ? 'Your agency has invited you. Create your login to get started.'
        : 'Get your agency set up in minutes.'}
    >
      <form onSubmit={submit} className="auth-form">
        <div className="form-group">
          <label className="form-label">Your name</label>
          <input className="form-input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
        </div>
        <div className="form-group">
          <label className="form-label">Email</label>
          <input type="email" required className="form-input" value={email}
            onChange={(e) => setEmail(e.target.value)} autoComplete="email"
            readOnly={isInvited} style={isInvited ? { background: 'var(--bg-subtle)', cursor: 'not-allowed' } : undefined} />
          {isInvited && <span className="form-help">This email matches your invitation — don't change it.</span>}
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
          {busy ? 'Creating…' : isInvited ? 'Join team' : 'Create account'}
        </button>

        <div className="auth-footer">
          Already have an account? <Link to="/login">Sign in</Link>
        </div>
        <div className="auth-footer" style={{ marginTop: 4, fontSize: 11, opacity: 0.6 }}>
          By signing up you agree to our <Link to="/terms">Terms</Link> and <Link to="/privacy">Privacy Policy</Link>
        </div>
      </form>
    </AuthShell>
  )
}
