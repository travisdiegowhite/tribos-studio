-- Migration: Add running support
-- Adds sport_type awareness to activities and training plans,
-- running profile fields for users, and indexes for multi-sport queries

-- ============================================================
-- 1. Add sport_type index on activities table
--    (sport_type column already exists from migration 001)
-- ============================================================

-- Index for filtering activities by sport type (Run, Ride, etc.)
CREATE INDEX IF NOT EXISTS idx_activities_sport_type
  ON activities(sport_type);

-- Composite index for user + sport_type queries (e.g. "show me all my runs")
CREATE INDEX IF NOT EXISTS idx_activities_user_sport_type
  ON activities(user_id, sport_type);

-- Composite index for user + type queries
CREATE INDEX IF NOT EXISTS idx_activities_user_type
  ON activities(user_id, type);

-- ============================================================
-- 2. Add sport_type to training_plans table
-- ============================================================

ALTER TABLE training_plans
  ADD COLUMN IF NOT EXISTS sport_type TEXT DEFAULT 'cycling';

COMMENT ON COLUMN training_plans.sport_type IS 'Primary sport for this plan: cycling or running';

-- ============================================================
-- 3. Add running profile fields to user profiles
-- ============================================================

-- Running threshold pace and fitness metrics
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS threshold_pace_sec INTEGER,
  ADD COLUMN IF NOT EXISTS vdot NUMERIC,
  ADD COLUMN IF NOT EXISTS max_hr INTEGER,
  ADD COLUMN IF NOT EXISTS resting_hr INTEGER,
  ADD COLUMN IF NOT EXISTS lthr INTEGER,
  ADD COLUMN IF NOT EXISTS primary_sport TEXT DEFAULT 'cycling';

COMMENT ON COLUMN profiles.threshold_pace_sec IS 'Running lactate threshold pace in seconds per km';
COMMENT ON COLUMN profiles.vdot IS 'Jack Daniels VDOT running fitness score';
COMMENT ON COLUMN profiles.max_hr IS 'Maximum heart rate in bpm';
COMMENT ON COLUMN profiles.resting_hr IS 'Resting heart rate in bpm';
COMMENT ON COLUMN profiles.lthr IS 'Lactate threshold heart rate in bpm';
COMMENT ON COLUMN profiles.primary_sport IS 'User primary sport: cycling or running';

-- ============================================================
-- 4. Add running-specific fields to user_training_preferences
-- ============================================================

ALTER TABLE user_training_preferences
  ADD COLUMN IF NOT EXISTS prefer_weekend_long_runs BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS primary_sport TEXT DEFAULT 'cycling';

COMMENT ON COLUMN user_training_preferences.prefer_weekend_long_runs IS 'Prefer weekend long runs (running plans)';
COMMENT ON COLUMN user_training_preferences.primary_sport IS 'Primary sport for training preferences';

-- ============================================================
-- 5. Create running_race_prs table for race time tracking
-- ============================================================

CREATE TABLE IF NOT EXISTS running_race_prs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  distance TEXT NOT NULL, -- '5k', '10k', 'half_marathon', 'marathon'
  time_seconds INTEGER NOT NULL,
  race_date DATE,
  race_name TEXT,
  activity_id UUID REFERENCES activities(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- One PR per distance per user (can be updated)
  UNIQUE(user_id, distance)
);

-- Enable RLS
ALTER TABLE running_race_prs ENABLE ROW LEVEL SECURITY;

-- RLS policies: users can only access their own PRs
CREATE POLICY "Users can view own race PRs"
  ON running_race_prs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own race PRs"
  ON running_race_prs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own race PRs"
  ON running_race_prs FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own race PRs"
  ON running_race_prs FOR DELETE
  USING (auth.uid() = user_id);

-- Index for user lookup
CREATE INDEX IF NOT EXISTS idx_running_race_prs_user_id
  ON running_race_prs(user_id);

-- ============================================================
-- 6. Add running-related columns to fitness_snapshots
-- ============================================================

ALTER TABLE fitness_snapshots
  ADD COLUMN IF NOT EXISTS weekly_run_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS weekly_run_distance_km NUMERIC DEFAULT 0;

COMMENT ON COLUMN fitness_snapshots.weekly_run_count IS 'Number of running activities in the snapshot week';
COMMENT ON COLUMN fitness_snapshots.weekly_run_distance_km IS 'Total running distance in km for the snapshot week';
