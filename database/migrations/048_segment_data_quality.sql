-- ============================================================================
-- Migration 048: Segment Data Quality Tiers
-- Adds data quality tracking to training segments so terrain-only segments
-- (detected from decoded polylines + elevation API) are distinguished from
-- fully measured segments (from Garmin FIT streams with power/HR/cadence).
-- ============================================================================

-- Data quality tier on training_segments
-- - 'measured': Full per-point streams (power, HR, cadence, speed) from Garmin FIT
-- - 'geometry_only': Coords + elevation only (from decoded Strava polyline + elevation API)
ALTER TABLE training_segments
  ADD COLUMN IF NOT EXISTS data_quality_tier TEXT NOT NULL DEFAULT 'measured'
    CHECK (data_quality_tier IN ('measured', 'geometry_only'));

-- Track which activities have had polyline-based segment analysis run
-- (separate from training_segments_analyzed_at which covers stream-based analysis)
ALTER TABLE activities
  ADD COLUMN IF NOT EXISTS polyline_segments_analyzed_at TIMESTAMPTZ;

-- Index for querying polyline-analyzable activities efficiently
CREATE INDEX IF NOT EXISTS idx_activities_polyline_analysis
  ON activities(user_id, polyline_segments_analyzed_at)
  WHERE map_summary_polyline IS NOT NULL
    AND activity_streams IS NULL
    AND polyline_segments_analyzed_at IS NULL;
