-- =========================================================================
-- 0005 — Report lifecycle: archive + soft delete + owner edit tracking
-- =========================================================================
-- Adds the missing pieces the owner needs to fully manage reports:
--   * archived_at  — owner-archived (recoverable)
--   * deleted_at   — owner-deleted (soft delete, hidden but recoverable by admin)
--   * owner_edited_at + owner_edits jsonb — track when owner edits before approval

alter table public.sv_reports add column if not exists archived_at      timestamptz;
alter table public.sv_reports add column if not exists archived_by      uuid references auth.users(id) on delete set null;
alter table public.sv_reports add column if not exists deleted_at       timestamptz;
alter table public.sv_reports add column if not exists deleted_by       uuid references auth.users(id) on delete set null;
alter table public.sv_reports add column if not exists owner_edited_at  timestamptz;
alter table public.sv_reports add column if not exists owner_edited_by  uuid references auth.users(id) on delete set null;
alter table public.sv_reports add column if not exists owner_edits      jsonb default '[]'::jsonb;

create index if not exists sv_reports_archived_idx on public.sv_reports(archived_at);
create index if not exists sv_reports_deleted_idx  on public.sv_reports(deleted_at);
