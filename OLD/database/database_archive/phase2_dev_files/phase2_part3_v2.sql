-- ============================================================================
-- Phase 2 - Part 3: Progression Levels (Version 2 - Minimal)
-- ============================================================================

-- Table: progression_levels
CREATE TABLE IF NOT EXISTS progression_levels (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
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
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
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

CREATE POLICY "Users can view their own progression history"
  ON progression_level_history FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own progression history"
  ON progression_level_history FOR INSERT WITH CHECK (user_id = auth.uid());

-- Add columns to planned_workouts
ALTER TABLE planned_workouts
  ADD COLUMN IF NOT EXISTS workout_level DECIMAL(3,1) CHECK (workout_level >= 1.0 AND workout_level <= 10.0);

ALTER TABLE planned_workouts
  ADD COLUMN IF NOT EXISTS target_zone VARCHAR(50) CHECK (target_zone IN (
    'recovery', 'endurance', 'tempo', 'sweet_spot', 'threshold', 'vo2max', 'anaerobic', 'mixed'
  ));

ALTER TABLE planned_workouts
  ADD COLUMN IF NOT EXISTS was_adapted BOOLEAN DEFAULT FALSE;

ALTER TABLE planned_workouts
  ADD COLUMN IF NOT EXISTS adaptation_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_planned_workouts_zone
  ON planned_workouts(user_id, target_zone) WHERE target_zone IS NOT NULL;

SELECT 'Part 3A Complete: Progression tables created' as status;
