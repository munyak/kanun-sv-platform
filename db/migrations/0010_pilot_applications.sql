-- =========================================================================
-- 0009 — Pilot tester applications + approval gate
-- Public splash/landing collects pilot-tester applications. Each submission
-- creates a PENDING record here (plus a gated, unconfirmed auth user). A
-- tester cannot sign in until Munya approves, which confirms the auth user
-- and flips status -> 'approved'. All writes go through service-role Edge
-- Functions (pilot-apply, pilot-review); RLS is locked so anon/authenticated
-- clients cannot read or tamper with applications directly.
-- =========================================================================

create table if not exists public.sv_pilot_applications (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  -- Core identity
  name             text not null,
  email            text not null,
  role             text not null check (role in ('parent','monitor','court')),

  -- Classification / segmentation (prospect vs. user)
  organization     text,                 -- agency / firm / court / self
  jurisdiction     text,                 -- county / state / location
  court_or_provider text check (court_or_provider in ('court_ordered','provider','both','unsure') or court_or_provider is null),
  use_case         text,                 -- what they want to test / use case
  how_heard        text,                 -- referral source

  -- Approval workflow
  status           text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewed_at      timestamptz,
  reviewed_by      text,                 -- admin email who actioned it
  notes            text,

  -- Link to the gated auth user that was provisioned for this applicant
  user_id          uuid
);

create index if not exists sv_pilot_applications_status_idx  on public.sv_pilot_applications (status, created_at desc);
create index if not exists sv_pilot_applications_email_idx   on public.sv_pilot_applications (lower(email));

-- One active (non-rejected) application per email keeps the queue clean.
create unique index if not exists sv_pilot_applications_email_active_uniq
  on public.sv_pilot_applications (lower(email))
  where status in ('pending','approved');

-- Lock it down: only the service role (Edge Functions) may read/write.
alter table public.sv_pilot_applications enable row level security;
-- (No policies for anon/authenticated => default deny. Service role bypasses RLS.)

-- keep updated_at fresh
create or replace function public.sv_pilot_applications_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists sv_pilot_applications_touch_trg on public.sv_pilot_applications;
create trigger sv_pilot_applications_touch_trg
  before update on public.sv_pilot_applications
  for each row execute function public.sv_pilot_applications_touch();
