import React, { useCallback, useEffect, useRef, useState } from 'react'

/*
  MonitorOnboarding — First-time setup flow for monitors

  Shows a checklist-style onboarding card when a monitor first logs in:
    1. PWA install prompt ("Add to Home Screen")
    2. Grant location permission
    3. Grant microphone permission (for voice observations)
    4. Grant camera permission (for photo evidence)
    5. Complete profile
    6. Ready for first visit

  State persisted to localStorage so it doesn't re-show after dismissal.
  Renders inline at the top of the Monitor Dashboard.
*/

const STEPS = [
  {
    key: 'install',
    label: 'Install the app',
    desc: 'Add KaNun to your home screen for quick access — it works offline too.',
    icon: '📲',
  },
  {
    key: 'location',
    label: 'Enable location',
    desc: 'GPS check-in verifies you arrived at the visit location on time.',
    icon: '📍',
  },
  {
    key: 'microphone',
    label: 'Enable microphone',
    desc: 'Voice-to-text lets you record observations hands-free during visits.',
    icon: '🎤',
  },
  {
    key: 'camera',
    label: 'Enable camera',
    desc: 'Capture photo evidence during visits when needed.',
    icon: '📸',
  },
  {
    key: 'profile',
    label: 'Complete your profile',
    desc: 'Add your availability, service areas, and certifications.',
    icon: '👤',
  },
]

export default function MonitorOnboarding({ monitorId, onNavigateProfile }) {
  const [dismissed, setDismissed] = useState(false)
  const [completed, setCompleted] = useState({})
  const [installing, setInstalling] = useState(false)
  const [expanded, setExpanded] = useState(true)
  const deferredPromptRef = useRef(null)

  // Load persisted state
  useEffect(() => {
    try {
      const saved = localStorage.getItem('kw_monitor_onboarding')
      if (saved) {
        const parsed = JSON.parse(saved)
        if (parsed.dismissed) { setDismissed(true); return }
        if (parsed.completed) setCompleted(parsed.completed)
      }
    } catch {}
  }, [])

  // Save state changes
  const persist = useCallback((newCompleted, isDismissed = false) => {
    try {
      localStorage.setItem('kw_monitor_onboarding', JSON.stringify({
        dismissed: isDismissed,
        completed: newCompleted,
      }))
    } catch {}
  }, [])

  // Listen for the beforeinstallprompt event (PWA)
  useEffect(() => {
    function handlePrompt(e) {
      e.preventDefault()
      deferredPromptRef.current = e
    }
    window.addEventListener('beforeinstallprompt', handlePrompt)

    // Check if already installed (standalone mode)
    if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) {
      markComplete('install')
    }

    return () => window.removeEventListener('beforeinstallprompt', handlePrompt)
  }, [])

  // Check permissions on mount
  useEffect(() => {
    checkPermissions()
  }, [])

  async function checkPermissions() {
    const newCompleted = { ...completed }

    // Check if installed as PWA
    if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) {
      newCompleted.install = true
    }

    // Check location permission
    if (navigator.permissions) {
      try {
        const geo = await navigator.permissions.query({ name: 'geolocation' })
        if (geo.state === 'granted') newCompleted.location = true
      } catch {}
    }

    // Check camera permission
    if (navigator.permissions) {
      try {
        const cam = await navigator.permissions.query({ name: 'camera' })
        if (cam.state === 'granted') newCompleted.camera = true
      } catch {}
    }

    // Check microphone permission
    if (navigator.permissions) {
      try {
        const mic = await navigator.permissions.query({ name: 'microphone' })
        if (mic.state === 'granted') newCompleted.microphone = true
      } catch {}
    }

    // Profile: consider complete if monitorId exists (basic profile created)
    if (monitorId) {
      newCompleted.profile = true
    }

    setCompleted(newCompleted)
    persist(newCompleted)
  }

  function markComplete(key) {
    setCompleted(prev => {
      const next = { ...prev, [key]: true }
      persist(next)
      return next
    })
  }

  async function handleInstall() {
    if (deferredPromptRef.current) {
      setInstalling(true)
      try {
        deferredPromptRef.current.prompt()
        const result = await deferredPromptRef.current.userChoice
        if (result.outcome === 'accepted') {
          markComplete('install')
        }
      } catch {}
      setInstalling(false)
      deferredPromptRef.current = null
    }
  }

  async function handleLocationPermission() {
    try {
      const pos = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 })
      })
      if (pos) markComplete('location')
    } catch (e) {
      // Permission denied — user needs to enable in settings
      alert('Location access was denied. Please enable location in your browser settings to use GPS check-in.')
    }
  }

  async function handleMicPermission() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach(t => t.stop())
      markComplete('microphone')
    } catch {
      alert('Microphone access was denied. Please enable it in your browser settings to use voice observations.')
    }
  }

  async function handleCameraPermission() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true })
      stream.getTracks().forEach(t => t.stop())
      markComplete('camera')
    } catch {
      alert('Camera access was denied. Please enable it in your browser settings to capture photo evidence.')
    }
  }

  function handleStepAction(key) {
    switch (key) {
      case 'install':
        if (deferredPromptRef.current) {
          handleInstall()
        } else if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) {
          markComplete('install')
        }
        break
      case 'location':
        handleLocationPermission()
        break
      case 'microphone':
        handleMicPermission()
        break
      case 'camera':
        handleCameraPermission()
        break
      case 'profile':
        if (onNavigateProfile) onNavigateProfile()
        break
    }
  }

  function handleDismiss() {
    setDismissed(true)
    persist(completed, true)
  }

  // Don't render if dismissed or all steps complete
  const completedCount = STEPS.filter(s => completed[s.key]).length
  if (dismissed || completedCount === STEPS.length) return null

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
  const showManualInstall = !deferredPromptRef.current && !completed.install

  return (
    <div className="card" style={{ marginBottom: 20, border: '2px solid var(--accent-soft)' }}>
      <div className="card-header" style={{ cursor: 'pointer' }} onClick={() => setExpanded(e => !e)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 20 }}>🚀</span>
          <div>
            <div className="card-title" style={{ fontSize: 15 }}>Get set up for your first visit</div>
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>
              {completedCount} of {STEPS.length} steps complete
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Progress ring */}
          <svg width="32" height="32" viewBox="0 0 36 36">
            <circle cx="18" cy="18" r="14" fill="none" stroke="var(--border-subtle)" strokeWidth="3" />
            <circle cx="18" cy="18" r="14" fill="none" stroke="var(--success)" strokeWidth="3"
              strokeDasharray={`${(completedCount / STEPS.length) * 88} 88`}
              strokeLinecap="round" transform="rotate(-90 18 18)" />
            <text x="18" y="21" textAnchor="middle" fontSize="10" fontWeight="600" fill="var(--text-primary)">
              {completedCount}/{STEPS.length}
            </text>
          </svg>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2"
            style={{ transition: 'transform 0.2s', transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>
            <path d="M6 9l6 6 6-6" />
          </svg>
        </div>
      </div>

      {expanded && (
        <div className="card-body" style={{ padding: 0 }}>
          {STEPS.map((step) => {
            const done = !!completed[step.key]
            const showInstallHelp = step.key === 'install' && showManualInstall

            return (
              <div key={step.key} style={{
                display: 'flex', alignItems: 'flex-start', gap: 12,
                padding: '12px 16px',
                borderBottom: '1px solid var(--border-subtle)',
                opacity: done ? 0.5 : 1,
                transition: 'opacity 0.3s',
              }}>
                {/* Check circle */}
                <div style={{
                  width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: done ? 'var(--success)' : 'var(--bg-subtle)',
                  color: done ? '#fff' : 'var(--text-tertiary)',
                  fontSize: 14, fontWeight: 600, marginTop: 2,
                }}>
                  {done ? '✓' : step.icon}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 14, fontWeight: 500,
                    color: done ? 'var(--text-tertiary)' : 'var(--text-primary)',
                    textDecoration: done ? 'line-through' : 'none',
                  }}>
                    {step.label}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>
                    {step.desc}
                  </div>

                  {/* Manual install instructions for iOS / desktop */}
                  {showInstallHelp && step.key === 'install' && (
                    <div style={{
                      marginTop: 8, padding: '8px 12px', borderRadius: 'var(--r)',
                      background: 'var(--bg-subtle)', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6,
                    }}>
                      {isIOS ? (
                        <>
                          <strong>On iPhone/iPad:</strong> Tap the{' '}
                          <span style={{ fontWeight: 600 }}>Share</span> button{' '}
                          <span style={{ fontSize: 16, verticalAlign: 'middle' }}>⎙</span> at the bottom,
                          then tap <strong>"Add to Home Screen"</strong>.
                        </>
                      ) : isMobile ? (
                        <>
                          <strong>On Android:</strong> Tap the <strong>⋮ menu</strong> in your browser,
                          then tap <strong>"Add to Home Screen"</strong> or <strong>"Install app"</strong>.
                        </>
                      ) : (
                        <>
                          <strong>On Desktop:</strong> Click the install icon in your browser's address bar,
                          or use Chrome menu → <strong>"Install KaNun Monitoring"</strong>.
                        </>
                      )}
                      <div style={{ marginTop: 6 }}>
                        <button className="btn btn-sm btn-secondary" onClick={() => markComplete('install')}>
                          I've added it ✓
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Action button */}
                {!done && (
                  <button
                    className="btn btn-sm btn-primary"
                    style={{ flexShrink: 0, marginTop: 2 }}
                    onClick={() => handleStepAction(step.key)}
                    disabled={step.key === 'install' && installing}
                  >
                    {step.key === 'install'
                      ? (deferredPromptRef.current ? (installing ? 'Installing...' : 'Install') : 'How to install')
                      : step.key === 'profile' ? 'Go to profile'
                      : 'Enable'}
                  </button>
                )}
              </div>
            )
          })}

          {/* Dismiss */}
          <div style={{ padding: '10px 16px', textAlign: 'center' }}>
            <button
              className="btn btn-sm btn-secondary"
              style={{ fontSize: 12, color: 'var(--text-tertiary)' }}
              onClick={handleDismiss}
            >
              Dismiss setup guide
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
