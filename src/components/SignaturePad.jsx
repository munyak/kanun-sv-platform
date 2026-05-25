import React, { useEffect, useRef, useState } from 'react'

/**
 * Canvas-based signature pad. Supports mouse and touch.
 * Calls `onChange(dataUrl|null)` whenever the pad's contents change.
 * Provides a `clear()` method via ref if needed.
 */
export default function SignaturePad({ value, onChange, height = 160, disabled = false }) {
  const canvasRef = useRef(null)
  const drawingRef = useRef(false)
  const lastRef = useRef({ x: 0, y: 0 })
  const [empty, setEmpty] = useState(!value)

  // Set up the canvas: resize for devicePixelRatio
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    const ctx = canvas.getContext('2d')
    ctx.scale(dpr, dpr)
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#0f1419'

    // Restore from value if any
    if (value) {
      const img = new Image()
      img.onload = () => ctx.drawImage(img, 0, 0, rect.width, rect.height)
      img.src = value
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function getPos(e) {
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const t = e.touches ? e.touches[0] : e
    return { x: t.clientX - rect.left, y: t.clientY - rect.top }
  }

  function start(e) {
    if (disabled) return
    e.preventDefault()
    drawingRef.current = true
    lastRef.current = getPos(e)
  }
  function move(e) {
    if (!drawingRef.current) return
    e.preventDefault()
    const p = getPos(e)
    const ctx = canvasRef.current.getContext('2d')
    ctx.beginPath()
    ctx.moveTo(lastRef.current.x, lastRef.current.y)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
    lastRef.current = p
    if (empty) setEmpty(false)
  }
  function end() {
    if (!drawingRef.current) return
    drawingRef.current = false
    const canvas = canvasRef.current
    const dataUrl = canvas.toDataURL('image/png')
    onChange?.(dataUrl)
  }

  function clear() {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setEmpty(true)
    onChange?.(null)
  }

  return (
    <div className="sigpad">
      <canvas
        ref={canvasRef}
        style={{ height: `${height}px`, touchAction: 'none', opacity: disabled ? 0.6 : 1 }}
        onMouseDown={start}
        onMouseMove={move}
        onMouseUp={end}
        onMouseLeave={end}
        onTouchStart={start}
        onTouchMove={move}
        onTouchEnd={end}
      />
      <div className="sigpad-foot">
        <div className="sigpad-hint">{empty ? 'Sign with your finger or mouse' : 'Signed'}</div>
        <button type="button" className="btn btn-sm btn-ghost" onClick={clear} disabled={disabled}>
          Clear
        </button>
      </div>
    </div>
  )
}
