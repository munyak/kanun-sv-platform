-- KaNun SV Platform — Phase 1.2
-- Adds the data model for the second feature wave:
--   * structured visit observation logging (check-in/out, GPS, prompts)
--   * e-signatures (intake / agreements / acknowledgements)
--   * portal access tokens (parent + attorney magic links)
--   * AI-assisted reports with review workflow
--   * reminder configs per case
--   * invoicing foundation (rates already live on sv_cases)
-- RLS stays disabled on these new tables for dev parity with the rest of sv_*.
-- Safe to re-run.

begin;

-- =========================================================================
-- 1) Augment sv_visits to carry the check-in/check-out flow + GPS
-- =========================================================================
alter table public.sv_visits add column if not exists checked_in_at        timestamptz;
alter table public.sv_visits add column if not exists checked_out_at       timestamptz;
alter table public.sv_visits add column if not exists checkin_lat          numeric(9,6);
alter table public.sv_visits add column if not exists checkin_lng          numeric(9,6);
alter table public.sv_visits add column if not exists checkout_lat         numeric(9,6);
alter table public.sv_visits add column if not exists checkout_lng         numeric(9,6);
alter table public.sv_visits add column if not exists actual_duration_minutes integer;
alter table public.sv_visits add column if not exists checkin_monitor_id   uuid references public.sv_monitors(id) on delete set null;

-- Allow the new states without dropping the old ones. We do NOT enforce a
-- CHECK constraint because legacy status values (canceled_*, no_show_*) coexist.
-- The app is the source of truth for the flow:
--   scheduled -> checked_in -> in_progress -> completed -> report_pending -> report_submitted

-- =========================================================================
-- 2) Structured observation logs (one row per observation entry per visit)
-- =========================================================================
create table if not exists public.sv_visit_observations (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.sv_organizations(id) on delete cascade,
  visit_id        uuid not null references public.sv_visits(id) on delete cascade,
  monitor_id      uuid references public.sv_monitors(id) on delete set null,
  -- structured prompts
  child_behavior        text,
  parent_interaction    text,
  safety_concerns       text,
  environment           text,
  -- free-text notes
  notes                 text,
  observed_at           timestamptz not null default now(),
  created_at            timestamptz not null default now()
);
create index if not exists sv_visit_observations_visit_idx on public.sv_visit_observations(visit_id);
create index if not exists sv_visit_observations_org_idx   on public.sv_visit_observations(org_id);

-- =========================================================================
-- 3) E-Signatures (intake, agreements, mandated reporter, confidentiality)
-- =========================================================================
create table if not exists public.sv_e_signatures (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.sv_organizations(id) on delete cascade,
  case_id           uuid references public.sv_cases(id) on delete cascade,
  party_id          uuid references public.sv_parties(id) on delete set null,
  monitor_id        uuid references public.sv_monitors(id) on delete set null,
  document_type     text not null,   -- service_agreement | confidentiality | mandated_reporter | intake_ack | other
  document_title    text,
  signer_name       text not null,
  signer_email      text,
  signer_role       text,            -- custodial | noncustodial | monitor | attorney | other
  signature_data    text not null,   -- data URL (image/png)
  ip_address        text,
  user_agent        text,
  signed_at         timestamptz not null default now(),
  created_at        timestamptz not null default now()
);
create index if not exists sv_e_signatures_case_idx  on public.sv_e_signatures(case_id);
create index if not exists sv_e_signatures_org_idx   on public.sv_e_signatures(org_id);
create index if not exists sv_e_signatures_doctype_idx on public.sv_e_signatures(document_type);

-- =========================================================================
-- 4) Portal access tokens (magic links for parent + attorney portals)
-- =========================================================================
create table if not exists public.sv_portal_access_tokens (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.sv_organizations(id) on delete cascade,
  case_id         uuid references public.sv_cases(id) on delete cascade,
  party_id        uuid references public.sv_parties(id) on delete cascade,
  token           text not null unique,             -- url-safe random
  portal_kind     text not null,                    -- parent | attorney
  display_name    text,                             -- shown on portal landing
  email           text,
  expires_at      timestamptz,                      -- null = never expires
  revoked_at      timestamptz,
  last_used_at    timestamptz,
  use_count       integer not null default 0,
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now()
);
create index if not exists sv_portal_tokens_kind_idx on public.sv_portal_access_tokens(portal_kind);
create index if not exists sv_portal_tokens_org_idx  on public.sv_portal_access_tokens(org_id);

-- =========================================================================
-- 5) Reports — extend the existing sv_reports table or create it.
--    We don't know its exact shape from the prior migrations, so this is a
--    defensive create-or-add.
-- =========================================================================
create table if not exists public.sv_reports (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.sv_organizations(id) on delete cascade,
  case_id         uuid not null references public.sv_cases(id) on delete cascade,
  visit_id        uuid references public.sv_visits(id) on delete set null,
  monitor_id      uuid references public.sv_monitors(id) on delete set null,
  report_type     text not null default 'visit_summary',  -- visit_summary | fl324p_attachment | incident
  status          text not null default 'draft',           -- draft | submitted | reviewed | approved
  visit_details   jsonb default '{}'::jsonb,
  observations    text,
  interactions    text,
  safety_concerns text,
  recommendations text,
  reviewer_id     uuid references auth.users(id) on delete set null,
  reviewed_at     timestamptz,
  approved_at     timestamptz,
  submitted_at    timestamptz,
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Add the columns we need even if the table already existed under a different shape.
alter table public.sv_reports add column if not exists visit_id        uuid references public.sv_visits(id) on delete set null;
alter table public.sv_reports add column if not exists monitor_id      uuid references public.sv_monitors(id) on delete set null;
alter table public.sv_reports add column if not exists report_type     text default 'visit_summary';
alter table public.sv_reports add column if not exists status          text default 'draft';
alter table public.sv_reports add column if not exists visit_details   jsonb default '{}'::jsonb;
alter table public.sv_reports add column if not exists observations    text;
alter table public.sv_reports add column if not exists interactions    text;
alter table public.sv_reports add column if not exists safety_concerns text;
alter table public.sv_reports add column if not exists recommendations text;
alter table public.sv_reports add column if not exists reviewer_id     uuid references auth.users(id) on delete set null;
alter table public.sv_reports add column if not exists reviewed_at     timestamptz;
alter table public.sv_reports add column if not exists approved_at     timestamptz;
alter table public.sv_reports add column if not exists submitted_at    timestamptz;

create index if not exists sv_reports_case_idx  on public.sv_reports(case_id);
create index if not exists sv_reports_visit_idx on public.sv_reports(visit_id);
create index if not exists sv_reports_status_idx on public.sv_reports(status);

-- =========================================================================
-- 6) Reminder configs (per case)
-- =========================================================================
create table if not exists public.sv_reminder_configs (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.sv_organizations(id) on delete cascade,
  case_id         uuid not null references public.sv_cases(id) on delete cascade,
  reminder_72h    boolean not null default true,
  reminder_24h    boolean not null default true,
  reminder_2h     boolean not null default true,
  channel_sms     boolean not null default true,
  channel_email   boolean not null default true,
  notify_custodial    boolean not null default true,
  notify_noncustodial boolean not null default true,
  notify_monitor      boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (case_id)
);
create index if not exists sv_reminder_configs_org_idx on public.sv_reminder_configs(org_id);

-- =========================================================================
-- 7) Invoices + payments (Stripe to come later)
-- =========================================================================
create table if not exists public.sv_invoices (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.sv_organizations(id) on delete cascade,
  case_id         uuid not null references public.sv_cases(id) on delete cascade,
  visit_id        uuid references public.sv_visits(id) on delete set null,
  invoice_number  text,
  bill_to_party_id uuid references public.sv_parties(id) on delete set null,
  amount_cents    integer not null default 0,
  status          text not null default 'draft',  -- draft | issued | paid | void | refunded
  issued_at       timestamptz,
  due_at          timestamptz,
  paid_at         timestamptz,
  notes           text,
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists sv_invoices_case_idx on public.sv_invoices(case_id);
create index if not exists sv_invoices_status_idx on public.sv_invoices(status);

create table if not exists public.sv_payments (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.sv_organizations(id) on delete cascade,
  invoice_id      uuid not null references public.sv_invoices(id) on delete cascade,
  amount_cents    integer not null,
  method          text,         -- card | cash | check | other
  reference       text,
  received_at     timestamptz not null default now(),
  created_at      timestamptz not null default now()
);
create index if not exists sv_payments_invoice_idx on public.sv_payments(invoice_id);

-- =========================================================================
-- 8) Keep RLS disabled on these new tables for dev parity.
-- =========================================================================
alter table public.sv_visit_observations    disable row level security;
alter table public.sv_e_signatures          disable row level security;
alter table public.sv_portal_access_tokens  disable row level security;
alter table public.sv_reports               disable row level security;
alter table public.sv_reminder_configs      disable row level security;
alter table public.sv_invoices              disable row level security;
alter table public.sv_payments              disable row level security;

commit;
