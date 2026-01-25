-- Migration: Cross-Training Activities
-- Adds support for tracking non-cycling activities like strength training, yoga, running, etc.
-- Run this in your Supabase SQL editor

-- ============================================================================
-- ACTIVITY TYPES TABLE
-- Stores both system-provided and user-created activity type templates
-- ============================================================================
CREATE TABLE IF NOT EXISTS activity_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,  -- NULL for system types

    -- Basic info
    name TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('strength', 'flexibility', 'cardio', 'recovery', 'mind_body', 'other')),
    description TEXT,
    icon TEXT DEFAULT 'activity',  -- Tabler icon name
    color TEXT DEFAULT '#6366f1',  -- Hex color for UI

    -- Default values for quick entry
    default_duration_minutes INTEGER DEFAULT 30,
    default_intensity INTEGER DEFAULT 5 CHECK (default_intensity >= 1 AND default_intensity <= 10),

    -- Category-specific metrics configuration (JSONB for flexibility)
    -- Example: {"track_distance": true, "track_sets_reps": true, "muscle_groups": ["legs", "core"]}
    metrics_config JSONB DEFAULT '{}',

    -- TSS estimation factors
    tss_per_hour_base NUMERIC DEFAULT 50,  -- Base TSS per hour at intensity 5
    tss_intensity_multiplier NUMERIC DEFAULT 0.15,  -- Additional TSS per intensity point above 5

    -- System vs user-created
    is_system BOOLEAN DEFAULT false,

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Ensure unique names per user (or globally for system types)
    UNIQUE NULLS NOT DISTINCT (user_id, name)
);

-- Create index for lookups
CREATE INDEX IF NOT EXISTS idx_activity_types_user_id ON activity_types(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_types_category ON activity_types(category);
CREATE INDEX IF NOT EXISTS idx_activity_types_is_system ON activity_types(is_system);

-- ============================================================================
-- CROSS TRAINING ACTIVITIES TABLE
-- Records individual cross-training sessions
-- ============================================================================
CREATE TABLE IF NOT EXISTS cross_training_activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    activity_type_id UUID REFERENCES activity_types(id) ON DELETE SET NULL,

    -- When
    activity_date DATE NOT NULL,
    start_time TIME,  -- Optional specific start time

    -- Core metrics
    duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
    intensity INTEGER NOT NULL CHECK (intensity >= 1 AND intensity <= 10),  -- RPE scale
    perceived_effort INTEGER CHECK (perceived_effort >= 1 AND perceived_effort <= 10),  -- How hard it felt

    -- Category-specific metrics (JSONB for flexibility)
    -- Strength: {"sets": 4, "exercises": ["squats", "lunges"], "muscle_groups": ["legs", "glutes"]}
    -- Cardio: {"distance_km": 5.2, "avg_hr": 145, "elevation_m": 120}
    -- Flexibility: {"focus_areas": ["hips", "hamstrings"], "hold_duration_seconds": 30}
    metrics JSONB DEFAULT '{}',

    -- Calculated training load
    estimated_tss NUMERIC,

    -- Subjective feedback
    mood_before INTEGER CHECK (mood_before >= 1 AND mood_before <= 5),
    mood_after INTEGER CHECK (mood_after >= 1 AND mood_after <= 5),
    notes TEXT,

    -- Source tracking (for future Garmin/Strava sync)
    source TEXT DEFAULT 'manual' CHECK (source IN ('manual', 'garmin', 'strava', 'apple_health')),
    external_id TEXT,  -- ID from external source

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_cross_training_user_id ON cross_training_activities(user_id);
CREATE INDEX IF NOT EXISTS idx_cross_training_date ON cross_training_activities(activity_date DESC);
CREATE INDEX IF NOT EXISTS idx_cross_training_type ON cross_training_activities(activity_type_id);
CREATE INDEX IF NOT EXISTS idx_cross_training_source ON cross_training_activities(source);

-- ============================================================================
-- INSERT DEFAULT SYSTEM ACTIVITY TYPES
-- ============================================================================
INSERT INTO activity_types (user_id, name, category, description, icon, color, default_duration_minutes, default_intensity, metrics_config, tss_per_hour_base, tss_intensity_multiplier, is_system)
VALUES
    -- Strength activities
    (NULL, 'Weight Training', 'strength', 'Gym-based resistance training with weights', 'barbell', '#ef4444', 60, 6,
     '{"track_sets_reps": true, "muscle_groups": ["full_body", "upper", "lower", "push", "pull", "legs", "core"]}',
     50, 0.12, true),
    (NULL, 'Bodyweight Training', 'strength', 'Resistance exercises using body weight', 'stretching', '#f97316', 45, 5,
     '{"track_sets_reps": true, "muscle_groups": ["full_body", "upper", "lower", "core"]}',
     40, 0.10, true),
    (NULL, 'Resistance Bands', 'strength', 'Training with elastic resistance bands', 'ripple', '#fb923c', 30, 4,
     '{"track_sets_reps": true}',
     35, 0.08, true),

    -- Flexibility activities
    (NULL, 'Yoga', 'flexibility', 'Yoga practice - various styles', 'yoga', '#8b5cf6', 60, 4,
     '{"yoga_style": ["vinyasa", "hatha", "yin", "power", "restorative"], "focus_areas": true}',
     30, 0.08, true),
    (NULL, 'Stretching', 'flexibility', 'General stretching and mobility work', 'stretching-2', '#a855f7', 20, 3,
     '{"focus_areas": true}',
     20, 0.05, true),
    (NULL, 'Pilates', 'flexibility', 'Pilates mat or reformer work', 'gymnastics', '#c084fc', 45, 5,
     '{"equipment": ["mat", "reformer"], "focus_areas": true}',
     35, 0.08, true),
    (NULL, 'Mobility Work', 'flexibility', 'Targeted mobility and flexibility drills', 'activity', '#d8b4fe', 30, 3,
     '{"focus_areas": true}',
     25, 0.05, true),

    -- Cardio activities
    (NULL, 'Running', 'cardio', 'Outdoor or treadmill running', 'run', '#22c55e', 45, 6,
     '{"track_distance": true, "track_pace": true, "track_hr": true, "terrain": ["road", "trail", "track", "treadmill"]}',
     70, 0.15, true),
    (NULL, 'Walking', 'cardio', 'Brisk walking or hiking', 'walk', '#4ade80', 60, 3,
     '{"track_distance": true, "terrain": ["road", "trail", "urban"]}',
     25, 0.05, true),
    (NULL, 'Swimming', 'cardio', 'Pool or open water swimming', 'swimming', '#06b6d4', 45, 6,
     '{"track_distance": true, "stroke_type": ["freestyle", "backstroke", "breaststroke", "mixed"]}',
     60, 0.12, true),
    (NULL, 'Rowing', 'cardio', 'Indoor rowing or on-water rowing', 'kayak', '#14b8a6', 30, 6,
     '{"track_distance": true, "track_pace": true}',
     65, 0.15, true),
    (NULL, 'Elliptical', 'cardio', 'Elliptical machine training', 'trending-up', '#10b981', 40, 5,
     '{"track_distance": true}',
     45, 0.10, true),
    (NULL, 'Skiing', 'cardio', 'Downhill or cross-country skiing', 'snowflake', '#0ea5e9', 120, 5,
     '{"ski_type": ["downhill", "cross_country", "backcountry"], "track_vertical": true}',
     55, 0.12, true),
    (NULL, 'Hiking', 'cardio', 'Trail hiking with elevation', 'mountain', '#059669', 180, 4,
     '{"track_distance": true, "track_elevation": true}',
     40, 0.08, true),

    -- Recovery activities
    (NULL, 'Foam Rolling', 'recovery', 'Self-myofascial release with foam roller', 'cylinder', '#64748b', 15, 2,
     '{"body_areas": true}',
     10, 0.02, true),
    (NULL, 'Massage', 'recovery', 'Professional or self-massage session', 'hand-finger', '#94a3b8', 60, 1,
     '{"massage_type": ["sports", "deep_tissue", "relaxation"]}',
     5, 0.01, true),
    (NULL, 'Ice Bath / Cold Therapy', 'recovery', 'Cold water immersion or cryotherapy', 'temperature-minus', '#38bdf8', 15, 2,
     '{"temperature": true, "duration_seconds": true}',
     5, 0.01, true),
    (NULL, 'Sauna', 'recovery', 'Heat therapy session', 'flame', '#f59e0b', 20, 2,
     '{"temperature": true, "sauna_type": ["dry", "steam", "infrared"]}',
     10, 0.02, true),

    -- Mind/Body activities
    (NULL, 'Meditation', 'mind_body', 'Mindfulness or guided meditation', 'brain', '#6366f1', 15, 1,
     '{"meditation_type": ["mindfulness", "guided", "breathing", "body_scan"]}',
     5, 0.01, true),
    (NULL, 'Breathing Exercises', 'mind_body', 'Structured breathing practice', 'wind', '#818cf8', 10, 2,
     '{"technique": ["box", "4-7-8", "wim_hof", "other"]}',
     5, 0.01, true),
    (NULL, 'Tai Chi', 'mind_body', 'Tai Chi practice', 'yin-yang', '#a5b4fc', 45, 3,
     '{}',
     20, 0.05, true)

ON CONFLICT DO NOTHING;

-- ============================================================================
-- FUNCTION: Calculate estimated TSS for cross-training activities
-- ============================================================================
CREATE OR REPLACE FUNCTION calculate_cross_training_tss(
    p_duration_minutes INTEGER,
    p_intensity INTEGER,
    p_tss_per_hour_base NUMERIC,
    p_tss_intensity_multiplier NUMERIC
) RETURNS NUMERIC AS $$
DECLARE
    hours NUMERIC;
    intensity_factor NUMERIC;
    result NUMERIC;
BEGIN
    hours := p_duration_minutes / 60.0;

    -- Calculate intensity factor (intensity 5 = 1.0, scales up/down from there)
    intensity_factor := 1.0 + (p_intensity - 5) * p_tss_intensity_multiplier;

    -- Ensure minimum factor of 0.3
    intensity_factor := GREATEST(0.3, intensity_factor);

    result := hours * p_tss_per_hour_base * intensity_factor;

    RETURN ROUND(result);
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TRIGGER: Auto-calculate TSS on insert/update
-- ============================================================================
CREATE OR REPLACE FUNCTION update_cross_training_tss()
RETURNS TRIGGER AS $$
DECLARE
    activity_type_record RECORD;
BEGIN
    -- Get the activity type's TSS parameters
    SELECT tss_per_hour_base, tss_intensity_multiplier
    INTO activity_type_record
    FROM activity_types
    WHERE id = NEW.activity_type_id;

    -- If we found the activity type, calculate TSS
    IF FOUND THEN
        NEW.estimated_tss := calculate_cross_training_tss(
            NEW.duration_minutes,
            NEW.intensity,
            activity_type_record.tss_per_hour_base,
            activity_type_record.tss_intensity_multiplier
        );
    ELSE
        -- Default calculation if no activity type
        NEW.estimated_tss := calculate_cross_training_tss(
            NEW.duration_minutes,
            NEW.intensity,
            50,  -- default base
            0.12  -- default multiplier
        );
    END IF;

    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_cross_training_tss
    BEFORE INSERT OR UPDATE ON cross_training_activities
    FOR EACH ROW
    EXECUTE FUNCTION update_cross_training_tss();

-- ============================================================================
-- ENABLE ROW LEVEL SECURITY
-- ============================================================================
ALTER TABLE activity_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE cross_training_activities ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- RLS POLICIES - Activity Types
-- ============================================================================
-- Users can view system activity types and their own custom types
CREATE POLICY "Users can view system and own activity types"
    ON activity_types FOR SELECT
    USING (is_system = true OR auth.uid() = user_id);

-- Users can create their own activity types
CREATE POLICY "Users can create own activity types"
    ON activity_types FOR INSERT
    WITH CHECK (auth.uid() = user_id AND is_system = false);

-- Users can update their own activity types (not system ones)
CREATE POLICY "Users can update own activity types"
    ON activity_types FOR UPDATE
    USING (auth.uid() = user_id AND is_system = false);

-- Users can delete their own activity types (not system ones)
CREATE POLICY "Users can delete own activity types"
    ON activity_types FOR DELETE
    USING (auth.uid() = user_id AND is_system = false);

-- ============================================================================
-- RLS POLICIES - Cross Training Activities
-- ============================================================================
CREATE POLICY "Users can view their own cross training activities"
    ON cross_training_activities FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own cross training activities"
    ON cross_training_activities FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own cross training activities"
    ON cross_training_activities FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own cross training activities"
    ON cross_training_activities FOR DELETE
    USING (auth.uid() = user_id);

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================
GRANT SELECT ON activity_types TO authenticated;
GRANT INSERT, UPDATE, DELETE ON activity_types TO authenticated;
GRANT ALL ON cross_training_activities TO authenticated;

GRANT ALL ON activity_types TO service_role;
GRANT ALL ON cross_training_activities TO service_role;

-- ============================================================================
-- VIEW: Daily training load summary including cross-training
-- ============================================================================
CREATE OR REPLACE VIEW daily_training_load AS
SELECT
    user_id,
    activity_date AS date,
    'cross_training' AS source,
    SUM(estimated_tss) AS total_tss,
    SUM(duration_minutes) AS total_duration_minutes,
    COUNT(*) AS activity_count,
    ARRAY_AGG(DISTINCT ct.activity_type_id) AS activity_type_ids
FROM cross_training_activities ct
GROUP BY user_id, activity_date;

-- Grant access to the view
GRANT SELECT ON daily_training_load TO authenticated;
GRANT SELECT ON daily_training_load TO service_role;
