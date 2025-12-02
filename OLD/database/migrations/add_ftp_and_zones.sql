-- Phase 2: FTP Management and Training Zones
-- This migration adds FTP tracking, history, and training zone configuration

-- ============================================================================
-- 1. USER FTP HISTORY
-- ============================================================================
-- Track FTP changes over time with source attribution

CREATE TABLE IF NOT EXISTS user_ftp_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  ftp_watts INTEGER NOT NULL CHECK (ftp_watts > 0 AND ftp_watts < 600),
  lthr_bpm INTEGER CHECK (lthr_bpm > 0 AND lthr_bpm < 220), -- Lactate Threshold Heart Rate
  test_date DATE NOT NULL,
  test_type VARCHAR(50) CHECK (test_type IN ('ramp', '20min', '8min', 'auto_detected', 'manual')),
  route_id UUID REFERENCES routes(id) ON DELETE SET NULL, -- Reference to test ride if applicable
  notes TEXT,
  is_current BOOLEAN DEFAULT TRUE, -- Only one should be current per user
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Ensure only one current FTP per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_current_ftp_per_user
  ON user_ftp_history(user_id)
  WHERE is_current = TRUE;

-- Index for querying FTP history
CREATE INDEX IF NOT EXISTS idx_ftp_history_user_date
  ON user_ftp_history(user_id, test_date DESC);

-- Enable Row Level Security
ALTER TABLE user_ftp_history ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own FTP history"
  ON user_ftp_history FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own FTP history"
  ON user_ftp_history FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own FTP history"
  ON user_ftp_history FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own FTP history"
  ON user_ftp_history FOR DELETE
  USING (user_id = auth.uid());

-- ============================================================================
-- 2. TRAINING ZONES CONFIGURATION
-- ============================================================================
-- Store custom training zones (power and heart rate) per user

CREATE TABLE IF NOT EXISTS training_zones (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  zone_name VARCHAR(50) NOT NULL CHECK (zone_name IN (
    'recovery', 'endurance', 'tempo', 'sweet_spot', 'threshold', 'vo2max', 'anaerobic'
  )),
  zone_number INTEGER CHECK (zone_number >= 1 AND zone_number <= 7),

  -- Power zones (in watts)
  power_min INTEGER CHECK (power_min >= 0),
  power_max INTEGER CHECK (power_max >= power_min),

  -- Heart rate zones (in bpm)
  hr_min INTEGER CHECK (hr_min >= 0 AND hr_min < 220),
  hr_max INTEGER CHECK (hr_max >= hr_min AND hr_max < 220),

  -- Percentage of FTP/LTHR
  ftp_percent_min DECIMAL(4,1) CHECK (ftp_percent_min >= 0 AND ftp_percent_min <= 200),
  ftp_percent_max DECIMAL(4,1) CHECK (ftp_percent_max >= ftp_percent_min AND ftp_percent_max <= 200),
  lthr_percent_min DECIMAL(4,1) CHECK (lthr_percent_min >= 0 AND lthr_percent_min <= 120),
  lthr_percent_max DECIMAL(4,1) CHECK (lthr_percent_max >= lthr_percent_min AND lthr_percent_max <= 120),

  description TEXT,
  color VARCHAR(7), -- Hex color for UI visualization

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(user_id, zone_name)
);

-- Index for querying zones
CREATE INDEX IF NOT EXISTS idx_training_zones_user
  ON training_zones(user_id, zone_number);

-- Enable Row Level Security
ALTER TABLE training_zones ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own training zones"
  ON training_zones FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own training zones"
  ON training_zones FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own training zones"
  ON training_zones FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own training zones"
  ON training_zones FOR DELETE
  USING (user_id = auth.uid());

-- ============================================================================
-- 3. FUNCTIONS
-- ============================================================================

-- Function to get current FTP for a user
CREATE OR REPLACE FUNCTION get_current_ftp(user_uuid UUID)
RETURNS INTEGER AS $$
BEGIN
  RETURN (
    SELECT ftp_watts
    FROM user_ftp_history
    WHERE user_id = user_uuid
      AND is_current = TRUE
    LIMIT 1
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get current LTHR for a user
CREATE OR REPLACE FUNCTION get_current_lthr(user_uuid UUID)
RETURNS INTEGER AS $$
BEGIN
  RETURN (
    SELECT lthr_bpm
    FROM user_ftp_history
    WHERE user_id = user_uuid
      AND is_current = TRUE
    LIMIT 1
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to set new FTP (marks all others as not current)
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
  -- Mark all existing FTP entries as not current
  UPDATE user_ftp_history
  SET is_current = FALSE, updated_at = NOW()
  WHERE user_id = user_uuid;

  -- Insert new FTP entry
  INSERT INTO user_ftp_history (
    user_id,
    ftp_watts,
    lthr_bpm,
    test_date,
    test_type,
    route_id,
    notes,
    is_current
  )
  VALUES (
    user_uuid,
    new_ftp,
    new_lthr,
    test_date_param,
    test_type_param,
    route_id_param,
    notes_param,
    TRUE
  )
  RETURNING id INTO new_ftp_id;

  RETURN new_ftp_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to initialize default training zones based on FTP/LTHR
CREATE OR REPLACE FUNCTION initialize_training_zones(
  user_uuid UUID,
  ftp_watts INTEGER,
  lthr_bpm INTEGER DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
  -- Delete existing zones
  DELETE FROM training_zones WHERE user_id = user_uuid;

  -- Zone 1: Recovery (0-55% FTP, 0-68% LTHR)
  INSERT INTO training_zones (
    user_id, zone_name, zone_number,
    power_min, power_max, ftp_percent_min, ftp_percent_max,
    hr_min, hr_max, lthr_percent_min, lthr_percent_max,
    description, color
  ) VALUES (
    user_uuid, 'recovery', 1,
    0, ROUND(ftp_watts * 0.55), 0, 55,
    CASE WHEN lthr_bpm IS NOT NULL THEN 0 ELSE NULL END,
    CASE WHEN lthr_bpm IS NOT NULL THEN ROUND(lthr_bpm * 0.68) ELSE NULL END,
    0, 68,
    'Active recovery, very easy spinning',
    '#51cf66' -- Green
  );

  -- Zone 2: Endurance (56-75% FTP, 69-83% LTHR)
  INSERT INTO training_zones (
    user_id, zone_name, zone_number,
    power_min, power_max, ftp_percent_min, ftp_percent_max,
    hr_min, hr_max, lthr_percent_min, lthr_percent_max,
    description, color
  ) VALUES (
    user_uuid, 'endurance', 2,
    ROUND(ftp_watts * 0.56), ROUND(ftp_watts * 0.75), 56, 75,
    CASE WHEN lthr_bpm IS NOT NULL THEN ROUND(lthr_bpm * 0.69) ELSE NULL END,
    CASE WHEN lthr_bpm IS NOT NULL THEN ROUND(lthr_bpm * 0.83) ELSE NULL END,
    69, 83,
    'Aerobic base building, conversational pace',
    '#4dabf7' -- Blue
  );

  -- Zone 3: Tempo (76-87% FTP, 84-94% LTHR)
  INSERT INTO training_zones (
    user_id, zone_name, zone_number,
    power_min, power_max, ftp_percent_min, ftp_percent_max,
    hr_min, hr_max, lthr_percent_min, lthr_percent_max,
    description, color
  ) VALUES (
    user_uuid, 'tempo', 3,
    ROUND(ftp_watts * 0.76), ROUND(ftp_watts * 0.87), 76, 87,
    CASE WHEN lthr_bpm IS NOT NULL THEN ROUND(lthr_bpm * 0.84) ELSE NULL END,
    CASE WHEN lthr_bpm IS NOT NULL THEN ROUND(lthr_bpm * 0.94) ELSE NULL END,
    84, 94,
    'Moderately hard, sustained effort',
    '#ffd43b' -- Yellow
  );

  -- Zone 4: Sweet Spot (88-93% FTP, 95-105% LTHR)
  INSERT INTO training_zones (
    user_id, zone_name, zone_number,
    power_min, power_max, ftp_percent_min, ftp_percent_max,
    hr_min, hr_max, lthr_percent_min, lthr_percent_max,
    description, color
  ) VALUES (
    user_uuid, 'sweet_spot', 4,
    ROUND(ftp_watts * 0.88), ROUND(ftp_watts * 0.93), 88, 93,
    CASE WHEN lthr_bpm IS NOT NULL THEN ROUND(lthr_bpm * 0.95) ELSE NULL END,
    CASE WHEN lthr_bpm IS NOT NULL THEN ROUND(lthr_bpm * 1.05) ELSE NULL END,
    95, 105,
    'High aerobic training, efficient fitness gains',
    '#ff922b' -- Orange
  );

  -- Zone 5: Threshold (94-105% FTP, 100-102% LTHR)
  INSERT INTO training_zones (
    user_id, zone_name, zone_number,
    power_min, power_max, ftp_percent_min, ftp_percent_max,
    hr_min, hr_max, lthr_percent_min, lthr_percent_max,
    description, color
  ) VALUES (
    user_uuid, 'threshold', 5,
    ROUND(ftp_watts * 0.94), ROUND(ftp_watts * 1.05), 94, 105,
    CASE WHEN lthr_bpm IS NOT NULL THEN ROUND(lthr_bpm * 1.00) ELSE NULL END,
    CASE WHEN lthr_bpm IS NOT NULL THEN ROUND(lthr_bpm * 1.02) ELSE NULL END,
    100, 102,
    'Lactate threshold, ~1 hour sustainable',
    '#ff6b6b' -- Red
  );

  -- Zone 6: VO2max (106-120% FTP, 103-106% LTHR)
  INSERT INTO training_zones (
    user_id, zone_name, zone_number,
    power_min, power_max, ftp_percent_min, ftp_percent_max,
    hr_min, hr_max, lthr_percent_min, lthr_percent_max,
    description, color
  ) VALUES (
    user_uuid, 'vo2max', 6,
    ROUND(ftp_watts * 1.06), ROUND(ftp_watts * 1.20), 106, 120,
    CASE WHEN lthr_bpm IS NOT NULL THEN ROUND(lthr_bpm * 1.03) ELSE NULL END,
    CASE WHEN lthr_bpm IS NOT NULL THEN ROUND(lthr_bpm * 1.06) ELSE NULL END,
    103, 106,
    'Maximal aerobic power, 3-8 min intervals',
    '#cc5de8' -- Purple
  );

  -- Zone 7: Anaerobic (121%+ FTP, 106%+ LTHR)
  INSERT INTO training_zones (
    user_id, zone_name, zone_number,
    power_min, power_max, ftp_percent_min, ftp_percent_max,
    hr_min, hr_max, lthr_percent_min, lthr_percent_max,
    description, color
  ) VALUES (
    user_uuid, 'anaerobic', 7,
    ROUND(ftp_watts * 1.21), ROUND(ftp_watts * 1.50), 121, 150,
    CASE WHEN lthr_bpm IS NOT NULL THEN ROUND(lthr_bpm * 1.06) ELSE NULL END,
    CASE WHEN lthr_bpm IS NOT NULL THEN 220 ELSE NULL END,
    106, 110,
    'Sprints and neuromuscular power, <3 min',
    '#862e9c' -- Dark purple
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to auto-create training zones when FTP is set
CREATE OR REPLACE FUNCTION auto_create_zones_on_ftp_insert()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_current = TRUE THEN
    PERFORM initialize_training_zones(NEW.user_id, NEW.ftp_watts, NEW.lthr_bpm);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_auto_create_zones
  AFTER INSERT ON user_ftp_history
  FOR EACH ROW
  WHEN (NEW.is_current = TRUE)
  EXECUTE FUNCTION auto_create_zones_on_ftp_insert();

-- ============================================================================
-- 4. HELPER FUNCTIONS
-- ============================================================================

-- Get FTP history for a user
CREATE OR REPLACE FUNCTION get_ftp_history(
  user_uuid UUID,
  limit_count INTEGER DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  ftp_watts INTEGER,
  lthr_bpm INTEGER,
  test_date DATE,
  test_type VARCHAR(50),
  is_current BOOLEAN,
  created_at TIMESTAMP
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    h.id,
    h.ftp_watts,
    h.lthr_bpm,
    h.test_date,
    h.test_type,
    h.is_current,
    h.created_at
  FROM user_ftp_history h
  WHERE h.user_id = user_uuid
  ORDER BY h.test_date DESC, h.created_at DESC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get training zones for a user
CREATE OR REPLACE FUNCTION get_user_training_zones(user_uuid UUID)
RETURNS TABLE (
  zone_name VARCHAR(50),
  zone_number INTEGER,
  power_min INTEGER,
  power_max INTEGER,
  hr_min INTEGER,
  hr_max INTEGER,
  ftp_percent_min DECIMAL(4,1),
  ftp_percent_max DECIMAL(4,1),
  description TEXT,
  color VARCHAR(7)
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    tz.zone_name,
    tz.zone_number,
    tz.power_min,
    tz.power_max,
    tz.hr_min,
    tz.hr_max,
    tz.ftp_percent_min,
    tz.ftp_percent_max,
    tz.description,
    tz.color
  FROM training_zones tz
  WHERE tz.user_id = user_uuid
  ORDER BY tz.zone_number;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Calculate which zone a power value falls into
CREATE OR REPLACE FUNCTION get_zone_for_power(
  user_uuid UUID,
  power_watts INTEGER
)
RETURNS VARCHAR(50) AS $$
DECLARE
  zone_result VARCHAR(50);
BEGIN
  SELECT zone_name INTO zone_result
  FROM training_zones
  WHERE user_id = user_uuid
    AND power_watts >= power_min
    AND power_watts <= power_max
  ORDER BY zone_number
  LIMIT 1;

  RETURN COALESCE(zone_result, 'unknown');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE user_ftp_history IS 'Tracks user FTP (Functional Threshold Power) and LTHR (Lactate Threshold Heart Rate) over time';
COMMENT ON TABLE training_zones IS 'User-specific training zones calculated from FTP/LTHR';
COMMENT ON FUNCTION get_current_ftp IS 'Returns the current FTP for a user';
COMMENT ON FUNCTION set_current_ftp IS 'Sets a new FTP and marks all others as not current';
COMMENT ON FUNCTION initialize_training_zones IS 'Creates default 7-zone training zones based on FTP/LTHR';
COMMENT ON FUNCTION get_zone_for_power IS 'Determines which training zone a given power value falls into';
