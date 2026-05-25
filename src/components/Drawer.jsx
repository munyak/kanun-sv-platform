import React, { useEffect, useRef } from 'react'

/**
 * Right-side slide-in drawer.
 * Pattern: backdrop overlay + slide-in panel from the right.
 * Pass `open` to control visibility; component stays mounted briefly during
 * the closing transition (via internal CSS) — but we keep the API simple and
 * unmount when `open` is false.
 *
 *   <Drawer open={open} onClose={...} title="..." footer={<>...</>}>
 *     <body content />
 *   </Drawer>
 */
export default function Drawer({
  open,
  onClose,
  title,
  subtitle,
  footer,
  width = 560,           // px
  children,
}) {
  const panelRef = useRef(null)

  // Lock background scroll when open
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  // Close on Esc
  useEffect(() => {
    if (!open) return
    function onKey(e) { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="drawer-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div
        ref={panelRef}
        className="drawer-panel"
        style={{ width: typeof width === 'number' ? `${width}px` : width }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="drawer-head">
          <div className="drawer-head-text">
            <div className="drawer-title">{title}</div>
            {subtitle && <div className="drawer-subtitle">{subtitle}</div>}
          </div>
          <button className="drawer-close" onClick={onClose} aria-label="Close drawer">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="drawer-body">{children}</div>

        {footer && <div className="drawer-foot">{footer}</div>}
      </div>
    </div>
  )
}
