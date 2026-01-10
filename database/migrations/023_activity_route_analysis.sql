-- Migration: Activity Route Analysis
-- Description: Stores analyzed training suitability data for imported activities
-- This enables matching activities to workout prescriptions for route recommendations

-- Create activity_route_analysis table
CREATE TABLE IF NOT EXISTS activity_route_analysis (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  activity_id UUID NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Segment data (JSONB arrays of identified segments)
  -- Each segment: { startIdx, endIdx, startDistance, endDistance, length, avgGrade, coordinates }
  flat_segments JSONB DEFAULT '[]'::jsonb,
  climb_segments JSONB DEFAULT '[]'::jsonb,
  descent_segments JSONB DEFAULT '[]'::jsonb,
  rolling_segments JSONB DEFAULT '[]'::jsonb,

  -- Interval-suitable segments (uninterrupted sections good for efforts)
  -- Each: { startDistance, endDistance, length, type, avgGrade, quality }
  interval_segments JSONB DEFAULT '[]'::jsonb,

  -- Quality metrics
  stop_frequency DECIMAL,                    -- Estimated stops per km
  segment_consistency DECIMAL,               -- 0-1 how consistent the terrain is
  longest_uninterrupted_km DECIMAL,          -- Longest segment without stops
  total_flat_km DECIMAL,                     -- Total flat distance
  total_climbing_km DECIMAL,                 -- Total climbing distance

  -- Training suitability scores (0-100)
  recovery_score INTEGER DEFAULT 0,
  endurance_score INTEGER DEFAULT 0,
  tempo_score INTEGER DEFAULT 0,
  sweet_spot_score INTEGER DEFAULT 0,
  threshold_score INTEGER DEFAULT 0,
  vo2max_score INTEGER DEFAULT 0,
  climbing_score INTEGER DEFAULT 0,
  intervals_score INTEGER DEFAULT 0,

  -- Best training uses for this route
  best_for TEXT[] DEFAULT '{}',              -- Array of workout categories

  -- Route characteristics summary
  terrain_type TEXT,                         -- 'flat', 'rolling', 'hilly', 'mountainous'
  ideal_duration_min INTEGER,                -- Minimum recommended duration (minutes)
  ideal_duration_max INTEGER,                -- Maximum recommended duration (minutes)

  -- Metadata
  analyzed_at TIMESTAMPTZ DEFAULT NOW(),
  analysis_version INTEGER DEFAULT 1,        -- For re-analysis when algorithm improves

  -- Unique constraint to prevent duplicate analysis
  CONSTRAINT unique_activity_analysis UNIQUE (activity_id)
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_activity_route_analysis_user_id
  ON activity_route_analysis(user_id);

CREATE INDEX IF NOT EXISTS idx_activity_route_analysis_best_for
  ON activity_route_analysis USING GIN(best_for);

CREATE INDEX IF NOT EXISTS idx_activity_route_analysis_scores
  ON activity_route_analysis(threshold_score, intervals_score, climbing_score, endurance_score);

CREATE INDEX IF NOT EXISTS idx_activity_route_analysis_terrain
  ON activity_route_analysis(terrain_type);

-- Enable RLS
ALTER TABLE activity_route_analysis ENABLE ROW LEVEL SECURITY;

-- Users can only see their own analysis
CREATE POLICY "Users can view own activity analysis"
  ON activity_route_analysis FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own analysis
CREATE POLICY "Users can insert own activity analysis"
  ON activity_route_analysis FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own analysis
CREATE POLICY "Users can update own activity analysis"
  ON activity_route_analysis FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own analysis
CREATE POLICY "Users can delete own activity analysis"
  ON activity_route_analysis FOR DELETE
  USING (auth.uid() = user_id);

-- Add comment for documentation
COMMENT ON TABLE activity_route_analysis IS
  'Stores training suitability analysis for imported activities, enabling smart route recommendations for workout prescriptions';

COMMENT ON COLUMN activity_route_analysis.interval_segments IS
  'Segments suitable for interval training - flat or consistent grade, uninterrupted';

COMMENT ON COLUMN activity_route_analysis.best_for IS
  'Array of workout categories this route is best suited for (recovery, threshold, climbing, etc)';
