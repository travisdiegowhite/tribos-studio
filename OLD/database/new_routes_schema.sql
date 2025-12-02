-- New routes table optimized for Strava integration
-- This replaces the existing routes table with a clean, Strava-first design

-- Drop existing table (CAUTION: This will delete all existing routes!)
DROP TABLE IF EXISTS routes CASCADE;
DROP TABLE IF EXISTS track_points CASCADE;

-- Create new routes table optimized for Strava data
CREATE TABLE routes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    
    -- Basic activity information
    name TEXT NOT NULL,
    description TEXT,
    activity_type TEXT DEFAULT 'ride',
    
    -- Strava integration
    strava_id BIGINT UNIQUE,
    imported_from TEXT DEFAULT 'manual' CHECK (imported_from IN ('manual', 'strava', 'file_upload')),
    
    -- Core metrics
    distance_km NUMERIC(8,3), -- e.g., 123.456 km
    duration_seconds INTEGER,
    elevation_gain_m INTEGER,
    elevation_loss_m INTEGER,
    
    -- Performance metrics (from Strava)
    average_speed FLOAT, -- km/h
    max_speed FLOAT, -- km/h
    average_pace FLOAT, -- min/km (calculated)
    
    -- Heart rate data
    average_heartrate INTEGER,
    max_heartrate INTEGER,
    hr_zones JSONB, -- Store HR zone distribution
    
    -- Power data
    average_watts INTEGER,
    max_watts INTEGER,
    normalized_power INTEGER,
    intensity_factor FLOAT,
    training_stress_score INTEGER,
    kilojoules INTEGER, -- Energy expenditure
    
    -- Location data
    start_latitude FLOAT,
    start_longitude FLOAT,
    end_latitude FLOAT,
    end_longitude FLOAT,
    
    -- Bounding box for the route
    bounds_north FLOAT,
    bounds_south FLOAT,
    bounds_east FLOAT,
    bounds_west FLOAT,
    
    -- Weather conditions (if available)
    temperature FLOAT, -- Celsius
    weather_condition TEXT,
    wind_speed FLOAT,
    wind_direction INTEGER,
    
    -- Route characteristics
    surface_type TEXT, -- road, gravel, trail, mixed
    route_type TEXT CHECK (route_type IN ('loop', 'out_back', 'point_to_point', 'unknown')),
    difficulty_rating INTEGER CHECK (difficulty_rating BETWEEN 1 AND 5),
    
    -- File/data storage
    filename TEXT,
    file_size_bytes INTEGER,
    track_points_count INTEGER,
    has_gps_data BOOLEAN DEFAULT false,
    has_heart_rate_data BOOLEAN DEFAULT false,
    has_power_data BOOLEAN DEFAULT false,
    has_cadence_data BOOLEAN DEFAULT false,
    
    -- Metadata
    recorded_at TIMESTAMPTZ, -- When the activity actually happened
    uploaded_at TIMESTAMPTZ, -- When it was uploaded to Strava
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Analysis results (computed)
    analysis_completed BOOLEAN DEFAULT false,
    analysis_results JSONB, -- Store computed insights
    
    -- Privacy and sharing
    is_private BOOLEAN DEFAULT false,
    visibility TEXT DEFAULT 'private' CHECK (visibility IN ('public', 'followers', 'private')),
    
    -- Tags and categorization
    tags TEXT[],
    training_goal TEXT, -- recovery, endurance, intervals, hills
    effort_level INTEGER CHECK (effort_level BETWEEN 1 AND 10),
    
    -- External links
    strava_url TEXT,
    external_id TEXT -- For other platforms
);

-- Create optimized track_points table
CREATE TABLE track_points (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    route_id UUID REFERENCES routes(id) ON DELETE CASCADE NOT NULL,
    
    -- Core GPS data
    latitude FLOAT NOT NULL,
    longitude FLOAT NOT NULL,
    elevation FLOAT,
    time_seconds FLOAT NOT NULL, -- Seconds from start of activity
    
    -- Performance data at this point
    distance_m FLOAT, -- Cumulative distance in meters
    speed FLOAT, -- Instantaneous speed in m/s
    
    -- Physiological data
    heartrate INTEGER,
    cadence INTEGER, -- RPM
    power_watts INTEGER,
    temperature FLOAT,
    
    -- Calculated fields
    grade_percent FLOAT, -- Calculated slope
    
    -- Index for ordering
    point_index INTEGER NOT NULL,
    
    UNIQUE(route_id, point_index)
);

-- Create indexes for performance
CREATE INDEX idx_routes_user_id ON routes(user_id);
CREATE INDEX idx_routes_strava_id ON routes(strava_id);
CREATE INDEX idx_routes_imported_from ON routes(imported_from);
CREATE INDEX idx_routes_recorded_at ON routes(recorded_at);
CREATE INDEX idx_routes_distance ON routes(distance_km);
CREATE INDEX idx_routes_location ON routes(start_latitude, start_longitude);
CREATE INDEX idx_routes_activity_type ON routes(activity_type);
CREATE INDEX idx_routes_training_goal ON routes(training_goal);

CREATE INDEX idx_track_points_route_id ON track_points(route_id);
CREATE INDEX idx_track_points_time ON track_points(route_id, time_seconds);
CREATE INDEX idx_track_points_location ON track_points(latitude, longitude);

-- Enable RLS (Row Level Security)
ALTER TABLE routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE track_points ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own routes" ON routes
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can view own track points" ON track_points
    FOR ALL USING (
        route_id IN (
            SELECT id FROM routes WHERE user_id = auth.uid()
        )
    );

-- Grant permissions
GRANT ALL ON routes TO authenticated;
GRANT ALL ON track_points TO authenticated;
GRANT ALL ON strava_imports TO authenticated;

-- Create a trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_routes_updated_at 
    BEFORE UPDATE ON routes 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Add some useful views
CREATE VIEW route_summary AS
SELECT 
    r.id,
    r.user_id,
    r.name,
    r.distance_km,
    r.duration_seconds,
    r.elevation_gain_m,
    r.average_speed,
    r.average_heartrate,
    r.average_watts,
    r.recorded_at,
    r.imported_from,
    r.training_goal,
    r.route_type,
    r.has_gps_data,
    r.has_heart_rate_data,
    r.has_power_data,
    -- Calculated fields
    ROUND((r.distance_km / (r.duration_seconds / 3600.0))::numeric, 2) as calculated_avg_speed,
    CASE 
        WHEN r.duration_seconds > 0 THEN ROUND((r.duration_seconds / 60.0 / r.distance_km)::numeric, 2)
        ELSE NULL 
    END as average_pace_min_per_km,
    CASE 
        WHEN r.distance_km > 0 THEN ROUND((r.elevation_gain_m / r.distance_km)::numeric, 1)
        ELSE 0 
    END as elevation_per_km
FROM routes r;

COMMENT ON TABLE routes IS 'Main routes/activities table optimized for Strava integration with comprehensive performance metrics';
COMMENT ON TABLE track_points IS 'GPS track points with performance data for each route';
COMMENT ON VIEW route_summary IS 'Summary view of routes with calculated performance metrics';