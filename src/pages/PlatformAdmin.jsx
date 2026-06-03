import React, { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { useAuth, roleLabel } from '../auth/AuthContext'

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtRelative(d) {
  if (!d) return 'Never'
  const diff = Date.now() - new Date(d).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return fmtDate(d)
}

export default function PlatformAdmin() {
  const { role } = useAuth()
  const [stats, setStats] = useState(null)
  const [orgs, setOrgs] = useState([])
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('overview')
  const [search, setSearch] = useState('')
  const [toast, setToast] = useState(null)
  const [resetBusy, setResetBusy] = useState(null)

  useEffect(() => { load() }, [])

  function showToast(message, kind = 'success') {
    setToast({ message, kind })
    setTimeout(() => setToast(null), 4000)
  }

  async function load() {
    setLoading(true)
    try {
      const [sRes, oRes, uRes] = await Promise.all([
        supabase.rpc('platform_admin_stats'),
        supabase.rpc('platform_admin_orgs'),
        supabase.rpc('platform_admin_users'),
      ])
      if (sRes.error) throw sRes.error
      setStats(sRes.data)
      setOrgs(oRes.data || [])
      setUsers(uRes.data || [])
    } catch (e) {
      console.error('PlatformAdmin load:', e)
      showToast(e.message || 'Failed to load admin data', 'error')
    } finally {
      setLoading(false)
    }
  }

  async function handlePasswordReset(email) {
    if (!email) return
    setResetBusy(email)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + '/reset-password',
      })
      if (error) throw error
      showToast(`Password reset email sent to ${email}`)
    } catch (e) {
      showToast(e.message || 'Failed to send reset', 'error')
    } finally {
      setResetBusy(null)
    }
  }

  if (role !== 'platform_admin') {
    return (
      <div className="empty-state" style={{ marginTop: 64 }}>
        <div className="empty-state-title">Not authorized</div>
        <div className="empty-state-desc">Platform administration requires the platform_admin role.</div>
      </div>
    )
  }

  if (loading) return <div className="loading">Loading platform data...</div>

  const filteredUsers = users.filter(u => {
    if (!search) return true
    const q = search.toLowerCase()
    return (u.email || '').toLowerCase().includes(q)
      || (u.full_name || '').toLowerCase().includes(q)
      || (u.memberships || []).some(m => (m.org_name || '').toLowerCase().includes(q) || (m.role || '').toLowerCase().includes(q))
  })

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Platform administration</h1>
          <div className="page-subtitle">Manage organizations, users, and platform health</div>
        </div>
        <button className="btn btn-secondary" onClick={load}>Refresh</button>
      </div>

      {/* Stats grid */}
      {stats && (
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-card-head">
              <div className="stat-label">Organizations</div>
            </div>
            <div className="stat-value">{stats.total_orgs}</div>
            <div className="stat-sub">Registered agencies</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-head">
              <div className="stat-label">Users</div>
            </div>
            <div className="stat-value">{stats.total_users}</div>
            <div className="stat-sub">{stats.total_monitors} active monitors</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-head">
              <div className="stat-label">Active cases</div>
            </div>
            <div className="stat-value">{stats.total_cases}</div>
            <div className="stat-sub">{stats.total_visits} total visits</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-head">
              <div className="stat-label">Reports</div>
            </div>
            <div className="stat-value">{stats.total_reports}</div>
            <div className="stat-sub">{stats.pending_reports} pending review</div>
          </div>
        </div>
      )}

      {/* Tab navigation */}
      <div className="admin-tabs">
        {[
          { key: 'overview', label: 'Organizations' },
          { key: 'users', label: 'Users' },
        ].map(t => (
          <button
            key={t.key}
            className={`admin-tab ${tab === t.key ? 'active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Organizations tab */}
      {tab === 'overview' && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">All organizations</div>
            <div className="cell-muted">{orgs.length} total</div>
          </div>
          <div className="card-body-flush">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Organization</th>
                  <th>Members</th>
                  <th>Monitors</th>
                  <th>Cases</th>
                  <th>Visits</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {orgs.length === 0 ? (
                  <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: 32 }}>No organizations yet</td></tr>
                ) : orgs.map(o => (
                  <tr key={o.id}>
                    <td>
                      <div className="cell-strong">{o.name}</div>
                      {o.email && <div className="cell-muted" style={{ fontSize: 12 }}>{o.email}</div>}
                    </td>
                    <td>{o.member_count}</td>
                    <td>{o.active_monitors}</td>
                    <td>{o.active_cases}</td>
                    <td>{o.total_visits}</td>
                    <td className="cell-muted">{fmtDate(o.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Users tab */}
      {tab === 'users' && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">All users</div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <input
                type="search"
                className="form-input"
                placeholder="Search users..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ width: 240, height: 32, fontSize: 13 }}
              />
              <div className="cell-muted">{filteredUsers.length} users</div>
            </div>
          </div>
          <div className="card-body-flush">
            <table className="data-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Organization</th>
                  <th>Last sign in</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.length === 0 ? (
                  <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: 32 }}>No users match your search</td></tr>
                ) : filteredUsers.map(u => {
                  const primaryMembership = (u.memberships || [])[0]
                  return (
                    <tr key={u.user_id}>
                      <td>
                        <div className="cell-strong">{u.full_name || '—'}</div>
                        <div className="cell-muted" style={{ fontSize: 12 }}>{u.email}</div>
                      </td>
                      <td>
                        {(u.memberships || []).map((m, i) => (
                          <span key={i} className={`badge ${m.role === 'platform_admin' ? 'badge-blue' : m.role === 'agency_owner' ? 'badge-green' : 'badge-gray'}`}>
                            {roleLabel(m.role)}
                          </span>
                        ))}
                        {(!u.memberships || u.memberships.length === 0) && (
                          <span className="badge badge-gray">No role</span>
                        )}
                      </td>
                      <td>
                        {(u.memberships || []).map((m, i) => (
                          <div key={i} style={{ fontSize: 13 }}>{m.org_name}</div>
                        ))}
                        {(!u.memberships || u.memberships.length === 0) && (
                          <span className="cell-muted">—</span>
                        )}
                      </td>
                      <td className="cell-muted">{fmtRelative(u.last_sign_in_at)}</td>
                      <td className="cell-muted">{fmtDate(u.created_at)}</td>
                      <td>
                        <button
                          className="btn btn-sm btn-secondary"
                          onClick={() => handlePasswordReset(u.email)}
                          disabled={resetBusy === u.email}
                        >
                          {resetBusy === u.email ? 'Sending...' : 'Reset password'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {toast && <div className={`toast ${toast.kind === 'error' ? 'error' : ''}`}>{toast.message}</div>}
    </div>
  )
}
