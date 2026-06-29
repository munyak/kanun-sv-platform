import React, { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabase'
import { useAuth } from '../auth/AuthContext'
import './pilot.css'

/*
  Pilot approval queue. Reached at /admin/pilots, gated to allow-listed admin
  emails (see RequireAdminEmail). Lists every pilot application and lets Munya
  Approve (activates the tester's login) or Reject — via the service-role
  `pilot-review` Edge Function.
*/

const COURT_LABEL = {
  court_ordered: 'Court-ordered', provider: 'Provider', both: 'Both', unsure: 'Unsure',
}
const ROLE_LABEL = { parent: 'Parent', monitor: 'Monitor', court: 'Court/Legal' }

export default function PilotAdmin() {
  const { signOut, user } = useAuth()
  const [apps, setApps] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [filter, setFilter] = useState('pending')

  const load = useCallback(async () => {
    setLoading(true); setErr(null)
    try {
      const { data, error } = await supabase.functions.invoke('pilot-review', { body: { action: 'list' } })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      setApps(data.applications || [])
    } catch (e) {
      setErr(e.message || 'Could not load applications.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function act(id, action) {
    setBusyId(id); setErr(null)
    try {
      const { data, error } = await supabase.functions.invoke('pilot-review', { body: { action, id } })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      await load()
    } catch (e) {
      setErr(e.message || `Could not ${action}.`)
    } finally {
      setBusyId(null)
    }
  }

  const shown = apps.filter((a) => filter === 'all' ? true : a.status === filter)
  const counts = apps.reduce((m, a) => ({ ...m, [a.status]: (m[a.status] || 0) + 1 }), {})

  return (
    <div className="pad-page">
      <header className="pad-top">
        <div>
          <div className="pa-brand"><span className="pa-brand-mark">KW</span> Pilot approvals</div>
          <p className="pa-muted" style={{ margin: '4px 0 0' }}>Signed in as {user?.email}</p>
        </div>
        <div className="pad-top-actions">
          <Link className="pa-btn pa-btn-ghost" to="/">Back to app</Link>
          <button className="pa-btn pa-btn-ghost" onClick={signOut}>Sign out</button>
        </div>
      </header>

      <div className="pad-filters">
        {['pending', 'approved', 'rejected', 'all'].map((f) => (
          <button key={f} className={`pad-chip${filter === f ? ' pad-chip-on' : ''}`} onClick={() => setFilter(f)}>
            {f[0].toUpperCase() + f.slice(1)}
            {f !== 'all' && <span className="pad-count">{counts[f] || 0}</span>}
          </button>
        ))}
        <button className="pa-btn pa-btn-ghost pad-refresh" onClick={load} disabled={loading}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {err && <div className="pa-error" style={{ margin: '0 0 16px' }}>{err}</div>}

      {loading && apps.length === 0 ? (
        <div className="pad-empty">Loading applications…</div>
      ) : shown.length === 0 ? (
        <div className="pad-empty">No {filter === 'all' ? '' : filter} applications.</div>
      ) : (
        <div className="pad-list">
          {shown.map((a) => (
            <div className="pad-row" key={a.id}>
              <div className="pad-row-main">
                <div className="pad-row-head">
                  <strong>{a.name}</strong>
                  <span className={`pad-status pad-status-${a.status}`}>{a.status}</span>
                  <span className="pad-role">
                    {ROLE_LABEL[a.role] || a.role || 'role TBD'}
                    {a.source === 'oauth' ? ' · OAuth' : ''}
                  </span>
                </div>
                <a className="pad-email" href={`mailto:${a.email}`}>{a.email}</a>
                <div className="pad-meta">
                  {a.organization && <span><b>Org:</b> {a.organization}</span>}
                  {a.jurisdiction && <span><b>Location:</b> {a.jurisdiction}</span>}
                  {a.court_or_provider && <span><b>Type:</b> {COURT_LABEL[a.court_or_provider] || a.court_or_provider}</span>}
                  {a.how_heard && <span><b>Heard via:</b> {a.how_heard}</span>}
                </div>
                {a.use_case && <div className="pad-usecase">“{a.use_case}”</div>}
                {a.reviewed_by && (
                  <div className="pad-reviewed">
                    {a.status} by {a.reviewed_by}
                    {a.reviewed_at && ` · ${new Date(a.reviewed_at).toLocaleDateString()}`}
                  </div>
                )}
              </div>
              {a.status === 'pending' && (
                <div className="pad-row-actions">
                  <button className="pa-btn pa-btn-primary" disabled={busyId === a.id}
                    onClick={() => act(a.id, 'approve')}>
                    {busyId === a.id ? '…' : 'Approve'}
                  </button>
                  <button className="pa-btn pa-btn-ghost pad-reject" disabled={busyId === a.id}
                    onClick={() => act(a.id, 'reject')}>Reject</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
