-- Additional columns for existing routes table to support Strava data
ALTER TABLE routes ADD COLUMN IF NOT EXISTS strava_id BIGINT UNIQUE;
ALTER TABLE routes ADD COLUMN IF NOT EXISTS imported_from TEXT DEFAULT 'manual';
ALTER TABLE routes ADD COLUMN IF NOT EXISTS average_speed FLOAT;
ALTER TABLE routes ADD COLUMN IF NOT EXISTS max_speed FLOAT;
ALTER TABLE routes ADD COLUMN IF NOT EXISTS average_heartrate INTEGER;
ALTER TABLE routes ADD COLUMN IF NOT EXISTS max_heartrate INTEGER;
ALTER TABLE routes ADD COLUMN IF NOT EXISTS average_watts INTEGER;
ALTER TABLE routes ADD COLUMN IF NOT EXISTS max_watts INTEGER;
ALTER TABLE routes ADD COLUMN IF NOT EXISTS kilojoules INTEGER;
ALTER TABLE routes ADD COLUMN IF NOT EXISTS start_latitude FLOAT;
ALTER TABLE routes ADD COLUMN IF NOT EXISTS start_longitude FLOAT;

-- Create strava_imports table to track import history
CREATE TABLE IF NOT EXISTS strava_imports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    imported_at TIMESTAMPTZ DEFAULT NOW(),
    activities_imported INTEGER DEFAULT 0,
    activities_skipped INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for efficient queries
CREATE INDEX IF NOT EXISTS idx_routes_strava_id ON routes(strava_id);
CREATE INDEX IF NOT EXISTS idx_routes_imported_from ON routes(imported_from);
CREATE INDEX IF NOT EXISTS idx_strava_imports_user_id ON strava_imports(user_id);

-- Enable RLS (Row Level Security) for strava_imports
ALTER TABLE strava_imports ENABLE ROW LEVEL SECURITY;

-- Create RLS policy for strava_imports
CREATE POLICY "Users can view own strava imports" ON strava_imports
    FOR ALL USING (auth.uid() = user_id);

-- Grant permissions
GRANT ALL ON strava_imports TO authenticated;
GRANT USAGE ON SEQUENCE strava_imports_id_seq TO authenticated;