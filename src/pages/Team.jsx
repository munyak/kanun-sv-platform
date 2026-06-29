import React, { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { useAuth, roleLabel } from '../auth/AuthContext'

export default function Team() {
  const { user, activeOrgId, role } = useAuth()
  const [members, setMembers] = useState([])
  const [invites, setInvites] = useState([])
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('monitor')
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState(null)

  const canManage = ['agency_owner', 'agency_manager', 'platform_admin'].includes(role)

  useEffect(() => { if (activeOrgId) load() }, [activeOrgId])

  async function load() {
    setLoading(true)
    try {
      const [m, i] = await Promise.all([
        supabase.from('sv_user_roles').select('id, user_id, role, created_at').eq('org_id', activeOrgId),
        supabase.from('sv_invitations').select('id, email, role, expires_at, accepted_at, created_at').eq('org_id', activeOrgId).is('accepted_at', null).order('created_at', { ascending: false }),
      ])
      setMembers(m.data || [])
      setInvites(i.data || [])
    } finally {
      setLoading(false)
    }
  }

  function showToast(message, kind = 'success') {
    setToast({ message, kind }); setTimeout(() => setToast(null), 3500)
  }

  async function sendInvite(e) {
    e.preventDefault()
    if (!email.trim()) return
    setBusy(true)
    try {
      const { error } = await supabase.from('sv_invitations').insert({
        org_id: activeOrgId,
        email: email.trim().toLowerCase(),
        role: inviteRole,
        invited_by: user.id,
      })
      if (error) throw error
      setEmail('')
      showToast('Invitation created. They’ll be added when they sign up with that email.')
      load()
    } catch (e) {
      showToast(e.message || 'Could not create invitation', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function cancelInvite(id) {
    const { error } = await supabase.from('sv_invitations').delete().eq('id', id)
    if (error) showToast(error.message, 'error')
    else { showToast('Invitation revoked.'); load() }
  }

  async function removeMember(m) {
    if (!confirm('Remove this member’s access? They’ll be signed out of your agency and their monitor profile deactivated. Their existing visits and reports are preserved. You can re-invite them later.')) return
    try {
      const { data, error } = await supabase.functions.invoke('manage-user', {
        body: { action: 'remove_access', user_id: m.user_id },
      })
      if (error) {
        let msg = 'Could not remove member.'
        try { const j = await error.context?.json?.(); if (j) msg = j.message || j.error || msg } catch { /* */ }
        throw new Error(msg)
      }
      if (data?.error) throw new Error(data.message || data.error)
      showToast('Member access removed.'); load()
    } catch (e) {
      showToast(e.message || 'Could not remove member.', 'error')
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Team</h1>
          <div className="page-subtitle">{members.length} member{members.length === 1 ? '' : 's'} · {invites.length} pending invite{invites.length === 1 ? '' : 's'}</div>
        </div>
      </div>

      {canManage && (
        <div className="card">
          <div className="card-header"><div className="card-title">Invite someone</div></div>
          <div className="card-body">
            <form onSubmit={sendInvite}>
              <div className="form-grid">
                <div className="form-group full" style={{ gridColumn: 'span 2' }}>
                  <label className="form-label">Email</label>
                  <input type="email" required className="form-input" value={email}
                    onChange={(e) => setEmail(e.target.value)} placeholder="person@example.com" />
                </div>
                <div className="form-group">
                  <label className="form-label">Role</label>
                  <select className="form-select" value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}>
                    <option value="monitor">Monitor</option>
                    <option value="agency_manager">Agency manager</option>
                    <option value="agency_owner">Agency owner</option>
                    <option value="attorney">Attorney (read-only)</option>
                    <option value="court_liaison">Court liaison (read-only)</option>
                  </select>
                </div>
              </div>
              <div className="btn-group right">
                <button className="btn btn-primary" disabled={busy}>{busy ? 'Sending…' : 'Send invite'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-header"><div className="card-title">Members</div></div>
        <div className="card-body-flush">
          {loading ? <div className="loading">Loading…</div> : members.length === 0 ? (
            <div className="empty-state"><div className="empty-state-title">No members yet</div></div>
          ) : (
            <table className="data-table">
              <thead>
                <tr><th>User ID</th><th>Role</th><th>Joined</th><th /></tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.id}>
                    <td className="cell-mono">{m.user_id === user?.id ? <strong>You</strong> : m.user_id.slice(0, 8) + '…'}</td>
                    <td><span className="badge badge-blue">{roleLabel(m.role)}</span></td>
                    <td className="cell-muted">{new Date(m.created_at).toLocaleDateString()}</td>
                    <td>
                      {canManage && m.user_id !== user?.id && (
                        <button className="btn btn-sm btn-secondary" onClick={() => removeMember(m)}>Remove access</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-header"><div className="card-title">Pending invitations</div></div>
        <div className="card-body-flush">
          {invites.length === 0 ? (
            <div className="empty-state"><div className="empty-state-title">No pending invitations</div></div>
          ) : (
            <table className="data-table">
              <thead><tr><th>Email</th><th>Role</th><th>Expires</th><th /></tr></thead>
              <tbody>
                {invites.map((i) => (
                  <tr key={i.id}>
                    <td className="cell-strong">{i.email}</td>
                    <td><span className="badge badge-yellow">{roleLabel(i.role)}</span></td>
                    <td className="cell-muted">{new Date(i.expires_at).toLocaleDateString()}</td>
                    <td>{canManage && <button className="btn btn-sm btn-secondary" onClick={() => cancelInvite(i.id)}>Revoke</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {toast && <div className={`toast ${toast.kind === 'error' ? 'error' : ''}`}>{toast.message}</div>}
    </div>
  )
}
