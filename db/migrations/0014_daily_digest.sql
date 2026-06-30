-- 0014 — Daily platform digest.
-- platform_daily_digest() aggregates the last-24h platform activity/usage; the
-- `daily-digest` Edge Function reads it (service role) and emails it via Resend
-- to the founder (DIGEST_TO). Scheduled with pg_cron. Applied to project
-- yxhwcicxarfmptwivkdu 2026-06-30.
--
-- One-time setup applied directly (kept out of this file; secrets must not live
-- in the repo):
--   create extension if not exists pg_cron;
--   create extension if not exists pg_net;
--   select cron.schedule('kanun-daily-digest', '0 13 * * *',  -- 06:00 PT daily
--     $$ select net.http_post(
--          url := 'https://yxhwcicxarfmptwivkdu.functions.supabase.co/daily-digest',
--          headers := jsonb_build_object('Content-Type','application/json','x-digest-secret','<DIGEST_SECRET>')
--        ) $$);
-- Edge Function secrets: DIGEST_SECRET, DIGEST_TO, RESEND_API_KEY (+ SUPABASE_* defaults).

create or replace function public.platform_daily_digest()
returns jsonb language sql security definer set search_path = public as $$
  select jsonb_build_object(
    'generated_at', now(),
    'signups_24h', (select count(*) from sv_pilot_applications where created_at >= now()-interval '24 hours'),
    'pending_total', (select count(*) from sv_pilot_applications where status='pending'),
    'approved_24h', (select count(*) from sv_pilot_applications where status='approved' and reviewed_at >= now()-interval '24 hours'),
    'active_testers_24h', (select count(distinct user_id) from sv_usage_events where created_at >= now()-interval '24 hours'),
    'events_24h', (select count(*) from sv_usage_events where created_at >= now()-interval '24 hours'),
    'top_events', (select coalesce(jsonb_agg(row_to_json(t)),'[]'::jsonb) from (select event, count(*)::int as count from sv_usage_events where created_at >= now()-interval '24 hours' group by event order by count(*) desc limit 8) t),
    'top_pages', (select coalesce(jsonb_agg(row_to_json(t)),'[]'::jsonb) from (select path, count(*)::int as count from sv_usage_events where event='page_view' and created_at >= now()-interval '24 hours' group by path order by count(*) desc limit 6) t),
    'feedback_24h', (select count(*) from sv_feedback where created_at >= now()-interval '24 hours'),
    'avg_rating_24h', (select round(avg(rating),1) from sv_feedback where rating is not null and created_at >= now()-interval '24 hours'),
    'recent_comments', (select coalesce(jsonb_agg(row_to_json(t)),'[]'::jsonb) from (select rating, comment from sv_feedback where comment is not null and created_at >= now()-interval '24 hours' order by created_at desc limit 5) t),
    'orgs', (select count(*) from sv_organizations),
    'users', (select count(*) from sv_user_roles),
    'monitors', (select count(*) from sv_monitors),
    'active_monitors', (select count(*) from sv_monitors where status != 'inactive'),
    'visits_scheduled_today', (select count(*) from sv_visits where scheduled_date = current_date),
    'visits_completed_24h', (select count(*) from sv_visits where status='completed' and updated_at >= now()-interval '24 hours'),
    'reports_submitted_24h', (select count(*) from sv_reports where submitted_at >= now()-interval '24 hours'),
    'cases_created_24h', (select count(*) from sv_cases where created_at >= now()-interval '24 hours')
  );
$$;
revoke execute on function public.platform_daily_digest() from public, authenticated;
