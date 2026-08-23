-- ============================================================================
-- Migration 113: add three columns the application already reads and writes
--
-- These columns are referenced throughout src/ and api/ and are covered by
-- passing unit tests, but were never added to the database. The tests pass
-- because they inject rows directly and exercise the pure formatting
-- functions; the queries that would supply those rows in production fail.
--
-- Concrete breakage this fixes:
--
--   1. actual_distance_km — written by src/hooks/useTrainingPlan.ts
--      (linkActivityToWorkout) and src/components/training/ActivityLinkingModal.jsx.
--      PostgREST rejects an UPDATE naming an unknown column, so the ENTIRE
--      update fails and both call sites throw. Manually linking an activity to
--      a planned workout has never worked for any user. The auto-link path
--      (src/hooks/useActivityAutoLink.ts) works only because it does not write
--      this column.
--
--   2. skipped_reason — named in the SELECT list at
--      api/utils/coachContextEnrichment.js:123. That query returns 42703, the
--      error is swallowed by the surrounding try/catch, and the coach silently
--      loses the athlete's whole week of planned sessions. Consumers at :255,
--      :313 and :323 render [SKIPPED] and exclude skipped sessions from
--      "upcoming"; both are asserted by coachContextEnrichment.test.js:138,244.
--
--   3. target_distance_km — named in the SELECT list at
--      src/utils/enhancedContext.js:691, so getTodaysPrescription() returns
--      null on every call. Also read by useUpcomingPlannedWorkouts.ts:70,
--      workoutRouteHref.ts:31 (prefills the route builder's distance),
--      trainingPlanExport.ts and api/utils/advancedRideAnalytics.js:696.
--
-- All three are nullable and additive. Existing rows get NULL, which is what
-- every reader already falls back to today.
--
-- NOTE: `target_distance_km` here is the planned distance of a WORKOUT. It is
-- unrelated to the `target_distance_km` tool parameter in
-- api/utils/routeEditTools.js, which is a route-shaping input (see CLAUDE.md's
-- note that the Workout.targetDistance concept is deliberately separate).
-- ============================================================================

ALTER TABLE planned_workouts
  ADD COLUMN IF NOT EXISTS skipped_reason     TEXT,
  ADD COLUMN IF NOT EXISTS target_distance_km NUMERIC,
  ADD COLUMN IF NOT EXISTS actual_distance_km NUMERIC;

COMMENT ON COLUMN planned_workouts.skipped_reason IS
  'Why the athlete skipped this session. NULL = not skipped. Rendered as [SKIPPED] in the coach context block and excluded from "upcoming" counts.';
COMMENT ON COLUMN planned_workouts.target_distance_km IS
  'Planned distance in KM (primarily running / distance-prescribed sessions). Suffixed per the distance-unit convention in CLAUDE.md.';
COMMENT ON COLUMN planned_workouts.actual_distance_km IS
  'Distance actually covered, in KM, copied from the linked activity at completion. Suffixed per the distance-unit convention in CLAUDE.md.';
