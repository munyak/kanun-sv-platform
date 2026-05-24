# Database migrations

Phase 1 multi-tenancy migration lives in `migrations/0001_phase1_multi_tenant.sql`.

## How to apply

1. Open the [Supabase SQL editor](https://supabase.com/dashboard/project/ubwmitylgqjlqpcsoezv/sql/new) for the `kanun-ops-dashboard` project.
2. Paste the entire contents of `migrations/0001_phase1_multi_tenant.sql` and run.
3. The migration is idempotent — safe to re-run if interrupted.

## What it does

- Creates `sv_organizations`, `sv_user_roles`, `sv_invitations`, `sv_onboarding_progress`.
- Adds `org_id` to every existing `sv_*` table.
- Drops the MVP's permissive RLS policies on those tables and replaces them with org-scoped policies driven by the authenticated user's `sv_user_roles` rows.
- Installs an `auth.users` insert trigger that auto-accepts open invitations matching the new user's email — the mechanism behind the team-invite flow.
- Adds `sv_monitors.user_id` so a monitor's auth account can find their monitor record.

## Verifying

After running, you should see in the Table Editor:
- `sv_organizations`, `sv_user_roles`, `sv_invitations`, `sv_onboarding_progress`.
- `org_id` column on every `sv_*` table.
- RLS enabled on every `sv_*` table with policies named `<table>_select`, `<table>_insert`, etc.

## Non-sv_* tables

This migration touches **only** tables whose names start with `sv_`. Other dashboard tables in this Supabase project are left alone.
