-- =========================================================================
-- 0007: Accept invitations at ANY time, not only at auth-user creation.
--
-- Problem: sv_handle_new_auth_user only fires on INSERT into auth.users.
-- If a person signs up BEFORE being invited (or the invite is created
-- after their account exists), the trigger never runs, they land in
-- onboarding, and create their own org as agency_owner.
--
-- Fix: an RPC the app calls on login when the user has no memberships.
-- Mirrors the trigger logic, keyed off auth.uid()/their email.
-- =========================================================================

create or replace function public.accept_pending_invitations()
returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  inv record;
  uemail text;
  accepted_count integer := 0;
begin
  if auth.uid() is null then
    return 0;
  end if;

  select email into uemail from auth.users where id = auth.uid();
  if uemail is null then
    return 0;
  end if;

  for inv in
    select * from public.sv_invitations
    where lower(email) = lower(uemail)
      and accepted_at is null
      and expires_at > now()
  loop
    insert into public.sv_user_roles (user_id, org_id, role)
    values (auth.uid(), inv.org_id, inv.role)
    on conflict do nothing;

    -- Link any placeholder monitor record created during the invite
    if inv.role = 'monitor' then
      update public.sv_monitors
         set user_id = auth.uid(),
             updated_at = now()
       where org_id = inv.org_id
         and lower(email) = lower(uemail)
         and (user_id is null or user_id = auth.uid());
    end if;

    update public.sv_invitations
       set accepted_at = now(),
           accepted_by = auth.uid()
     where id = inv.id;

    accepted_count := accepted_count + 1;
  end loop;

  return accepted_count;
end;
$$;

revoke all on function public.accept_pending_invitations() from public;
grant execute on function public.accept_pending_invitations() to authenticated;

-- -------------------------------------------------------------------------
-- Data repair (run manually per affected user, if a monitor already created
-- their own org as agency_owner):
--
-- 1. Find their bogus org + role:
--    select r.id, r.role, o.name, r.user_id from sv_user_roles r
--      join sv_organizations o on o.id = r.org_id
--      where r.user_id = '<USER_UUID>';
-- 2. Delete the bogus owner role (and their empty org if unused):
--    delete from sv_user_roles where id = '<ROLE_ROW_UUID>';
--    delete from sv_organizations where id = '<BOGUS_ORG_UUID>'
--      and not exists (select 1 from sv_user_roles where org_id = '<BOGUS_ORG_UUID>');
-- 3. Re-invite them from the Monitors page (or insert sv_user_roles with
--    role='monitor' for the correct org), then have them log out/in.
-- -------------------------------------------------------------------------
