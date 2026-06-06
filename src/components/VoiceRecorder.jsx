import React, { useCallback, useEffect, useRef, useState } from 'react'

/*
  VoiceRecorder — Web Speech API voice-to-text for monitor observations

  Usage:
    <VoiceRecorder onTranscript={(text) => setText(prev => prev + ' ' + text)} />

  Features:
  - Real-time transcription as the monitor speaks
  - Visual audio level indicator
  - Auto-restart on pause (continuous mode)
  - Works on mobile Chrome and Safari
  - Graceful fallback when Speech API unavailable
*/

const SpeechRecognition = typeof window !== 'undefined'
  ? window.SpeechRecognition || window.webkitSpeechRecognition
  : null

const IS_IOS = typeof navigator !== 'undefined' &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))

export default function VoiceRecorder({ onTranscript, onStatusChange, disabled }) {
  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState('')
  const [supported, setSupported] = useState(true)
  const [error, setError] = useState(null)
  const recognitionRef = useRef(null)
  const restartRef = useRef(false)
  const restartTimerRef = useRef(null)
  const lastStartRef = useRef(0)

  // Keep latest callbacks in refs so the recognition instance is created
  // exactly once and NEVER torn down by parent re-renders (the previous
  // version rebuilt recognition on every keystroke because onTranscript
  // was an inline arrow prop — mic appeared to "start then stop itself").
  const onTranscriptRef = useRef(onTranscript)
  const onStatusChangeRef = useRef(onStatusChange)
  useEffect(() => {
    onTranscriptRef.current = onTranscript
    onStatusChangeRef.current = onStatusChange
  })

  useEffect(() => {
    if (!SpeechRecognition) {
      setSupported(false)
      return
    }

    const recognition = new SpeechRecognition()
    // iOS Safari does not honor continuous mode — it ends recognition after
    // every utterance/pause regardless. Use short sessions + delayed
    // auto-restart on iOS; true continuous elsewhere.
    recognition.continuous = !IS_IOS
    recognition.interimResults = true
    recognition.lang = 'en-US'
    recognition.maxAlternatives = 1

    recognition.onresult = (event) => {
      let interimText = ''
      let finalText = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript
        if (event.results[i].isFinal) finalText += transcript
        else interimText += transcript
      }
      if (finalText) {
        onTranscriptRef.current?.(finalText.trim())
        setInterim('')
      } else {
        setInterim(interimText)
      }
    }

    recognition.onstart = () => {
      lastStartRef.current = Date.now()
      setListening(true)
      setError(null)
      onStatusChangeRef.current?.('listening')
    }

    recognition.onend = () => {
      setInterim('')
      if (restartRef.current) {
        // If sessions are dying instantly (<500ms), something is wrong —
        // don't spin in a start/stop loop.
        const lived = Date.now() - lastStartRef.current
        if (lived < 500) {
          restartRef.current = false
          setListening(false)
          onStatusChangeRef.current?.('stopped')
          return
        }
        // Delayed restart: calling start() synchronously inside onend
        // throws/fails on iOS Safari. A short delay makes restart reliable
        // on both iOS and Chrome (~60s session timeout).
        clearTimeout(restartTimerRef.current)
        restartTimerRef.current = setTimeout(() => {
          if (!restartRef.current) return
          try {
            recognition.start()
          } catch (_) {
            restartRef.current = false
            setListening(false)
            onStatusChangeRef.current?.('stopped')
          }
        }, IS_IOS ? 350 : 150)
        // Keep UI in "listening" state across the micro-gap
      } else {
        setListening(false)
        onStatusChangeRef.current?.('stopped')
      }
    }

    recognition.onerror = (event) => {
      if (event.error === 'no-speech' || event.error === 'aborted') {
        // Silence or programmatic stop — onend handles restart
        return
      }
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        setError('Microphone access denied. Check Settings → Safari → Microphone.')
        setSupported(false)
      } else if (event.error === 'network') {
        setError('Network error — speech recognition requires internet.')
      } else {
        setError(`Speech error: ${event.error}`)
      }
      setListening(false)
      restartRef.current = false
      onStatusChangeRef.current?.('error')
    }

    recognitionRef.current = recognition

    return () => {
      restartRef.current = false
      clearTimeout(restartTimerRef.current)
      try { recognition.stop() } catch (_) {}
    }
  }, [])

  const toggleListening = useCallback(() => {
    if (!recognitionRef.current) return
    if (listening) {
      restartRef.current = false
      recognitionRef.current.stop()
    } else {
      restartRef.current = true
      setError(null)
      try {
        recognitionRef.current.start()
      } catch (e) {
        setError(e.message)
      }
    }
  }, [listening])

  if (!supported) {
    return (
      <div className="voice-unsupported">
        <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
          {error || 'Voice input not available in this browser'}
        </span>
      </div>
    )
  }

  return (
    <div className="voice-recorder">
      <button
        type="button"
        className={`voice-btn ${listening ? 'active' : ''}`}
        onClick={toggleListening}
        disabled={disabled}
        title={listening ? 'Stop recording' : 'Start voice input'}
        aria-label={listening ? 'Stop voice recording' : 'Start voice recording'}
      >
        {listening ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="6" width="12" height="12" rx="2" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 1a4 4 0 00-4 4v7a4 4 0 008 0V5a4 4 0 00-4-4z" />
            <path d="M19 10v2a7 7 0 01-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="23" />
            <line x1="8" y1="23" x2="16" y2="23" />
          </svg>
        )}
        <span className="voice-btn-label">
          {listening ? 'Recording...' : 'Voice'}
        </span>
      </button>

      {listening && (
        <div className="voice-pulse" aria-hidden="true">
          <span /><span /><span />
        </div>
      )}

      {interim && (
        <div className="voice-interim" aria-live="polite">
          {interim}
        </div>
      )}

      {error && (
        <div className="voice-error">{error}</div>
      )}
    </div>
  )
}
