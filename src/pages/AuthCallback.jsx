import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'

// Supabase v2 auto-detects the auth tokens in the URL and sets the session.
// We just wait for the session to be present, then redirect home.
export default function AuthCallback() {
  const nav = useNavigate()
  const [err, setErr] = useState(null)

  useEffect(() => {
    let done = false
    const timer = setTimeout(() => { if (!done) setErr('Sign-in timed out. Try again.') }, 8000)
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) {
        done = true
        clearTimeout(timer)
        nav('/', { replace: true })
      }
    })
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        done = true
        clearTimeout(timer)
        nav('/', { replace: true })
      }
    })
    return () => { clearTimeout(timer); data?.subscription?.unsubscribe?.() }
  }, [nav])

  return (
    <div style={{ padding: 48, textAlign: 'center' }}>
      <h2 style={{ marginBottom: 8 }}>Signing you in…</h2>
      {err
        ? <div className="auth-error" style={{ margin: '16px auto', maxWidth: 360 }}>{err}</div>
        : <div className="loading">Connecting to KaNun</div>}
    </div>
  )
}
