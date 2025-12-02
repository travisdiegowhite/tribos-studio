-- ============================================================================
-- Phase 2 - Part 1: FTP & Training Zones ONLY
-- ============================================================================

-- Table 1: user_ftp_history
CREATE TABLE IF NOT EXISTS user_ftp_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  ftp_watts INTEGER NOT NULL CHECK (ftp_watts > 0 AND ftp_watts < 600),
  lthr_bpm INTEGER CHECK (lthr_bpm > 0 AND lthr_bpm < 220),
  test_date DATE NOT NULL,
  test_type VARCHAR(50) CHECK (test_type IN ('ramp', '20min', '8min', 'auto_detected', 'manual')),
  route_id UUID,
  notes TEXT,
  is_current BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE user_ftp_history
  ADD CONSTRAINT user_ftp_history_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE user_ftp_history
  ADD CONSTRAINT user_ftp_history_route_id_fkey
  FOREIGN KEY (route_id) REFERENCES routes(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_one_current_ftp_per_user
  ON user_ftp_history(user_id) WHERE is_current = TRUE;

CREATE INDEX IF NOT EXISTS idx_ftp_history_user_date
  ON user_ftp_history(user_id, test_date DESC);

ALTER TABLE user_ftp_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own FTP history"
  ON user_ftp_history FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own FTP history"
  ON user_ftp_history FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own FTP history"
  ON user_ftp_history FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own FTP history"
  ON user_ftp_history FOR DELETE USING (user_id = auth.uid());

-- Table 2: training_zones
CREATE TABLE IF NOT EXISTS training_zones (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
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

ALTER TABLE training_zones
  ADD CONSTRAINT training_zones_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_training_zones_user
  ON training_zones(user_id, zone_number);

ALTER TABLE training_zones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own training zones"
  ON training_zones FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own training zones"
  ON training_zones FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own training zones"
  ON training_zones FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own training zones"
  ON training_zones FOR DELETE USING (user_id = auth.uid());

SELECT 'Part 1 Complete: FTP & Training Zones tables created' as status;
