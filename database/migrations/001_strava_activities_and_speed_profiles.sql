-- Migration: Create strava_activities and user_speed_profiles tables
-- Run this in your Supabase SQL editor

-- Create strava_activities table to store synced activities
CREATE TABLE IF NOT EXISTS strava_activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL DEFAULT 'strava',
    provider_activity_id TEXT NOT NULL,
    name TEXT,
    type TEXT, -- 'Ride', 'VirtualRide', 'GravelRide', 'MountainBikeRide', 'EBikeRide'
    sport_type TEXT,
    start_date TIMESTAMPTZ,
    start_date_local TIMESTAMPTZ,
    distance NUMERIC, -- meters
    moving_time INTEGER, -- seconds
    elapsed_time INTEGER, -- seconds
    total_elevation_gain NUMERIC, -- meters
    average_speed NUMERIC, -- m/s
    max_speed NUMERIC, -- m/s
    average_watts NUMERIC,
    kilojoules NUMERIC,
    average_heartrate NUMERIC,
    max_heartrate NUMERIC,
    suffer_score INTEGER,
    workout_type INTEGER,
    trainer BOOLEAN DEFAULT false,
    commute BOOLEAN DEFAULT false,
    gear_id TEXT,
    map_summary_polyline TEXT,
    raw_data JSONB, -- Full activity data from Strava
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Unique constraint on user + activity
    UNIQUE(user_id, provider_activity_id)
);

-- Create user_speed_profiles table to store calculated speed profiles
CREATE TABLE IF NOT EXISTS user_speed_profiles (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Overall stats
    average_speed NUMERIC, -- km/h
    speed_std_dev NUMERIC, -- Standard deviation
    rides_analyzed INTEGER DEFAULT 0,

    -- By activity type
    road_speed NUMERIC, -- km/h
    road_rides_count INTEGER DEFAULT 0,
    gravel_speed NUMERIC, -- km/h
    gravel_rides_count INTEGER DEFAULT 0,
    mtb_speed NUMERIC, -- km/h
    mtb_rides_count INTEGER DEFAULT 0,

    -- Performance tiers (km/h)
    easy_speed NUMERIC, -- Recovery pace
    endurance_speed NUMERIC, -- Sustainable pace
    tempo_speed NUMERIC, -- Faster pace
    fast_speed NUMERIC, -- Top 10% pace

    -- Elevation tolerance
    avg_elevation_per_km NUMERIC, -- meters gained per km

    -- Time preferences
    avg_ride_duration NUMERIC, -- minutes

    -- Metadata
    has_sufficient_data BOOLEAN DEFAULT false,
    last_calculated TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_strava_activities_user_id ON strava_activities(user_id);
CREATE INDEX IF NOT EXISTS idx_strava_activities_start_date ON strava_activities(start_date);
CREATE INDEX IF NOT EXISTS idx_strava_activities_type ON strava_activities(type);

-- Enable RLS
ALTER TABLE strava_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_speed_profiles ENABLE ROW LEVEL SECURITY;

-- RLS Policies for strava_activities
CREATE POLICY "Users can view their own activities"
    ON strava_activities FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own activities"
    ON strava_activities FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own activities"
    ON strava_activities FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own activities"
    ON strava_activities FOR DELETE
    USING (auth.uid() = user_id);

-- Service role policy for server-side operations
CREATE POLICY "Service role has full access to activities"
    ON strava_activities FOR ALL
    USING (auth.role() = 'service_role');

-- RLS Policies for user_speed_profiles
CREATE POLICY "Users can view their own speed profile"
    ON user_speed_profiles FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own speed profile"
    ON user_speed_profiles FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own speed profile"
    ON user_speed_profiles FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Service role has full access to speed profiles"
    ON user_speed_profiles FOR ALL
    USING (auth.role() = 'service_role');

-- Grant necessary permissions
GRANT ALL ON strava_activities TO authenticated;
GRANT ALL ON user_speed_profiles TO authenticated;
GRANT ALL ON strava_activities TO service_role;
GRANT ALL ON user_speed_profiles TO service_role;
