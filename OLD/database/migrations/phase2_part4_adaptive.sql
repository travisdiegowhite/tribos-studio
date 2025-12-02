-- ============================================================================
-- Phase 2 - Part 4: Adaptive Training Tables
-- ============================================================================

-- Table: adaptation_history
CREATE TABLE IF NOT EXISTS adaptation_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  planned_workout_id UUID,
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

ALTER TABLE adaptation_history
  ADD CONSTRAINT adaptation_history_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE adaptation_history
  ADD CONSTRAINT adaptation_history_planned_workout_id_fkey
  FOREIGN KEY (planned_workout_id) REFERENCES planned_workouts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_adaptation_history_user ON adaptation_history(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_adaptation_history_workout ON adaptation_history(planned_workout_id);
CREATE INDEX IF NOT EXISTS idx_adaptation_pending ON adaptation_history(user_id, was_accepted) WHERE was_accepted IS NULL;

ALTER TABLE adaptation_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own adaptation history"
  ON adaptation_history FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own adaptation history"
  ON adaptation_history FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own adaptation history"
  ON adaptation_history FOR UPDATE USING (user_id = auth.uid());

-- Table: adaptation_settings
CREATE TABLE IF NOT EXISTS adaptation_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
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

ALTER TABLE adaptation_settings
  ADD CONSTRAINT adaptation_settings_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE adaptation_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own adaptation settings"
  ON adaptation_settings FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own adaptation settings"
  ON adaptation_settings FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own adaptation settings"
  ON adaptation_settings FOR UPDATE USING (user_id = auth.uid());

-- Comments
COMMENT ON TABLE user_ftp_history IS 'Phase 2: FTP tracking with history';
COMMENT ON TABLE training_zones IS 'Phase 2: 7 training zones calculated from FTP';
COMMENT ON TABLE progression_levels IS 'Phase 2: User fitness level (1-10) per zone';
COMMENT ON TABLE progression_level_history IS 'Phase 2: Audit log of progression changes';
COMMENT ON TABLE adaptation_history IS 'Phase 2: Workout adaptation recommendations';
COMMENT ON TABLE adaptation_settings IS 'Phase 2: Adaptive training preferences';

SELECT 'Part 4 Complete: Adaptive Training tables created' as status;
SELECT '============================================' as separator;
SELECT 'PHASE 2 INSTALLATION COMPLETE!' as final_status;
SELECT '============================================' as separator;
