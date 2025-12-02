-- ============================================================================
-- COMPLETE PHASE 2 CLEANUP - Remove Everything
-- This script completely removes all Phase 2 tables, functions, triggers, and indexes
-- Run this to start fresh
-- ============================================================================

-- ============================================================================
-- STEP 1: DROP ALL TRIGGERS (must be first, before functions)
-- ============================================================================

DROP TRIGGER IF EXISTS trigger_auto_create_zones ON user_ftp_history;

-- ============================================================================
-- STEP 2: DROP ALL FUNCTIONS (after triggers)
-- ============================================================================

-- FTP Functions
DROP FUNCTION IF EXISTS get_current_ftp(UUID);
DROP FUNCTION IF EXISTS get_current_lthr(UUID);
DROP FUNCTION IF EXISTS set_current_ftp(UUID, INTEGER, INTEGER, DATE, VARCHAR, UUID, TEXT);
DROP FUNCTION IF EXISTS initialize_training_zones(UUID, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS auto_create_zones_on_ftp_insert();
DROP FUNCTION IF EXISTS get_ftp_history(UUID, INTEGER);
DROP FUNCTION IF EXISTS get_user_training_zones(UUID);
DROP FUNCTION IF EXISTS get_zone_for_power(UUID, INTEGER);

-- Progression Functions
DROP FUNCTION IF EXISTS initialize_progression_levels(UUID);
DROP FUNCTION IF EXISTS get_progression_levels(UUID);
DROP FUNCTION IF EXISTS get_progression_level_for_zone(UUID, VARCHAR);
DROP FUNCTION IF EXISTS update_progression_level(UUID, VARCHAR, DECIMAL, VARCHAR, UUID, UUID);
DROP FUNCTION IF EXISTS increment_zone_workout_count(UUID, VARCHAR, DATE);
DROP FUNCTION IF EXISTS calculate_level_adjustment(INTEGER, INTEGER, DECIMAL, DECIMAL);
DROP FUNCTION IF EXISTS apply_workout_to_progression(UUID, VARCHAR, DECIMAL, INTEGER, INTEGER, UUID, UUID);
DROP FUNCTION IF EXISTS get_progression_history(UUID, VARCHAR, INTEGER);
DROP FUNCTION IF EXISTS seed_progression_from_rpe_data(UUID);

-- Adaptive Training Functions
DROP FUNCTION IF EXISTS evaluate_workout_adaptation(UUID, UUID);
DROP FUNCTION IF EXISTS run_adaptive_training(UUID);
DROP FUNCTION IF EXISTS accept_adaptation(UUID);
DROP FUNCTION IF EXISTS reject_adaptation(UUID);
DROP FUNCTION IF EXISTS get_pending_adaptations(UUID);
DROP FUNCTION IF EXISTS get_user_adaptation_settings(UUID);
DROP FUNCTION IF EXISTS update_adaptation_settings(UUID, BOOLEAN, BOOLEAN, VARCHAR, INTEGER, DECIMAL, DECIMAL, BOOLEAN);

-- ============================================================================
-- STEP 3: REMOVE COLUMNS FROM EXISTING TABLES
-- ============================================================================

ALTER TABLE planned_workouts
  DROP COLUMN IF EXISTS workout_level,
  DROP COLUMN IF EXISTS target_zone,
  DROP COLUMN IF EXISTS was_adapted,
  DROP COLUMN IF EXISTS adaptation_reason;

-- ============================================================================
-- STEP 4: DROP ALL INDEXES
-- ============================================================================

-- FTP indexes
DROP INDEX IF EXISTS idx_one_current_ftp_per_user;
DROP INDEX IF EXISTS idx_ftp_history_user_date;
DROP INDEX IF EXISTS idx_training_zones_user;

-- Progression indexes
DROP INDEX IF EXISTS idx_progression_levels_user;
DROP INDEX IF EXISTS idx_progression_levels_zone;
DROP INDEX IF EXISTS idx_progression_history_user;
DROP INDEX IF EXISTS idx_planned_workouts_zone;

-- Adaptation indexes
DROP INDEX IF EXISTS idx_adaptation_history_user;
DROP INDEX IF EXISTS idx_adaptation_history_workout;
DROP INDEX IF EXISTS idx_adaptation_pending;

-- ============================================================================
-- STEP 5: DROP ALL TABLES (in correct order)
-- ============================================================================

-- Drop tables that reference other tables first
DROP TABLE IF EXISTS adaptation_history CASCADE;
DROP TABLE IF EXISTS adaptation_settings CASCADE;
DROP TABLE IF EXISTS progression_level_history CASCADE;
DROP TABLE IF EXISTS progression_levels CASCADE;
DROP TABLE IF EXISTS training_zones CASCADE;
DROP TABLE IF EXISTS user_ftp_history CASCADE;

-- ============================================================================
-- VERIFICATION
-- ============================================================================

DO $$
DECLARE
  table_count INTEGER;
  function_count INTEGER;
BEGIN
  -- Check for remaining tables
  SELECT COUNT(*) INTO table_count
  FROM information_schema.tables
  WHERE table_name IN (
    'user_ftp_history', 'training_zones', 'progression_levels',
    'progression_level_history', 'adaptation_history', 'adaptation_settings'
  );

  -- Check for remaining functions
  SELECT COUNT(*) INTO function_count
  FROM information_schema.routines
  WHERE routine_name IN (
    'get_current_ftp', 'set_current_ftp', 'initialize_training_zones',
    'get_progression_levels', 'apply_workout_to_progression',
    'evaluate_workout_adaptation', 'run_adaptive_training'
  );

  RAISE NOTICE '============================================';
  RAISE NOTICE 'Phase 2 Cleanup Complete';
  RAISE NOTICE '============================================';
  RAISE NOTICE 'Remaining Phase 2 tables: %', table_count;
  RAISE NOTICE 'Remaining Phase 2 functions: %', function_count;

  IF table_count = 0 AND function_count = 0 THEN
    RAISE NOTICE 'Status: ✓ All Phase 2 objects successfully removed';
  ELSE
    RAISE WARNING 'Status: ⚠ Some Phase 2 objects still exist';
  END IF;
  RAISE NOTICE '============================================';
END $$;
