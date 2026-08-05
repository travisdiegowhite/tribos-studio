-- Migration 107: Lock down RLS-less public tables flagged by the Supabase linter
-- (rls_disabled_in_public, lint 0013)
--
-- Findings (2026-08-05): the three `_cleanup_20260801_*` backup tables from the
-- 2026-08-01 metrics cleanup (see docs/CLEANUP_REPORT.md) and the PostGIS
-- `spatial_ref_sys` table were exposed to the anon/authenticated API roles with
-- full CRUD grants and no RLS. The backup tables contain real user activity
-- rows, so this was a live data leak via PostgREST.
--
-- Fix:
-- 1. `_cleanup_20260801_*` (owned by postgres): enable RLS with NO policies —
--    anon/authenticated get deny-all, while service_role (used by /api) bypasses
--    RLS, so the documented rollback path in docs/CLEANUP_REPORT.md still works.
--    Grants are also revoked for defense in depth. The tables themselves stay
--    under the "wait and watch" retention policy — this migration does NOT drop
--    them.
-- 2. `spatial_ref_sys` (owned by supabase_admin via the PostGIS extension):
--    NOT fixable from the postgres role. RLS can't be enabled (not owner), and
--    the anon/authenticated grants were made BY supabase_admin, so a REVOKE run
--    as postgres is a silent no-op (REVOKE only removes grants where the current
--    role is the grantor — this is also why migration 025's revoke never took
--    effect). The revoke below is kept for the harmless PUBLIC/postgres-granted
--    cases but the linter finding for this table will persist.
--
--    Verified 2026-08-05 that PostGIS is entirely unused in this project: zero
--    geometry/geography columns, zero non-extension DB functions referencing
--    PostGIS, zero app-code callers of ST_* functions. The real fix is to drop
--    the extension (which removes spatial_ref_sys), or recreate it in the
--    `extensions` schema if spatial features are ever wanted. The drop was
--    explicitly approved on 2026-08-05 and executed by migration 108.

-- ============================================================================
-- 1. Backup tables from the 2026-08-01 cleanup: RLS deny-all + revoke grants
-- ============================================================================

ALTER TABLE IF EXISTS public._cleanup_20260801_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public._cleanup_20260801_fitness_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public._cleanup_20260801_training_load_daily ENABLE ROW LEVEL SECURITY;

-- No policies are created: with RLS enabled and zero policies, anon and
-- authenticated are denied all row access. service_role bypasses RLS.

REVOKE ALL ON public._cleanup_20260801_activities FROM anon, authenticated;
REVOKE ALL ON public._cleanup_20260801_fitness_snapshots FROM anon, authenticated;
REVOKE ALL ON public._cleanup_20260801_training_load_daily FROM anon, authenticated;

-- ============================================================================
-- 2. spatial_ref_sys: revoke API access (RLS not possible — extension-owned)
-- ============================================================================

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'spatial_ref_sys'
    ) THEN
        REVOKE ALL ON public.spatial_ref_sys FROM anon, authenticated;
        RAISE NOTICE 'Revoked API-role access from spatial_ref_sys';
    END IF;
END $$;

-- ============================================================================
-- Verification (manual)
-- ============================================================================

-- Expect rls_enabled = true for the three _cleanup tables, and no
-- anon/authenticated grants on any of the four tables:
--
-- SELECT c.relname, c.relrowsecurity AS rls_enabled,
--   (SELECT string_agg(DISTINCT tp.grantee || ':' || tp.privilege_type, ', ')
--    FROM information_schema.table_privileges tp
--    WHERE tp.table_schema = 'public' AND tp.table_name = c.relname
--      AND tp.grantee IN ('anon', 'authenticated')) AS api_role_grants
-- FROM pg_class c
-- JOIN pg_namespace n ON n.oid = c.relnamespace
-- WHERE n.nspname = 'public'
--   AND c.relname IN ('spatial_ref_sys',
--                     '_cleanup_20260801_activities',
--                     '_cleanup_20260801_fitness_snapshots',
--                     '_cleanup_20260801_training_load_daily');
