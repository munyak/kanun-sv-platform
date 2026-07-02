-- =========================================================================
-- 0017 — Post-signup engagement analytics for Platform Admin
-- Answers "what do users do after they sign up?" — a signup→activation funnel,
-- a per-user activity table (metadata only), and daily time-series of signups
-- and key actions. Derived from auth.users + sv_user_roles + sv_usage_events
-- + the operational tables. NO report/case content is ever surfaced — only
-- counts, roles, statuses and timestamps.
--
-- Attribution notes:
--   * signup / confirm / last-login come from auth.users.
--   * per-user ACTIONS come from sv_usage_events (accurate per-user log,
--     populated since 2026-06-29). Reports/visits also fall back to the
--     authoritative tables (sv_reports.created_by, sv_visits.monitor_id) so
--     pre-instrumentation activity still counts.
--   * funnel step "created a case" is true if the user logged a case_created
--     event, owns an org that has cases, or is the primary monitor on a case.
-- Applied to project yxhwcicxarfmptwivkdu.
-- =========================================================================

drop function if exists public.platform_admin_engagement(integer);

create or replace function public.platform_admin_engagement(p_days integer default 30)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
  v_start date := current_date - p_days;
begin
  -- Only platform_admin can call this
  if not exists (
    select 1 from public.sv_user_roles
    where user_id = auth.uid() and role = 'platform_admin'
  ) then
    raise exception 'Forbidden';
  end if;

  with
  ev as (
    select user_id,
      count(*) as n_events,
      count(*) filter (where event = 'case_created')      as ev_cases,
      count(*) filter (where event = 'visit_scheduled')   as ev_visits,
      count(*) filter (where event = 'report_submitted')  as ev_reports,
      count(*) filter (where event = 'visit_checkin')      as ev_checkins,
      count(*) filter (where event = 'monitor_added')      as ev_monitors,
      count(*) filter (where event in ('quiz_started','quiz_completed')) as ev_academy,
      count(*) filter (where event = 'login')              as ev_logins,
      max(created_at) as last_event_at
    from public.sv_usage_events
    where user_id is not null
    group by user_id
  ),
  owner_orgs as (
    select user_id, array_agg(distinct org_id) as org_ids
    from public.sv_user_roles
    where role in ('agency_owner','agency_manager')
    group by user_id
  ),
  user_monitors as (
    select coalesce(user_id, auth_user_id) as uid, array_agg(id) as monitor_ids
    from public.sv_monitors
    where coalesce(user_id, auth_user_id) is not null
    group by coalesce(user_id, auth_user_id)
  ),
  per_user as (
    select
      u.id as user_id,
      u.email,
      coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name') as full_name,
      u.created_at        as signup_at,
      u.email_confirmed_at as confirmed_at,
      u.last_sign_in_at,
      (select array_agg(distinct r.role) from public.sv_user_roles r where r.user_id = u.id) as roles,
      (select string_agg(distinct o.name, ', ')
         from public.sv_user_roles r
         join public.sv_organizations o on o.id = r.org_id
        where r.user_id = u.id) as org_names,
      coalesce(ev.n_events, 0) as n_events,
      ev.last_event_at,
      coalesce(ev.ev_cases, 0) as n_cases,
      greatest(
        coalesce(ev.ev_visits, 0),
        coalesce((select count(*) from public.sv_visits v where v.monitor_id = any(coalesce(um.monitor_ids, '{}'::uuid[]))), 0)
      ) as n_visits,
      greatest(
        coalesce(ev.ev_reports, 0),
        coalesce((select count(*) from public.sv_reports rp where rp.created_by = u.id), 0)
      ) as n_reports,
      coalesce(ev.ev_checkins, 0) as n_checkins,
      coalesce(ev.ev_academy, 0)  as n_academy,
      coalesce(ev.ev_logins, 0)   as n_logins,
      -- funnel flags (hybrid: event log OR authoritative tables)
      (u.email_confirmed_at is not null) as f_confirmed,
      (u.last_sign_in_at is not null or coalesce(ev.n_events, 0) > 0) as f_activated,
      (
        coalesce(ev.ev_cases, 0) > 0
        or exists(select 1 from public.sv_cases c where c.org_id = any(coalesce(oo.org_ids, '{}'::uuid[])))
        or exists(select 1 from public.sv_cases c where c.primary_monitor_id = any(coalesce(um.monitor_ids, '{}'::uuid[])))
      ) as f_case,
      (
        coalesce(ev.ev_visits, 0) > 0
        or exists(select 1 from public.sv_visits v where v.monitor_id = any(coalesce(um.monitor_ids, '{}'::uuid[])))
      ) as f_visit,
      (
        coalesce(ev.ev_reports, 0) > 0
        or exists(select 1 from public.sv_reports rp where rp.created_by = u.id)
      ) as f_report
    from auth.users u
    left join ev            on ev.user_id = u.id
    left join owner_orgs oo on oo.user_id = u.id
    left join user_monitors um on um.uid = u.id
  )
  select jsonb_build_object(
    'period_days', p_days,
    'generated_at', now(),

    -- ── Signup → activation funnel (all-time cohort) ──
    'funnel', jsonb_build_object(
      'signed_up',        (select count(*) from per_user),
      'confirmed',        (select count(*) from per_user where f_confirmed),
      'activated',        (select count(*) from per_user where f_activated),
      'created_case',     (select count(*) from per_user where f_case),
      'scheduled_visit',  (select count(*) from per_user where f_visit),
      'submitted_report', (select count(*) from per_user where f_report)
    ),

    -- ── Headline totals ──
    'totals', jsonb_build_object(
      'total_users',      (select count(*) from per_user),
      'new_signups_period', (select count(*) from per_user where signup_at >= v_start),
      'new_7d',           (select count(*) from per_user where signup_at >= now() - interval '7 days'),
      'new_30d',          (select count(*) from per_user where signup_at >= now() - interval '30 days'),
      'active_7d',        (select count(*) from per_user where greatest(last_sign_in_at, last_event_at) >= now() - interval '7 days'),
      'active_30d',       (select count(*) from per_user where greatest(last_sign_in_at, last_event_at) >= now() - interval '30 days'),
      'never_logged_in',  (select count(*) from per_user where last_sign_in_at is null)
    ),

    -- ── Per-user activity table (metadata only) ──
    'per_user', (
      select coalesce(jsonb_agg(row_to_json(p)::jsonb order by p.signup_at desc), '[]'::jsonb)
      from (
        select user_id, email, full_name, signup_at, confirmed_at, last_sign_in_at,
               roles, org_names, n_events, last_event_at,
               n_cases, n_visits, n_reports, n_checkins, n_academy, n_logins,
               greatest(last_sign_in_at, last_event_at) as last_active,
               f_confirmed, f_activated, f_case, f_visit, f_report
        from per_user
      ) p
    ),

    -- ── Daily time-series over the selected window ──
    'daily', (
      select coalesce(jsonb_agg(row_to_json(d)::jsonb order by d.day), '[]'::jsonb)
      from (
        select g::date as day,
          (select count(*) from auth.users u where u.created_at::date = g::date) as signups,
          (select count(distinct e.user_id) from public.sv_usage_events e where e.created_at::date = g::date) as active_users,
          (select count(*) from public.sv_usage_events e where e.created_at::date = g::date and e.event = 'login') as logins,
          (select count(*) from public.sv_usage_events e where e.created_at::date = g::date and e.event = 'case_created') as cases,
          (select count(*) from public.sv_usage_events e where e.created_at::date = g::date and e.event = 'visit_scheduled') as visits,
          (select count(*) from public.sv_usage_events e where e.created_at::date = g::date and e.event = 'report_submitted') as reports
        from generate_series(v_start::timestamp, current_date::timestamp, interval '1 day') g
      ) d
    )
  ) into result;

  return result;
end;
$$;

grant execute on function public.platform_admin_engagement(integer) to authenticated;
