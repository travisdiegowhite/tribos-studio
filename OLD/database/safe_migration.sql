-- Safe migration to add enhanced Strava fields to existing routes table
-- This will NOT drop existing data, just add new columns

-- Add new enhanced fields to existing routes table
ALTER TABLE routes ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE routes ADD COLUMN IF NOT EXISTS activity_type TEXT DEFAULT 'ride';
ALTER TABLE routes ADD COLUMN IF NOT EXISTS average_pace FLOAT;
ALTER TABLE routes ADD COLUMN IF NOT EXISTS hr_zones JSONB;
ALTER TABLE routes ADD COLUMN IF NOT EXISTS normalized_power INTEGER;
ALTER TABLE routes ADD COLUMN IF NOT EXISTS intensity_factor FLOAT;
ALTER TABLE routes ADD COLUMN IF NOT EXISTS training_stress_score INTEGER;
ALTER TABLE routes ADD COLUMN IF NOT EXISTS end_latitude FLOAT;
ALTER TABLE routes ADD COLUMN IF NOT EXISTS end_longitude FLOAT;
ALTER TABLE routes ADD COLUMN IF NOT EXISTS temperature FLOAT;
ALTER TABLE routes ADD COLUMN IF NOT EXISTS weather_condition TEXT;
ALTER TABLE routes ADD COLUMN IF NOT EXISTS wind_speed FLOAT;
ALTER TABLE routes ADD COLUMN IF NOT EXISTS wind_direction INTEGER;
ALTER TABLE routes ADD COLUMN IF NOT EXISTS surface_type TEXT;
ALTER TABLE routes ADD COLUMN IF NOT EXISTS route_type TEXT CHECK (route_type IN ('loop', 'out_back', 'point_to_point', 'unknown'));
ALTER TABLE routes ADD COLUMN IF NOT EXISTS difficulty_rating INTEGER CHECK (difficulty_rating BETWEEN 1 AND 5);
ALTER TABLE routes ADD COLUMN IF NOT EXISTS file_size_bytes INTEGER;
ALTER TABLE routes ADD COLUMN IF NOT EXISTS track_points_count INTEGER;
ALTER TABLE routes ADD COLUMN IF NOT EXISTS has_gps_data BOOLEAN DEFAULT false;
ALTER TABLE routes ADD COLUMN IF NOT EXISTS has_heart_rate_data BOOLEAN DEFAULT false;
ALTER TABLE routes ADD COLUMN IF NOT EXISTS has_power_data BOOLEAN DEFAULT false;
ALTER TABLE routes ADD COLUMN IF NOT EXISTS has_cadence_data BOOLEAN DEFAULT false;
ALTER TABLE routes ADD COLUMN IF NOT EXISTS recorded_at TIMESTAMPTZ;
ALTER TABLE routes ADD COLUMN IF NOT EXISTS uploaded_at TIMESTAMPTZ;
ALTER TABLE routes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE routes ADD COLUMN IF NOT EXISTS analysis_completed BOOLEAN DEFAULT false;
ALTER TABLE routes ADD COLUMN IF NOT EXISTS analysis_results JSONB;
ALTER TABLE routes ADD COLUMN IF NOT EXISTS is_private BOOLEAN DEFAULT false;
ALTER TABLE routes ADD COLUMN IF NOT EXISTS visibility TEXT DEFAULT 'private' CHECK (visibility IN ('public', 'followers', 'private'));
ALTER TABLE routes ADD COLUMN IF NOT EXISTS tags TEXT[];
ALTER TABLE routes ADD COLUMN IF NOT EXISTS training_goal TEXT;
ALTER TABLE routes ADD COLUMN IF NOT EXISTS effort_level INTEGER CHECK (effort_level BETWEEN 1 AND 10);
ALTER TABLE routes ADD COLUMN IF NOT EXISTS strava_url TEXT;
ALTER TABLE routes ADD COLUMN IF NOT EXISTS external_id TEXT;

-- Update recorded_at for existing records where it's null
UPDATE routes SET recorded_at = created_at WHERE recorded_at IS NULL;

-- Update has_gps_data flag for existing routes based on available data
UPDATE routes SET has_gps_data = true
WHERE (start_latitude IS NOT NULL AND start_longitude IS NOT NULL)
OR id IN (
    SELECT DISTINCT route_id
    FROM track_points
    WHERE latitude IS NOT NULL AND longitude IS NOT NULL
);

-- Update track_points_count for existing routes
UPDATE routes SET track_points_count = (
    SELECT COUNT(*)
    FROM track_points
    WHERE track_points.route_id = routes.id
) WHERE track_points_count IS NULL;

-- Update has_heart_rate_data flag
UPDATE routes SET has_heart_rate_data = true
WHERE average_heartrate IS NOT NULL AND average_heartrate > 0;

-- Update has_power_data flag
UPDATE routes SET has_power_data = true
WHERE average_watts IS NOT NULL AND average_watts > 0;

-- Add new indexes for enhanced fields
CREATE INDEX IF NOT EXISTS idx_routes_activity_type ON routes(activity_type);
CREATE INDEX IF NOT EXISTS idx_routes_training_goal ON routes(training_goal);
CREATE INDEX IF NOT EXISTS idx_routes_route_type ON routes(route_type);
CREATE INDEX IF NOT EXISTS idx_routes_surface_type ON routes(surface_type);
CREATE INDEX IF NOT EXISTS idx_routes_recorded_at ON routes(recorded_at);

-- Create a trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_routes_updated_at ON routes;
CREATE TRIGGER update_routes_updated_at 
    BEFORE UPDATE ON routes 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Update the imported_from check constraint if it exists
ALTER TABLE routes DROP CONSTRAINT IF EXISTS routes_imported_from_check;
ALTER TABLE routes ADD CONSTRAINT routes_imported_from_check 
    CHECK (imported_from IN ('manual', 'strava', 'file_upload'));

-- Update visibility check constraint
ALTER TABLE routes DROP CONSTRAINT IF EXISTS routes_visibility_check;

COMMENT ON TABLE routes IS 'Enhanced routes table with comprehensive Strava integration and performance metrics';