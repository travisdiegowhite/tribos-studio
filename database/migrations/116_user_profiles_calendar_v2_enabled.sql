-- ============================================================================
-- SUPERSEDED 2026-08-29 — THE GATE THIS COLUMN SERVED NO LONGER EXISTS.
--
-- /train IS the calendar_entries calendar now, for every athlete, and the
-- parallel /calendar surface, its route, its guard, `useCalendarV2Access` and
-- the VITE_CALENDAR_V2_ENABLED env flag are all deleted. Nothing reads this
-- column: `grep -rn "calendar_v2_enabled" src/ api/` returns only the comment
-- in api/coach.js explaining what the flag used to be.
--
-- The column is KEPT under the same "wait and watch" policy that governs
-- user_profiles.route_builder_v2_enabled (see CLAUDE.md). Do not add new
-- readers or writers, and do not drop it without explicit approval.
--
-- The gate was not a mistake — it is what made the rebuild survivable. It
-- became wrong the moment /train's reads were repointed for everyone without
-- being gated too: from then on it was the LEGACY writers that wrote where
-- nobody looks, so the flag protected exactly the wrong side.
-- ============================================================================

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
