import { supabase } from '../supabase'

/**
 * Validate a portal access token, returning the row + the org name.
 * Returns { token, org } on success, throws on failure.
 *
 * Touches use_count + last_used_at as a soft audit trail.
 */
export async function loadPortalToken(token, expectedKind) {
  const { data, error } = await supabase
    .from('sv_portal_access_tokens')
    .select(`*, org:org_id(id, name)`)
    .eq('token', token)
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error('This link is no longer valid.')
  if (data.revoked_at) throw new Error('This link has been revoked.')
  if (data.expires_at && new Date(data.expires_at) < new Date()) throw new Error('This link has expired.')
  if (expectedKind && data.portal_kind !== expectedKind) throw new Error('Wrong portal type.')

  // Best-effort audit ping (don't block on errors)
  supabase.from('sv_portal_access_tokens')
    .update({ last_used_at: new Date().toISOString(), use_count: (data.use_count || 0) + 1 })
    .eq('id', data.id).then(() => {})

  return data
}

/**
 * Generate a URL-safe random token. Browser-native, no deps.
 */
export function generatePortalToken(bytes = 24) {
  const arr = new Uint8Array(bytes)
  crypto.getRandomValues(arr)
  return btoa(String.fromCharCode(...arr))
    .replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}
