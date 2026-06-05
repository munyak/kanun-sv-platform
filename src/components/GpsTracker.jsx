import { useCallback, useEffect, useRef, useState } from 'react'

/*
  useGpsTracker — Continuous GPS tracking during active visits

  Usage:
    const { tracking, track, startTracking, stopTracking, currentPosition } = useGpsTracker()

  Returns:
  - tracking: boolean — whether actively recording
  - track: Array<{lat, lng, accuracy, timestamp}> — GPS breadcrumbs
  - currentPosition: {lat, lng, accuracy} | null
  - startTracking(): void
  - stopTracking(): Array — returns the final track

  The track is stored in memory and can be persisted to Supabase
  as a JSONB array on the sv_visits table (gps_track column).
*/

export function useGpsTracker(intervalMs = 30000) {
  const [tracking, setTracking] = useState(false)
  const [track, setTrack] = useState([])
  const [currentPosition, setCurrentPosition] = useState(null)
  const [error, setError] = useState(null)
  const watchIdRef = useRef(null)
  const trackRef = useRef([])

  const recordPosition = useCallback((position) => {
    const point = {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
      accuracy: Math.round(position.coords.accuracy),
      timestamp: new Date().toISOString(),
    }
    trackRef.current = [...trackRef.current, point]
    setTrack(trackRef.current)
    setCurrentPosition({ lat: point.lat, lng: point.lng, accuracy: point.accuracy })
    setError(null)
  }, [])

  const handleError = useCallback((err) => {
    console.warn('GPS error:', err.message)
    if (err.code === 1) setError('Location permission denied')
    else if (err.code === 2) setError('Location unavailable')
    else if (err.code === 3) setError('Location timeout')
    else setError(err.message)
  }, [])

  const startTracking = useCallback(() => {
    if (!navigator.geolocation) {
      setError('Geolocation not supported')
      return
    }

    trackRef.current = []
    setTrack([])
    setTracking(true)
    setError(null)

    // Get initial position immediately
    navigator.geolocation.getCurrentPosition(recordPosition, handleError, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0,
    })

    // Then watch continuously
    watchIdRef.current = navigator.geolocation.watchPosition(
      recordPosition,
      handleError,
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: intervalMs,
      }
    )
  }, [recordPosition, handleError, intervalMs])

  const stopTracking = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }
    setTracking(false)
    return trackRef.current
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
      }
    }
  }, [])

  return { tracking, track, currentPosition, error, startTracking, stopTracking }
}

/*
  GpsStatusBar — visual indicator for GPS tracking state

  Shows current position accuracy, number of points recorded,
  and tracking status. Designed for the monitor mobile view.
*/
export function GpsStatusBar({ tracking, track, currentPosition, error }) {
  if (!tracking && track.length === 0) return null

  return (
    <div className="gps-bar">
      <div className="gps-bar-left">
        {tracking && (
          <span className="gps-pulse" aria-hidden="true">
            <span className="gps-pulse-dot" />
          </span>
        )}
        <span className="gps-bar-status">
          {tracking ? 'GPS tracking' : `${track.length} points recorded`}
        </span>
      </div>
      {currentPosition && (
        <span className="gps-bar-accuracy">
          ±{currentPosition.accuracy}m
        </span>
      )}
      {error && <span className="gps-bar-error">{error}</span>}
    </div>
  )
}
