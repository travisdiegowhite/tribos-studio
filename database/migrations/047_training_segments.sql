-- ============================================================================
-- Migration 047: Training Segments
-- Creates the training segment library for workout-route matching
-- Segments are discrete, trainable stretches of road detected from ride history
-- ============================================================================

-- ============================================================================
-- 1. TRAINING SEGMENTS — Core segment geography and characteristics
-- ============================================================================
CREATE TABLE IF NOT EXISTS training_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Geography
  start_lat DECIMAL(10, 7) NOT NULL,
  start_lng DECIMAL(10, 7) NOT NULL,
  end_lat DECIMAL(10, 7) NOT NULL,
  end_lng DECIMAL(10, 7) NOT NULL,
  geojson JSONB NOT NULL,               -- GeoJSON LineString for map rendering
  distance_meters DECIMAL(10, 1) NOT NULL,

  -- Generated identity
  auto_name TEXT,                        -- "Spine Rd Climb" (generated via reverse geocoding)
  custom_name TEXT,                      -- rider override (nullable)
  display_name TEXT GENERATED ALWAYS AS (COALESCE(custom_name, auto_name)) STORED,
  description TEXT,                      -- "12 min sustained climb, 4.2% avg, no stops"

  -- Terrain
  avg_gradient DECIMAL(5, 2) DEFAULT 0,
  max_gradient DECIMAL(5, 2) DEFAULT 0,
  min_gradient DECIMAL(5, 2) DEFAULT 0,
  gradient_variability DECIMAL(5, 2) DEFAULT 0,  -- std dev of gradient
  elevation_gain_meters DECIMAL(8, 1) DEFAULT 0,
  elevation_loss_meters DECIMAL(8, 1) DEFAULT 0,
  terrain_type TEXT NOT NULL DEFAULT 'flat'
    CHECK (terrain_type IN ('flat', 'climb', 'descent', 'rolling')),

  -- Obstruction scoring
  obstruction_score INTEGER DEFAULT 0
    CHECK (obstruction_score >= 0 AND obstruction_score <= 100),
  stop_count INTEGER DEFAULT 0,
  stops_per_km DECIMAL(5, 2) DEFAULT 0,
  traffic_signal_count INTEGER DEFAULT 0,
  sharp_turn_count INTEGER DEFAULT 0,
  max_uninterrupted_seconds INTEGER DEFAULT 0,

  -- Topology
  topology TEXT DEFAULT 'point_to_point'
    CHECK (topology IN ('loop', 'out_and_back', 'point_to_point', 'circuit')),
  is_repeatable BOOLEAN DEFAULT false,
  parent_loop_id UUID REFERENCES training_segments(id) ON DELETE SET NULL,

  -- Analysis metadata
  ride_count INTEGER DEFAULT 0,
  first_ridden_at TIMESTAMPTZ,
  last_ridden_at TIMESTAMPTZ,
  confidence_score INTEGER DEFAULT 0
    CHECK (confidence_score >= 0 AND confidence_score <= 100),
  analysis_version INTEGER DEFAULT 1,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Spatial index for finding nearby segments
CREATE INDEX IF NOT EXISTS idx_training_segments_user
  ON training_segments(user_id);
CREATE INDEX IF NOT EXISTS idx_training_segments_start
  ON training_segments(user_id, start_lat, start_lng);
CREATE INDEX IF NOT EXISTS idx_training_segments_end
  ON training_segments(user_id, end_lat, end_lng);
CREATE INDEX IF NOT EXISTS idx_training_segments_terrain
  ON training_segments(user_id, terrain_type);
CREATE INDEX IF NOT EXISTS idx_training_segments_last_ridden
  ON training_segments(user_id, last_ridden_at DESC);

-- ============================================================================
-- 2. TRAINING SEGMENT RIDES — Per-ride data for each segment traversal
-- ============================================================================
CREATE TABLE IF NOT EXISTS training_segment_rides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  segment_id UUID NOT NULL REFERENCES training_segments(id) ON DELETE CASCADE,
  activity_id UUID NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ridden_at TIMESTAMPTZ NOT NULL,

  -- Power
  avg_power DECIMAL(6, 1),
  normalized_power DECIMAL(6, 1),
  max_power DECIMAL(6, 1),
  power_zone TEXT,

  -- Heart rate
  avg_hr INTEGER,
  max_hr INTEGER,
  hr_zone TEXT,

  -- Performance
  duration_seconds INTEGER NOT NULL,
  avg_speed DECIMAL(6, 2),        -- km/h
  avg_cadence INTEGER,

  -- Stops within this segment traversal
  stop_count INTEGER DEFAULT 0,
  stop_duration_seconds INTEGER DEFAULT 0,

  -- Conditions (from activity metadata if available)
  temperature DECIMAL(5, 1),
  wind_speed DECIMAL(5, 1),
  wind_direction DECIMAL(5, 1),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_segment_rides_segment
  ON training_segment_rides(segment_id);
CREATE INDEX IF NOT EXISTS idx_segment_rides_activity
  ON training_segment_rides(activity_id);
CREATE INDEX IF NOT EXISTS idx_segment_rides_user
  ON training_segment_rides(user_id, ridden_at DESC);
-- Prevent duplicate entries for same segment+activity
CREATE UNIQUE INDEX IF NOT EXISTS idx_segment_rides_unique
  ON training_segment_rides(segment_id, activity_id);

-- ============================================================================
-- 3. TRAINING SEGMENT PROFILES — Aggregated power/performance data per segment
-- ============================================================================
CREATE TABLE IF NOT EXISTS training_segment_profiles (
  segment_id UUID PRIMARY KEY REFERENCES training_segments(id) ON DELETE CASCADE,

  -- Aggregated power stats
  mean_avg_power DECIMAL(6, 1),
  std_dev_power DECIMAL(6, 1),
  min_avg_power DECIMAL(6, 1),
  max_avg_power DECIMAL(6, 1),
  mean_normalized_power DECIMAL(6, 1),
  typical_power_zone TEXT,
  zone_distribution JSONB DEFAULT '{}',  -- {"recovery": 0.0, "endurance": 0.12, ...}
  consistency_score INTEGER DEFAULT 0
    CHECK (consistency_score >= 0 AND consistency_score <= 100),

  -- Heart rate
  mean_avg_hr INTEGER,
  typical_hr_zone TEXT,

  -- Cadence
  mean_cadence INTEGER,

  -- Training suitability flags
  suitable_for_steady_state BOOLEAN DEFAULT false,
  suitable_for_short_intervals BOOLEAN DEFAULT false,
  suitable_for_sprints BOOLEAN DEFAULT false,
  suitable_for_recovery BOOLEAN DEFAULT false,

  -- Workout type match rankings
  best_workout_matches JSONB DEFAULT '[]',  -- [{"type": "sweet_spot_3x10", "score": 94}, ...]

  -- Frequency & recency
  rides_last_30_days INTEGER DEFAULT 0,
  rides_last_90_days INTEGER DEFAULT 0,
  avg_rides_per_month DECIMAL(4, 1) DEFAULT 0,
  frequency_tier TEXT DEFAULT 'rare'
    CHECK (frequency_tier IN ('primary', 'regular', 'occasional', 'rare')),
  typical_days JSONB DEFAULT '[]',           -- ["tuesday", "thursday", "saturday"]
  relevance_score INTEGER DEFAULT 0
    CHECK (relevance_score >= 0 AND relevance_score <= 100),

  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 4. WORKOUT SEGMENT MATCHES — Precomputed recommendations
-- ============================================================================
CREATE TABLE IF NOT EXISTS workout_segment_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workout_type TEXT NOT NULL,              -- "sweet_spot_3x10", "threshold_2x20", etc.
  segment_id UUID NOT NULL REFERENCES training_segments(id) ON DELETE CASCADE,

  -- Match quality scores (0-100)
  match_score INTEGER NOT NULL DEFAULT 0
    CHECK (match_score >= 0 AND match_score <= 100),
  power_match INTEGER DEFAULT 0,
  duration_match INTEGER DEFAULT 0,
  obstruction_match INTEGER DEFAULT 0,
  repeatability_match INTEGER DEFAULT 0,
  relevance_match INTEGER DEFAULT 0,

  -- Context
  recommended_power_target TEXT,           -- "238-253W (88-94% FTP)"
  recommended_ftp_range TEXT,              -- "at current FTP of 270W"
  match_reasoning TEXT,                    -- Human-readable explanation

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days')
);

CREATE INDEX IF NOT EXISTS idx_workout_matches_user
  ON workout_segment_matches(user_id, workout_type);
CREATE INDEX IF NOT EXISTS idx_workout_matches_score
  ON workout_segment_matches(user_id, match_score DESC);
CREATE INDEX IF NOT EXISTS idx_workout_matches_expiry
  ON workout_segment_matches(expires_at);
-- Prevent duplicate matches for same user+workout+segment
CREATE UNIQUE INDEX IF NOT EXISTS idx_workout_matches_unique
  ON workout_segment_matches(user_id, workout_type, segment_id);

-- ============================================================================
-- 5. ADD SEGMENT ANALYSIS FLAG TO ACTIVITIES
-- ============================================================================
-- Track which activities have been processed for training segment extraction
ALTER TABLE activities
  ADD COLUMN IF NOT EXISTS training_segments_analyzed_at TIMESTAMPTZ;

-- ============================================================================
-- 6. ROW-LEVEL SECURITY
-- ============================================================================
ALTER TABLE training_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_segment_rides ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_segment_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout_segment_matches ENABLE ROW LEVEL SECURITY;

-- Users can only access their own segments
CREATE POLICY training_segments_user_policy ON training_segments
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY training_segment_rides_user_policy ON training_segment_rides
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY training_segment_profiles_user_policy ON training_segment_profiles
  FOR ALL USING (
    segment_id IN (SELECT id FROM training_segments WHERE user_id = auth.uid())
  );

CREATE POLICY workout_segment_matches_user_policy ON workout_segment_matches
  FOR ALL USING (auth.uid() = user_id);

-- ============================================================================
-- 7. UPDATED_AT TRIGGERS
-- ============================================================================
CREATE OR REPLACE FUNCTION update_training_segment_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER training_segments_updated_at
  BEFORE UPDATE ON training_segments
  FOR EACH ROW EXECUTE FUNCTION update_training_segment_updated_at();

CREATE TRIGGER training_segment_profiles_updated_at
  BEFORE UPDATE ON training_segment_profiles
  FOR EACH ROW EXECUTE FUNCTION update_training_segment_updated_at();
