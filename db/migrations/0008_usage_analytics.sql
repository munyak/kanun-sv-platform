-- =========================================================================
-- 0008 — Usage analytics RPC for Platform Admin
-- Derives usage metrics from existing tables — no new tables required.
-- Returns visit trends, monitor activity, feature adoption, and org usage.
-- =========================================================================

-- Drop if exists so this is idempotent
drop function if exists public.platform_admin_usage_analytics(integer);

create or replace function public.platform_admin_usage_analytics(p_days integer default 30)
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

  select jsonb_build_object(
    'period_days', p_days,
    'period_start', v_start,
    'period_end', current_date,

    -- ── Visit volume & trends ──
    'visits_summary', (
      select jsonb_build_object(
        'total',      count(*),
        'completed',  count(*) filter (where status = 'completed'),
        'cancelled',  count(*) filter (where status = 'cancelled'),
        'no_show',    count(*) filter (where status = 'no_show'),
        'in_progress', count(*) filter (where status in ('checked_in','active')),
        'scheduled',  count(*) filter (where status = 'scheduled'),
        'completion_rate', case when count(*) > 0
          then round(100.0 * count(*) filter (where status = 'completed') / count(*), 1)
          else 0 end
      )
      from public.sv_visits
      where scheduled_date >= v_start
    ),

    -- ── Daily visit counts (for trend chart) ──
    'daily_visits', (
      select coalesce(jsonb_agg(row_to_json(d)::jsonb order by d.day), '[]'::jsonb)
      from (
        select
          scheduled_date as day,
          count(*) as total,
          count(*) filter (where status = 'completed') as completed,
          count(*) filter (where status = 'cancelled') as cancelled
        from public.sv_visits
        where scheduled_date >= v_start
        group by scheduled_date
      ) d
    ),

    -- ── Monitor activity ──
    'monitor_activity', (
      select coalesce(jsonb_agg(row_to_json(m)::jsonb order by m.visit_count desc), '[]'::jsonb)
      from (
        select
          mon.id as monitor_id,
          mon.first_name,
          mon.last_name,
          o.name as org_name,
          count(distinct v.id) as visit_count,
          count(distinct v.id) filter (where v.status = 'completed') as completed_visits,
          count(obs.id) as observation_count,
          max(v.scheduled_date) as last_active_date,
          -- Feature adoption flags
          bool_or(v.checkin_lat is not null) as used_gps
        from public.sv_monitors mon
        join public.sv_organizations o on o.id = mon.org_id
        left join public.sv_visits v on v.monitor_id = mon.id and v.scheduled_date >= v_start
        left join public.sv_visit_observations obs on obs.visit_id = v.id
        where mon.status != 'inactive'
        group by mon.id, mon.first_name, mon.last_name, o.name
        limit 50
      ) m
    ),

    -- ── Observation stats ──
    'observations_summary', (
      select jsonb_build_object(
        'total', count(*),
        'concerns', count(*) filter (where obs.severity = 'concern'),
        'critical', count(*) filter (where obs.severity = 'critical'),
        'normal', count(*) filter (where obs.severity = 'normal' or obs.severity is null),
        'with_flags', count(*) filter (where obs.severity in ('concern','critical')),
        'avg_per_visit', case when (select count(*) from sv_visits where scheduled_date >= v_start and status = 'completed') > 0
          then round(count(*)::numeric / (select count(*) from sv_visits where scheduled_date >= v_start and status = 'completed'), 1)
          else 0 end
      )
      from public.sv_visit_observations obs
      join public.sv_visits v on v.id = obs.visit_id
      where v.scheduled_date >= v_start
    ),

    -- ── Report generation stats ──
    'reports_summary', (
      select jsonb_build_object(
        'total', count(*),
        'draft', count(*) filter (where status = 'draft'),
        'submitted', count(*) filter (where status = 'submitted'),
        'approved', count(*) filter (where status = 'approved'),
        'rejected', count(*) filter (where status = 'rejected')
      )
      from public.sv_reports
      where created_at >= v_start
    ),

    -- ── Feature adoption (GPS, voice, quick flags) ──
    'feature_adoption', (
      select jsonb_build_object(
        'gps_checkins', (select count(*) from sv_visits where checkin_lat is not null and scheduled_date >= v_start),
        'gps_checkouts', (select count(*) from sv_visits where checkout_lat is not null and scheduled_date >= v_start),
        'quick_flags', (select count(*) from sv_visit_observations obs join sv_visits v on v.id = obs.visit_id where obs.severity in ('concern','critical') and v.scheduled_date >= v_start),
        'photo_count', (select count(*) from sv_visit_photos p join sv_visits v on v.id = p.visit_id where v.scheduled_date >= v_start),
        'total_observations', (select count(*) from sv_visit_observations obs join sv_visits v on v.id = obs.visit_id where v.scheduled_date >= v_start)
      )
    ),

    -- ── Org-level usage breakdown ──
    'org_usage', (
      select coalesce(jsonb_agg(row_to_json(ou)::jsonb order by ou.visit_count desc), '[]'::jsonb)
      from (
        select
          o.id as org_id,
          o.name as org_name,
          (select count(*) from sv_visits where org_id = o.id and scheduled_date >= v_start) as visit_count,
          (select count(*) from sv_visits where org_id = o.id and scheduled_date >= v_start and status = 'completed') as completed_visits,
          (select count(*) from sv_monitors where org_id = o.id and status != 'inactive') as active_monitors,
          (select count(*) from sv_user_roles where org_id = o.id) as total_users,
          (select max(v2.scheduled_date) from sv_visits v2 where v2.org_id = o.id) as last_visit_date
        from public.sv_organizations o
      ) ou
    ),

    -- ── Login / sign-in activity (from auth.users, last_sign_in_at) ──
    'active_users', (
      select jsonb_build_object(
        'total_users', count(*),
        'active_last_7d', count(*) filter (where last_sign_in_at >= current_date - 7),
        'active_last_30d', count(*) filter (where last_sign_in_at >= current_date - 30),
        'never_logged_in', count(*) filter (where last_sign_in_at is null)
      )
      from auth.users
      where id in (select user_id from public.sv_user_roles)
    )

  ) into result;

  return result;
end;
$$;

-- Grant execute to authenticated
grant execute on function public.platform_admin_usage_analytics(integer) to authenticated;
