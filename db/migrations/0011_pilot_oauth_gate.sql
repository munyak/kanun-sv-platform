-- =========================================================================
-- 0011 — Extend pilot applications for OAuth (Google/Facebook) sign-ups
-- OAuth users are auto-email-confirmed by the provider, so the confirmation
-- gate doesn't hold them. The app-level approval gate (pilot-gate function)
-- auto-creates a PENDING application for any authenticated user who isn't an
-- approved tester / existing member, so OAuth sign-ins land in the same
-- approval queue instead of bypassing it.
--   - role becomes nullable (OAuth doesn't collect it up front)
--   - source records how the application arrived (form | oauth)
-- =========================================================================

alter table public.sv_pilot_applications
  alter column role drop not null;

alter table public.sv_pilot_applications
  add column if not exists source text not null default 'form'
  check (source in ('form','oauth'));
