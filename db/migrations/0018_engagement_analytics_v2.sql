-- =========================================================================
-- 0018 — Engagement analytics v2 for Platform Admin
--
-- A materially richer, product-analytics-grade view of what users do after
-- they sign up. Inspired by the patterns used in Amplitude, Mixpanel, PostHog,
-- Pendo, June.so, Heap, Stripe, Vercel and Linear dashboards:
--   * North-star KPI header with period-over-period deltas + daily sparklines
--   * Weekly signup retention cohort grid (the classic heatmap) + N-day curve
--   * DAU / WAU / MAU and the DAU/MAU stickiness ratio over time
--   * Activation rate + median time-to-value for each key first action
--   * Activation funnel with conversion % AND median time-to-convert per step
--   * Feature adoption (% of users using each feature) + page-area adoption
--   * Segmentation: exclude internal/staff accounts, filter by role and org
--   * Per-user activity timeline (metadata-only event stream)
--
-- PRIVACY: metadata only. NEVER surfaces client names, case details, visit
-- notes or report content — only counts, statuses, timestamps, roles, org
-- names, and event types.
--
-- Because per-user login history was only instrumented recently, "activity"
-- is derived from a UNION of every user-attributable timestamped signal:
-- usage events, auth signup/last-sign-in, authored reports, org creation, and
-- org-level case/visit creation (attributed to the agency owner/manager, the
-- only user linkage available — monitor rows are not yet tied to auth users).
--
-- All functions are SECURITY DEFINER and gated to platform_admin.
-- Applied to project yxhwcicxarfmptwivkdu.
-- =========================================================================

-- Internal/staff detection helper: platform_admin role OR an internal email
-- domain. Used to let staff exclude themselves from customer-facing metrics.
create or replace function public.sv_is_internal_email(p_email text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select coalesce(p_email ~* '@(kanun\.digital|kanunwellness\.com|kanunmonitoring\.com|kanunmonitor\.com|kanun\.com)$', false);
$$;

drop function if exists public.platform_admin_engagement_v2(integer, boolean, text, uuid);

create or replace function public.platform_admin_engagement_v2(
  p_days integer default 30,
  p_exclude_internal boolean default true,
  p_role text default null,
  p_org uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
  v_days integer := greatest(coalesce(p_days, 30), 1);
  v_now  timestamptz := now();
  v_today date := current_date;
  v_start date := current_date - v_days + 1;         -- inclusive current window start
  v_prev_start date := current_date - (2 * v_days) + 1;
  v_max_weeks integer := 8;                            -- retention grid width
begin
  if not exists (
    select 1 from public.sv_user_roles
    where user_id = auth.uid() and role = 'platform_admin'
  ) then
    raise exception 'Forbidden';
  end if;

  with
  -- ── User universe with derived attributes ──────────────────────────────
  base as (
    select
      u.id as user_id,
      u.email,
      coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name') as full_name,
      u.created_at        as signup_at,
      u.email_confirmed_at as confirmed_at,
      u.last_sign_in_at,
      (select array_agg(distinct r.role::text) from public.sv_user_roles r where r.user_id = u.id) as roles,
      -- highest-privilege role for segmentation
      (select r.role::text from public.sv_user_roles r where r.user_id = u.id
        order by array_position(array['platform_admin','agency_owner','agency_manager','monitor','parent','attorney','court_liaison']::text[], r.role::text)
        limit 1) as primary_role,
      (select array_agg(distinct r.org_id) from public.sv_user_roles r where r.user_id = u.id and r.org_id is not null) as org_ids,
      (select array_agg(distinct r.org_id) from public.sv_user_roles r where r.user_id = u.id and r.role in ('agency_owner','agency_manager')) as owned_org_ids,
      (select string_agg(distinct o.name, ', ') from public.sv_user_roles r join public.sv_organizations o on o.id = r.org_id where r.user_id = u.id) as org_names,
      (
        exists (select 1 from public.sv_user_roles r where r.user_id = u.id and r.role = 'platform_admin')
        or public.sv_is_internal_email(u.email)
      ) as is_internal
    from auth.users u
  ),
  -- First-timestamp of each key action per user (hybrid: event log OR tables).
  -- least() ignores NULLs, returning the earliest available signal.
  first_ts as (
    select b.user_id,
      b.signup_at   as t_signup,
      b.confirmed_at as t_confirmed,
      least(
        (select min(e.created_at) from public.sv_usage_events e where e.user_id = b.user_id),
        b.last_sign_in_at
      ) as t_activated,
      least(
        (select min(e.created_at) from public.sv_usage_events e where e.user_id = b.user_id and e.event = 'case_created'),
        (select min(c.created_at) from public.sv_cases c where c.org_id = any(coalesce(b.owned_org_ids, '{}'::uuid[])))
      ) as t_case,
      least(
        (select min(e.created_at) from public.sv_usage_events e where e.user_id = b.user_id and e.event = 'visit_scheduled'),
        (select min(v.created_at) from public.sv_visits v where v.org_id = any(coalesce(b.owned_org_ids, '{}'::uuid[])))
      ) as t_visit,
      least(
        (select min(e.created_at) from public.sv_usage_events e where e.user_id = b.user_id and e.event = 'report_submitted'),
        (select min(coalesce(rp.submitted_at, rp.created_at)) from public.sv_reports rp where rp.created_by = b.user_id)
      ) as t_report
    from base b
  ),
  -- Per-user event counts (metadata) for the activity table.
  ev as (
    select user_id,
      count(*) as n_events,
      count(*) filter (where event = 'case_created')      as ev_cases,
      count(*) filter (where event = 'visit_scheduled')   as ev_visits,
      count(*) filter (where event = 'report_submitted')  as ev_reports,
      count(*) filter (where event = 'visit_checkin')     as ev_checkins,
      count(*) filter (where event = 'monitor_added')     as ev_monitors,
      count(*) filter (where event in ('quiz_started','quiz_completed')) as ev_academy,
      count(*) filter (where event = 'login')             as ev_logins,
      count(*) filter (where event = 'feedback_submitted') as ev_feedback,
      count(*) filter (where event = 'page_view')         as ev_pageviews,
      max(created_at) as last_event_at
    from public.sv_usage_events
    where user_id is not null
    group by user_id
  ),
  -- ── Activity spine: distinct (user_id, day) a user was active ──────────
  -- Union of every user-attributable timestamped signal.
  activity_raw as (
    select user_id, created_at::date as day from public.sv_usage_events where user_id is not null
    union
    select b.user_id, b.signup_at::date from base b
    union
    select b.user_id, b.last_sign_in_at::date from base b where b.last_sign_in_at is not null
    union
    select rp.created_by, coalesce(rp.submitted_at, rp.created_at)::date from public.sv_reports rp where rp.created_by is not null
    union
    select o.created_by, o.created_at::date from public.sv_organizations o where o.created_by is not null
    union
    select r.user_id, c.created_at::date
      from public.sv_cases c
      join public.sv_user_roles r on r.org_id = c.org_id and r.role in ('agency_owner','agency_manager')
    union
    select r.user_id, v.created_at::date
      from public.sv_visits v
      join public.sv_user_roles r on r.org_id = v.org_id and r.role in ('agency_owner','agency_manager')
  ),
  -- ── Filtered universe (respects exclude_internal / role / org) ─────────
  fu as (
    select b.*, f.t_signup, f.t_confirmed, f.t_activated, f.t_case, f.t_visit, f.t_report
    from base b
    join first_ts f on f.user_id = b.user_id
    where (not p_exclude_internal or not b.is_internal)
      and (p_role is null or p_role = any(coalesce(b.roles, '{}'::text[])))
      and (p_org is null or p_org = any(coalesce(b.org_ids, '{}'::uuid[])))
  ),
  activity as (
    select a.user_id, a.day from activity_raw a where a.user_id in (select user_id from fu)
  )

  select jsonb_build_object(
    'meta', jsonb_build_object(
      'period_days', v_days,
      'generated_at', v_now,
      'filters', jsonb_build_object('exclude_internal', p_exclude_internal, 'role', p_role, 'org', p_org),
      'universe_size', (select count(*) from fu),
      'total_users', (select count(*) from base),
      'internal_count', (select count(*) from base where is_internal),
      'max_weeks', v_max_weeks
    ),

    -- ── Segments for filter dropdowns ──
    'segments', jsonb_build_object(
      'roles', (
        select coalesce(jsonb_agg(row_to_json(r)::jsonb order by r.n desc), '[]'::jsonb)
        from (select unnest(roles) as role, count(*) n from base group by 1) r
      ),
      'orgs', (
        select coalesce(jsonb_agg(row_to_json(o)::jsonb order by o.name), '[]'::jsonb)
        from (
          select o.id as org_id, o.name,
            (select count(distinct r.user_id) from public.sv_user_roles r where r.org_id = o.id) as members
          from public.sv_organizations o
        ) o
      )
    ),

    -- ── North-star KPI header (period-over-period + sparklines) ──
    'kpis', jsonb_build_object(
      'total_users', jsonb_build_object(
        'value', (select count(*) from fu),
        'delta', (select count(*) from fu where t_signup::date >= v_start)
      ),
      'new_signups', jsonb_build_object(
        'value', (select count(*) from fu where t_signup::date >= v_start),
        'prev',  (select count(*) from fu where t_signup::date >= v_prev_start and t_signup::date < v_start),
        'spark', (
          select coalesce(jsonb_agg(cnt order by g), '[]'::jsonb)
          from generate_series(v_start, v_today, interval '1 day') g
          cross join lateral (select count(*) cnt from fu where t_signup::date = g::date) s
        )
      ),
      'active_users', jsonb_build_object(
        'value', (select count(distinct user_id) from activity where day >= v_start),
        'prev',  (select count(distinct user_id) from activity where day >= v_prev_start and day < v_start),
        'spark', (
          select coalesce(jsonb_agg(cnt order by g), '[]'::jsonb)
          from generate_series(v_start, v_today, interval '1 day') g
          cross join lateral (select count(distinct user_id) cnt from activity where day = g::date) s
        )
      ),
      'activation_rate', jsonb_build_object(
        'value', (select case when count(*) > 0 then round(100.0 * count(*) filter (where t_activated is not null) / count(*)) else 0 end from fu),
        'activated', (select count(*) filter (where t_activated is not null) from fu),
        'total', (select count(*) from fu)
      ),
      'stickiness', jsonb_build_object(
        -- DAU/MAU today (as %), plus a spark of the daily ratio across the window
        'value', (
          select case when mau > 0 then round(100.0 * dau / mau) else 0 end
          from (
            select
              (select count(distinct user_id) from activity where day = v_today) dau,
              (select count(distinct user_id) from activity where day > v_today - 30) mau
          ) x
        ),
        'spark', (
          select coalesce(jsonb_agg(ratio order by g), '[]'::jsonb)
          from generate_series(v_start, v_today, interval '1 day') g
          cross join lateral (
            select case when m > 0 then round(100.0 * d / m) else 0 end ratio
            from (
              select (select count(distinct user_id) from activity where day = g::date) d,
                     (select count(distinct user_id) from activity where day > g::date - 30 and day <= g::date) m
            ) y
          ) s
        )
      )
    ),

    -- ── Activation funnel: conversion % + median time-to-convert per step ──
    'funnel', jsonb_build_object(
      'signed_up',        (select count(*) from fu),
      'confirmed',        (select count(*) from fu where t_confirmed is not null),
      'activated',        (select count(*) from fu where t_activated is not null),
      'created_case',     (select count(*) from fu where t_case is not null),
      'scheduled_visit',  (select count(*) from fu where t_visit is not null),
      'submitted_report', (select count(*) from fu where t_report is not null),
      -- median days between consecutive steps (only over users who reached the later step)
      'median_days', jsonb_build_object(
        'to_confirmed', (select round((percentile_cont(0.5) within group (order by extract(epoch from (t_confirmed - t_signup))/86400.0))::numeric, 1) from fu where t_confirmed is not null and t_confirmed >= t_signup),
        'to_activated', (select round((percentile_cont(0.5) within group (order by extract(epoch from (t_activated - coalesce(t_confirmed, t_signup)))/86400.0))::numeric, 1) from fu where t_activated is not null and t_activated >= coalesce(t_confirmed, t_signup)),
        'to_case',      (select round((percentile_cont(0.5) within group (order by extract(epoch from (t_case - t_activated))/86400.0))::numeric, 1) from fu where t_case is not null and t_activated is not null and t_case >= t_activated),
        'to_visit',     (select round((percentile_cont(0.5) within group (order by extract(epoch from (t_visit - t_case))/86400.0))::numeric, 1) from fu where t_visit is not null and t_case is not null and t_visit >= t_case),
        'to_report',    (select round((percentile_cont(0.5) within group (order by extract(epoch from (t_report - t_visit))/86400.0))::numeric, 1) from fu where t_report is not null and t_visit is not null and t_report >= t_visit)
      )
    ),

    -- ── Activation & time-to-value (median days from signup) ──
    'activation', jsonb_build_object(
      'ttv', jsonb_build_object(
        'login',  jsonb_build_object('median_days', (select round((percentile_cont(0.5) within group (order by extract(epoch from (t_activated - t_signup))/86400.0))::numeric,1) from fu where t_activated is not null and t_activated >= t_signup), 'n', (select count(*) from fu where t_activated is not null)),
        'case',   jsonb_build_object('median_days', (select round((percentile_cont(0.5) within group (order by extract(epoch from (t_case - t_signup))/86400.0))::numeric,1) from fu where t_case is not null and t_case >= t_signup), 'n', (select count(*) from fu where t_case is not null)),
        'visit',  jsonb_build_object('median_days', (select round((percentile_cont(0.5) within group (order by extract(epoch from (t_visit - t_signup))/86400.0))::numeric,1) from fu where t_visit is not null and t_visit >= t_signup), 'n', (select count(*) from fu where t_visit is not null)),
        'report', jsonb_build_object('median_days', (select round((percentile_cont(0.5) within group (order by extract(epoch from (t_report - t_signup))/86400.0))::numeric,1) from fu where t_report is not null and t_report >= t_signup), 'n', (select count(*) from fu where t_report is not null))
      ),
      -- activation rate by weekly signup cohort (trend)
      'by_cohort', (
        select coalesce(jsonb_agg(row_to_json(c)::jsonb order by c.cohort_week), '[]'::jsonb)
        from (
          select date_trunc('week', t_signup)::date as cohort_week,
            count(*) as size,
            count(*) filter (where t_activated is not null) as activated,
            case when count(*) > 0 then round(100.0 * count(*) filter (where t_activated is not null) / count(*)) else 0 end as pct
          from fu
          group by 1
        ) c
      )
    ),

    -- ── Retention: weekly cohort grid (% of cohort active N weeks later) ──
    'retention', jsonb_build_object(
      'cohorts', (
        select coalesce(jsonb_agg(row_to_json(cc)::jsonb order by cc.cohort_week), '[]'::jsonb)
        from (
          select
            cohort_week,
            size,
            (
              select coalesce(jsonb_agg(row_to_json(cell)::jsonb order by cell.wk), '[]'::jsonb)
              from (
                select w.wk,
                  count(distinct a.user_id) as active,
                  case when co.size > 0 then round(100.0 * count(distinct a.user_id) / co.size) else 0 end as pct
                from generate_series(0, v_max_weeks) w(wk)
                left join activity a
                  on a.user_id in (select user_id from fu f2 where date_trunc('week', f2.t_signup)::date = co.cohort_week)
                 and floor((a.day - co.cohort_week) / 7.0) = w.wk
                 and a.day >= co.cohort_week
                where w.wk <= floor((v_today - co.cohort_week)/7.0)   -- only weeks that have elapsed
                group by w.wk
              ) cell
            ) as cells
          from (
            select date_trunc('week', t_signup)::date as cohort_week, count(*) as size
            from fu group by 1
          ) co
          order by cohort_week
        ) cc
      ),
      -- N-day rolling retention curve: % of tenured users active on/after day N
      'curve', (
        select coalesce(jsonb_agg(row_to_json(p)::jsonb order by p.day), '[]'::jsonb)
        from (
          select d as day,
            (select count(*) from fu where (v_today - t_signup::date) >= d) as eligible,
            (select count(*) from fu f
               where (v_today - f.t_signup::date) >= d
                 and exists (select 1 from activity a where a.user_id = f.user_id and (a.day - f.t_signup::date) >= d)
            ) as retained,
            case when (select count(*) from fu where (v_today - t_signup::date) >= d) > 0
              then round(100.0 * (select count(*) from fu f where (v_today - f.t_signup::date) >= d and exists (select 1 from activity a where a.user_id = f.user_id and (a.day - f.t_signup::date) >= d))
                         / (select count(*) from fu where (v_today - t_signup::date) >= d))
              else null end as pct
          from unnest(array[1,3,7,14,30]) d
        ) p
      )
    ),

    -- ── Stickiness time series: DAU / WAU / MAU / ratio over the window ──
    'stickiness_series', (
      select coalesce(jsonb_agg(row_to_json(s)::jsonb order by s.day), '[]'::jsonb)
      from (
        select g::date as day,
          (select count(distinct user_id) from activity where day = g::date) as dau,
          (select count(distinct user_id) from activity where day > g::date - 7 and day <= g::date) as wau,
          (select count(distinct user_id) from activity where day > g::date - 30 and day <= g::date) as mau,
          case when (select count(distinct user_id) from activity where day > g::date - 30 and day <= g::date) > 0
            then round(100.0 * (select count(distinct user_id) from activity where day = g::date)
                       / (select count(distinct user_id) from activity where day > g::date - 30 and day <= g::date))
            else 0 end as stickiness
        from generate_series(v_start, v_today, interval '1 day') g
      ) s
    ),

    -- ── Feature adoption: % of users using each feature (all-time) + trend ──
    'feature_adoption', (
      select coalesce(jsonb_agg(row_to_json(fa)::jsonb order by fa.users desc), '[]'::jsonb)
      from (
        select * from (values
          ('Logged in',        (select count(*) from fu where t_activated is not null),
                               (select count(distinct user_id) from activity a where a.day >= v_start and a.user_id in (select user_id from fu))),
          ('Created a case',   (select count(*) from fu where t_case is not null),
                               (select count(distinct e.user_id) from public.sv_usage_events e where e.event='case_created' and e.created_at::date >= v_start and e.user_id in (select user_id from fu))),
          ('Scheduled a visit',(select count(*) from fu where t_visit is not null),
                               (select count(distinct e.user_id) from public.sv_usage_events e where e.event='visit_scheduled' and e.created_at::date >= v_start and e.user_id in (select user_id from fu))),
          ('Checked in (GPS)', (select count(distinct e.user_id) from public.sv_usage_events e where e.event='visit_checkin' and e.user_id in (select user_id from fu)),
                               (select count(distinct e.user_id) from public.sv_usage_events e where e.event='visit_checkin' and e.created_at::date >= v_start and e.user_id in (select user_id from fu))),
          ('Submitted a report',(select count(*) from fu where t_report is not null),
                               (select count(distinct e.user_id) from public.sv_usage_events e where e.event='report_submitted' and e.created_at::date >= v_start and e.user_id in (select user_id from fu))),
          ('Added a monitor',  (select count(distinct e.user_id) from public.sv_usage_events e where e.event='monitor_added' and e.user_id in (select user_id from fu)),
                               (select count(distinct e.user_id) from public.sv_usage_events e where e.event='monitor_added' and e.created_at::date >= v_start and e.user_id in (select user_id from fu))),
          ('Academy / training',(select count(distinct e.user_id) from public.sv_usage_events e where e.event in ('quiz_started','quiz_completed') and e.user_id in (select user_id from fu)),
                               (select count(distinct e.user_id) from public.sv_usage_events e where e.event in ('quiz_started','quiz_completed') and e.created_at::date >= v_start and e.user_id in (select user_id from fu))),
          ('Gave feedback',    (select count(distinct e.user_id) from public.sv_usage_events e where e.event='feedback_submitted' and e.user_id in (select user_id from fu)),
                               (select count(distinct e.user_id) from public.sv_usage_events e where e.event='feedback_submitted' and e.created_at::date >= v_start and e.user_id in (select user_id from fu)))
        ) as t(feature, users, users_period)
      ) fa
    ),

    -- ── Page-area adoption (top-level path segment; metadata only) ──
    'page_areas', (
      select coalesce(jsonb_agg(row_to_json(pa)::jsonb order by pa.views desc), '[]'::jsonb)
      from (
        select
          coalesce(nullif(split_part(ltrim(path,'/'),'/',1), ''), '(home)') as area,
          count(*) as views,
          count(distinct user_id) as users
        from public.sv_usage_events
        where event = 'page_view' and path is not null and user_id in (select user_id from fu)
        group by 1
      ) pa
    ),

    -- ── Daily time-series (enhanced) for the trend chart ──
    'daily', (
      select coalesce(jsonb_agg(row_to_json(d)::jsonb order by d.day), '[]'::jsonb)
      from (
        select g::date as day,
          (select count(*) from fu where t_signup::date = g::date) as signups,
          (select count(distinct user_id) from activity where day = g::date) as active_users,
          (select count(*) from public.sv_usage_events e where e.created_at::date = g::date and e.event = 'login' and e.user_id in (select user_id from fu)) as logins,
          (select count(*) from public.sv_usage_events e where e.created_at::date = g::date and e.event = 'case_created' and e.user_id in (select user_id from fu)) as cases,
          (select count(*) from public.sv_usage_events e where e.created_at::date = g::date and e.event = 'visit_scheduled' and e.user_id in (select user_id from fu)) as visits,
          (select count(*) from public.sv_usage_events e where e.created_at::date = g::date and e.event = 'report_submitted' and e.user_id in (select user_id from fu)) as reports
        from generate_series(v_start, v_today, interval '1 day') g
      ) d
    ),

    -- ── Per-user activity table (metadata only; ALL users w/ is_internal) ──
    'per_user', (
      select coalesce(jsonb_agg(row_to_json(p)::jsonb order by p.signup_at desc), '[]'::jsonb)
      from (
        select
          b.user_id, b.email, b.full_name, b.signup_at, b.confirmed_at, b.last_sign_in_at,
          b.roles, b.primary_role, b.org_names, b.is_internal,
          coalesce(e.n_events, 0) as n_events,
          e.last_event_at,
          greatest(b.last_sign_in_at, e.last_event_at) as last_active,
          coalesce(e.ev_cases, 0) as n_cases,
          coalesce(e.ev_visits, 0) as n_visits,
          greatest(coalesce(e.ev_reports,0), coalesce((select count(*) from public.sv_reports rp where rp.created_by = b.user_id),0)) as n_reports,
          coalesce(e.ev_checkins, 0) as n_checkins,
          coalesce(e.ev_academy, 0) as n_academy,
          coalesce(e.ev_logins, 0) as n_logins,
          coalesce(e.ev_pageviews, 0) as n_pageviews,
          (f.t_confirmed is not null) as f_confirmed,
          (f.t_activated is not null) as f_activated,
          (f.t_case is not null)  as f_case,
          (f.t_visit is not null) as f_visit,
          (f.t_report is not null) as f_report
        from base b
        left join ev e on e.user_id = b.user_id
        left join first_ts f on f.user_id = b.user_id
      ) p
    )
  ) into result;

  return result;
end;
$$;

grant execute on function public.platform_admin_engagement_v2(integer, boolean, text, uuid) to authenticated;


-- =========================================================================
-- Per-user activity timeline — an Amplitude-style chronological event stream.
-- Metadata only: event type, timestamp, and a short non-PII label. Unions
-- signup/auth milestones, usage events, authored reports, and org-level
-- case/visit/org creation attributed to the user.
-- =========================================================================
drop function if exists public.platform_admin_user_timeline(uuid, integer);

create or replace function public.platform_admin_user_timeline(
  p_user_id uuid,
  p_limit integer default 200
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
  v_owned uuid[];
begin
  if not exists (
    select 1 from public.sv_user_roles
    where user_id = auth.uid() and role = 'platform_admin'
  ) then
    raise exception 'Forbidden';
  end if;

  select array_agg(distinct org_id) into v_owned
  from public.sv_user_roles
  where user_id = p_user_id and role in ('agency_owner','agency_manager') and org_id is not null;

  with tl as (
    -- Auth milestones
    select u.created_at as ts, 'signup'::text as type, 'Signed up'::text as label, null::text as meta
      from auth.users u where u.id = p_user_id
    union all
    select u.email_confirmed_at, 'confirmed', 'Confirmed email', null
      from auth.users u where u.id = p_user_id and u.email_confirmed_at is not null
    union all
    select u.last_sign_in_at, 'last_login', 'Most recent sign-in', null
      from auth.users u where u.id = p_user_id and u.last_sign_in_at is not null
    -- Usage events (already user-scoped, metadata only)
    union all
    select e.created_at, e.event,
      case e.event
        when 'login' then 'Logged in'
        when 'page_view' then 'Viewed ' || coalesce(nullif(split_part(ltrim(e.path,'/'),'/',1),''),'home')
        when 'case_created' then 'Created a case'
        when 'visit_scheduled' then 'Scheduled a visit'
        when 'visit_checkin' then 'Checked in to a visit'
        when 'report_submitted' then 'Submitted a report'
        when 'monitor_added' then 'Added a monitor'
        when 'quiz_started' then 'Started academy quiz'
        when 'quiz_completed' then 'Completed academy quiz'
        when 'feedback_submitted' then 'Gave feedback'
        else replace(e.event,'_',' ')
      end,
      e.path
    from public.sv_usage_events e where e.user_id = p_user_id
    -- Authored reports (status only)
    union all
    select coalesce(rp.submitted_at, rp.created_at), 'report', 'Report ' || coalesce(rp.status::text,'created'), null
      from public.sv_reports rp where rp.created_by = p_user_id
    -- Org creation
    union all
    select o.created_at, 'org_created', 'Created organization ' || o.name, null
      from public.sv_organizations o where o.created_by = p_user_id
    -- Org-level cases / visits (attributed to owner; metadata only)
    union all
    select c.created_at, 'case', 'A case was created in ' || o.name, null
      from public.sv_cases c join public.sv_organizations o on o.id = c.org_id
      where c.org_id = any(coalesce(v_owned,'{}'::uuid[]))
    union all
    select v.created_at, 'visit', 'A visit was scheduled in ' || o.name, coalesce(v.status::text,null)
      from public.sv_visits v join public.sv_organizations o on o.id = v.org_id
      where v.org_id = any(coalesce(v_owned,'{}'::uuid[]))
  )
  select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.ts desc), '[]'::jsonb)
  into result
  from (
    select ts, type, label, meta from tl where ts is not null order by ts desc limit p_limit
  ) x;

  return result;
end;
$$;

grant execute on function public.platform_admin_user_timeline(uuid, integer) to authenticated;
