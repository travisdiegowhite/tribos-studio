-- Migration 125: Lock down calendar_entries_backup_20260829
-- (Supabase linter rls_disabled_in_public, lint 0013 — flagged 2026-09-13)
--
-- Finding: `public.calendar_entries_backup_20260829` was created by hand on
-- 2026-08-29 as a safety copy of `calendar_entries` before the migration 115
-- backfill ran. It was made with a plain CREATE TABLE ... AS, so it inherited
-- the default anon/authenticated grants of the public schema with NO row-level
-- security. It holds 58 real athlete calendar rows, so anyone with the project
-- URL and the public anon key could read, edit or delete them via PostgREST.
--
-- No code in src/ or api/ references this table — it exists only as a manual
-- rollback point. This is the same situation migration 107 fixed for the
-- `_cleanup_20260801_*` backups, and the fix is identical:
--
-- 1. Enable RLS with NO policies: anon/authenticated are denied all row
--    access. service_role (used by /api and the dashboard SQL editor)
--    bypasses RLS, so the table stays readable for a manual restore.
-- 2. Revoke the API-role grants for defense in depth.
--
-- The table itself stays under the "wait and watch" retention policy — this
-- migration does NOT drop it. Once the calendar_entries cut-over has soaked,
-- drop it with explicit approval:
--   DROP TABLE IF EXISTS public.calendar_entries_backup_20260829;

ALTER TABLE IF EXISTS public.calendar_entries_backup_20260829 ENABLE ROW LEVEL SECURITY;

-- No policies are created on purpose: RLS enabled + zero policies = deny-all
-- for anon and authenticated.

REVOKE ALL ON public.calendar_entries_backup_20260829 FROM anon, authenticated;

-- ============================================================================
-- Verification (manual)
-- ============================================================================
-- Expect rls_enabled = true and api_role_grants = NULL:
--
-- SELECT c.relname, c.relrowsecurity AS rls_enabled,
--   (SELECT string_agg(DISTINCT tp.grantee || ':' || tp.privilege_type, ', ')
--    FROM information_schema.table_privileges tp
--    WHERE tp.table_schema = 'public' AND tp.table_name = c.relname
--      AND tp.grantee IN ('anon', 'authenticated')) AS api_role_grants
-- FROM pg_class c
-- JOIN pg_namespace n ON n.oid = c.relnamespace
-- WHERE n.nspname = 'public'
--   AND c.relname = 'calendar_entries_backup_20260829';
