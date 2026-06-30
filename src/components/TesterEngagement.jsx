import React, { useState, useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { logUsage, logFeedback } from '../lib/analytics'

/*
  Mounted once inside AppShell. Two jobs:
   1. Log a `page_view` usage event on every route change (tester telemetry).
   2. Show a small, non-invasive, frequency-capped feedback prompt — bottom
      right, dismissible, never blocks the UI. Asks one short, valuable
      question with an optional comment; results land in sv_feedback.
*/

const PROMPTS = [
  'How easy was it to get what you needed today?',
  'How would you rate your experience so far?',
  'How well is KaNun Monitoring fitting your workflow?',
  'How likely are you to recommend KaNun Monitoring to a colleague?',
]

const NEXT_KEY = 'kanun.feedback.next'          // don't prompt before this timestamp
const SHOW_AFTER_MS = 45_000                     // wait until they've used the app a bit
const SNOOZE_MS = 3 * 24 * 60 * 60 * 1000        // "Not now" → 3 days
const AFTER_SUBMIT_MS = 21 * 24 * 60 * 60 * 1000 // submitted → 3 weeks

export default function TesterEngagement() {
  const loc = useLocation()
  const [open, setOpen] = useState(false)
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const promptRef = useRef(PROMPTS[0])

  // 1) usage telemetry — page view per route
  useEffect(() => { logUsage('page_view', {}) }, [loc.pathname])

  // 2) maybe schedule the feedback prompt
  useEffect(() => {
    const next = parseInt(localStorage.getItem(NEXT_KEY) || '0', 10)
    if (Date.now() < next) return
    promptRef.current = PROMPTS[Math.floor(Math.random() * PROMPTS.length)]
    const t = setTimeout(() => setOpen(true), SHOW_AFTER_MS)
    return () => clearTimeout(t)
  }, [])

  function snooze() {
    localStorage.setItem(NEXT_KEY, String(Date.now() + SNOOZE_MS))
    setOpen(false)
  }

  async function submit() {
    if (!rating && !comment.trim()) { snooze(); return }
    setBusy(true)
    await logFeedback({
      prompt: promptRef.current,
      rating: rating || null,
      comment: comment.trim() || null,
      context: { path: loc.pathname },
    })
    logUsage('feedback_submitted', { rating: rating || null })
    localStorage.setItem(NEXT_KEY, String(Date.now() + AFTER_SUBMIT_MS))
    setBusy(false)
    setSent(true)
    setTimeout(() => setOpen(false), 1900)
  }

  if (!open) return null

  return (
    <div style={S.wrap} role="dialog" aria-label="Quick feedback">
      <button onClick={snooze} aria-label="Dismiss" style={S.close}>×</button>
      {sent ? (
        <div style={{ padding: '6px 2px' }}>
          <div style={S.thanksIcon}>✓</div>
          <div style={S.thanksText}>Thank you — this shapes what we build next.</div>
        </div>
      ) : (
        <>
          <div style={S.eyebrow}>Quick feedback · 10 seconds</div>
          <div style={S.q}>{promptRef.current}</div>
          <div style={S.scale}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} onClick={() => setRating(n)}
                style={{ ...S.dot, ...(rating === n ? S.dotOn : null) }} aria-label={`${n} of 5`}>{n}</button>
            ))}
          </div>
          <div style={S.scaleLabels}><span>Not great</span><span>Excellent</span></div>
          <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2}
            placeholder="Anything we should improve? (optional)" style={S.textarea} />
          <div style={S.actions}>
            <button onClick={snooze} style={S.ghost} disabled={busy}>Not now</button>
            <button onClick={submit} style={S.send} disabled={busy}>{busy ? 'Sending…' : 'Send'}</button>
          </div>
        </>
      )}
    </div>
  )
}

const S = {
  wrap: {
    position: 'fixed', right: 20, bottom: 20, zIndex: 900, width: 320, maxWidth: 'calc(100vw - 32px)',
    background: '#fff', border: '1px solid #e3ece8', borderRadius: 14,
    boxShadow: '0 18px 50px -16px rgba(11,60,44,.4)', padding: '16px 18px',
    fontFamily: 'Inter, system-ui, sans-serif', color: '#15241f',
    animation: 'none',
  },
  close: {
    position: 'absolute', top: 8, right: 10, border: 0, background: 'transparent',
    fontSize: 20, lineHeight: 1, color: '#9aa8a2', cursor: 'pointer',
  },
  eyebrow: { fontSize: 11, fontWeight: 700, letterSpacing: '.5px', textTransform: 'uppercase', color: '#2D6A4F', marginBottom: 6 },
  q: { fontSize: 14.5, fontWeight: 600, lineHeight: 1.4, margin: '0 0 12px', paddingRight: 14 },
  scale: { display: 'flex', gap: 8, marginBottom: 4 },
  dot: {
    flex: 1, height: 36, borderRadius: 9, border: '1px solid #d8e6df', background: '#fff',
    color: '#44564f', fontSize: 14, fontWeight: 600, cursor: 'pointer',
  },
  dotOn: { background: '#2D6A4F', color: '#fff', borderColor: '#2D6A4F' },
  scaleLabels: { display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#9aa8a2', margin: '4px 2px 10px' },
  textarea: {
    width: '100%', fontFamily: 'inherit', fontSize: 13.5, padding: '9px 11px', resize: 'vertical',
    border: '1px solid #d8e6df', borderRadius: 10, outline: 'none', boxSizing: 'border-box', marginBottom: 10,
  },
  actions: { display: 'flex', justifyContent: 'flex-end', gap: 8 },
  ghost: { border: '1px solid #d8e6df', background: '#fff', color: '#44564f', borderRadius: 9, padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  send: { border: 0, background: '#2D6A4F', color: '#fff', borderRadius: 9, padding: '8px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  thanksIcon: { width: 34, height: 34, borderRadius: '50%', background: '#2D6A4F', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 800, margin: '4px 0 10px' },
  thanksText: { fontSize: 14, lineHeight: 1.5, color: '#2a3b36' },
}
