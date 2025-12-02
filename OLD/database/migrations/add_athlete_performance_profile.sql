-- Athlete Performance Profile Schema
-- Stores calculated performance metrics for personalized routing

-- Create athlete_performance_profile table
CREATE TABLE IF NOT EXISTS athlete_performance_profile (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,

    -- Base speeds by terrain type (km/h)
    base_road_speed DECIMAL(5,2) DEFAULT 25.0,       -- Flat paved roads
    base_gravel_speed DECIMAL(5,2) DEFAULT 20.0,     -- Gravel/mixed terrain
    base_climbing_speed DECIMAL(5,2) DEFAULT 14.0,   -- Sustained climbs (>40m/km)
    base_commute_speed DECIMAL(5,2) DEFAULT 18.0,    -- Casual/commute pace
    base_mountain_speed DECIMAL(5,2) DEFAULT 16.0,   -- Technical MTB terrain

    -- Analysis metadata
    speed_confidence DECIMAL(3,2) DEFAULT 0.0 CHECK (speed_confidence >= 0 AND speed_confidence <= 1),
    rides_analyzed_count INTEGER DEFAULT 0,
    last_calculated_at TIMESTAMPTZ,

    -- Optional power data
    ftp_watts INTEGER,                                 -- Functional Threshold Power
    power_to_weight DECIMAL(5,2),                     -- W/kg ratio

    -- Speed calculation breakdown (for transparency)
    road_rides_count INTEGER DEFAULT 0,
    gravel_rides_count INTEGER DEFAULT 0,
    climbing_rides_count INTEGER DEFAULT 0,
    commute_rides_count INTEGER DEFAULT 0,

    -- Data quality indicators
    has_sufficient_data BOOLEAN DEFAULT FALSE,        -- At least 10 rides analyzed
    needs_recalculation BOOLEAN DEFAULT TRUE,         -- Flag to trigger re-analysis

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add speed modifier columns to existing training_context table
ALTER TABLE training_context
ADD COLUMN IF NOT EXISTS current_speed_modifier DECIMAL(3,2) DEFAULT 1.0 CHECK (current_speed_modifier >= 0.5 AND current_speed_modifier <= 1.5);

ALTER TABLE training_context
ADD COLUMN IF NOT EXISTS suggested_speed_modifier DECIMAL(3,2) DEFAULT 1.0 CHECK (suggested_speed_modifier >= 0.5 AND suggested_speed_modifier <= 1.5);

ALTER TABLE training_context
ADD COLUMN IF NOT EXISTS speed_modifier_reason TEXT;

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_athlete_performance_user_id ON athlete_performance_profile(user_id);
CREATE INDEX IF NOT EXISTS idx_athlete_performance_needs_recalc ON athlete_performance_profile(needs_recalculation) WHERE needs_recalculation = TRUE;

-- Enable Row Level Security
ALTER TABLE athlete_performance_profile ENABLE ROW LEVEL SECURITY;

-- Create RLS policy
CREATE POLICY "Users can view and edit own performance profile" ON athlete_performance_profile
    FOR ALL USING (auth.uid() = user_id);

-- Grant permissions
GRANT ALL ON athlete_performance_profile TO authenticated;

-- Create trigger to update timestamps
CREATE TRIGGER update_athlete_performance_profile_updated_at
BEFORE UPDATE ON athlete_performance_profile
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create function to initialize athlete performance profile
CREATE OR REPLACE FUNCTION initialize_athlete_performance_profile(p_user_id UUID)
RETURNS VOID AS $$
BEGIN
    INSERT INTO athlete_performance_profile (user_id, needs_recalculation)
    VALUES (p_user_id, TRUE)
    ON CONFLICT (user_id) DO NOTHING;
END;
$$ LANGUAGE plpgsql;

-- Create function to calculate speed confidence score
CREATE OR REPLACE FUNCTION calculate_speed_confidence(
    p_rides_analyzed INTEGER,
    p_road_count INTEGER,
    p_gravel_count INTEGER,
    p_climbing_count INTEGER
)
RETURNS DECIMAL(3,2) AS $$
DECLARE
    confidence DECIMAL(3,2);
    terrain_diversity DECIMAL(3,2);
BEGIN
    -- Base confidence from total rides (0-0.6)
    confidence := LEAST(p_rides_analyzed::DECIMAL / 30.0, 0.6);

    -- Terrain diversity bonus (0-0.4)
    -- Award points for having data across multiple terrain types
    terrain_diversity := 0.0;
    IF p_road_count >= 5 THEN terrain_diversity := terrain_diversity + 0.15; END IF;
    IF p_gravel_count >= 3 THEN terrain_diversity := terrain_diversity + 0.15; END IF;
    IF p_climbing_count >= 3 THEN terrain_diversity := terrain_diversity + 0.10; END IF;

    confidence := confidence + terrain_diversity;

    -- Cap at 1.0
    RETURN LEAST(confidence, 1.0);
END;
$$ LANGUAGE plpgsql;

-- Create view for user speed profile with calculated metrics
CREATE OR REPLACE VIEW user_speed_profiles AS
SELECT
    app.user_id,
    app.base_road_speed,
    app.base_gravel_speed,
    app.base_climbing_speed,
    app.base_commute_speed,
    app.base_mountain_speed,
    app.speed_confidence,
    app.rides_analyzed_count,
    app.last_calculated_at,
    app.ftp_watts,
    app.has_sufficient_data,
    app.needs_recalculation,

    -- Current modifiers from training context
    tc.current_speed_modifier,
    tc.suggested_speed_modifier,
    tc.speed_modifier_reason,
    tc.fatigue_level,

    -- Calculate effective speeds (base * modifier)
    ROUND(app.base_road_speed * COALESCE(tc.current_speed_modifier, 1.0), 1) as effective_road_speed,
    ROUND(app.base_gravel_speed * COALESCE(tc.current_speed_modifier, 1.0), 1) as effective_gravel_speed,
    ROUND(app.base_climbing_speed * COALESCE(tc.current_speed_modifier, 1.0), 1) as effective_climbing_speed,
    ROUND(app.base_commute_speed * COALESCE(tc.current_speed_modifier, 1.0), 1) as effective_commute_speed,

    app.updated_at
FROM athlete_performance_profile app
LEFT JOIN training_context tc ON app.user_id = tc.user_id;

-- Grant permissions on view
GRANT SELECT ON user_speed_profiles TO authenticated;

-- Create function to mark profile for recalculation when new rides are imported
CREATE OR REPLACE FUNCTION mark_speed_profile_for_recalculation()
RETURNS TRIGGER AS $$
BEGIN
    -- Mark user's speed profile for recalculation when a new ride is imported
    UPDATE athlete_performance_profile
    SET needs_recalculation = TRUE
    WHERE user_id = NEW.user_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on routes table to auto-flag when new rides imported
CREATE TRIGGER trigger_mark_speed_recalculation
AFTER INSERT ON routes
FOR EACH ROW
WHEN (NEW.imported_from IN ('strava', 'wahoo', 'garmin'))
EXECUTE FUNCTION mark_speed_profile_for_recalculation();

-- Add helpful comments
COMMENT ON TABLE athlete_performance_profile IS 'Stores user-specific cycling performance metrics calculated from ride history for personalized routing';
COMMENT ON COLUMN athlete_performance_profile.speed_confidence IS 'Confidence score (0-1) based on quantity and diversity of ride data';
COMMENT ON COLUMN athlete_performance_profile.needs_recalculation IS 'Flag set when new rides imported, triggers background recalculation';
COMMENT ON FUNCTION calculate_speed_confidence IS 'Calculates confidence score from 0-1 based on ride count and terrain diversity';
