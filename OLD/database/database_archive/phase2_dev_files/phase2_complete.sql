-- ============================================================================
-- Phase 2: Adaptive Intelligence - Complete Migration
-- Run this file to install all Phase 2 features
-- ============================================================================
-- Order: FTP & Zones → Progression Levels → Adaptive Training
-- ============================================================================

-- ============================================================================
-- PART 1: FTP MANAGEMENT & TRAINING ZONES
-- ============================================================================

-- 1.1: USER FTP HISTORY
CREATE TABLE IF NOT EXISTS user_ftp_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  ftp_watts INTEGER NOT NULL CHECK (ftp_watts > 0 AND ftp_watts < 600),
  lthr_bpm INTEGER CHECK (lthr_bpm > 0 AND lthr_bpm < 220),
  test_date DATE NOT NULL,
  test_type VARCHAR(50) CHECK (test_type IN ('ramp', '20min', '8min', 'auto_detected', 'manual')),
  route_id UUID REFERENCES routes(id) ON DELETE SET NULL,
  notes TEXT,
  is_current BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_one_current_ftp_per_user
  ON user_ftp_history(user_id) WHERE is_current = TRUE;

CREATE INDEX IF NOT EXISTS idx_ftp_history_user_date
  ON user_ftp_history(user_id, test_date DESC);

ALTER TABLE user_ftp_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own FTP history" ON user_ftp_history;
CREATE POLICY "Users can view their own FTP history"
  ON user_ftp_history FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert their own FTP history" ON user_ftp_history;
CREATE POLICY "Users can insert their own FTP history"
  ON user_ftp_history FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update their own FTP history" ON user_ftp_history;
CREATE POLICY "Users can update their own FTP history"
  ON user_ftp_history FOR UPDATE USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete their own FTP history" ON user_ftp_history;
CREATE POLICY "Users can delete their own FTP history"
  ON user_ftp_history FOR DELETE USING (user_id = auth.uid());

-- 1.2: TRAINING ZONES
CREATE TABLE IF NOT EXISTS training_zones (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  zone_name VARCHAR(50) NOT NULL CHECK (zone_name IN (
    'recovery', 'endurance', 'tempo', 'sweet_spot', 'threshold', 'vo2max', 'anaerobic'
  )),
  zone_number INTEGER CHECK (zone_number >= 1 AND zone_number <= 7),
  power_min INTEGER CHECK (power_min >= 0),
  power_max INTEGER CHECK (power_max >= power_min),
  hr_min INTEGER CHECK (hr_min >= 0 AND hr_min < 220),
  hr_max INTEGER CHECK (hr_max >= hr_min AND hr_max < 220),
  ftp_percent_min DECIMAL(4,1) CHECK (ftp_percent_min >= 0 AND ftp_percent_min <= 200),
  ftp_percent_max DECIMAL(4,1) CHECK (ftp_percent_max >= ftp_percent_min AND ftp_percent_max <= 200),
  lthr_percent_min DECIMAL(4,1) CHECK (lthr_percent_min >= 0 AND lthr_percent_min <= 120),
  lthr_percent_max DECIMAL(4,1) CHECK (lthr_percent_max >= lthr_percent_min AND lthr_percent_max <= 120),
  description TEXT,
  color VARCHAR(7),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, zone_name)
);

CREATE INDEX IF NOT EXISTS idx_training_zones_user
  ON training_zones(user_id, zone_number);

ALTER TABLE training_zones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own training zones" ON training_zones;
CREATE POLICY "Users can view their own training zones"
  ON training_zones FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert their own training zones" ON training_zones;
CREATE POLICY "Users can insert their own training zones"
  ON training_zones FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update their own training zones" ON training_zones;
CREATE POLICY "Users can update their own training zones"
  ON training_zones FOR UPDATE USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete their own training zones" ON training_zones;
CREATE POLICY "Users can delete their own training zones"
  ON training_zones FOR DELETE USING (user_id = auth.uid());

-- 1.3: FTP FUNCTIONS
CREATE OR REPLACE FUNCTION get_current_ftp(user_uuid UUID)
RETURNS INTEGER AS $$
BEGIN
  RETURN (
    SELECT ftp_watts FROM user_ftp_history
    WHERE user_id = user_uuid AND is_current = TRUE
    LIMIT 1
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_current_lthr(user_uuid UUID)
RETURNS INTEGER AS $$
BEGIN
  RETURN (
    SELECT lthr_bpm FROM user_ftp_history
    WHERE user_id = user_uuid AND is_current = TRUE
    LIMIT 1
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION set_current_ftp(
  user_uuid UUID,
  new_ftp INTEGER,
  new_lthr INTEGER DEFAULT NULL,
  test_date_param DATE DEFAULT CURRENT_DATE,
  test_type_param VARCHAR(50) DEFAULT 'manual',
  route_id_param UUID DEFAULT NULL,
  notes_param TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  new_ftp_id UUID;
BEGIN
  UPDATE user_ftp_history SET is_current = FALSE, updated_at = NOW()
  WHERE user_id = user_uuid;

  INSERT INTO user_ftp_history (
    user_id, ftp_watts, lthr_bpm, test_date, test_type, route_id, notes, is_current
  ) VALUES (
    user_uuid, new_ftp, new_lthr, test_date_param, test_type_param, route_id_param, notes_param, TRUE
  ) RETURNING id INTO new_ftp_id;

  RETURN new_ftp_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION initialize_training_zones(
  user_uuid UUID,
  ftp_watts INTEGER,
  lthr_bpm INTEGER DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
  DELETE FROM training_zones WHERE user_id = user_uuid;

  INSERT INTO training_zones (user_id, zone_name, zone_number, power_min, power_max, ftp_percent_min, ftp_percent_max, hr_min, hr_max, lthr_percent_min, lthr_percent_max, description, color) VALUES
  (user_uuid, 'recovery', 1, 0, ROUND(ftp_watts * 0.55), 0, 55, CASE WHEN lthr_bpm IS NOT NULL THEN 0 END, CASE WHEN lthr_bpm IS NOT NULL THEN ROUND(lthr_bpm * 0.68) END, 0, 68, 'Active recovery, very easy spinning', '#51cf66'),
  (user_uuid, 'endurance', 2, ROUND(ftp_watts * 0.56), ROUND(ftp_watts * 0.75), 56, 75, CASE WHEN lthr_bpm IS NOT NULL THEN ROUND(lthr_bpm * 0.69) END, CASE WHEN lthr_bpm IS NOT NULL THEN ROUND(lthr_bpm * 0.83) END, 69, 83, 'Aerobic base building, conversational pace', '#4dabf7'),
  (user_uuid, 'tempo', 3, ROUND(ftp_watts * 0.76), ROUND(ftp_watts * 0.87), 76, 87, CASE WHEN lthr_bpm IS NOT NULL THEN ROUND(lthr_bpm * 0.84) END, CASE WHEN lthr_bpm IS NOT NULL THEN ROUND(lthr_bpm * 0.94) END, 84, 94, 'Moderately hard, sustained effort', '#ffd43b'),
  (user_uuid, 'sweet_spot', 4, ROUND(ftp_watts * 0.88), ROUND(ftp_watts * 0.93), 88, 93, CASE WHEN lthr_bpm IS NOT NULL THEN ROUND(lthr_bpm * 0.95) END, CASE WHEN lthr_bpm IS NOT NULL THEN ROUND(lthr_bpm * 1.05) END, 95, 105, 'High aerobic training, efficient fitness gains', '#ff922b'),
  (user_uuid, 'threshold', 5, ROUND(ftp_watts * 0.94), ROUND(ftp_watts * 1.05), 94, 105, CASE WHEN lthr_bpm IS NOT NULL THEN ROUND(lthr_bpm * 1.00) END, CASE WHEN lthr_bpm IS NOT NULL THEN ROUND(lthr_bpm * 1.02) END, 100, 102, 'Lactate threshold, ~1 hour sustainable', '#ff6b6b'),
  (user_uuid, 'vo2max', 6, ROUND(ftp_watts * 1.06), ROUND(ftp_watts * 1.20), 106, 120, CASE WHEN lthr_bpm IS NOT NULL THEN ROUND(lthr_bpm * 1.03) END, CASE WHEN lthr_bpm IS NOT NULL THEN ROUND(lthr_bpm * 1.06) END, 103, 106, 'Maximal aerobic power, 3-8 min intervals', '#cc5de8'),
  (user_uuid, 'anaerobic', 7, ROUND(ftp_watts * 1.21), ROUND(ftp_watts * 1.50), 121, 150, CASE WHEN lthr_bpm IS NOT NULL THEN ROUND(lthr_bpm * 1.06) END, CASE WHEN lthr_bpm IS NOT NULL THEN 220 END, 106, 110, 'Sprints and neuromuscular power, <3 min', '#862e9c');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION auto_create_zones_on_ftp_insert()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_current = TRUE THEN
    PERFORM initialize_training_zones(NEW.user_id, NEW.ftp_watts, NEW.lthr_bpm);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_auto_create_zones ON user_ftp_history;
CREATE TRIGGER trigger_auto_create_zones
  AFTER INSERT ON user_ftp_history
  FOR EACH ROW
  WHEN (NEW.is_current = TRUE)
  EXECUTE FUNCTION auto_create_zones_on_ftp_insert();

CREATE OR REPLACE FUNCTION get_ftp_history(user_uuid UUID, limit_count INTEGER DEFAULT 10)
RETURNS TABLE (id UUID, ftp_watts INTEGER, lthr_bpm INTEGER, test_date DATE, test_type VARCHAR, is_current BOOLEAN, created_at TIMESTAMP) AS $$
BEGIN
  RETURN QUERY
  SELECT h.id, h.ftp_watts, h.lthr_bpm, h.test_date, h.test_type, h.is_current, h.created_at
  FROM user_ftp_history h
  WHERE h.user_id = user_uuid
  ORDER BY h.test_date DESC, h.created_at DESC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_user_training_zones(user_uuid UUID)
RETURNS TABLE (zone_name VARCHAR, zone_number INTEGER, power_min INTEGER, power_max INTEGER, hr_min INTEGER, hr_max INTEGER, ftp_percent_min DECIMAL, ftp_percent_max DECIMAL, description TEXT, color VARCHAR) AS $$
BEGIN
  RETURN QUERY
  SELECT tz.zone_name, tz.zone_number, tz.power_min, tz.power_max, tz.hr_min, tz.hr_max, tz.ftp_percent_min, tz.ftp_percent_max, tz.description, tz.color
  FROM training_zones tz
  WHERE tz.user_id = user_uuid
  ORDER BY tz.zone_number;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_zone_for_power(user_uuid UUID, power_watts INTEGER)
RETURNS VARCHAR AS $$
DECLARE
  zone_result VARCHAR;
BEGIN
  SELECT zone_name INTO zone_result
  FROM training_zones
  WHERE user_id = user_uuid AND power_watts >= power_min AND power_watts <= power_max
  ORDER BY zone_number LIMIT 1;
  RETURN COALESCE(zone_result, 'unknown');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- PART 2: PROGRESSION LEVELS
-- ============================================================================

-- 2.1: PROGRESSION LEVELS TABLE
CREATE TABLE IF NOT EXISTS progression_levels (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
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

CREATE INDEX IF NOT EXISTS idx_progression_levels_user ON progression_levels(user_id);
CREATE INDEX IF NOT EXISTS idx_progression_levels_zone ON progression_levels(user_id, zone);

ALTER TABLE progression_levels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own progression levels" ON progression_levels;
CREATE POLICY "Users can view their own progression levels"
  ON progression_levels FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert their own progression levels" ON progression_levels;
CREATE POLICY "Users can insert their own progression levels"
  ON progression_levels FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update their own progression levels" ON progression_levels;
CREATE POLICY "Users can update their own progression levels"
  ON progression_levels FOR UPDATE USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete their own progression levels" ON progression_levels;
CREATE POLICY "Users can delete their own progression levels"
  ON progression_levels FOR DELETE USING (user_id = auth.uid());

-- 2.2: PROGRESSION LEVEL HISTORY
CREATE TABLE IF NOT EXISTS progression_level_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  zone VARCHAR(50) NOT NULL,
  old_level DECIMAL(3,1),
  new_level DECIMAL(3,1) NOT NULL,
  level_change DECIMAL(3,1),
  reason VARCHAR(100),
  route_id UUID REFERENCES routes(id) ON DELETE SET NULL,
  planned_workout_id UUID REFERENCES planned_workouts(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_progression_history_user
  ON progression_level_history(user_id, zone, created_at DESC);

ALTER TABLE progression_level_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own progression history" ON progression_level_history;
CREATE POLICY "Users can view their own progression history"
  ON progression_level_history FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert their own progression history" ON progression_level_history;
CREATE POLICY "Users can insert their own progression history"
  ON progression_level_history FOR INSERT WITH CHECK (user_id = auth.uid());

-- 2.3: ADD COLUMNS TO PLANNED_WORKOUTS
ALTER TABLE planned_workouts
  ADD COLUMN IF NOT EXISTS workout_level DECIMAL(3,1) CHECK (workout_level >= 1.0 AND workout_level <= 10.0),
  ADD COLUMN IF NOT EXISTS target_zone VARCHAR(50) CHECK (target_zone IN (
    'recovery', 'endurance', 'tempo', 'sweet_spot', 'threshold', 'vo2max', 'anaerobic', 'mixed'
  )),
  ADD COLUMN IF NOT EXISTS was_adapted BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS adaptation_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_planned_workouts_zone
  ON planned_workouts(user_id, target_zone) WHERE target_zone IS NOT NULL;

-- 2.4: PROGRESSION LEVEL FUNCTIONS
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

-- ============================================================================
-- PART 3: ADAPTIVE TRAINING (Simplified - core tables only)
-- ============================================================================

-- 3.1: ADAPTATION HISTORY
CREATE TABLE IF NOT EXISTS adaptation_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  planned_workout_id UUID REFERENCES planned_workouts(id) ON DELETE SET NULL,
  old_workout_level DECIMAL(3,1),
  new_workout_level DECIMAL(3,1),
  level_change DECIMAL(3,1),
  adaptation_type VARCHAR(50) CHECK (adaptation_type IN ('increase', 'decrease', 'substitute', 'skip', 'reschedule', 'no_change')),
  reason TEXT,
  tsb_value DECIMAL(5,1),
  recent_completion_rate DECIMAL(4,1),
  zone_progression_level DECIMAL(3,1),
  recent_avg_rpe DECIMAL(3,1),
  was_accepted BOOLEAN DEFAULT NULL,
  user_feedback TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  accepted_at TIMESTAMP,
  rejected_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_adaptation_history_user ON adaptation_history(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_adaptation_history_workout ON adaptation_history(planned_workout_id);
CREATE INDEX IF NOT EXISTS idx_adaptation_pending ON adaptation_history(user_id, was_accepted) WHERE was_accepted IS NULL;

ALTER TABLE adaptation_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own adaptation history" ON adaptation_history;
CREATE POLICY "Users can view their own adaptation history"
  ON adaptation_history FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert their own adaptation history" ON adaptation_history;
CREATE POLICY "Users can insert their own adaptation history"
  ON adaptation_history FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update their own adaptation history" ON adaptation_history;
CREATE POLICY "Users can update their own adaptation history"
  ON adaptation_history FOR UPDATE USING (user_id = auth.uid());

-- 3.2: ADAPTATION SETTINGS
CREATE TABLE IF NOT EXISTS adaptation_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
  adaptive_enabled BOOLEAN DEFAULT TRUE,
  auto_apply BOOLEAN DEFAULT FALSE,
  adaptation_sensitivity VARCHAR(20) DEFAULT 'moderate' CHECK (adaptation_sensitivity IN ('conservative', 'moderate', 'aggressive')),
  min_days_before_workout INTEGER DEFAULT 2 CHECK (min_days_before_workout >= 0),
  tsb_fatigued_threshold DECIMAL(5,1) DEFAULT -30,
  tsb_fresh_threshold DECIMAL(5,1) DEFAULT 5,
  notify_on_adaptation BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE adaptation_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own adaptation settings" ON adaptation_settings;
CREATE POLICY "Users can view their own adaptation settings"
  ON adaptation_settings FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert their own adaptation settings" ON adaptation_settings;
CREATE POLICY "Users can insert their own adaptation settings"
  ON adaptation_settings FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update their own adaptation settings" ON adaptation_settings;
CREATE POLICY "Users can update their own adaptation settings"
  ON adaptation_settings FOR UPDATE USING (user_id = auth.uid());

-- ============================================================================
-- COMPLETION
-- ============================================================================

COMMENT ON TABLE user_ftp_history IS 'Phase 2: FTP tracking with history';
COMMENT ON TABLE training_zones IS 'Phase 2: 7 training zones calculated from FTP';
COMMENT ON TABLE progression_levels IS 'Phase 2: User fitness level (1-10) per zone';
COMMENT ON TABLE progression_level_history IS 'Phase 2: Audit log of progression changes';
COMMENT ON TABLE adaptation_history IS 'Phase 2: Workout adaptation recommendations';
COMMENT ON TABLE adaptation_settings IS 'Phase 2: Adaptive training preferences';
