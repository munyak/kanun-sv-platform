-- KaNun SV Platform — Phase 1.2
-- Data model for the second feature wave:
--   * structured visit observation logging (check-in/out, GPS, prompts)
--   * e-signatures (intake / agreements / acknowledgements)
--   * portal access tokens (parent + attorney magic links)
--   * report workflow extensions on sv_reports
--   * reminder configs per case (sv_reminders already exists for send log)
--   * invoicing foundation (rates already live on sv_cases)
--
-- Idempotent: every CREATE uses IF NOT EXISTS, every ALTER uses IF NOT EXISTS,
-- and ENUM extensions use IF NOT EXISTS. Safe to re-run.
--
-- IMPORTANT: this migration extends two pre-existing tables rather than
-- replacing them: sv_visit_observations (already has the rich 5.20 schema)
-- and sv_reports (already has period-summary fields + a status enum).

-- =========================================================================
-- 1) Augment sv_visits with check-in/check-out + GPS
-- =========================================================================
alter table public.sv_visits add column if not exists checked_in_at        timestamptz;
alter table public.sv_visits add column if not exists checked_out_at       timestamptz;
alter table public.sv_visits add column if not exists checkin_lat          numeric(9,6);
alter table public.sv_visits add column if not exists checkin_lng          numeric(9,6);
alter table public.sv_visits add column if not exists checkout_lat         numeric(9,6);
alter table public.sv_visits add column if not exists checkout_lng         numeric(9,6);
alter table public.sv_visits add column if not exists actual_duration_minutes integer;
alter table public.sv_visits add column if not exists checkin_monitor_id   uuid references public.sv_monitors(id) on delete set null;

-- Extend the visit status enum to cover the new flow states.
alter type public.sv_visit_status add value if not exists 'checked_in';
alter type public.sv_visit_status add value if not exists 'report_pending';
alter type public.sv_visit_status add value if not exists 'report_submitted';

-- =========================================================================
-- 2) Extend the existing sv_visit_observations with org_id + new prompt cols
-- =========================================================================
alter table public.sv_visit_observations add column if not exists org_id             uuid references public.sv_organizations(id) on delete cascade;
alter table public.sv_visit_observations add column if not exists parent_interaction text;
alter table public.sv_visit_observations add column if not exists environment        text;
alter table public.sv_visit_observations add column if not exists notes              text;
alter table public.sv_visit_observations add column if not exists safety_concerns    text;
alter table public.sv_visit_observations alter column observation_type drop not null;

create index if not exists sv_visit_observations_visit_idx on public.sv_visit_observations(visit_id);
create index if not exists sv_visit_observations_org_idx   on public.sv_visit_observations(org_id);

-- Backfill org_id from the parent visit
update public.sv_visit_observations o
   set org_id = v.org_id
  from public.sv_visits v
 where o.visit_id = v.id and o.org_id is null;

-- =========================================================================
-- 3) E-Signatures
-- =========================================================================
create table if not exists public.sv_e_signatures (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.sv_organizations(id) on delete cascade,
  case_id           uuid references public.sv_cases(id) on delete cascade,
  party_id          uuid references public.sv_parties(id) on delete set null,
  monitor_id        uuid references public.sv_monitors(id) on delete set null,
  document_type     text not null,
  document_title    text,
  signer_name       text not null,
  signer_email      text,
  signer_role       text,
  signature_data    text not null,
  ip_address        text,
  user_agent        text,
  signed_at         timestamptz not null default now(),
  created_at        timestamptz not null default now()
);
create index if not exists sv_e_signatures_case_idx     on public.sv_e_signatures(case_id);
create index if not exists sv_e_signatures_org_idx      on public.sv_e_signatures(org_id);
create index if not exists sv_e_signatures_doctype_idx  on public.sv_e_signatures(document_type);
alter table public.sv_e_signatures disable row level security;

-- =========================================================================
-- 4) Portal access tokens (parent + attorney magic links)
-- =========================================================================
create table if not exists public.sv_portal_access_tokens (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.sv_organizations(id) on delete cascade,
  case_id         uuid references public.sv_cases(id) on delete cascade,
  party_id        uuid references public.sv_parties(id) on delete cascade,
  token           text not null unique,
  portal_kind     text not null,
  display_name    text,
  email           text,
  expires_at      timestamptz,
  revoked_at      timestamptz,
  last_used_at    timestamptz,
  use_count       integer not null default 0,
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now()
);
create index if not exists sv_portal_tokens_kind_idx on public.sv_portal_access_tokens(portal_kind);
create index if not exists sv_portal_tokens_org_idx  on public.sv_portal_access_tokens(org_id);
alter table public.sv_portal_access_tokens disable row level security;

-- =========================================================================
-- 5) Extend sv_reports for the per-visit report editor + workflow
-- =========================================================================
alter table public.sv_reports add column if not exists visit_id        uuid references public.sv_visits(id) on delete set null;
alter table public.sv_reports add column if not exists report_type     text default 'visit_summary';
alter table public.sv_reports add column if not exists visit_details   jsonb default '{}'::jsonb;
alter table public.sv_reports add column if not exists observations    text;
alter table public.sv_reports add column if not exists interactions    text;
alter table public.sv_reports add column if not exists safety_concerns text;
alter table public.sv_reports add column if not exists recommendations text;
alter table public.sv_reports add column if not exists reviewer_id     uuid references auth.users(id) on delete set null;
alter table public.sv_reports add column if not exists reviewed_at     timestamptz;
alter table public.sv_reports add column if not exists approved_at     timestamptz;
alter table public.sv_reports add column if not exists submitted_at    timestamptz;
alter table public.sv_reports add column if not exists created_by      uuid references auth.users(id) on delete set null;

-- The existing sv_report_status enum has draft, pending_review, approved,
-- filed, distributed. We add the two states the new editor uses.
alter type public.sv_report_status add value if not exists 'submitted';
alter type public.sv_report_status add value if not exists 'reviewed';

-- Loosen period_start/period_end so per-visit reports don't need them
alter table public.sv_reports alter column period_start drop not null;
alter table public.sv_reports alter column period_end   drop not null;

create index if not exists sv_reports_case_idx  on public.sv_reports(case_id);
create index if not exists sv_reports_visit_idx on public.sv_reports(visit_id);

-- =========================================================================
-- 6) Reminder configs per case (sv_reminders already exists for send log)
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
alter table public.sv_reminder_configs disable row level security;

-- =========================================================================
-- 7) Invoices + payments
-- =========================================================================
create table if not exists public.sv_invoices (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.sv_organizations(id) on delete cascade,
  case_id         uuid not null references public.sv_cases(id) on delete cascade,
  visit_id        uuid references public.sv_visits(id) on delete set null,
  invoice_number  text,
  bill_to_party_id uuid references public.sv_parties(id) on delete set null,
  amount_cents    integer not null default 0,
  status          text not null default 'draft',
  issued_at       timestamptz,
  due_at          timestamptz,
  paid_at         timestamptz,
  notes           text,
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists sv_invoices_case_idx   on public.sv_invoices(case_id);
create index if not exists sv_invoices_status_idx on public.sv_invoices(status);
alter table public.sv_invoices disable row level security;

create table if not exists public.sv_payments (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.sv_organizations(id) on delete cascade,
  invoice_id      uuid not null references public.sv_invoices(id) on delete cascade,
  amount_cents    integer not null,
  method          text,
  reference       text,
  received_at     timestamptz not null default now(),
  created_at      timestamptz not null default now()
);
create index if not exists sv_payments_invoice_idx on public.sv_payments(invoice_id);
alter table public.sv_payments disable row level security;
