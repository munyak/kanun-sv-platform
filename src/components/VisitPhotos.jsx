import React, { useEffect, useRef, useState } from 'react'
import {
  uploadVisitPhoto,
  listVisitPhotos,
  getSignedPhotoUrl,
  deleteVisitPhoto,
  readGeolocation,
} from '../lib/visitPhotos'

function fmtClock(ts) {
  if (!ts) return ''
  return new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function PhotoThumb({ photo, onOpen, onDelete, readOnly }) {
  const [url, setUrl] = useState(null)
  useEffect(() => {
    let cancelled = false
    getSignedPhotoUrl(photo.storage_path).then((u) => { if (!cancelled) setUrl(u) }).catch(() => {})
    return () => { cancelled = true }
  }, [photo.id])

  return (
    <div className="vw-photo-thumb">
      <button
        type="button"
        className="vw-photo-thumb-btn"
        onClick={() => url && onOpen(url)}
        aria-label={`Photo at ${fmtClock(photo.captured_at)}`}
      >
        {url ? (
          <img src={url} alt="" loading="lazy" />
        ) : (
          <div className="vw-photo-thumb-skel" />
        )}
        <div className="vw-photo-thumb-time">{fmtClock(photo.captured_at)}</div>
      </button>
      {!readOnly && (
        <button
          type="button"
          className="vw-photo-thumb-remove"
          onClick={() => onDelete(photo)}
          aria-label="Remove photo"
          title="Remove photo"
        >×</button>
      )}
    </div>
  )
}

/**
 * Mobile-first photo capture + thumbnail strip for the active visit flow.
 * - Tapping "Add photo" opens the device camera (capture="environment") or
 *   falls back to the gallery picker on desktop.
 * - Uploads to the visit-photos Supabase Storage bucket and records the row.
 * - GPS is captured at the moment of capture so geo data sticks with the
 *   photo even if the monitor moves before reviewing the visit.
 */
export default function VisitPhotos({
  orgId, visitId, monitorId, userId,
  readOnly = false,
  compact = false,
  onError,
  onChange,
}) {
  const [photos, setPhotos] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [viewerUrl, setViewerUrl] = useState(null)
  const cameraRef = useRef(null)
  const galleryRef = useRef(null)

  async function refresh() {
    setLoading(true)
    try {
      const rows = await listVisitPhotos(visitId)
      setPhotos(rows)
      onChange?.(rows)
    } catch (e) {
      onError?.(e.message || 'Failed to load photos')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { if (visitId) refresh() }, [visitId])

  async function handleFiles(fileList) {
    if (!fileList || fileList.length === 0) return
    setBusy(true)
    try {
      // Capture location once for the whole batch to avoid hammering the
      // geolocation prompt; falls through gracefully if denied.
      const gps = await readGeolocation()
      for (const file of fileList) {
        await uploadVisitPhoto({
          orgId, visitId, monitorId, userId,
          file, gps,
        })
      }
      await refresh()
    } catch (e) {
      onError?.(e.message || 'Photo upload failed')
    } finally {
      setBusy(false)
      if (cameraRef.current) cameraRef.current.value = ''
      if (galleryRef.current) galleryRef.current.value = ''
    }
  }

  async function handleDelete(photo) {
    if (!confirm('Remove this photo? This cannot be undone.')) return
    setBusy(true)
    try {
      await deleteVisitPhoto(photo)
      await refresh()
    } catch (e) {
      onError?.(e.message || 'Could not delete photo')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={`vw-photos ${compact ? 'compact' : ''}`}>
      {!readOnly && (
        <>
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: 'none' }}
            onChange={(e) => handleFiles(e.target.files)}
          />
          <input
            ref={galleryRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => handleFiles(e.target.files)}
          />
          <div className="vw-photo-actions">
            <button
              type="button"
              className="vw-photo-action vw-photo-action-camera"
              onClick={() => cameraRef.current?.click()}
              disabled={busy}
            >
              <span className="vw-photo-action-icon" aria-hidden="true">📷</span>
              <span>{busy ? 'Uploading…' : 'Take photo'}</span>
            </button>
            <button
              type="button"
              className="vw-photo-action vw-photo-action-gallery"
              onClick={() => galleryRef.current?.click()}
              disabled={busy}
            >
              <span className="vw-photo-action-icon" aria-hidden="true">🖼️</span>
              <span>From gallery</span>
            </button>
          </div>
        </>
      )}

      {loading ? (
        <div className="vw-photo-empty">Loading photos…</div>
      ) : photos.length === 0 ? (
        !readOnly && <div className="vw-photo-empty">No photos yet. Photos help document the visit setting and evidence.</div>
      ) : (
        <div className="vw-photo-strip">
          {photos.map((p) => (
            <PhotoThumb
              key={p.id}
              photo={p}
              onOpen={setViewerUrl}
              onDelete={handleDelete}
              readOnly={readOnly}
            />
          ))}
        </div>
      )}

      {viewerUrl && (
        <div
          className="vw-photo-viewer"
          role="dialog"
          aria-label="Photo preview"
          onClick={() => setViewerUrl(null)}
        >
          <img src={viewerUrl} alt="" />
          <button
            type="button"
            className="vw-photo-viewer-close"
            onClick={(e) => { e.stopPropagation(); setViewerUrl(null) }}
            aria-label="Close"
          >×</button>
        </div>
      )}
    </div>
  )
}
