-- ============================================================================
-- 109: Fix planned_workouts.original_workout_id column type (uuid → TEXT)
-- ============================================================================
-- Migration 057 intended to ADD original_workout_id as TEXT, but the column
-- already existed as UUID (from the pre-057 schema), so 057's IF NOT EXISTS
-- guard skipped it and production drifted from the migration's intent.
--
-- The column stores library workout ids, which are TEXT slugs (e.g.
-- 'endurance_base_build') — same domain as planned_workouts.workout_id (TEXT).
-- With the UUID type, the coach's adjust_schedule "replace" action fails with
--   invalid input syntax for type uuid: "endurance_base_build"
-- whenever it tries to record the replaced workout's id.
--
-- Safe: verified 0 non-null values in production at time of writing, and
-- uuid → text is a widening conversion regardless.

ALTER TABLE planned_workouts
  ALTER COLUMN original_workout_id TYPE TEXT USING original_workout_id::text;

COMMENT ON COLUMN planned_workouts.original_workout_id IS
  'Library workout id (TEXT slug) this row held before a coach replace/remove adjustment — see migration 057/109.';
