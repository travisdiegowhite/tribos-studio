-- Cleanup script for Phase 2 migrations
-- Run this if you need to start fresh

-- Note: We use DO blocks to handle cases where tables don't exist yet

-- Drop policies for progression_levels (if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'progression_levels') THEN
    DROP POLICY IF EXISTS "Users can view their own progression levels" ON progression_levels;
    DROP POLICY IF EXISTS "Users can insert their own progression levels" ON progression_levels;
    DROP POLICY IF EXISTS "Users can update their own progression levels" ON progression_levels;
    DROP POLICY IF EXISTS "Users can delete their own progression levels" ON progression_levels;
  END IF;
END $$;

-- Drop policies for progression_level_history (if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'progression_level_history') THEN
    DROP POLICY IF EXISTS "Users can view their own progression history" ON progression_level_history;
    DROP POLICY IF EXISTS "Users can insert their own progression history" ON progression_level_history;
  END IF;
END $$;

-- Drop policies for user_ftp_history (if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'user_ftp_history') THEN
    DROP POLICY IF EXISTS "Users can view their own FTP history" ON user_ftp_history;
    DROP POLICY IF EXISTS "Users can insert their own FTP history" ON user_ftp_history;
    DROP POLICY IF EXISTS "Users can update their own FTP history" ON user_ftp_history;
    DROP POLICY IF EXISTS "Users can delete their own FTP history" ON user_ftp_history;
  END IF;
END $$;

-- Drop policies for training_zones (if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'training_zones') THEN
    DROP POLICY IF EXISTS "Users can view their own training zones" ON training_zones;
    DROP POLICY IF EXISTS "Users can insert their own training zones" ON training_zones;
    DROP POLICY IF EXISTS "Users can update their own training zones" ON training_zones;
    DROP POLICY IF EXISTS "Users can delete their own training zones" ON training_zones;
  END IF;
END $$;

-- Drop policies for adaptation_history (if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'adaptation_history') THEN
    DROP POLICY IF EXISTS "Users can view their own adaptation history" ON adaptation_history;
    DROP POLICY IF EXISTS "Users can insert their own adaptation history" ON adaptation_history;
    DROP POLICY IF EXISTS "Users can update their own adaptation history" ON adaptation_history;
  END IF;
END $$;

-- Drop policies for adaptation_settings (if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'adaptation_settings') THEN
    DROP POLICY IF EXISTS "Users can view their own adaptation settings" ON adaptation_settings;
    DROP POLICY IF EXISTS "Users can insert their own adaptation settings" ON adaptation_settings;
    DROP POLICY IF EXISTS "Users can update their own adaptation settings" ON adaptation_settings;
  END IF;
END $$;

-- Drop triggers FIRST (before functions they depend on)
DROP TRIGGER IF EXISTS trigger_auto_create_zones ON user_ftp_history;

-- Drop functions (if they exist)
DROP FUNCTION IF EXISTS seed_progression_from_rpe_data(UUID);
DROP FUNCTION IF EXISTS get_progression_history(UUID, VARCHAR, INTEGER);
DROP FUNCTION IF EXISTS apply_workout_to_progression(UUID, VARCHAR, DECIMAL, INTEGER, INTEGER, UUID, UUID);
DROP FUNCTION IF EXISTS calculate_level_adjustment(INTEGER, INTEGER, DECIMAL, DECIMAL);
DROP FUNCTION IF EXISTS get_progression_level_for_zone(UUID, VARCHAR);
DROP FUNCTION IF EXISTS increment_zone_workout_count(UUID, VARCHAR, DATE);
DROP FUNCTION IF EXISTS update_progression_level(UUID, VARCHAR, DECIMAL, VARCHAR, UUID, UUID);
DROP FUNCTION IF EXISTS get_progression_levels(UUID);
DROP FUNCTION IF EXISTS initialize_progression_levels(UUID);

DROP FUNCTION IF EXISTS get_zone_for_power(UUID, INTEGER);
DROP FUNCTION IF EXISTS get_user_training_zones(UUID);
DROP FUNCTION IF EXISTS get_ftp_history(UUID, INTEGER);
DROP FUNCTION IF EXISTS initialize_training_zones(UUID, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS set_current_ftp(UUID, INTEGER, INTEGER, DATE, VARCHAR, UUID, TEXT);
DROP FUNCTION IF EXISTS get_current_lthr(UUID);
DROP FUNCTION IF EXISTS get_current_ftp(UUID);
DROP FUNCTION IF EXISTS auto_create_zones_on_ftp_insert();

DROP FUNCTION IF EXISTS run_adaptive_training(UUID);
DROP FUNCTION IF EXISTS respond_to_adaptation(UUID, BOOLEAN, TEXT);
DROP FUNCTION IF EXISTS apply_adaptation(UUID, UUID, VARCHAR, DECIMAL, TEXT, BOOLEAN);
DROP FUNCTION IF EXISTS evaluate_workout_adaptation(UUID, UUID);
DROP FUNCTION IF EXISTS get_recent_training_metrics(UUID, INTEGER);
DROP FUNCTION IF EXISTS get_adaptation_settings(UUID);

-- Drop indexes
DROP INDEX IF EXISTS idx_progression_levels_user;
DROP INDEX IF EXISTS idx_progression_levels_zone;
DROP INDEX IF EXISTS idx_progression_history_user;
DROP INDEX IF EXISTS idx_planned_workouts_zone;
DROP INDEX IF EXISTS idx_ftp_history_user_date;
DROP INDEX IF EXISTS idx_one_current_ftp_per_user;
DROP INDEX IF EXISTS idx_training_zones_user;
DROP INDEX IF EXISTS idx_adaptation_history_user;
DROP INDEX IF EXISTS idx_adaptation_history_workout;
DROP INDEX IF EXISTS idx_adaptation_pending;

-- Drop tables (in reverse dependency order)
DROP TABLE IF EXISTS adaptation_history CASCADE;
DROP TABLE IF EXISTS adaptation_settings CASCADE;
DROP TABLE IF EXISTS progression_level_history CASCADE;
DROP TABLE IF EXISTS progression_levels CASCADE;
DROP TABLE IF EXISTS training_zones CASCADE;
DROP TABLE IF EXISTS user_ftp_history CASCADE;

-- Drop columns from planned_workouts (if they were added)
ALTER TABLE planned_workouts DROP COLUMN IF EXISTS workout_level;
ALTER TABLE planned_workouts DROP COLUMN IF EXISTS target_zone;
ALTER TABLE planned_workouts DROP COLUMN IF EXISTS was_adapted;
ALTER TABLE planned_workouts DROP COLUMN IF EXISTS adaptation_reason;
