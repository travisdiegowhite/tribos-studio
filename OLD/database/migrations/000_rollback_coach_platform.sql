-- =====================================================
-- ROLLBACK SCRIPT: Coach Platform
-- =====================================================
-- Run this FIRST to clean up any partial migration
-- Then run 001_coach_platform.sql fresh
-- =====================================================

-- Drop all RLS policies (in reverse order of creation)
DROP POLICY IF EXISTS "Users can update messages in their relationships" ON coach_messages;
DROP POLICY IF EXISTS "Users can send messages in active relationships" ON coach_messages;
DROP POLICY IF EXISTS "Users can view messages in their relationships" ON coach_messages;

DROP POLICY IF EXISTS "Coaches can update assigned workouts" ON planned_workouts;
DROP POLICY IF EXISTS "Coaches can assign workouts" ON planned_workouts;
DROP POLICY IF EXISTS "Coaches can view assigned workouts" ON planned_workouts;

DROP POLICY IF EXISTS "Athletes can delete relationships" ON coach_athlete_relationships;
DROP POLICY IF EXISTS "Coaches can delete relationships" ON coach_athlete_relationships;
DROP POLICY IF EXISTS "Athletes can update their coach relationships" ON coach_athlete_relationships;
DROP POLICY IF EXISTS "Coaches can update their athlete relationships" ON coach_athlete_relationships;
DROP POLICY IF EXISTS "Coaches can create athlete relationships" ON coach_athlete_relationships;
DROP POLICY IF EXISTS "Athletes can view their coach relationships" ON coach_athlete_relationships;
DROP POLICY IF EXISTS "Coaches can view their athlete relationships" ON coach_athlete_relationships;

-- Drop triggers
DROP TRIGGER IF EXISTS trg_relationship_status_change ON coach_athlete_relationships;

-- Drop functions
DROP FUNCTION IF EXISTS find_user_by_email(TEXT);
DROP FUNCTION IF EXISTS update_relationship_status();
DROP FUNCTION IF EXISTS get_athlete_summary(UUID, UUID);

-- Drop indexes
DROP INDEX IF EXISTS idx_coach_messages_unread;
DROP INDEX IF EXISTS idx_coach_messages_relationship;
DROP INDEX IF EXISTS idx_planned_workouts_athlete;
DROP INDEX IF EXISTS idx_planned_workouts_coach;
DROP INDEX IF EXISTS idx_coach_relationships_athlete;
DROP INDEX IF EXISTS idx_coach_relationships_coach;
DROP INDEX IF EXISTS idx_user_profiles_account_type;

-- Drop new tables
DROP TABLE IF EXISTS coach_messages CASCADE;
DROP TABLE IF EXISTS coach_athlete_relationships CASCADE;

-- Remove columns from planned_workouts
ALTER TABLE planned_workouts
  DROP COLUMN IF EXISTS athlete_id;

ALTER TABLE planned_workouts
  DROP COLUMN IF EXISTS coach_notes;

ALTER TABLE planned_workouts
  DROP COLUMN IF EXISTS assigned_by_coach_id;

-- Remove columns from user_profiles
ALTER TABLE user_profiles
  DROP COLUMN IF EXISTS max_athletes;

ALTER TABLE user_profiles
  DROP COLUMN IF EXISTS coach_availability;

ALTER TABLE user_profiles
  DROP COLUMN IF EXISTS coach_pricing;

ALTER TABLE user_profiles
  DROP COLUMN IF EXISTS coach_specialties;

ALTER TABLE user_profiles
  DROP COLUMN IF EXISTS coach_certifications;

ALTER TABLE user_profiles
  DROP COLUMN IF EXISTS coach_bio;

ALTER TABLE user_profiles
  DROP COLUMN IF EXISTS account_type;

-- =====================================================
-- ROLLBACK COMPLETE
-- =====================================================

DO $$
BEGIN
  RAISE NOTICE 'Coach platform rollback completed successfully!';
  RAISE NOTICE 'You can now run 001_coach_platform.sql to apply the full migration.';
END $$;
