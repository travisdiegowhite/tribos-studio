-- ============================================================================
-- Migration 090: user_profiles.route_builder_v2_enabled
--
-- Per-user gate for Route Builder 2.0 BETA. Defaults to FALSE so existing
-- users get no access until explicitly flipped via Supabase Studio.
--
-- Access requires BOTH:
--   1. VITE_ROUTE_BUILDER_V2_ENABLED === 'true' in the deploy env (kill switch)
--   2. user_profiles.route_builder_v2_enabled = TRUE for the specific user
--
-- When false, the BUILDER 2.0 BETA nav link is hidden and direct URL access
-- to /route-builder-2 redirects to the v1 builder at /ride/new.
--
-- Replaces the previous env-only flag from P1.1.
-- ============================================================================

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS route_builder_v2_enabled BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN user_profiles.route_builder_v2_enabled IS
  'Per-user gate for Route Builder 2.0 BETA access (Stabilize series S1). When TRUE and VITE_ROUTE_BUILDER_V2_ENABLED=true at the deploy level, the user sees the BUILDER 2.0 nav link and can reach /route-builder-2. Flipped manually in Supabase Studio; no end-user UI manages this in S1.';
