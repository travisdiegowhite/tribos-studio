-- Phase 2: Progression Levels System
-- Track user fitness level (1-10) across training zones
-- Similar to TrainerRoad's Progression Levels

-- ============================================================================
-- 1. PROGRESSION LEVELS
-- ============================================================================
-- Track user's current fitness level in each training zone (1.0 - 10.0 scale)

CREATE TABLE IF NOT EXISTS progression_levels (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  zone VARCHAR(50) NOT NULL CHECK (zone IN (
    'recovery', 'endurance', 'tempo', 'sweet_spot', 'threshold', 'vo2max', 'anaerobic'
  )),
  level DECIMAL(3,1) NOT NULL CHECK (level >= 1.0 AND level <= 10.0),
  workouts_completed INTEGER DEFAULT 0, -- Count of workouts in this zone
  last_workout_date DATE,
  last_level_change DECIMAL(3,1), -- Amount of last change (+0.3, -0.5, etc.)
  last_level_change_date TIMESTAMP,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(user_id, zone)
);

-- Index for querying progression levels
CREATE INDEX IF NOT EXISTS idx_progression_levels_user
  ON progression_levels(user_id);

CREATE INDEX IF NOT EXISTS idx_progression_levels_zone
  ON progression_levels(user_id, zone);

-- Enable Row Level Security
ALTER TABLE progression_levels ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own progression levels"
  ON progression_levels FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own progression levels"
  ON progression_levels FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own progression levels"
  ON progression_levels FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own progression levels"
  ON progression_levels FOR DELETE
  USING (user_id = auth.uid());

-- ============================================================================
-- 2. PROGRESSION LEVEL HISTORY
-- ============================================================================
-- Audit log of progression level changes over time

CREATE TABLE IF NOT EXISTS progression_level_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  zone VARCHAR(50) NOT NULL,
  old_level DECIMAL(3,1),
  new_level DECIMAL(3,1) NOT NULL,
  level_change DECIMAL(3,1), -- new_level - old_level
  reason VARCHAR(100), -- 'workout_success', 'workout_struggle', 'workout_failure', 'manual_adjustment'
  route_id UUID REFERENCES routes(id) ON DELETE SET NULL, -- Reference to workout that triggered change
  planned_workout_id UUID REFERENCES planned_workouts(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Index for querying history
CREATE INDEX IF NOT EXISTS idx_progression_history_user
  ON progression_level_history(user_id, zone, created_at DESC);

-- Enable Row Level Security
ALTER TABLE progression_level_history ENABLE ROW LEVEL SECURITY;

-- RLS Policy
CREATE POLICY "Users can view their own progression history"
  ON progression_level_history FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own progression history"
  ON progression_level_history FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- ============================================================================
-- 3. ADD COLUMNS TO PLANNED_WORKOUTS
-- ============================================================================
-- Extend planned_workouts table to support progression and adaptation

ALTER TABLE planned_workouts
  ADD COLUMN IF NOT EXISTS workout_level DECIMAL(3,1) CHECK (workout_level >= 1.0 AND workout_level <= 10.0),
  ADD COLUMN IF NOT EXISTS target_zone VARCHAR(50) CHECK (target_zone IN (
    'recovery', 'endurance', 'tempo', 'sweet_spot', 'threshold', 'vo2max', 'anaerobic', 'mixed'
  )),
  ADD COLUMN IF NOT EXISTS was_adapted BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS adaptation_reason TEXT;

-- Create index for querying workouts by zone
CREATE INDEX IF NOT EXISTS idx_planned_workouts_zone
  ON planned_workouts(user_id, target_zone)
  WHERE target_zone IS NOT NULL;

-- ============================================================================
-- 4. FUNCTIONS
-- ============================================================================

-- Initialize default progression levels for a new user
CREATE OR REPLACE FUNCTION initialize_progression_levels(user_uuid UUID)
RETURNS VOID AS $$
DECLARE
  zones VARCHAR[] := ARRAY['recovery', 'endurance', 'tempo', 'sweet_spot', 'threshold', 'vo2max', 'anaerobic'];
  zone_name VARCHAR;
BEGIN
  FOREACH zone_name IN ARRAY zones
  LOOP
    INSERT INTO progression_levels (user_id, zone, level)
    VALUES (user_uuid, zone_name, 3.0) -- Start everyone at level 3.0 (intermediate)
    ON CONFLICT (user_id, zone) DO NOTHING;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get all progression levels for a user
CREATE OR REPLACE FUNCTION get_progression_levels(user_uuid UUID)
RETURNS TABLE (
  zone VARCHAR(50),
  level DECIMAL(3,1),
  workouts_completed INTEGER,
  last_workout_date DATE,
  last_level_change DECIMAL(3,1),
  last_level_change_date TIMESTAMP
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    pl.zone,
    pl.level,
    pl.workouts_completed,
    pl.last_workout_date,
    pl.last_level_change,
    pl.last_level_change_date
  FROM progression_levels pl
  WHERE pl.user_id = user_uuid
  ORDER BY
    CASE pl.zone
      WHEN 'recovery' THEN 1
      WHEN 'endurance' THEN 2
      WHEN 'tempo' THEN 3
      WHEN 'sweet_spot' THEN 4
      WHEN 'threshold' THEN 5
      WHEN 'vo2max' THEN 6
      WHEN 'anaerobic' THEN 7
    END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update progression level for a zone
CREATE OR REPLACE FUNCTION update_progression_level(
  user_uuid UUID,
  zone_name VARCHAR(50),
  level_change DECIMAL(3,1), -- e.g., +0.3 for success, -0.5 for failure
  reason_text VARCHAR(100) DEFAULT 'manual_adjustment',
  route_id_param UUID DEFAULT NULL,
  planned_workout_id_param UUID DEFAULT NULL
)
RETURNS DECIMAL(3,1) AS $$
DECLARE
  old_level DECIMAL(3,1);
  new_level DECIMAL(3,1);
BEGIN
  -- Get current level
  SELECT level INTO old_level
  FROM progression_levels
  WHERE user_id = user_uuid AND zone = zone_name;

  -- If no progression level exists, initialize at 3.0
  IF old_level IS NULL THEN
    INSERT INTO progression_levels (user_id, zone, level)
    VALUES (user_uuid, zone_name, 3.0);
    old_level := 3.0;
  END IF;

  -- Calculate new level (clamped between 1.0 and 10.0)
  new_level := GREATEST(1.0, LEAST(10.0, old_level + level_change));

  -- Update progression level
  UPDATE progression_levels
  SET
    level = new_level,
    last_level_change = level_change,
    last_level_change_date = NOW(),
    updated_at = NOW()
  WHERE user_id = user_uuid AND zone = zone_name;

  -- Record in history
  INSERT INTO progression_level_history (
    user_id,
    zone,
    old_level,
    new_level,
    level_change,
    reason,
    route_id,
    planned_workout_id
  )
  VALUES (
    user_uuid,
    zone_name,
    old_level,
    new_level,
    level_change,
    reason_text,
    route_id_param,
    planned_workout_id_param
  );

  RETURN new_level;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Increment workout count for a zone
CREATE OR REPLACE FUNCTION increment_zone_workout_count(
  user_uuid UUID,
  zone_name VARCHAR(50),
  workout_date DATE DEFAULT CURRENT_DATE
)
RETURNS VOID AS $$
BEGIN
  UPDATE progression_levels
  SET
    workouts_completed = workouts_completed + 1,
    last_workout_date = workout_date,
    updated_at = NOW()
  WHERE user_id = user_uuid AND zone = zone_name;

  -- If no progression level exists, create it
  IF NOT FOUND THEN
    INSERT INTO progression_levels (user_id, zone, level, workouts_completed, last_workout_date)
    VALUES (user_uuid, zone_name, 3.0, 1, workout_date);
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get progression level for a specific zone
CREATE OR REPLACE FUNCTION get_progression_level_for_zone(
  user_uuid UUID,
  zone_name VARCHAR(50)
)
RETURNS DECIMAL(3,1) AS $$
DECLARE
  current_level DECIMAL(3,1);
BEGIN
  SELECT level INTO current_level
  FROM progression_levels
  WHERE user_id = user_uuid AND zone = zone_name;

  -- If no level exists, initialize and return 3.0
  IF current_level IS NULL THEN
    PERFORM initialize_progression_levels(user_uuid);
    RETURN 3.0;
  END IF;

  RETURN current_level;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Calculate progression level change based on workout performance
-- This is the core algorithm that determines how much to adjust levels
CREATE OR REPLACE FUNCTION calculate_level_adjustment(
  completion_percentage INTEGER, -- 0-100
  perceived_exertion INTEGER, -- 1-10 RPE
  workout_level DECIMAL(3,1), -- Difficulty of the workout
  current_progression_level DECIMAL(3,1) -- User's current level in this zone
)
RETURNS DECIMAL(3,1) AS $$
DECLARE
  level_diff DECIMAL(3,1);
  adjustment DECIMAL(3,1);
BEGIN
  -- Calculate how far above/below their level the workout was
  level_diff := workout_level - current_progression_level;

  -- Success case: completed >=90% and RPE was manageable
  IF completion_percentage >= 90 THEN
    IF perceived_exertion <= 7 THEN
      -- Easy success - moderate increase
      adjustment := 0.3;
    ELSIF perceived_exertion <= 9 THEN
      -- Hard but successful - small increase
      adjustment := 0.2;
    ELSE
      -- Barely made it (RPE 10) - minimal increase
      adjustment := 0.1;
    END IF;

  -- Partial completion (70-89%)
  ELSIF completion_percentage >= 70 THEN
    IF perceived_exertion <= 8 THEN
      -- Partial but felt okay - small increase
      adjustment := 0.1;
    ELSE
      -- Struggled - no change
      adjustment := 0.0;
    END IF;

  -- Poor completion (50-69%)
  ELSIF completion_percentage >= 50 THEN
    IF perceived_exertion >= 9 THEN
      -- Really struggled - decrease
      adjustment := -0.3;
    ELSE
      -- Didn't complete but wasn't maxed out - small decrease
      adjustment := -0.1;
    END IF;

  -- Failure (<50% completion)
  ELSE
    adjustment := -0.5;
  END IF;

  -- If workout was way above their level, be more lenient
  IF level_diff > 2.0 AND adjustment < 0 THEN
    adjustment := adjustment / 2.0; -- Halve the penalty
  END IF;

  -- If workout was way below their level, limit the gains
  IF level_diff < -2.0 AND adjustment > 0 THEN
    adjustment := adjustment / 2.0; -- Halve the increase
  END IF;

  RETURN adjustment;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Apply workout feedback to update progression level
CREATE OR REPLACE FUNCTION apply_workout_to_progression(
  user_uuid UUID,
  zone_name VARCHAR(50),
  workout_level_param DECIMAL(3,1),
  completion_percentage INTEGER,
  perceived_exertion INTEGER,
  route_id_param UUID DEFAULT NULL,
  planned_workout_id_param UUID DEFAULT NULL
)
RETURNS DECIMAL(3,1) AS $$
DECLARE
  current_level DECIMAL(3,1);
  adjustment DECIMAL(3,1);
  new_level DECIMAL(3,1);
  reason_text VARCHAR(100);
BEGIN
  -- Get current progression level
  current_level := get_progression_level_for_zone(user_uuid, zone_name);

  -- Calculate adjustment
  adjustment := calculate_level_adjustment(
    completion_percentage,
    perceived_exertion,
    workout_level_param,
    current_level
  );

  -- Determine reason text
  IF adjustment > 0 THEN
    reason_text := 'workout_success';
  ELSIF adjustment < 0 THEN
    IF completion_percentage < 50 THEN
      reason_text := 'workout_failure';
    ELSE
      reason_text := 'workout_struggle';
    END IF;
  ELSE
    reason_text := 'no_change';
  END IF;

  -- Update progression level
  new_level := update_progression_level(
    user_uuid,
    zone_name,
    adjustment,
    reason_text,
    route_id_param,
    planned_workout_id_param
  );

  -- Increment workout count
  PERFORM increment_zone_workout_count(user_uuid, zone_name);

  RETURN new_level;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get progression level history for a zone
CREATE OR REPLACE FUNCTION get_progression_history(
  user_uuid UUID,
  zone_name VARCHAR(50) DEFAULT NULL,
  days_back INTEGER DEFAULT 90
)
RETURNS TABLE (
  date TIMESTAMP,
  zone VARCHAR(50),
  old_level DECIMAL(3,1),
  new_level DECIMAL(3,1),
  level_change DECIMAL(3,1),
  reason VARCHAR(100)
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    plh.created_at,
    plh.zone,
    plh.old_level,
    plh.new_level,
    plh.level_change,
    plh.reason
  FROM progression_level_history plh
  WHERE plh.user_id = user_uuid
    AND (zone_name IS NULL OR plh.zone = zone_name)
    AND plh.created_at >= NOW() - (days_back || ' days')::INTERVAL
  ORDER BY plh.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 5. SEED PROGRESSION LEVELS FROM EXISTING RPE DATA
-- ============================================================================
-- This function analyzes existing workout feedback to estimate initial levels

CREATE OR REPLACE FUNCTION seed_progression_from_rpe_data(user_uuid UUID)
RETURNS TEXT AS $$
DECLARE
  zone_record RECORD;
  avg_rpe DECIMAL(3,1);
  workout_count INTEGER;
  initial_level DECIMAL(3,1);
  zones_updated INTEGER := 0;
BEGIN
  -- For each zone, analyze past workout feedback
  FOR zone_record IN
    SELECT DISTINCT pw.target_zone as zone
    FROM planned_workouts pw
    WHERE pw.user_id = user_uuid
      AND pw.target_zone IS NOT NULL
      AND pw.completed = TRUE
  LOOP
    -- Calculate average RPE for workouts in this zone
    SELECT
      AVG(wf.perceived_exertion),
      COUNT(*)
    INTO avg_rpe, workout_count
    FROM workout_feedback wf
    INNER JOIN planned_workouts pw ON wf.planned_workout_id = pw.id
    WHERE pw.user_id = user_uuid
      AND pw.target_zone = zone_record.zone
      AND wf.perceived_exertion IS NOT NULL;

    -- Only proceed if we have data
    IF workout_count > 0 THEN
      -- Estimate initial level based on average RPE
      -- Lower RPE = higher fitness level in that zone
      initial_level := CASE
        WHEN avg_rpe <= 5 THEN 7.0  -- Very easy = high fitness
        WHEN avg_rpe <= 6 THEN 6.0
        WHEN avg_rpe <= 7 THEN 5.0
        WHEN avg_rpe <= 8 THEN 4.0
        WHEN avg_rpe <= 9 THEN 3.0
        ELSE 2.0  -- Very hard = low fitness
      END;

      -- Insert or update progression level
      INSERT INTO progression_levels (
        user_id,
        zone,
        level,
        workouts_completed
      )
      VALUES (
        user_uuid,
        zone_record.zone,
        initial_level,
        workout_count
      )
      ON CONFLICT (user_id, zone)
      DO UPDATE SET
        level = initial_level,
        workouts_completed = workout_count,
        updated_at = NOW();

      zones_updated := zones_updated + 1;
    END IF;
  END LOOP;

  -- Initialize any missing zones at default level 3.0
  PERFORM initialize_progression_levels(user_uuid);

  RETURN 'Seeded ' || zones_updated || ' zones from RPE data';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE progression_levels IS 'Tracks user fitness level (1-10 scale) in each training zone';
COMMENT ON TABLE progression_level_history IS 'Audit log of all progression level changes';
COMMENT ON FUNCTION initialize_progression_levels IS 'Creates default progression levels (3.0) for all zones';
COMMENT ON FUNCTION update_progression_level IS 'Updates progression level for a zone and records in history';
COMMENT ON FUNCTION calculate_level_adjustment IS 'Core algorithm to determine level change based on workout performance';
COMMENT ON FUNCTION apply_workout_to_progression IS 'Applies completed workout feedback to update progression level';
COMMENT ON FUNCTION seed_progression_from_rpe_data IS 'Seeds initial progression levels from existing RPE survey data';
