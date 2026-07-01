-- 0015 — Resolve Supabase security-advisor RLS lints.
-- Applied to project yxhwcicxarfmptwivkdu 2026-06-30.
--
-- 1) rls_enabled_no_policy: sv_pilot_applications had RLS enabled but no
--    policies (deny-all to clients — writes/reads go through the service-role
--    edge functions). Add explicit platform-admin read/update so the table has
--    real policies; inserts remain service-role-only (no insert policy).
drop policy if exists sv_pilot_applications_admin_select on public.sv_pilot_applications;
create policy sv_pilot_applications_admin_select on public.sv_pilot_applications
  for select to authenticated using (
    exists (select 1 from public.sv_user_roles where user_id = auth.uid() and role = 'platform_admin')
  );
drop policy if exists sv_pilot_applications_admin_update on public.sv_pilot_applications;
create policy sv_pilot_applications_admin_update on public.sv_pilot_applications
  for update to authenticated using (
    exists (select 1 from public.sv_user_roles where user_id = auth.uid() and role = 'platform_admin')
  );

-- 2) rls_policy_always_true: sv_org_insert allowed INSERT with WITH CHECK (true)
--    (unrestricted). Self-serve onboarding always sets created_by = user.id, so
--    require it — keeps signup working and prevents spoofing the creator.
drop policy if exists sv_org_insert on public.sv_organizations;
create policy sv_org_insert on public.sv_organizations
  for insert to authenticated with check (created_by = auth.uid());
