-- KaNun Supervised Visitation Platform — Phase 1
-- Multi-tenant foundation: organizations, user roles, invitations,
-- onboarding progress, org_id on all sv_* tables, and RLS policies.
--
-- Safe to re-run: every CREATE uses IF NOT EXISTS, every ALTER uses IF NOT EXISTS,
-- every policy is dropped before being re-created.
--
-- Run this in the Supabase SQL editor against project ubwmitylgqjlqpcsoezv.

begin;

-- =========================================================================
-- 1. Role enum
-- =========================================================================
do $$
begin
  if not exists (select 1 from pg_type where typname = 'sv_role') then
    create type public.sv_role as enum (
      'platform_admin',
      'agency_owner',
      'agency_manager',
      'monitor',
      'parent',
      'attorney',
      'court_liaison'
    );
  end if;
end$$;

-- =========================================================================
-- 2. Organizations
-- =========================================================================
create table if not exists public.sv_organizations (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  address_street  text,
  address_city    text,
  address_state   text,
  address_zip     text,
  license_number  text,
  service_areas   text[] default '{}',           -- e.g. {"Los Angeles County", "Orange County"}
  services        text[] default '{}',           -- e.g. {"supervised_visitation","monitored_exchange","therapeutic"}
  pricing         jsonb  default '{}'::jsonb,    -- {hourly_rate, minimum_duration, cancellation_fee, sliding_scale}
  court_affiliations text[] default '{}',
  phone           text,
  email           text,
  website         text,
  logo_url        text,
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists sv_organizations_created_by_idx on public.sv_organizations(created_by);

-- =========================================================================
-- 3. User roles (multi-org capable)
-- =========================================================================
create table if not exists public.sv_user_roles (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  org_id      uuid not null references public.sv_organizations(id) on delete cascade,
  role        public.sv_role not null,
  created_at  timestamptz not null default now(),
  unique (user_id, org_id, role)
);

create index if not exists sv_user_roles_user_idx on public.sv_user_roles(user_id);
create index if not exists sv_user_roles_org_idx  on public.sv_user_roles(org_id);

-- =========================================================================
-- 4. Invitations
-- =========================================================================
create table if not exists public.sv_invitations (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.sv_organizations(id) on delete cascade,
  email       text not null,
  role        public.sv_role not null,
  invited_by  uuid references auth.users(id) on delete set null,
  token       uuid not null default gen_random_uuid(),
  expires_at  timestamptz not null default (now() + interval '14 days'),
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

create unique index if not exists sv_invitations_org_email_open_idx
  on public.sv_invitations(org_id, lower(email)) where accepted_at is null;
create index if not exists sv_invitations_email_idx on public.sv_invitations(lower(email));
create index if not exists sv_invitations_token_idx on public.sv_invitations(token);

-- =========================================================================
-- 5. Onboarding progress
-- =========================================================================
create table if not exists public.sv_onboarding_progress (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  org_id          uuid references public.sv_organizations(id) on delete cascade,
  current_step    int  not null default 1,
  completed_steps int[] not null default '{}',
  step_data       jsonb not null default '{}'::jsonb,
  completed       boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (user_id)
);

-- =========================================================================
-- 6. Add org_id to existing sv_* tables.
--    These are the tables introduced by the MVP. We only touch sv_* tables;
--    other dashboard tables are untouched per project policy.
-- =========================================================================
do $$
declare
  t text;
  existing_sv_tables text[] := array[
    'sv_cases','sv_visits','sv_monitors','sv_parties','sv_children',
    'sv_reports','sv_documents','sv_intake_acknowledgements',
    'sv_case_reasons','sv_visit_notes','sv_monitor_qualifications',
    'sv_monitor_clearances','sv_case_attorneys','sv_audit_log','sv_settings'
  ];
begin
  foreach t in array existing_sv_tables loop
    if exists (select 1 from information_schema.tables
               where table_schema = 'public' and table_name = t) then
      execute format(
        'alter table public.%I add column if not exists org_id uuid references public.sv_organizations(id) on delete cascade',
        t);
      execute format(
        'create index if not exists %I on public.%I(org_id)',
        t || '_org_id_idx', t);
    end if;
  end loop;
end$$;

-- =========================================================================
-- 7. Helper: org_ids the current user belongs to.
--    SECURITY DEFINER so it can read sv_user_roles regardless of RLS.
-- =========================================================================
create or replace function public.sv_current_user_org_ids()
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(distinct org_id), array[]::uuid[])
  from public.sv_user_roles
  where user_id = auth.uid();
$$;

create or replace function public.sv_user_has_org_role(p_org uuid, p_roles public.sv_role[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.sv_user_roles
    where user_id = auth.uid()
      and org_id = p_org
      and role = any(p_roles)
  );
$$;

grant execute on function public.sv_current_user_org_ids() to authenticated;
grant execute on function public.sv_user_has_org_role(uuid, public.sv_role[]) to authenticated;

-- =========================================================================
-- 8. Trigger: when an invitation's email matches a new auth user, auto-create
--    the sv_user_roles record. This is what powers the invite flow.
-- =========================================================================
create or replace function public.sv_handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  inv record;
begin
  -- accept any open invitations for this email
  for inv in
    select * from public.sv_invitations
    where lower(email) = lower(new.email)
      and accepted_at is null
      and expires_at > now()
  loop
    insert into public.sv_user_roles (user_id, org_id, role)
    values (new.id, inv.org_id, inv.role)
    on conflict do nothing;

    update public.sv_invitations
       set accepted_at = now(),
           accepted_by = new.id
     where id = inv.id;
  end loop;

  return new;
end;
$$;

drop trigger if exists sv_on_auth_user_created on auth.users;
create trigger sv_on_auth_user_created
  after insert on auth.users
  for each row execute function public.sv_handle_new_auth_user();

-- =========================================================================
-- 9. RLS — enable + policies
-- =========================================================================
alter table public.sv_organizations      enable row level security;
alter table public.sv_user_roles         enable row level security;
alter table public.sv_invitations        enable row level security;
alter table public.sv_onboarding_progress enable row level security;

-- ---- sv_organizations ----
drop policy if exists sv_org_select on public.sv_organizations;
create policy sv_org_select on public.sv_organizations
  for select to authenticated
  using (id = any (public.sv_current_user_org_ids()));

drop policy if exists sv_org_insert on public.sv_organizations;
create policy sv_org_insert on public.sv_organizations
  for insert to authenticated
  with check (created_by = auth.uid());

drop policy if exists sv_org_update on public.sv_organizations;
create policy sv_org_update on public.sv_organizations
  for update to authenticated
  using (public.sv_user_has_org_role(id, array['agency_owner','agency_manager','platform_admin']::public.sv_role[]))
  with check (public.sv_user_has_org_role(id, array['agency_owner','agency_manager','platform_admin']::public.sv_role[]));

-- ---- sv_user_roles ----
drop policy if exists sv_user_roles_select on public.sv_user_roles;
create policy sv_user_roles_select on public.sv_user_roles
  for select to authenticated
  using (
    user_id = auth.uid()
    or org_id = any (public.sv_current_user_org_ids())
  );

drop policy if exists sv_user_roles_insert_self on public.sv_user_roles;
create policy sv_user_roles_insert_self on public.sv_user_roles
  for insert to authenticated
  with check (
    -- a user can claim ownership of an org they just created (created_by = self),
    -- or an admin of an org can add roles to that org
    (user_id = auth.uid() and exists (
       select 1 from public.sv_organizations o
        where o.id = org_id and o.created_by = auth.uid()
    ))
    or public.sv_user_has_org_role(org_id, array['agency_owner','platform_admin']::public.sv_role[])
  );

drop policy if exists sv_user_roles_delete on public.sv_user_roles;
create policy sv_user_roles_delete on public.sv_user_roles
  for delete to authenticated
  using (public.sv_user_has_org_role(org_id, array['agency_owner','platform_admin']::public.sv_role[]));

-- ---- sv_invitations ----
drop policy if exists sv_inv_select on public.sv_invitations;
create policy sv_inv_select on public.sv_invitations
  for select to authenticated
  using (
    org_id = any (public.sv_current_user_org_ids())
    or lower(email) = lower(coalesce((auth.jwt() ->> 'email'), ''))
  );

drop policy if exists sv_inv_insert on public.sv_invitations;
create policy sv_inv_insert on public.sv_invitations
  for insert to authenticated
  with check (
    public.sv_user_has_org_role(org_id, array['agency_owner','agency_manager','platform_admin']::public.sv_role[])
  );

drop policy if exists sv_inv_delete on public.sv_invitations;
create policy sv_inv_delete on public.sv_invitations
  for delete to authenticated
  using (
    public.sv_user_has_org_role(org_id, array['agency_owner','agency_manager','platform_admin']::public.sv_role[])
  );

-- ---- sv_onboarding_progress ----
drop policy if exists sv_onb_select on public.sv_onboarding_progress;
create policy sv_onb_select on public.sv_onboarding_progress
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists sv_onb_upsert on public.sv_onboarding_progress;
create policy sv_onb_upsert on public.sv_onboarding_progress
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists sv_onb_update on public.sv_onboarding_progress;
create policy sv_onb_update on public.sv_onboarding_progress
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- =========================================================================
-- 10. Replace the MVP's permissive RLS on existing sv_* tables with
--     org-scoped policies. We DROP every old policy on those tables, then
--     enable RLS and add org-scoped read/write policies.
-- =========================================================================
do $$
declare
  t text;
  pol record;
  org_scoped_tables text[] := array[
    'sv_cases','sv_visits','sv_monitors','sv_parties','sv_children',
    'sv_reports','sv_documents','sv_intake_acknowledgements',
    'sv_case_reasons','sv_visit_notes','sv_monitor_qualifications',
    'sv_monitor_clearances','sv_case_attorneys','sv_audit_log','sv_settings'
  ];
begin
  foreach t in array org_scoped_tables loop
    if not exists (select 1 from information_schema.tables
                   where table_schema='public' and table_name=t) then
      continue;
    end if;

    -- drop every existing policy on this table
    for pol in
      select policyname from pg_policies
      where schemaname='public' and tablename=t
    loop
      execute format('drop policy if exists %I on public.%I', pol.policyname, t);
    end loop;

    execute format('alter table public.%I enable row level security', t);

    -- select policy
    execute format($f$
      create policy %I on public.%I
        for select to authenticated
        using (org_id = any (public.sv_current_user_org_ids()))
    $f$, t || '_select', t);

    -- insert policy (org members can insert into their org)
    execute format($f$
      create policy %I on public.%I
        for insert to authenticated
        with check (org_id = any (public.sv_current_user_org_ids()))
    $f$, t || '_insert', t);

    -- update policy
    execute format($f$
      create policy %I on public.%I
        for update to authenticated
        using (org_id = any (public.sv_current_user_org_ids()))
        with check (org_id = any (public.sv_current_user_org_ids()))
    $f$, t || '_update', t);

    -- delete policy: only owners/managers
    execute format($f$
      create policy %I on public.%I
        for delete to authenticated
        using (public.sv_user_has_org_role(org_id, array['agency_owner','agency_manager','platform_admin']::public.sv_role[]))
    $f$, t || '_delete', t);
  end loop;
end$$;

-- =========================================================================
-- 11. Optional: link sv_monitors to auth.users so a monitor's account can
--     find their monitor record. (Add column if not present.)
-- =========================================================================
do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema='public' and table_name='sv_monitors') then
    execute 'alter table public.sv_monitors add column if not exists user_id uuid references auth.users(id) on delete set null';
    execute 'create index if not exists sv_monitors_user_id_idx on public.sv_monitors(user_id)';
  end if;
end$$;

commit;
