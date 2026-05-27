-- =========================================================================
-- 0006 — Visit photos + GPS accuracy
-- =========================================================================
-- Adds the storage table and bucket so monitors can capture photo evidence
-- from a mobile device during a visit, and records GPS accuracy alongside
-- the existing checkin/checkout lat/lng.
--
-- Idempotent: re-runnable.

-- 1) sv_visits — capture device-reported GPS accuracy (meters)
alter table public.sv_visits add column if not exists checkin_accuracy_m  numeric(7,1);
alter table public.sv_visits add column if not exists checkout_accuracy_m numeric(7,1);

-- 2) sv_visit_photos — photo evidence attached to a visit
create table if not exists public.sv_visit_photos (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.sv_organizations(id) on delete cascade,
  visit_id        uuid not null references public.sv_visits(id) on delete cascade,
  monitor_id      uuid references public.sv_monitors(id) on delete set null,
  observation_id  uuid references public.sv_visit_observations(id) on delete set null,
  storage_path    text not null,
  mime_type       text,
  size_bytes      integer,
  caption         text,
  captured_at     timestamptz not null default now(),
  gps_lat         numeric(9,6),
  gps_lng         numeric(9,6),
  gps_accuracy_m  numeric(7,1),
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now()
);
create index if not exists sv_visit_photos_visit_idx on public.sv_visit_photos(visit_id);
create index if not exists sv_visit_photos_org_idx   on public.sv_visit_photos(org_id);
create index if not exists sv_visit_photos_obs_idx   on public.sv_visit_photos(observation_id);

-- Matches the org-scoped, app-enforced access pattern used by the rest of
-- the schema (the app filters every query by activeOrgId).
alter table public.sv_visit_photos disable row level security;

-- 3) Storage bucket for visit photo files. Private — accessed via signed URLs.
insert into storage.buckets (id, name, public)
  values ('visit-photos', 'visit-photos', false)
  on conflict (id) do nothing;
