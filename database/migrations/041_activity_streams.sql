-- Add activity_streams column to store per-point metric data from FIT files
-- This enables colored route rendering by speed, power, HR, and elevation
-- Format: { coords: [[lng, lat], ...], elevation: [...], power: [...], speed: [...], heartRate: [...], cadence: [...] }
-- Arrays are parallel (same index = same point) and use the simplified track (RDP ~10% of original)

ALTER TABLE activities ADD COLUMN IF NOT EXISTS activity_streams JSONB;

-- Index for checking if streams exist (used to decide whether to show color toggle)
CREATE INDEX IF NOT EXISTS idx_activities_has_streams
  ON activities ((activity_streams IS NOT NULL))
  WHERE activity_streams IS NOT NULL;

COMMENT ON COLUMN activities.activity_streams IS 'Per-point metric streams from FIT file (coords, elevation, power, speed, heartRate, cadence). Parallel arrays aligned with simplified GPS track.';
