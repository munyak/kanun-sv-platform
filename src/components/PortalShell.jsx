import React from 'react'

/**
 * Light, warm layout for parent + attorney portals. No org-side navigation —
 * intentionally a guest-feeling space, not a clinical dashboard.
 */
export default function PortalShell({ orgName, portalKind, signerName, children }) {
  return (
    <div className="portal-shell">
      <header className="portal-topbar">
        <div className="portal-topbar-brand">
          <div className="brand-mark">KW</div>
          <div>
            <div className="portal-topbar-name">{orgName || 'KaNun Wellness'}</div>
            <div className="portal-topbar-sub">Supervised Visitation · {portalKind === 'parent' ? 'Parent Portal' : 'Attorney Portal'}</div>
          </div>
        </div>
        {signerName && (
          <div style={{ fontSize: 13, color: 'var(--gray-600)' }}>
            Signed in as <strong style={{ color: 'var(--gray-900)' }}>{signerName}</strong>
          </div>
        )}
      </header>
      <main className="portal-main">{children}</main>
    </div>
  )
}
