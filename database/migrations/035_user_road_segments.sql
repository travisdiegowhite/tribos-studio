-- Migration: User Road Segments for Personalized Routing
-- Tracks which road segments users ride to enable preference-based route generation
-- Run this in your Supabase SQL editor

-- ============================================================================
-- USER ROAD SEGMENTS TABLE
-- Stores road segments a user has ridden with ride count and timing
-- ============================================================================
CREATE TABLE IF NOT EXISTS user_road_segments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Segment identification
    -- Using coordinate-based hash for flexibility without requiring OSM way lookup
    segment_hash TEXT NOT NULL,              -- Hash of snapped start/end coords (8 decimal places)

    -- Segment geometry (for spatial queries and matching)
    start_lat DECIMAL(10,7) NOT NULL,        -- 7 decimal places = ~1cm precision
    start_lng DECIMAL(10,7) NOT NULL,
    end_lat DECIMAL(10,7) NOT NULL,
    end_lng DECIMAL(10,7) NOT NULL,

    -- Segment metadata (enriched from first ride or OSM)
    segment_length_m INTEGER,                -- Length in meters
    bearing INTEGER,                         -- Compass bearing (0-359)

    -- Usage statistics
    ride_count INTEGER NOT NULL DEFAULT 1,
    first_ridden_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_ridden_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Performance data (aggregated from rides)
    avg_speed_ms DECIMAL(5,2),               -- Average speed in m/s across all rides
    min_speed_ms DECIMAL(5,2),               -- Slowest recorded speed
    max_speed_ms DECIMAL(5,2),               -- Fastest recorded speed
    total_time_s INTEGER,                    -- Cumulative time on this segment

    -- Optional OSM enrichment (can be populated later via map matching)
    osm_way_id BIGINT,                       -- OSM way ID if matched
    road_name TEXT,                          -- Road name from OSM
    road_type TEXT,                          -- highway tag (residential, primary, cycleway, etc.)
    surface_type TEXT,                       -- surface tag (asphalt, gravel, unpaved, etc.)

    -- Constraints
    UNIQUE(user_id, segment_hash),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- INDEXES FOR EFFICIENT QUERIES
-- ============================================================================

-- Primary lookup: user's segments
CREATE INDEX IF NOT EXISTS idx_user_road_segments_user_id
    ON user_road_segments(user_id);

-- Spatial queries: find segments in a bounding box
CREATE INDEX IF NOT EXISTS idx_user_road_segments_start_coords
    ON user_road_segments(start_lat, start_lng);
CREATE INDEX IF NOT EXISTS idx_user_road_segments_end_coords
    ON user_road_segments(end_lat, end_lng);

-- Preference scoring: frequently ridden segments
CREATE INDEX IF NOT EXISTS idx_user_road_segments_ride_count
    ON user_road_segments(user_id, ride_count DESC);

-- Recent segments for freshness weighting
CREATE INDEX IF NOT EXISTS idx_user_road_segments_last_ridden
    ON user_road_segments(user_id, last_ridden_at DESC);

-- OSM way lookup (when enriched)
CREATE INDEX IF NOT EXISTS idx_user_road_segments_osm_way
    ON user_road_segments(osm_way_id) WHERE osm_way_id IS NOT NULL;

-- ============================================================================
-- ACTIVITY SEGMENTS EXTRACTED FLAG
-- Track which activities have been processed for segment extraction
-- ============================================================================
ALTER TABLE activities
    ADD COLUMN IF NOT EXISTS segments_extracted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_activities_segments_extracted
    ON activities(user_id, segments_extracted_at)
    WHERE segments_extracted_at IS NULL;

-- ============================================================================
-- USER ROAD PREFERENCES TABLE
-- User-level settings for route preference behavior
-- ============================================================================
CREATE TABLE IF NOT EXISTS user_road_preferences (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Preference strength (0 = ignore history, 100 = strongly prefer familiar roads)
    familiarity_strength INTEGER NOT NULL DEFAULT 50 CHECK (familiarity_strength BETWEEN 0 AND 100),

    -- Explore mode: intentionally weight toward new roads
    explore_mode BOOLEAN NOT NULL DEFAULT false,

    -- Minimum ride count to consider a segment "familiar"
    min_rides_for_familiar INTEGER NOT NULL DEFAULT 2,

    -- Recency weighting: how much to favor recently ridden roads
    -- 0 = no recency preference, 100 = heavily favor recent roads
    recency_weight INTEGER NOT NULL DEFAULT 30 CHECK (recency_weight BETWEEN 0 AND 100),

    -- Time decay: after how many days does familiarity start to decay (0 = never)
    familiarity_decay_days INTEGER NOT NULL DEFAULT 180,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- UPSERT FUNCTION FOR SEGMENT STORAGE
-- Atomically insert or update a road segment with new ride data
-- ============================================================================
CREATE OR REPLACE FUNCTION upsert_user_road_segment(
    p_user_id UUID,
    p_segment_hash TEXT,
    p_start_lat DECIMAL,
    p_start_lng DECIMAL,
    p_end_lat DECIMAL,
    p_end_lng DECIMAL,
    p_segment_length_m INTEGER,
    p_bearing INTEGER,
    p_speed_ms DECIMAL,
    p_time_s INTEGER,
    p_activity_date TIMESTAMPTZ
) RETURNS UUID AS $$
DECLARE
    v_segment_id UUID;
BEGIN
    INSERT INTO user_road_segments (
        user_id, segment_hash,
        start_lat, start_lng, end_lat, end_lng,
        segment_length_m, bearing,
        ride_count, first_ridden_at, last_ridden_at,
        avg_speed_ms, min_speed_ms, max_speed_ms, total_time_s
    ) VALUES (
        p_user_id, p_segment_hash,
        p_start_lat, p_start_lng, p_end_lat, p_end_lng,
        p_segment_length_m, p_bearing,
        1, p_activity_date, p_activity_date,
        p_speed_ms, p_speed_ms, p_speed_ms, p_time_s
    )
    ON CONFLICT (user_id, segment_hash) DO UPDATE SET
        ride_count = user_road_segments.ride_count + 1,
        last_ridden_at = GREATEST(user_road_segments.last_ridden_at, p_activity_date),
        first_ridden_at = LEAST(user_road_segments.first_ridden_at, p_activity_date),
        -- Update running average of speed
        avg_speed_ms = CASE
            WHEN p_speed_ms IS NOT NULL THEN
                (COALESCE(user_road_segments.avg_speed_ms, 0) * user_road_segments.ride_count + p_speed_ms)
                / (user_road_segments.ride_count + 1)
            ELSE user_road_segments.avg_speed_ms
        END,
        min_speed_ms = LEAST(COALESCE(user_road_segments.min_speed_ms, p_speed_ms), p_speed_ms),
        max_speed_ms = GREATEST(COALESCE(user_road_segments.max_speed_ms, p_speed_ms), p_speed_ms),
        total_time_s = COALESCE(user_road_segments.total_time_s, 0) + COALESCE(p_time_s, 0),
        updated_at = NOW()
    RETURNING id INTO v_segment_id;

    RETURN v_segment_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FUNCTION: Get segment preferences for route scoring
-- Returns preference scores for a list of segment hashes
-- ============================================================================
CREATE OR REPLACE FUNCTION get_segment_preferences(
    p_user_id UUID,
    p_segment_hashes TEXT[]
) RETURNS TABLE (
    segment_hash TEXT,
    ride_count INTEGER,
    preference_score DECIMAL,
    confidence TEXT,
    last_ridden_at TIMESTAMPTZ
) AS $$
DECLARE
    v_prefs user_road_preferences%ROWTYPE;
    v_decay_factor DECIMAL;
BEGIN
    -- Get user's preference settings (or defaults)
    SELECT * INTO v_prefs FROM user_road_preferences WHERE user_id = p_user_id;

    RETURN QUERY
    SELECT
        s.segment_hash,
        s.ride_count,
        -- Calculate preference score based on ride count
        CASE
            WHEN s.ride_count = 0 THEN 1.0
            WHEN s.ride_count = 1 THEN 1.1
            WHEN s.ride_count <= 3 THEN 1.2 + (s.ride_count - 1) * 0.05
            WHEN s.ride_count <= 5 THEN 1.3 + (s.ride_count - 3) * 0.025
            WHEN s.ride_count <= 10 THEN 1.35 + (s.ride_count - 5) * 0.03
            ELSE 1.5
        END::DECIMAL AS preference_score,
        -- Confidence level
        CASE
            WHEN s.ride_count >= 5 THEN 'high'
            WHEN s.ride_count >= 2 THEN 'medium'
            WHEN s.ride_count = 1 THEN 'low'
            ELSE 'unknown'
        END::TEXT AS confidence,
        s.last_ridden_at
    FROM user_road_segments s
    WHERE s.user_id = p_user_id
    AND s.segment_hash = ANY(p_segment_hashes);
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FUNCTION: Find user segments in a bounding box
-- Used for finding familiar roads along a potential route corridor
-- ============================================================================
CREATE OR REPLACE FUNCTION get_user_segments_in_bbox(
    p_user_id UUID,
    p_min_lat DECIMAL,
    p_max_lat DECIMAL,
    p_min_lng DECIMAL,
    p_max_lng DECIMAL,
    p_min_ride_count INTEGER DEFAULT 1
) RETURNS TABLE (
    id UUID,
    segment_hash TEXT,
    start_lat DECIMAL,
    start_lng DECIMAL,
    end_lat DECIMAL,
    end_lng DECIMAL,
    ride_count INTEGER,
    last_ridden_at TIMESTAMPTZ,
    road_name TEXT,
    road_type TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        s.id,
        s.segment_hash,
        s.start_lat,
        s.start_lng,
        s.end_lat,
        s.end_lng,
        s.ride_count,
        s.last_ridden_at,
        s.road_name,
        s.road_type
    FROM user_road_segments s
    WHERE s.user_id = p_user_id
    AND s.ride_count >= p_min_ride_count
    AND (
        -- Segment start is in bbox
        (s.start_lat BETWEEN p_min_lat AND p_max_lat AND s.start_lng BETWEEN p_min_lng AND p_max_lng)
        OR
        -- Segment end is in bbox
        (s.end_lat BETWEEN p_min_lat AND p_max_lat AND s.end_lng BETWEEN p_min_lng AND p_max_lng)
    )
    ORDER BY s.ride_count DESC;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FUNCTION: Get user's segment statistics
-- Overview of a user's road segment history
-- ============================================================================
CREATE OR REPLACE FUNCTION get_user_segment_stats(p_user_id UUID)
RETURNS TABLE (
    total_segments INTEGER,
    total_rides INTEGER,
    unique_km DECIMAL,
    most_ridden_segment_hash TEXT,
    most_ridden_count INTEGER,
    segments_by_ride_count JSONB,
    recent_new_segments INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*)::INTEGER AS total_segments,
        SUM(s.ride_count)::INTEGER AS total_rides,
        (SUM(s.segment_length_m) / 1000.0)::DECIMAL AS unique_km,
        (SELECT s2.segment_hash FROM user_road_segments s2
         WHERE s2.user_id = p_user_id ORDER BY s2.ride_count DESC LIMIT 1) AS most_ridden_segment_hash,
        MAX(s.ride_count)::INTEGER AS most_ridden_count,
        jsonb_build_object(
            '1_ride', COUNT(*) FILTER (WHERE s.ride_count = 1),
            '2_3_rides', COUNT(*) FILTER (WHERE s.ride_count BETWEEN 2 AND 3),
            '4_10_rides', COUNT(*) FILTER (WHERE s.ride_count BETWEEN 4 AND 10),
            '10_plus_rides', COUNT(*) FILTER (WHERE s.ride_count > 10)
        ) AS segments_by_ride_count,
        COUNT(*) FILTER (WHERE s.first_ridden_at > NOW() - INTERVAL '30 days')::INTEGER AS recent_new_segments
    FROM user_road_segments s
    WHERE s.user_id = p_user_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- ENABLE ROW LEVEL SECURITY
-- ============================================================================
ALTER TABLE user_road_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_road_preferences ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- RLS POLICIES - User Road Segments
-- ============================================================================
DROP POLICY IF EXISTS "Users can view their own road segments" ON user_road_segments;
CREATE POLICY "Users can view their own road segments"
    ON user_road_segments FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own road segments" ON user_road_segments;
CREATE POLICY "Users can insert their own road segments"
    ON user_road_segments FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own road segments" ON user_road_segments;
CREATE POLICY "Users can update their own road segments"
    ON user_road_segments FOR UPDATE
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own road segments" ON user_road_segments;
CREATE POLICY "Users can delete their own road segments"
    ON user_road_segments FOR DELETE
    USING (auth.uid() = user_id);

-- ============================================================================
-- RLS POLICIES - User Road Preferences
-- ============================================================================
DROP POLICY IF EXISTS "Users can view their own road preferences" ON user_road_preferences;
CREATE POLICY "Users can view their own road preferences"
    ON user_road_preferences FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own road preferences" ON user_road_preferences;
CREATE POLICY "Users can insert their own road preferences"
    ON user_road_preferences FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own road preferences" ON user_road_preferences;
CREATE POLICY "Users can update their own road preferences"
    ON user_road_preferences FOR UPDATE
    USING (auth.uid() = user_id);

-- ============================================================================
-- TRIGGER: Auto-update updated_at timestamp
-- ============================================================================
CREATE OR REPLACE FUNCTION update_user_road_segments_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_user_road_segments_timestamp ON user_road_segments;
CREATE TRIGGER trigger_update_user_road_segments_timestamp
    BEFORE UPDATE ON user_road_segments
    FOR EACH ROW
    EXECUTE FUNCTION update_user_road_segments_timestamp();

DROP TRIGGER IF EXISTS trigger_update_user_road_preferences_timestamp ON user_road_preferences;
CREATE TRIGGER trigger_update_user_road_preferences_timestamp
    BEFORE UPDATE ON user_road_preferences
    FOR EACH ROW
    EXECUTE FUNCTION update_user_road_segments_timestamp();

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================
GRANT ALL ON user_road_segments TO authenticated;
GRANT ALL ON user_road_preferences TO authenticated;
GRANT ALL ON user_road_segments TO service_role;
GRANT ALL ON user_road_preferences TO service_role;

-- Grant execute on functions
GRANT EXECUTE ON FUNCTION upsert_user_road_segment TO authenticated;
GRANT EXECUTE ON FUNCTION upsert_user_road_segment TO service_role;
GRANT EXECUTE ON FUNCTION get_segment_preferences TO authenticated;
GRANT EXECUTE ON FUNCTION get_segment_preferences TO service_role;
GRANT EXECUTE ON FUNCTION get_user_segments_in_bbox TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_segments_in_bbox TO service_role;
GRANT EXECUTE ON FUNCTION get_user_segment_stats TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_segment_stats TO service_role;
