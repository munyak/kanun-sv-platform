-- 0016 — Security-advisor hardening (non-RLS lints). Applied to
-- yxhwcicxarfmptwivkdu 2026-06-30.
--
-- Also done out-of-band (not DDL / kept here for the record):
--   * extension_in_public: moved pg_net public -> extensions schema
--       (drop extension pg_net; create extension pg_net with schema extensions;)
--       net.http_post still resolves; the daily-digest cron was re-tested OK.
--   * auth_leaked_password_protection: enabled HIBP + min password length 8
--       (Auth config via Management API).

-- function_search_path_mutable: pin search_path on the two trigger functions.
alter function public.sv_pilot_applications_touch() set search_path = public;
alter function public.sv_update_updated_at() set search_path = public;

-- security_definer_function_executable: lock anon (and where possible
-- authenticated) out of SECURITY DEFINER functions that clients shouldn't call.
-- The platform_admin_* RPCs self-check the caller's platform_admin role, so they
-- stay callable by authenticated; the digest runs only as service_role; the
-- new-user trigger fn isn't callable directly. The RLS helper functions
-- (sv_current_user_org_ids, sv_user_has_org_role) are intentionally left
-- executable by anon+authenticated — RLS policies call them on every query.
do $do$
declare fn text;
begin
  foreach fn in array array[
    'public.platform_admin_stats()','public.platform_admin_orgs()','public.platform_admin_users()',
    'public.platform_admin_activity()','public.platform_admin_attention()','public.platform_admin_background_checks()',
    'public.platform_admin_org_detail(uuid)','public.platform_admin_user_detail(uuid)','public.platform_admin_usage_analytics(integer)',
    'public.accept_pending_invitations()'
  ] loop
    execute format('revoke execute on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end $do$;

revoke execute on function public.platform_daily_digest() from public, anon, authenticated;
grant execute on function public.platform_daily_digest() to service_role;
revoke execute on function public.sv_handle_new_auth_user() from public;
