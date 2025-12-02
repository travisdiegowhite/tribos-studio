-- Migration: Add onboarding fields to user_profiles
-- Description: Adds fields for new onboarding flow (intent, goals, stats caching)
-- Date: 2025-01-26

-- Add primary intent field (what brings user to tribos)
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS
  primary_intent TEXT CHECK (primary_intent IN ('routes', 'training', 'coach', 'exploring'));

-- Add onboarding completion timestamp
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS
  onboarding_completed_at TIMESTAMPTZ;

-- Add onboarding version tracking (for A/B testing and migrations)
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS
  onboarding_version INTEGER DEFAULT 2;

-- Goal-related fields
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS
  primary_goal TEXT CHECK (primary_goal IN (
    'consistency', 'endurance_event', 'speed_power', 'enjoyment'
  ));

ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS
  goal_event_name TEXT;

ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS
  goal_event_date DATE;

ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS
  goal_event_type TEXT CHECK (goal_event_type IN (
    'gran_fondo', 'century', 'race', 'tour', 'fitness', 'other'
  ));

-- Cache first sync stats for aha moment (avoid recalculating)
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS
  first_sync_stats JSONB;

-- Track when first sync completed
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS
  first_sync_completed_at TIMESTAMPTZ;

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_user_profiles_primary_intent
  ON user_profiles(primary_intent);

CREATE INDEX IF NOT EXISTS idx_user_profiles_onboarding_completed
  ON user_profiles(onboarding_completed_at);

CREATE INDEX IF NOT EXISTS idx_user_profiles_primary_goal
  ON user_profiles(primary_goal);

-- Add comment for documentation
COMMENT ON COLUMN user_profiles.primary_intent IS 'User intent selected during onboarding: routes, training, coach, or exploring';
COMMENT ON COLUMN user_profiles.primary_goal IS 'User cycling goal: consistency, endurance_event, speed_power, or enjoyment';
COMMENT ON COLUMN user_profiles.first_sync_stats IS 'Cached aggregate stats shown in onboarding aha moment';
