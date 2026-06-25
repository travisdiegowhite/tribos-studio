-- ============================================================================
-- Migration 100: enable Route Builder 2.0 + routing-first Today for everyone
--
-- Beta launch cut-over. Flips the per-user gate from opt-in to opt-out:
--   1. New signups now default to enabled (column default FALSE -> TRUE), so
--      a freshly-inserted user_profiles row lands on RB2 + the new Today.
--   2. All existing users are bulk-enabled.
--
-- The per-user column and the env kill switch (VITE_ROUTE_BUILDER_V2_ENABLED)
-- are intentionally KEPT. The env flag remains the master rollback lever:
-- setting it to "false" instantly reverts every user to v1 + the live Today
-- (see src/hooks/useRouteBuilderV2Access.ts). To re-disable per-user at the
-- SQL level, use snippet #4 in database/enable_rb2_cohort.sql.
--
-- Supersedes migration 090's "default FALSE, flip manually" stance.
-- ============================================================================

-- New signups default to enabled.
ALTER TABLE user_profiles
  ALTER COLUMN route_builder_v2_enabled SET DEFAULT TRUE;

-- Bulk-enable all existing users.
UPDATE user_profiles
SET route_builder_v2_enabled = TRUE
WHERE route_builder_v2_enabled IS DISTINCT FROM TRUE;

COMMENT ON COLUMN user_profiles.route_builder_v2_enabled IS
  'Per-user gate for Route Builder 2.0 + routing-first Today. As of the beta launch (migration 100) this defaults to TRUE for new signups and is enabled for all existing users. The env flag VITE_ROUTE_BUILDER_V2_ENABLED is the master kill switch: when false, no one reaches v2 regardless of this column. Set this column to FALSE for a specific user to opt them out individually.';
