-- Routes table for tribos.studio
-- Stores user-created and AI-generated cycling routes

CREATE TABLE IF NOT EXISTS routes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,

    -- Basic Information
    name TEXT NOT NULL,
    description TEXT,

    -- Core Metrics
    distance_km NUMERIC(8,3),
    elevation_gain_m INTEGER,
    elevation_loss_m INTEGER,
    estimated_duration_minutes INTEGER,

    -- Route Data
    geometry JSONB NOT NULL,  -- GeoJSON geometry (LineString or MultiLineString)
    waypoints JSONB,          -- Array of waypoint objects

    -- Location Data
    start_latitude FLOAT,
    start_longitude FLOAT,
    end_latitude FLOAT,
    end_longitude FLOAT,

    -- Route Characteristics
    route_type TEXT CHECK (route_type IN ('loop', 'out_back', 'point_to_point')),
    difficulty_rating INTEGER CHECK (difficulty_rating BETWEEN 1 AND 5),
    training_goal TEXT,  -- endurance, intervals, hills, recovery
    surface_type TEXT,   -- paved, gravel, mixed

    -- AI Generation Metadata
    generated_by TEXT CHECK (generated_by IN ('manual', 'ai', 'strava_import')),
    ai_prompt TEXT,           -- Original AI prompt if AI-generated
    ai_suggestions JSONB,     -- Alternative suggestions from AI

    -- Privacy & Sharing
    is_private BOOLEAN DEFAULT true,
    visibility TEXT CHECK (visibility IN ('private', 'friends', 'public')) DEFAULT 'private',

    -- Categorization
    tags TEXT[],

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_routes_user_id ON routes(user_id);
CREATE INDEX IF NOT EXISTS idx_routes_training_goal ON routes(training_goal);
CREATE INDEX IF NOT EXISTS idx_routes_distance ON routes(distance_km);
CREATE INDEX IF NOT EXISTS idx_routes_visibility ON routes(visibility) WHERE visibility != 'private';
CREATE INDEX IF NOT EXISTS idx_routes_created_at ON routes(created_at DESC);

-- Enable Row Level Security
ALTER TABLE routes ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own routes"
  ON routes FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own routes"
  ON routes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own routes"
  ON routes FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own routes"
  ON routes FOR DELETE
  USING (auth.uid() = user_id);

-- Public routes are viewable by everyone
CREATE POLICY "Public routes are viewable"
  ON routes FOR SELECT
  USING (visibility = 'public');

-- Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_routes_updated_at
    BEFORE UPDATE ON routes
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
