import { supabase } from '../supabase'

const BUCKET = 'visit-photos'

function extensionFor(mime, fallback = 'jpg') {
  if (!mime) return fallback
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg'
  if (mime.includes('png')) return 'png'
  if (mime.includes('webp')) return 'webp'
  if (mime.includes('heic')) return 'heic'
  return fallback
}

export async function uploadVisitPhoto({ orgId, visitId, monitorId, observationId = null, file, gps = null, userId = null }) {
  if (!orgId || !visitId || !file) throw new Error('uploadVisitPhoto: missing required field')

  const ext = extensionFor(file.type)
  const id = (crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`)
  const path = `${orgId}/${visitId}/${id}.${ext}`

  const up = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || 'image/jpeg',
    upsert: false,
  })
  if (up.error) throw up.error

  const insert = await supabase.from('sv_visit_photos').insert({
    org_id: orgId,
    visit_id: visitId,
    monitor_id: monitorId || null,
    observation_id: observationId,
    storage_path: path,
    mime_type: file.type || 'image/jpeg',
    size_bytes: file.size || null,
    gps_lat: gps?.lat ?? null,
    gps_lng: gps?.lng ?? null,
    gps_accuracy_m: gps?.accuracy ?? null,
    created_by: userId,
  }).select().single()

  if (insert.error) {
    // Best-effort cleanup so a failed insert doesn't leak a storage object.
    await supabase.storage.from(BUCKET).remove([path]).catch(() => {})
    throw insert.error
  }
  return insert.data
}

export async function listVisitPhotos(visitId) {
  const { data, error } = await supabase
    .from('sv_visit_photos')
    .select('*')
    .eq('visit_id', visitId)
    .order('captured_at', { ascending: true })
  if (error) throw error
  return data || []
}

export async function getSignedPhotoUrl(storagePath, expiresIn = 3600) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, expiresIn)
  if (error) throw error
  return data.signedUrl
}

export async function deleteVisitPhoto(photo) {
  const { error: dbErr } = await supabase.from('sv_visit_photos').delete().eq('id', photo.id)
  if (dbErr) throw dbErr
  // Storage cleanup is best-effort — the DB row is the source of truth.
  await supabase.storage.from(BUCKET).remove([photo.storage_path]).catch(() => {})
}

export async function readGeolocation() {
  if (!('geolocation' in navigator)) return null
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
      }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 },
    )
  })
}
