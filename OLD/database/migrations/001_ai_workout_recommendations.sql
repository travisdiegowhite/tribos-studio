-- Migration: Add AI Workout Recommendation Support
-- Date: 2025-11-24
-- Description: Extends planned_workouts table to support AI-recommended workouts
--              while maintaining compatibility with existing training plan workflow

-- ============================================================
-- 1. Add AI metadata fields to planned_workouts
-- ============================================================

-- Add fields to track AI recommendations
ALTER TABLE planned_workouts
ADD COLUMN IF NOT EXISTS ai_metadata JSONB DEFAULT NULL;

-- Add optional direct reference to athlete (for workouts not tied to a plan)
ALTER TABLE planned_workouts
ADD COLUMN IF NOT EXISTS athlete_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Add scheduled_date as alternative to plan-based scheduling
ALTER TABLE planned_workouts
ADD COLUMN IF NOT EXISTS scheduled_date DATE;

-- Add direct template reference
ALTER TABLE planned_workouts
ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES workout_templates(id) ON DELETE SET NULL;

-- Add completion status (more granular than boolean)
ALTER TABLE planned_workouts
ADD COLUMN IF NOT EXISTS completion_status TEXT
CHECK (completion_status IN ('scheduled', 'in_progress', 'completed', 'skipped', 'cancelled'))
DEFAULT 'scheduled';

-- Make plan_id optional (for standalone AI workouts)
ALTER TABLE planned_workouts
ALTER COLUMN plan_id DROP NOT NULL;

-- Add index for workout template lookup
ALTER TABLE workout_templates
ADD COLUMN IF NOT EXISTS is_system_template BOOLEAN DEFAULT true;

-- Add workout library ID for mapping
ALTER TABLE workout_templates
ADD COLUMN IF NOT EXISTS library_id TEXT UNIQUE;

-- ============================================================
-- 2. Update constraints to support both workflows
-- ============================================================

-- Add constraint: either plan_id OR (athlete_id + scheduled_date) must be provided
-- Drop existing constraint first to make this idempotent
DO $$
BEGIN
  -- Drop constraint if it exists
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'planned_workouts_context_check'
  ) THEN
    ALTER TABLE planned_workouts DROP CONSTRAINT planned_workouts_context_check;
  END IF;

  -- Add the constraint
  ALTER TABLE planned_workouts
  ADD CONSTRAINT planned_workouts_context_check
  CHECK (
    (plan_id IS NOT NULL AND week_number IS NOT NULL AND day_of_week IS NOT NULL) OR
    (athlete_id IS NOT NULL AND scheduled_date IS NOT NULL)
  );
END $$;

-- ============================================================
-- 3. Create indexes for AI workout queries
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_planned_workouts_athlete_date
ON planned_workouts(athlete_id, scheduled_date);

CREATE INDEX IF NOT EXISTS idx_planned_workouts_template
ON planned_workouts(template_id);

CREATE INDEX IF NOT EXISTS idx_planned_workouts_completion_status
ON planned_workouts(completion_status);

CREATE INDEX IF NOT EXISTS idx_workout_templates_library_id
ON workout_templates(library_id);

-- ============================================================
-- 4. Update RLS policies to support athlete-based access
-- ============================================================

-- Allow athletes to view their own workouts (even without a plan)
DROP POLICY IF EXISTS "Users can view own planned workouts" ON planned_workouts;
CREATE POLICY "Users can view own planned workouts"
  ON planned_workouts FOR SELECT
  USING (
    -- Original plan-based access
    (EXISTS (
      SELECT 1 FROM training_plans
      WHERE training_plans.id = planned_workouts.plan_id
      AND training_plans.user_id = auth.uid()
    ))
    OR
    -- New direct athlete access
    (athlete_id = auth.uid())
  );

-- Allow athletes to insert their own workouts
DROP POLICY IF EXISTS "Users can create own planned workouts" ON planned_workouts;
CREATE POLICY "Users can create own planned workouts"
  ON planned_workouts FOR INSERT
  WITH CHECK (
    -- Original plan-based access
    (EXISTS (
      SELECT 1 FROM training_plans
      WHERE training_plans.id = planned_workouts.plan_id
      AND training_plans.user_id = auth.uid()
    ))
    OR
    -- New direct athlete access
    (athlete_id = auth.uid())
  );

-- Allow athletes to update their own workouts
DROP POLICY IF EXISTS "Users can update own planned workouts" ON planned_workouts;
CREATE POLICY "Users can update own planned workouts"
  ON planned_workouts FOR UPDATE
  USING (
    (EXISTS (
      SELECT 1 FROM training_plans
      WHERE training_plans.id = planned_workouts.plan_id
      AND training_plans.user_id = auth.uid()
    ))
    OR
    (athlete_id = auth.uid())
  );

-- Allow athletes to delete their own workouts
DROP POLICY IF EXISTS "Users can delete own planned workouts" ON planned_workouts;
CREATE POLICY "Users can delete own planned workouts"
  ON planned_workouts FOR DELETE
  USING (
    (EXISTS (
      SELECT 1 FROM training_plans
      WHERE training_plans.id = planned_workouts.plan_id
      AND training_plans.user_id = auth.uid()
    ))
    OR
    (athlete_id = auth.uid())
  );

-- ============================================================
-- 5. Helper function to get or create AI training plan
-- ============================================================

CREATE OR REPLACE FUNCTION get_or_create_ai_training_plan(
  p_user_id UUID
) RETURNS UUID AS $$
DECLARE
  v_plan_id UUID;
BEGIN
  -- Try to find existing AI training plan
  SELECT id INTO v_plan_id
  FROM training_plans
  WHERE user_id = p_user_id
    AND name = 'AI Coach Recommendations'
    AND status = 'active'
  LIMIT 1;

  -- Create if doesn't exist
  IF v_plan_id IS NULL THEN
    INSERT INTO training_plans (
      user_id,
      name,
      goal_type,
      fitness_level,
      hours_per_week,
      duration_weeks,
      current_phase,
      status
    ) VALUES (
      p_user_id,
      'AI Coach Recommendations',
      'general_fitness',
      'intermediate',
      5,
      52,
      'base',
      'active'
    )
    RETURNING id INTO v_plan_id;
  END IF;

  RETURN v_plan_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 6. Comments for documentation
-- ============================================================

COMMENT ON COLUMN planned_workouts.ai_metadata IS 'JSON metadata for AI-recommended workouts: {recommended: true, reason: "...", priority: "high|medium|low", source: "ai_coach"}';
COMMENT ON COLUMN planned_workouts.athlete_id IS 'Optional direct athlete reference for workouts not tied to a specific training plan';
COMMENT ON COLUMN planned_workouts.scheduled_date IS 'Specific date for standalone workouts (alternative to week_number/day_of_week)';
COMMENT ON COLUMN planned_workouts.template_id IS 'Optional direct reference to workout template';
COMMENT ON COLUMN planned_workouts.completion_status IS 'Granular completion status: scheduled, in_progress, completed, skipped, cancelled';
COMMENT ON COLUMN workout_templates.library_id IS 'Unique identifier for mapping to frontend workout library (e.g., "three_by_ten_sst")';
COMMENT ON FUNCTION get_or_create_ai_training_plan(UUID) IS 'Returns existing or creates new AI training plan for a user';

-- ============================================================
-- 7. Sync existing workout templates with library IDs
-- ============================================================

-- Map existing templates to library IDs where there's a clear match
UPDATE workout_templates SET library_id = 'recovery_spin' WHERE name = 'Easy Recovery Ride';
UPDATE workout_templates SET library_id = 'endurance_base_build' WHERE name = 'Endurance Base Build';
UPDATE workout_templates SET library_id = 'traditional_sst' WHERE name = 'Sweet Spot Intervals';
UPDATE workout_templates SET library_id = 'five_by_four_vo2' WHERE name = 'VO2 Max Intervals';
UPDATE workout_templates SET library_id = 'hill_repeats' WHERE name = 'Hill Repeats';
UPDATE workout_templates SET library_id = 'tempo_ride' WHERE name = 'Tempo Ride';
UPDATE workout_templates SET library_id = 'long_endurance_ride' WHERE name = 'Long Endurance Ride';
