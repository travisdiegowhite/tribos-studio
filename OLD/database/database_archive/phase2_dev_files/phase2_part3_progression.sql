-- ============================================================================
-- Phase 2 - Part 3: Progression Levels Tables & Functions
-- ============================================================================

-- Table: progression_levels
CREATE TABLE IF NOT EXISTS progression_levels (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  zone VARCHAR(50) NOT NULL CHECK (zone IN (
    'recovery', 'endurance', 'tempo', 'sweet_spot', 'threshold', 'vo2max', 'anaerobic'
  )),
  level DECIMAL(3,1) NOT NULL CHECK (level >= 1.0 AND level <= 10.0),
  workouts_completed INTEGER DEFAULT 0,
  last_workout_date DATE,
  last_level_change DECIMAL(3,1),
  last_level_change_date TIMESTAMP,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, zone)
);

ALTER TABLE progression_levels
  ADD CONSTRAINT progression_levels_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_progression_levels_user ON progression_levels(user_id);
CREATE INDEX IF NOT EXISTS idx_progression_levels_zone ON progression_levels(user_id, zone);

ALTER TABLE progression_levels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own progression levels"
  ON progression_levels FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own progression levels"
  ON progression_levels FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own progression levels"
  ON progression_levels FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own progression levels"
  ON progression_levels FOR DELETE USING (user_id = auth.uid());

-- Table: progression_level_history
CREATE TABLE IF NOT EXISTS progression_level_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  zone VARCHAR(50) NOT NULL,
  old_level DECIMAL(3,1),
  new_level DECIMAL(3,1) NOT NULL,
  level_change DECIMAL(3,1),
  reason VARCHAR(100),
  route_id UUID,
  planned_workout_id UUID,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE progression_level_history
  ADD CONSTRAINT progression_level_history_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE progression_level_history
  ADD CONSTRAINT progression_level_history_route_id_fkey
  FOREIGN KEY (route_id) REFERENCES routes(id) ON DELETE SET NULL;

ALTER TABLE progression_level_history
  ADD CONSTRAINT progression_level_history_planned_workout_id_fkey
  FOREIGN KEY (planned_workout_id) REFERENCES planned_workouts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_progression_history_user
  ON progression_level_history(user_id, zone, created_at DESC);

ALTER TABLE progression_level_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own progression history"
  ON progression_level_history FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own progression history"
  ON progression_level_history FOR INSERT WITH CHECK (user_id = auth.uid());

-- Add columns to planned_workouts
ALTER TABLE planned_workouts
  ADD COLUMN IF NOT EXISTS workout_level DECIMAL(3,1) CHECK (workout_level >= 1.0 AND workout_level <= 10.0),
  ADD COLUMN IF NOT EXISTS target_zone VARCHAR(50) CHECK (target_zone IN (
    'recovery', 'endurance', 'tempo', 'sweet_spot', 'threshold', 'vo2max', 'anaerobic', 'mixed'
  )),
  ADD COLUMN IF NOT EXISTS was_adapted BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS adaptation_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_planned_workouts_zone
  ON planned_workouts(user_id, target_zone) WHERE target_zone IS NOT NULL;

-- Functions
CREATE OR REPLACE FUNCTION initialize_progression_levels(user_uuid UUID)
RETURNS VOID AS $$
DECLARE
  zones VARCHAR[] := ARRAY['recovery', 'endurance', 'tempo', 'sweet_spot', 'threshold', 'vo2max', 'anaerobic'];
  zone_name VARCHAR;
BEGIN
  FOREACH zone_name IN ARRAY zones
  LOOP
    INSERT INTO progression_levels (user_id, zone, level)
    VALUES (user_uuid, zone_name, 3.0)
    ON CONFLICT (user_id, zone) DO NOTHING;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_progression_levels(user_uuid UUID)
RETURNS TABLE (zone VARCHAR, level DECIMAL, workouts_completed INTEGER, last_workout_date DATE, last_level_change DECIMAL, last_level_change_date TIMESTAMP) AS $$
BEGIN
  RETURN QUERY
  SELECT pl.zone, pl.level, pl.workouts_completed, pl.last_workout_date, pl.last_level_change, pl.last_level_change_date
  FROM progression_levels pl
  WHERE pl.user_id = user_uuid
  ORDER BY CASE pl.zone
    WHEN 'recovery' THEN 1 WHEN 'endurance' THEN 2 WHEN 'tempo' THEN 3
    WHEN 'sweet_spot' THEN 4 WHEN 'threshold' THEN 5 WHEN 'vo2max' THEN 6 WHEN 'anaerobic' THEN 7
  END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_progression_level_for_zone(user_uuid UUID, zone_name VARCHAR)
RETURNS DECIMAL AS $$
DECLARE
  current_level DECIMAL;
BEGIN
  SELECT level INTO current_level FROM progression_levels
  WHERE user_id = user_uuid AND zone = zone_name;
  IF current_level IS NULL THEN
    PERFORM initialize_progression_levels(user_uuid);
    RETURN 3.0;
  END IF;
  RETURN current_level;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION update_progression_level(
  user_uuid UUID, zone_name VARCHAR, level_change DECIMAL,
  reason_text VARCHAR DEFAULT 'manual_adjustment',
  route_id_param UUID DEFAULT NULL, planned_workout_id_param UUID DEFAULT NULL
)
RETURNS DECIMAL AS $$
DECLARE
  old_level DECIMAL; new_level DECIMAL;
BEGIN
  SELECT level INTO old_level FROM progression_levels WHERE user_id = user_uuid AND zone = zone_name;
  IF old_level IS NULL THEN
    INSERT INTO progression_levels (user_id, zone, level) VALUES (user_uuid, zone_name, 3.0);
    old_level := 3.0;
  END IF;
  new_level := GREATEST(1.0, LEAST(10.0, old_level + level_change));
  UPDATE progression_levels SET level = new_level, last_level_change = level_change,
    last_level_change_date = NOW(), updated_at = NOW()
  WHERE user_id = user_uuid AND zone = zone_name;
  INSERT INTO progression_level_history (user_id, zone, old_level, new_level, level_change, reason, route_id, planned_workout_id)
  VALUES (user_uuid, zone_name, old_level, new_level, level_change, reason_text, route_id_param, planned_workout_id_param);
  RETURN new_level;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION increment_zone_workout_count(user_uuid UUID, zone_name VARCHAR, workout_date DATE DEFAULT CURRENT_DATE)
RETURNS VOID AS $$
BEGIN
  UPDATE progression_levels SET workouts_completed = workouts_completed + 1, last_workout_date = workout_date, updated_at = NOW()
  WHERE user_id = user_uuid AND zone = zone_name;
  IF NOT FOUND THEN
    INSERT INTO progression_levels (user_id, zone, level, workouts_completed, last_workout_date)
    VALUES (user_uuid, zone_name, 3.0, 1, workout_date);
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION calculate_level_adjustment(
  completion_percentage INTEGER, perceived_exertion INTEGER,
  workout_level DECIMAL, current_progression_level DECIMAL
)
RETURNS DECIMAL AS $$
DECLARE
  level_diff DECIMAL; adjustment DECIMAL;
BEGIN
  level_diff := workout_level - current_progression_level;
  IF completion_percentage >= 90 THEN
    adjustment := CASE WHEN perceived_exertion <= 7 THEN 0.3 WHEN perceived_exertion <= 9 THEN 0.2 ELSE 0.1 END;
  ELSIF completion_percentage >= 70 THEN
    adjustment := CASE WHEN perceived_exertion <= 8 THEN 0.1 ELSE 0.0 END;
  ELSIF completion_percentage >= 50 THEN
    adjustment := CASE WHEN perceived_exertion >= 9 THEN -0.3 ELSE -0.1 END;
  ELSE
    adjustment := -0.5;
  END IF;
  IF level_diff > 2.0 AND adjustment < 0 THEN adjustment := adjustment / 2.0; END IF;
  IF level_diff < -2.0 AND adjustment > 0 THEN adjustment := adjustment / 2.0; END IF;
  RETURN adjustment;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION apply_workout_to_progression(
  user_uuid UUID, zone_name VARCHAR, workout_level_param DECIMAL,
  completion_percentage INTEGER, perceived_exertion INTEGER,
  route_id_param UUID DEFAULT NULL, planned_workout_id_param UUID DEFAULT NULL
)
RETURNS DECIMAL AS $$
DECLARE
  current_level DECIMAL; adjustment DECIMAL; new_level DECIMAL; reason_text VARCHAR;
BEGIN
  current_level := get_progression_level_for_zone(user_uuid, zone_name);
  adjustment := calculate_level_adjustment(completion_percentage, perceived_exertion, workout_level_param, current_level);
  reason_text := CASE WHEN adjustment > 0 THEN 'workout_success'
    WHEN adjustment < 0 THEN CASE WHEN completion_percentage < 50 THEN 'workout_failure' ELSE 'workout_struggle' END
    ELSE 'no_change' END;
  new_level := update_progression_level(user_uuid, zone_name, adjustment, reason_text, route_id_param, planned_workout_id_param);
  PERFORM increment_zone_workout_count(user_uuid, zone_name);
  RETURN new_level;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_progression_history(user_uuid UUID, zone_name VARCHAR DEFAULT NULL, days_back INTEGER DEFAULT 90)
RETURNS TABLE (date TIMESTAMP, zone VARCHAR, old_level DECIMAL, new_level DECIMAL, level_change DECIMAL, reason VARCHAR) AS $$
BEGIN
  RETURN QUERY
  SELECT plh.created_at, plh.zone, plh.old_level, plh.new_level, plh.level_change, plh.reason
  FROM progression_level_history plh
  WHERE plh.user_id = user_uuid AND (zone_name IS NULL OR plh.zone = zone_name)
    AND plh.created_at >= NOW() - (days_back || ' days')::INTERVAL
  ORDER BY plh.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION seed_progression_from_rpe_data(user_uuid UUID)
RETURNS TEXT AS $$
DECLARE
  zone_record RECORD; avg_rpe DECIMAL; workout_count INTEGER; initial_level DECIMAL; zones_updated INTEGER := 0;
BEGIN
  FOR zone_record IN
    SELECT DISTINCT pw.target_zone as zone FROM planned_workouts pw
    WHERE pw.user_id = user_uuid AND pw.target_zone IS NOT NULL AND pw.completed = TRUE
  LOOP
    SELECT AVG(wf.perceived_exertion), COUNT(*) INTO avg_rpe, workout_count
    FROM workout_feedback wf
    INNER JOIN planned_workouts pw ON wf.planned_workout_id = pw.id
    WHERE pw.user_id = user_uuid AND pw.target_zone = zone_record.zone AND wf.perceived_exertion IS NOT NULL;
    IF workout_count > 0 THEN
      initial_level := CASE WHEN avg_rpe <= 5 THEN 7.0 WHEN avg_rpe <= 6 THEN 6.0 WHEN avg_rpe <= 7 THEN 5.0
        WHEN avg_rpe <= 8 THEN 4.0 WHEN avg_rpe <= 9 THEN 3.0 ELSE 2.0 END;
      INSERT INTO progression_levels (user_id, zone, level, workouts_completed)
      VALUES (user_uuid, zone_record.zone, initial_level, workout_count)
      ON CONFLICT (user_id, zone) DO UPDATE SET level = initial_level, workouts_completed = workout_count, updated_at = NOW();
      zones_updated := zones_updated + 1;
    END IF;
  END LOOP;
  PERFORM initialize_progression_levels(user_uuid);
  RETURN 'Seeded ' || zones_updated || ' zones from RPE data';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

SELECT 'Part 3 Complete: Progression Levels created' as status;
