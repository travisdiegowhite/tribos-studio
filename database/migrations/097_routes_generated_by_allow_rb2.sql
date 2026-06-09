-- ============================================================================
-- Migration 097: routes.generated_by — allow 'rb2'
--
-- Route Builder 2.0 saves routes with generated_by = 'rb2' (see
-- src/hooks/route-builder/useRoutePersistence.ts). The original CHECK
-- constraint from create_routes_table.sql only permitted
-- ('manual', 'ai', 'strava_import'), so every save from Builder 2.0 failed with:
--
--   new row for relation "routes" violates check constraint
--   "routes_generated_by_check"   → HTTP 500 from /api/routes (save_route)
--
-- Widen the allowed set to include 'rb2'. Safe widening: existing rows are only
-- 'manual'/'ai', so re-adding the constraint cannot fail row revalidation.
--
-- Applied to production via Supabase MCP on 2026-06-06; this file records it for
-- source-of-truth parity.
-- ============================================================================

ALTER TABLE public.routes DROP CONSTRAINT IF EXISTS routes_generated_by_check;

ALTER TABLE public.routes ADD CONSTRAINT routes_generated_by_check
  CHECK (generated_by IN ('manual', 'ai', 'strava_import', 'rb2'));
