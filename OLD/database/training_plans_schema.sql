-- Training Plans Schema for Phase 1
-- Adds structured training plan support with workout templates and progress tracking

-- ============================================================
-- TRAINING PLANS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS training_plans (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  goal_event_date DATE,
  goal_type TEXT NOT NULL CHECK (goal_type IN ('endurance', 'climbing', 'racing', 'general_fitness', 'century', 'gran_fondo')),
  fitness_level TEXT NOT NULL CHECK (fitness_level IN ('beginner', 'intermediate', 'advanced')),
  hours_per_week INTEGER NOT NULL CHECK (hours_per_week > 0 AND hours_per_week <= 40),
  duration_weeks INTEGER NOT NULL CHECK (duration_weeks > 0 AND duration_weeks <= 52),
  current_week INTEGER DEFAULT 1,
  current_phase TEXT NOT NULL CHECK (current_phase IN ('base', 'build', 'peak', 'taper', 'recovery')),
  ftp INTEGER, -- Functional Threshold Power (watts)
  max_heart_rate INTEGER,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'cancelled')),
  started_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- ============================================================
-- PLANNED WORKOUTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS planned_workouts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  plan_id UUID REFERENCES training_plans(id) ON DELETE CASCADE NOT NULL,
  week_number INTEGER NOT NULL CHECK (week_number > 0),
  day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6), -- 0=Sunday, 6=Saturday
  workout_type TEXT NOT NULL CHECK (workout_type IN ('rest', 'recovery', 'endurance', 'tempo', 'sweet_spot', 'threshold', 'vo2max', 'hill_repeats', 'intervals', 'long_ride')),
  target_tss INTEGER CHECK (target_tss >= 0 AND target_tss <= 500),
  target_duration INTEGER NOT NULL CHECK (target_duration >= 0), -- minutes (0 for rest days)
  target_zone DECIMAL CHECK (target_zone >= 1 AND target_zone <= 5),
  terrain_preference TEXT CHECK (terrain_preference IN ('flat', 'rolling', 'hilly', 'mixed')),
  description TEXT,
  completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMP WITH TIME ZONE,
  route_id UUID REFERENCES routes(id) ON DELETE SET NULL,
  actual_tss INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- ============================================================
-- TRAINING METRICS TABLE (Daily aggregates)
-- ============================================================
CREATE TABLE IF NOT EXISTS training_metrics (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  date DATE NOT NULL,
  daily_tss INTEGER DEFAULT 0,
  ctl DECIMAL, -- Chronic Training Load (42-day exponentially weighted average)
  atl DECIMAL, -- Acute Training Load (7-day exponentially weighted average)
  tsb DECIMAL, -- Training Stress Balance (CTL - ATL)
  weekly_volume_hours DECIMAL, -- Total hours for the week
  weekly_elevation_gain INTEGER, -- Total elevation for the week
  calculated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id, date)
);

-- ============================================================
-- WORKOUT TEMPLATES TABLE (Predefined workout structures)
-- ============================================================
CREATE TABLE IF NOT EXISTS workout_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  workout_type TEXT NOT NULL,
  description TEXT,
  structure JSONB NOT NULL, -- Detailed workout structure
  target_tss INTEGER,
  duration INTEGER, -- minutes
  terrain_type TEXT,
  difficulty_level TEXT CHECK (difficulty_level IN ('beginner', 'intermediate', 'advanced')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- ============================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_training_plans_user ON training_plans(user_id);
CREATE INDEX IF NOT EXISTS idx_training_plans_status ON training_plans(status);
CREATE INDEX IF NOT EXISTS idx_planned_workouts_plan ON planned_workouts(plan_id);
CREATE INDEX IF NOT EXISTS idx_planned_workouts_week ON planned_workouts(plan_id, week_number);
CREATE INDEX IF NOT EXISTS idx_training_metrics_user_date ON training_metrics(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_workout_templates_type ON workout_templates(workout_type);

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================
ALTER TABLE training_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE planned_workouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout_templates ENABLE ROW LEVEL SECURITY;

-- Training Plans Policies
CREATE POLICY "Users can view own training plans"
  ON training_plans FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own training plans"
  ON training_plans FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own training plans"
  ON training_plans FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own training plans"
  ON training_plans FOR DELETE
  USING (auth.uid() = user_id);

-- Planned Workouts Policies
CREATE POLICY "Users can view own planned workouts"
  ON planned_workouts FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM training_plans
    WHERE training_plans.id = planned_workouts.plan_id
    AND training_plans.user_id = auth.uid()
  ));

CREATE POLICY "Users can create own planned workouts"
  ON planned_workouts FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM training_plans
    WHERE training_plans.id = planned_workouts.plan_id
    AND training_plans.user_id = auth.uid()
  ));

CREATE POLICY "Users can update own planned workouts"
  ON planned_workouts FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM training_plans
    WHERE training_plans.id = planned_workouts.plan_id
    AND training_plans.user_id = auth.uid()
  ));

CREATE POLICY "Users can delete own planned workouts"
  ON planned_workouts FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM training_plans
    WHERE training_plans.id = planned_workouts.plan_id
    AND training_plans.user_id = auth.uid()
  ));

-- Training Metrics Policies
CREATE POLICY "Users can view own training metrics"
  ON training_metrics FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own training metrics"
  ON training_metrics FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own training metrics"
  ON training_metrics FOR UPDATE
  USING (auth.uid() = user_id);

-- Workout Templates Policies (public read)
CREATE POLICY "Anyone can view workout templates"
  ON workout_templates FOR SELECT
  USING (true);

-- ============================================================
-- SEED DATA: Default Workout Templates
-- ============================================================
INSERT INTO workout_templates (name, workout_type, description, structure, target_tss, duration, terrain_type, difficulty_level) VALUES
(
  'Easy Recovery Ride',
  'recovery',
  'Low intensity recovery ride in Zone 1-2',
  '{
    "warmup": {"duration": 5, "zone": 1},
    "main": [{"duration": 30, "zone": 2}],
    "cooldown": {"duration": 5, "zone": 1}
  }',
  30,
  40,
  'flat',
  'beginner'
),
(
  'Endurance Base Build',
  'endurance',
  'Zone 2 endurance ride for aerobic base building',
  '{
    "warmup": {"duration": 10, "zone": 1},
    "main": [{"duration": 90, "zone": 2}],
    "cooldown": {"duration": 10, "zone": 1}
  }',
  75,
  110,
  'flat',
  'intermediate'
),
(
  'Sweet Spot Intervals',
  'sweet_spot',
  '3x15 min sweet spot intervals with 5 min recovery',
  '{
    "warmup": {"duration": 10, "zone": 1},
    "intervals": {
      "sets": 3,
      "work": {"duration": 15, "zone": 3.5, "intensity": "sweet_spot"},
      "rest": {"duration": 5, "zone": 1}
    },
    "cooldown": {"duration": 10, "zone": 1}
  }',
  85,
  70,
  'flat',
  'intermediate'
),
(
  'VO2 Max Intervals',
  'vo2max',
  '5x5 min VO2 max efforts with 5 min recovery',
  '{
    "warmup": {"duration": 15, "zone": 2},
    "intervals": {
      "sets": 5,
      "work": {"duration": 5, "zone": 5, "intensity": "vo2max"},
      "rest": {"duration": 5, "zone": 1}
    },
    "cooldown": {"duration": 10, "zone": 1}
  }',
  95,
  75,
  'flat',
  'advanced'
),
(
  'Hill Repeats',
  'hill_repeats',
  '6x3 min hill climbs at threshold with recovery descents',
  '{
    "warmup": {"duration": 15, "zone": 2},
    "intervals": {
      "sets": 6,
      "work": {"duration": 3, "zone": 4, "intensity": "threshold", "terrain": "climb_4-7%"},
      "rest": {"duration": 5, "zone": 1, "terrain": "descent"}
    },
    "cooldown": {"duration": 10, "zone": 1}
  }',
  80,
  70,
  'hilly',
  'advanced'
),
(
  'Tempo Ride',
  'tempo',
  'Sustained tempo effort in Zone 3',
  '{
    "warmup": {"duration": 10, "zone": 2},
    "main": [{"duration": 40, "zone": 3}],
    "cooldown": {"duration": 10, "zone": 1}
  }',
  65,
  60,
  'rolling',
  'intermediate'
),
(
  'Long Endurance Ride',
  'long_ride',
  'Extended Zone 2 ride for endurance building',
  '{
    "warmup": {"duration": 15, "zone": 1},
    "main": [{"duration": 150, "zone": 2}],
    "cooldown": {"duration": 15, "zone": 1}
  }',
  140,
  180,
  'mixed',
  'intermediate'
)
ON CONFLICT (name) DO NOTHING;

-- ============================================================
-- HELPER FUNCTIONS
-- ============================================================

-- Function to calculate TSS from a ride
CREATE OR REPLACE FUNCTION calculate_tss(
  duration_seconds INTEGER,
  avg_power INTEGER,
  ftp INTEGER
) RETURNS INTEGER AS $$
DECLARE
  intensity_factor DECIMAL;
  duration_hours DECIMAL;
  tss INTEGER;
BEGIN
  IF ftp IS NULL OR ftp = 0 THEN
    RETURN NULL;
  END IF;

  intensity_factor := avg_power::DECIMAL / ftp::DECIMAL;
  duration_hours := duration_seconds::DECIMAL / 3600.0;
  tss := ROUND((duration_hours * intensity_factor * intensity_factor * 100)::NUMERIC);

  RETURN tss;
END;
$$ LANGUAGE plpgsql;

-- Function to estimate TSS without power data (distance/elevation based)
CREATE OR REPLACE FUNCTION estimate_tss(
  duration_minutes INTEGER,
  distance_km DECIMAL,
  elevation_gain_m INTEGER,
  workout_type TEXT
) RETURNS INTEGER AS $$
DECLARE
  base_tss INTEGER;
  elevation_factor DECIMAL;
  intensity_multiplier DECIMAL;
BEGIN
  -- Base TSS from duration (assuming endurance pace)
  base_tss := ROUND((duration_minutes::DECIMAL / 60.0) * 50);

  -- Elevation adjustment (roughly 10 TSS per 300m of climbing)
  elevation_factor := (elevation_gain_m::DECIMAL / 300.0) * 10;

  -- Intensity multiplier based on workout type
  intensity_multiplier := CASE workout_type
    WHEN 'recovery' THEN 0.5
    WHEN 'endurance' THEN 1.0
    WHEN 'tempo' THEN 1.3
    WHEN 'sweet_spot' THEN 1.5
    WHEN 'threshold' THEN 1.7
    WHEN 'vo2max' THEN 2.0
    WHEN 'hill_repeats' THEN 1.6
    ELSE 1.0
  END;

  RETURN ROUND((base_tss + elevation_factor) * intensity_multiplier);
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE training_plans IS 'User training plans with goals and periodization';
COMMENT ON TABLE planned_workouts IS 'Individual workouts within training plans';
COMMENT ON TABLE training_metrics IS 'Daily training load metrics (TSS, CTL, ATL, TSB)';
COMMENT ON TABLE workout_templates IS 'Predefined workout structures for route generation';
