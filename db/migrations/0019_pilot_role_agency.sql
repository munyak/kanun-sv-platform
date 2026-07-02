-- =========================================================================
-- 0019: Distinguish agency owners from individual monitors on pilot applications.
--
-- Problem: the pilot application form offered a single "Monitor / Agency"
-- choice (role = 'monitor'), so agency OWNERS who applied were classified —
-- and emailed — as "monitor". The confirmation and approval emails read
-- "You applied as / You're set up as Monitor" for people who actually run an
-- agency.
--
-- Fix: widen the role CHECK constraint to add a distinct 'agency' value.
-- Purely additive (widens the allowed set) — cannot invalidate existing rows.
-- The form, the ROLE_LABEL map, and both emails then reflect the real role.
-- Already applied to prod (yxhwcicxarfmptwivkdu) via the Management API; kept
-- here so the migration history stays complete.
-- =========================================================================

alter table public.sv_pilot_applications
  drop constraint if exists sv_pilot_applications_role_check;

alter table public.sv_pilot_applications
  add constraint sv_pilot_applications_role_check
  check (role in ('parent', 'agency', 'monitor', 'court'));
