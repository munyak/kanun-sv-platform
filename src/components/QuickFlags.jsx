import React, { useState } from 'react'

/*
  QuickFlags — One-tap incident flag buttons for monitors

  Standard 5.20 violation categories as quick-tap buttons.
  Each tap auto-creates an observation with:
  - Category: safety_concern or incident
  - Severity: concern or critical
  - Description: pre-filled with the flag label
  - Timestamp: automatic
  - Can be expanded with notes after tapping

  Usage:
    <QuickFlags onFlag={(flag) => addObservation({
      category: flag.category,
      severity: flag.severity,
      description: flag.description,
    })} busy={busy} />
*/

const FLAGS = [
  {
    id: 'derogatory_comments',
    label: 'Derogatory comments',
    shortLabel: 'Derogatory',
    icon: '💬',
    category: 'safety_concern',
    severity: 'concern',
    description: 'Derogatory comments made about the other parent in the presence of the child.',
  },
  {
    id: 'court_case_discussed',
    label: 'Court case discussed',
    shortLabel: 'Court talk',
    icon: '⚖️',
    category: 'safety_concern',
    severity: 'concern',
    description: 'Court case or legal proceedings discussed in the presence of the child.',
  },
  {
    id: 'information_gathering',
    label: 'Information gathering',
    shortLabel: 'Info gathering',
    icon: '🔍',
    category: 'safety_concern',
    severity: 'concern',
    description: 'Parent attempted to gather information about the other parent through the child.',
  },
  {
    id: 'inappropriate_discipline',
    label: 'Inappropriate discipline',
    shortLabel: 'Discipline',
    icon: '⚠️',
    category: 'incident',
    severity: 'critical',
    description: 'Inappropriate or excessive discipline observed during the visit.',
  },
  {
    id: 'unauthorized_gifts',
    label: 'Unauthorized gifts',
    shortLabel: 'Gifts',
    icon: '🎁',
    category: 'safety_concern',
    severity: 'concern',
    description: 'Unauthorized gifts given to the child in violation of court order.',
  },
  {
    id: 'unauthorized_photography',
    label: 'Unauthorized photography',
    shortLabel: 'Photography',
    icon: '📸',
    category: 'safety_concern',
    severity: 'concern',
    description: 'Unauthorized photography or recording during the visit in violation of court order.',
  },
  {
    id: 'unauthorized_physical_contact',
    label: 'Inappropriate contact',
    shortLabel: 'Contact',
    icon: '🚫',
    category: 'incident',
    severity: 'critical',
    description: 'Unauthorized or inappropriate physical contact observed during the visit.',
  },
  {
    id: 'unauthorized_signals',
    label: 'Covert signals',
    shortLabel: 'Signals',
    icon: '👁️',
    category: 'safety_concern',
    severity: 'concern',
    description: 'Covert signals, gestures, or coded communication directed at the child.',
  },
  {
    id: 'substance_suspected',
    label: 'Substance suspected',
    shortLabel: 'Substance',
    icon: '🧪',
    category: 'incident',
    severity: 'critical',
    description: 'Parent appears to be under the influence of alcohol or controlled substances.',
  },
  {
    id: 'child_distress',
    label: 'Child in distress',
    shortLabel: 'Distress',
    icon: '😢',
    category: 'incident',
    severity: 'critical',
    description: 'Child showing signs of significant emotional distress, fear, or withdrawal.',
  },
]

export default function QuickFlags({ onFlag, busy }) {
  const [expanded, setExpanded] = useState(false)
  const [confirmFlag, setConfirmFlag] = useState(null)
  const [notes, setNotes] = useState('')
  const [flagBusy, setFlagBusy] = useState(false)

  async function handleConfirm() {
    if (!confirmFlag) return
    setFlagBusy(true)
    try {
      await onFlag({
        category: confirmFlag.category,
        severity: confirmFlag.severity,
        description: notes
          ? `${confirmFlag.description}\n\nMonitor notes: ${notes}`
          : confirmFlag.description,
      })
      setConfirmFlag(null)
      setNotes('')
    } finally {
      setFlagBusy(false)
    }
  }

  const visibleFlags = expanded ? FLAGS : FLAGS.slice(0, 4)

  return (
    <div className="quick-flags">
      <div className="quick-flags-header">
        <span className="quick-flags-title">Quick flag</span>
        <button
          type="button"
          className="quick-flags-toggle"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? 'Show less' : `All ${FLAGS.length} flags`}
        </button>
      </div>

      <div className="quick-flags-grid">
        {visibleFlags.map((flag) => (
          <button
            key={flag.id}
            type="button"
            className={`quick-flag-btn ${flag.severity === 'critical' ? 'critical' : 'concern'}`}
            onClick={() => { setConfirmFlag(flag); setNotes('') }}
            disabled={busy}
          >
            <span className="quick-flag-icon" aria-hidden="true">{flag.icon}</span>
            <span className="quick-flag-label">{flag.shortLabel}</span>
          </button>
        ))}
      </div>

      {/* Confirmation dialog */}
      {confirmFlag && (
        <div className="quick-flag-confirm">
          <div className="quick-flag-confirm-header">
            <span className={`quick-flag-severity ${confirmFlag.severity}`}>
              {confirmFlag.severity === 'critical' ? '⚠ Critical' : '⚡ Concern'}
            </span>
            <button type="button" className="quick-flag-close" onClick={() => setConfirmFlag(null)}>✕</button>
          </div>
          <div className="quick-flag-confirm-body">
            <div className="quick-flag-confirm-desc">{confirmFlag.description}</div>
            <textarea
              className="quick-flag-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add details (optional) — what exactly happened, who was involved..."
              rows={2}
            />
          </div>
          <div className="quick-flag-confirm-actions">
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setConfirmFlag(null)}>Cancel</button>
            <button
              type="button"
              className={`btn btn-sm ${confirmFlag.severity === 'critical' ? 'btn-danger' : 'btn-primary'}`}
              onClick={handleConfirm}
              disabled={flagBusy}
            >
              {flagBusy ? 'Logging...' : 'Log this flag'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
