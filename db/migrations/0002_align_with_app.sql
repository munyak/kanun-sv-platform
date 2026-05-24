-- KaNun SV Platform — Phase 1.1
-- Aligns the live DB with what the application now needs:
--   (1) drop NOT NULL on intake-optional fields so the wizard can save partial data
--   (2) repoint legacy FKs from sv_organization (singular) -> sv_organizations
--   (3) give sv_case_children an org_id so RLS / org scoping works there too
--   (4) backfill org_id on every sv_* table to the single live org (Kanun Monitoring)
--   (5) link Munya's monitor seed row to his auth user
-- Safe to re-run.

begin;

-- =========================================================================
-- 1) Loosen NOT NULL on fields the intake / monitor wizards treat as optional
-- =========================================================================
alter table public.sv_parties   alter column phone_primary    drop not null;
alter table public.sv_parties   alter column primary_language drop not null;

alter table public.sv_children  alter column date_of_birth    drop not null;
alter table public.sv_children  alter column primary_language drop not null;

alter table public.sv_monitors  alter column phone            drop not null;
alter table public.sv_monitors  alter column date_of_birth    drop not null;
alter table public.sv_monitors  alter column languages        drop not null;
alter table public.sv_monitors  alter column is_21_or_older   drop not null;
alter table public.sv_monitors  alter column no_dui_5_years   drop not null;
alter table public.sv_monitors  alter column no_probation_10_years drop not null;
alter table public.sv_monitors  alter column no_crime_against_person drop not null;
alter table public.sv_monitors  alter column no_restraining_orders_10_years drop not null;
alter table public.sv_monitors  alter column livescan_completed drop not null;
alter table public.sv_monitors  alter column trustline_registered drop not null;
alter table public.sv_monitors  alter column training_hours_completed drop not null;
alter table public.sv_monitors  alter column kcm_certified     drop not null;
alter table public.sv_monitors  alter column fl324p_signed     drop not null;
alter table public.sv_monitors  alter column status            drop not null;

alter table public.sv_cases     alter column court_order_date  drop not null;
alter table public.sv_cases     alter column custodial_party_id drop not null;
alter table public.sv_cases     alter column noncustodial_party_id drop not null;
alter table public.sv_cases     alter column supervision_type  drop not null;
alter table public.sv_cases     alter column referral_source   drop not null;
alter table public.sv_cases     alter column risk_level        drop not null;
alter table public.sv_cases     alter column reason_for_supervision drop not null;
alter table public.sv_cases     alter column has_protective_order drop not null;
alter table public.sv_cases     alter column has_sexual_abuse_allegations drop not null;
alter table public.sv_cases     alter column history_domestic_violence drop not null;
alter table public.sv_cases     alter column history_substance_abuse drop not null;
alter table public.sv_cases     alter column history_weapons    drop not null;
alter table public.sv_cases     alter column visit_frequency    drop not null;
alter table public.sv_cases     alter column visit_duration_minutes drop not null;
alter table public.sv_cases     alter column staggered_arrival  drop not null;
alter table public.sv_cases     alter column gifts_permitted    drop not null;
alter table public.sv_cases     alter column photography_permitted drop not null;
alter table public.sv_cases     alter column physical_contact_permitted drop not null;
alter table public.sv_cases     alter column service_agreement_signed_custodial drop not null;
alter table public.sv_cases     alter column service_agreement_signed_noncustodial drop not null;
alter table public.sv_cases     alter column rate_per_visit     drop not null;
alter table public.sv_cases     alter column status             drop not null;
alter table public.sv_cases     alter column court_name         drop not null;
alter table public.sv_cases     alter column case_number        drop not null;

-- Sane defaults so the wizard doesn't have to populate every boolean
alter table public.sv_cases     alter column has_protective_order set default false;
alter table public.sv_cases     alter column has_sexual_abuse_allegations set default false;
alter table public.sv_cases     alter column history_domestic_violence set default false;
alter table public.sv_cases     alter column history_substance_abuse set default false;
alter table public.sv_cases     alter column history_weapons set default false;
alter table public.sv_cases     alter column staggered_arrival set default true;
alter table public.sv_cases     alter column gifts_permitted set default true;
alter table public.sv_cases     alter column photography_permitted set default false;
alter table public.sv_cases     alter column physical_contact_permitted set default true;
alter table public.sv_cases     alter column service_agreement_signed_custodial set default false;
alter table public.sv_cases     alter column service_agreement_signed_noncustodial set default false;
alter table public.sv_cases     alter column status set default 'intake';
alter table public.sv_cases     alter column reason_for_supervision set default '{}'::text[];
alter table public.sv_cases     alter column risk_level set default 'medium';
alter table public.sv_cases     alter column rate_per_visit set default 0;
alter table public.sv_cases     alter column visit_duration_minutes set default 120;
alter table public.sv_cases     alter column visit_frequency set default 'as scheduled';

alter table public.sv_monitors  alter column status set default 'pending_verification';
alter table public.sv_monitors  alter column is_21_or_older set default false;
alter table public.sv_monitors  alter column no_dui_5_years set default false;
alter table public.sv_monitors  alter column no_probation_10_years set default false;
alter table public.sv_monitors  alter column no_crime_against_person set default false;
alter table public.sv_monitors  alter column no_restraining_orders_10_years set default false;
alter table public.sv_monitors  alter column livescan_completed set default false;
alter table public.sv_monitors  alter column trustline_registered set default false;
alter table public.sv_monitors  alter column training_hours_completed set default 0;
alter table public.sv_monitors  alter column kcm_certified set default false;
alter table public.sv_monitors  alter column fl324p_signed set default false;
alter table public.sv_monitors  alter column languages set default '{English}'::text[];

alter table public.sv_parties   alter column interpreter_needed set default false;
alter table public.sv_parties   alter column photo_id_verified  set default false;

-- =========================================================================
-- 2) Drop the legacy FKs that point sv_cases.org_id and sv_monitors.org_id
--    at the singular sv_organization table. We'll re-stamp the data first,
--    then put correct FKs in place against sv_organizations (plural).
-- =========================================================================
alter table public.sv_cases    drop constraint if exists sv_cases_org_id_fkey;
alter table public.sv_monitors drop constraint if exists sv_monitors_org_id_fkey;

-- =========================================================================
-- 3) Org-scope the case<->child link table so dashboard/case views can
--    join on it without leaking across orgs.
-- =========================================================================
alter table public.sv_case_children
  add column if not exists org_id uuid references public.sv_organizations(id) on delete cascade;
create index if not exists sv_case_children_org_id_idx on public.sv_case_children(org_id);

-- =========================================================================
-- 4) Backfill org_id on every sv_* table to the single existing live org.
-- =========================================================================
do $$
declare
  v_org uuid;
begin
  select id into v_org from public.sv_organizations order by created_at desc limit 1;
  if v_org is null then
    raise notice 'No org found — skipping backfill';
    return;
  end if;

  update public.sv_cases       set org_id = v_org
    where org_id is null or not exists (select 1 from public.sv_organizations o where o.id = sv_cases.org_id);
  update public.sv_monitors    set org_id = v_org
    where org_id is null or not exists (select 1 from public.sv_organizations o where o.id = sv_monitors.org_id);
  update public.sv_parties     set org_id = v_org where org_id is null;
  update public.sv_children    set org_id = v_org where org_id is null;
  update public.sv_visits      set org_id = v_org where org_id is null;
  update public.sv_documents   set org_id = v_org where org_id is null;
  update public.sv_reports     set org_id = v_org where org_id is null;
  update public.sv_invitations set org_id = v_org where org_id is null;
  update public.sv_audit_log   set org_id = v_org where org_id is null;
  update public.sv_case_children set org_id = v_org where org_id is null;
end$$;

-- =========================================================================
-- 5) Now re-create correct FKs against sv_organizations (plural).
-- =========================================================================
alter table public.sv_cases    add constraint sv_cases_org_id_fkey
       foreign key (org_id) references public.sv_organizations(id) on delete cascade;
alter table public.sv_monitors add constraint sv_monitors_org_id_fkey
       foreign key (org_id) references public.sv_organizations(id) on delete cascade;

-- =========================================================================
-- 6) Wire Munya's seed monitor row to his auth user so the Monitor
--    dashboard can resolve it.
-- =========================================================================
update public.sv_monitors
   set user_id = '5eec97f8-4a15-41ee-8844-7a0cd781cda5'
 where email = 'mkanaventi@gmail.com' and user_id is null;

commit;
