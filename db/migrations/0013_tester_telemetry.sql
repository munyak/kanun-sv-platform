-- 0013 — Tester telemetry: in-platform usage events + feedback.
-- Captures what testers do (page views / key actions) and their in-app feedback
-- so platform admins can see engagement and stats. RLS: a user may insert only
-- their own rows; platform admins read everything, org owners read their org.
-- Applied to project yxhwcicxarfmptwivkdu 2026-06-29.

create table if not exists public.sv_usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  org_id uuid,
  event text not null,
  path text,
  props jsonb,
  created_at timestamptz not null default now()
);
create index if not exists sv_usage_events_created_idx on public.sv_usage_events(created_at desc);
create index if not exists sv_usage_events_user_idx on public.sv_usage_events(user_id);
alter table public.sv_usage_events enable row level security;
drop policy if exists sv_usage_events_insert on public.sv_usage_events;
create policy sv_usage_events_insert on public.sv_usage_events
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists sv_usage_events_select on public.sv_usage_events;
create policy sv_usage_events_select on public.sv_usage_events
  for select to authenticated using (
    exists (select 1 from public.sv_user_roles where user_id = auth.uid() and role = 'platform_admin')
    or org_id = any (public.sv_current_user_org_ids())
  );

create table if not exists public.sv_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  org_id uuid,
  prompt text,
  rating int,
  comment text,
  context jsonb,
  created_at timestamptz not null default now()
);
create index if not exists sv_feedback_created_idx on public.sv_feedback(created_at desc);
alter table public.sv_feedback enable row level security;
drop policy if exists sv_feedback_insert on public.sv_feedback;
create policy sv_feedback_insert on public.sv_feedback
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists sv_feedback_select on public.sv_feedback;
create policy sv_feedback_select on public.sv_feedback
  for select to authenticated using (
    exists (select 1 from public.sv_user_roles where user_id = auth.uid() and role = 'platform_admin')
    or org_id = any (public.sv_current_user_org_ids())
  );
