-- =========================================================================
-- 0004 — Monitor experience
-- Attaches the auth.users → sv_user_roles trigger, links sv_monitors.user_id
-- when a monitor signup is accepted, and adds weekly availability slots.
-- =========================================================================

-- 1) Replace the new-user handler so it also links any monitor record
--    (sv_monitors row matched by email + org) to the new auth user.
create or replace function public.sv_handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
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

    -- If the invitation was for a monitor and a monitor record already
    -- exists in this org for the same email, link it to this auth user.
    if inv.role = 'monitor' then
      update public.sv_monitors
         set user_id = new.id,
             updated_at = now()
       where org_id = inv.org_id
         and lower(email) = lower(new.email)
         and (user_id is null or user_id = new.id);
    end if;

    update public.sv_invitations
       set accepted_at = now(),
           accepted_by = new.id
     where id = inv.id;
  end loop;

  return new;
end;
$$;

-- 2) Attach the trigger to auth.users (idempotent)
drop trigger if exists sv_on_auth_user_created on auth.users;
create trigger sv_on_auth_user_created
  after insert on auth.users
  for each row execute function public.sv_handle_new_auth_user();

-- 3) Monitor availability — weekly recurring slots
create table if not exists public.sv_monitor_availability (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.sv_organizations(id) on delete cascade,
  monitor_id      uuid not null references public.sv_monitors(id) on delete cascade,
  day_of_week     smallint not null check (day_of_week between 0 and 6),  -- 0 = Sunday
  start_time      time not null,
  end_time        time not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (end_time > start_time)
);
create index if not exists sv_monitor_availability_monitor_idx on public.sv_monitor_availability(monitor_id);
create index if not exists sv_monitor_availability_org_idx     on public.sv_monitor_availability(org_id);
alter table public.sv_monitor_availability disable row level security;

-- 4) Optional: alert seen / dismissed marker on monitors so we can show
--    schedule-change notifications until acknowledged.
alter table public.sv_monitors add column if not exists last_seen_at timestamptz;
