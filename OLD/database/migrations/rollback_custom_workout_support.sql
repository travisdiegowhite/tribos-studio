-- Rollback Script: Custom Workout Support
-- Description: Completely removes all custom workout support changes
-- Date: 2025-11-22
-- Version: 1.0
-- Purpose: Clean slate - removes all changes so you can run the migration fresh

-- =====================================================
-- STEP 1: Drop all functions first
-- =====================================================

DROP FUNCTION IF EXISTS search_workouts_by_tag(UUID, TEXT);
DROP FUNCTION IF EXISTS count_workouts_shared_by_user(UUID);
DROP FUNCTION IF EXISTS count_user_custom_workouts(UUID);
DROP FUNCTION IF EXISTS get_accessible_workouts(UUID);

-- =====================================================
-- STEP 2: Drop all RLS policies
-- =====================================================

-- Drop workout_templates policies
DROP POLICY IF EXISTS "Users can delete own custom workouts" ON workout_templates;
DROP POLICY IF EXISTS "Users can update own custom workouts" ON workout_templates;
DROP POLICY IF EXISTS "Users can create custom workouts" ON workout_templates;
DROP POLICY IF EXISTS "Users can view accessible workouts" ON workout_templates;
DROP POLICY IF EXISTS "Anyone can view workout templates" ON workout_templates;

-- Drop workout_shares policies
DROP POLICY IF EXISTS "Users can delete their shares" ON workout_shares;
DROP POLICY IF EXISTS "Users can share their own workouts" ON workout_shares;
DROP POLICY IF EXISTS "Users can view their workout shares" ON workout_shares;

-- =====================================================
-- STEP 3: Drop workout_shares table
-- =====================================================

DROP TABLE IF EXISTS workout_shares CASCADE;

-- =====================================================
-- STEP 4: Remove template_id from planned_workouts
-- =====================================================

ALTER TABLE planned_workouts DROP COLUMN IF EXISTS template_id;

-- =====================================================
-- STEP 5: Remove custom workout columns from workout_templates
-- =====================================================

ALTER TABLE workout_templates
  DROP COLUMN IF EXISTS tags,
  DROP COLUMN IF EXISTS focus_area,
  DROP COLUMN IF EXISTS intensity_factor,
  DROP COLUMN IF EXISTS primary_zone,
  DROP COLUMN IF EXISTS coach_notes,
  DROP COLUMN IF EXISTS category,
  DROP COLUMN IF EXISTS is_public,
  DROP COLUMN IF EXISTS is_system_template,
  DROP COLUMN IF EXISTS created_by_user_id;

-- =====================================================
-- STEP 6: Restore original RLS policy for workout_templates
-- =====================================================

-- Re-enable the original "anyone can view" policy
CREATE POLICY "Anyone can view workout templates"
  ON workout_templates FOR SELECT
  USING (true);

-- =====================================================
-- SUCCESS MESSAGE
-- =====================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Rollback Complete!';
  RAISE NOTICE 'All custom workout support changes have been removed.';
  RAISE NOTICE 'Database is back to original state.';
  RAISE NOTICE '';
  RAISE NOTICE 'Next step: Run add_custom_workout_support.sql (the complete version)';
END $$;
