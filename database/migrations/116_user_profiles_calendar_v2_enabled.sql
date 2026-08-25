-- ============================================================================
-- Migration 116: user_profiles.calendar_v2_enabled
--
-- Per-user gate for the rebuilt calendar at /calendar, which reads and writes
-- `calendar_entries` (migrations 114/115) instead of `planned_workouts`.
-- Defaults to FALSE so nobody reaches it until explicitly flipped.
--
-- Access requires BOTH:
--   1. VITE_CALENDAR_V2_ENABLED === 'true' in the deploy env (kill switch)
--   2. user_profiles.calendar_v2_enabled = TRUE for the specific user
--
-- When false, the CALENDAR nav link is hidden and direct URL access to
-- /calendar redirects to /train (the existing plan-owned calendar).
--
-- Mirrors migration 090, which gated Route Builder 2.0 — the one rebuild in
-- this codebase that actually completed its cutover. The counter-example is
-- migration 086, which built its tables behind a flag that was never flipped
-- and left five empty tables behind; see docs and CLAUDE.md.
--
-- To grant access:
--   UPDATE user_profiles SET calendar_v2_enabled = TRUE WHERE id = '<uuid>';
-- ============================================================================

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS calendar_v2_enabled BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN user_profiles.calendar_v2_enabled IS
  'Per-user gate for the rebuilt calendar at /calendar (calendar_entries-backed). When TRUE and VITE_CALENDAR_V2_ENABLED=true at the deploy level, the user sees the CALENDAR nav link and can reach /calendar. Flipped manually in Supabase Studio. Delete this column once the cutover completes and /train is retired.';
