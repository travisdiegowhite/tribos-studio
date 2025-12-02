-- Fix track_points schema to allow NULL values for fields not available in Strava summary polyline
-- This enables GPS import from Strava bulk import without requiring detailed API calls

-- Make time_seconds nullable (summary polyline doesn't include timestamps)
ALTER TABLE track_points
  ALTER COLUMN time_seconds DROP NOT NULL;

-- Make distance_m nullable (summary polyline doesn't include distance markers)
-- Note: distance_m field may not exist in all schemas, so we use IF EXISTS pattern
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'track_points'
    AND column_name = 'distance_m'
  ) THEN
    ALTER TABLE track_points ALTER COLUMN distance_m DROP NOT NULL;
  END IF;
END $$;

-- Rename conflicting column if it exists (some schemas use 'time' vs 'time_seconds')
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'track_points'
    AND column_name = 'time'
  ) THEN
    ALTER TABLE track_points RENAME COLUMN time TO time_seconds;
  END IF;
END $$;

-- Also check for 'distance' vs 'distance_m'
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'track_points'
    AND column_name = 'distance'
  ) THEN
    ALTER TABLE track_points RENAME COLUMN distance TO distance_m;
  END IF;
END $$;

-- Add indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_track_points_route_point ON track_points(route_id, point_index);
CREATE INDEX IF NOT EXISTS idx_track_points_coords ON track_points(latitude, longitude);

COMMENT ON TABLE track_points IS 'GPS track points for routes. time_seconds and distance_m are nullable because Strava summary polyline only provides coordinates.';
