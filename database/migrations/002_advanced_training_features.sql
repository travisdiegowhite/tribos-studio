-- Migration: Advanced Training Features
-- Phase 2: FTP History, Health Metrics, Progression Levels, Workout Feedback
-- Run this in your Supabase SQL editor

-- ============================================================================
-- FTP HISTORY TABLE
-- Track FTP changes over time for trend analysis
-- ============================================================================
CREATE TABLE IF NOT EXISTS ftp_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    ftp_value INTEGER NOT NULL,
    detection_method TEXT NOT NULL DEFAULT 'manual', -- 'manual', 'test', 'auto_detected', 'workout_estimate'
    test_type TEXT, -- '20min', 'ramp', '8min', 'race'
    confidence_score NUMERIC, -- 0-100 for auto-detected values
    notes TEXT,
    recorded_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_ftp_history_user_id ON ftp_history(user_id);
CREATE INDEX IF NOT EXISTS idx_ftp_history_recorded_at ON ftp_history(recorded_at DESC);

-- ============================================================================
-- HEALTH METRICS TABLE
-- Daily health check-ins for better training recommendations
-- ============================================================================
CREATE TABLE IF NOT EXISTS health_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    recorded_date DATE NOT NULL,

    -- Core metrics
    resting_heart_rate INTEGER, -- bpm
    hrv_score NUMERIC, -- ms (RMSSD) or device-specific score
    hrv_source TEXT, -- 'garmin', 'whoop', 'oura', 'apple_watch', 'manual'

    -- Sleep metrics
    sleep_hours NUMERIC,
    sleep_quality INTEGER, -- 1-5 scale
    sleep_score NUMERIC, -- Device-provided score (0-100)

    -- Subjective metrics
    energy_level INTEGER, -- 1-5 scale
    muscle_soreness INTEGER, -- 1-5 scale (1=none, 5=severe)
    mood INTEGER, -- 1-5 scale
    stress_level INTEGER, -- 1-5 scale

    -- Weight tracking
    weight_kg NUMERIC,

    -- Recovery indicators
    readiness_score NUMERIC, -- Calculated or device-provided (0-100)

    -- Notes
    notes TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- One entry per user per day
    UNIQUE(user_id, recorded_date)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_health_metrics_user_id ON health_metrics(user_id);
CREATE INDEX IF NOT EXISTS idx_health_metrics_date ON health_metrics(recorded_date DESC);

-- ============================================================================
-- PROGRESSION LEVELS TABLE
-- Track zone-specific fitness levels (inspired by TrainerRoad's Progression Levels)
-- ============================================================================
CREATE TABLE IF NOT EXISTS progression_levels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Zone levels (1.0 - 10.0 scale)
    endurance_level NUMERIC DEFAULT 1.0,
    tempo_level NUMERIC DEFAULT 1.0,
    sweet_spot_level NUMERIC DEFAULT 1.0,
    threshold_level NUMERIC DEFAULT 1.0,
    vo2max_level NUMERIC DEFAULT 1.0,
    anaerobic_level NUMERIC DEFAULT 1.0,
    sprint_level NUMERIC DEFAULT 1.0,

    -- Time in zone (accumulated seconds)
    endurance_time_seconds INTEGER DEFAULT 0,
    tempo_time_seconds INTEGER DEFAULT 0,
    sweet_spot_time_seconds INTEGER DEFAULT 0,
    threshold_time_seconds INTEGER DEFAULT 0,
    vo2max_time_seconds INTEGER DEFAULT 0,
    anaerobic_time_seconds INTEGER DEFAULT 0,
    sprint_time_seconds INTEGER DEFAULT 0,

    -- Workout counts by zone
    endurance_workouts INTEGER DEFAULT 0,
    tempo_workouts INTEGER DEFAULT 0,
    sweet_spot_workouts INTEGER DEFAULT 0,
    threshold_workouts INTEGER DEFAULT 0,
    vo2max_workouts INTEGER DEFAULT 0,
    anaerobic_workouts INTEGER DEFAULT 0,
    sprint_workouts INTEGER DEFAULT 0,

    -- Last workout dates by zone
    endurance_last_workout TIMESTAMPTZ,
    tempo_last_workout TIMESTAMPTZ,
    sweet_spot_last_workout TIMESTAMPTZ,
    threshold_last_workout TIMESTAMPTZ,
    vo2max_last_workout TIMESTAMPTZ,
    anaerobic_last_workout TIMESTAMPTZ,
    sprint_last_workout TIMESTAMPTZ,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(user_id)
);

-- ============================================================================
-- WORKOUT FEEDBACK TABLE
-- Store user feedback on completed workouts for AI learning
-- ============================================================================
CREATE TABLE IF NOT EXISTS workout_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    activity_id UUID REFERENCES strava_activities(id) ON DELETE SET NULL,
    workout_id TEXT, -- Reference to workout library if applicable

    -- Completion status
    completed BOOLEAN DEFAULT true,
    completion_percentage INTEGER DEFAULT 100, -- 0-100

    -- Difficulty feedback
    perceived_difficulty INTEGER, -- 1-5 (1=too easy, 3=just right, 5=too hard)
    rpe_score INTEGER, -- Rate of Perceived Exertion 1-10

    -- Performance vs targets
    hit_power_targets BOOLEAN,
    hit_hr_targets BOOLEAN,
    hit_duration_targets BOOLEAN,

    -- Qualitative feedback
    enjoyment INTEGER, -- 1-5 scale
    would_repeat BOOLEAN,

    -- Open feedback
    notes TEXT,
    what_went_well TEXT,
    what_was_hard TEXT,

    -- AI learning flags
    ai_should_adjust BOOLEAN DEFAULT false,
    adjustment_direction TEXT, -- 'easier', 'harder', 'shorter', 'longer'

    recorded_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_workout_feedback_user_id ON workout_feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_workout_feedback_activity_id ON workout_feedback(activity_id);
CREATE INDEX IF NOT EXISTS idx_workout_feedback_recorded_at ON workout_feedback(recorded_at DESC);

-- ============================================================================
-- ENABLE ROW LEVEL SECURITY
-- ============================================================================
ALTER TABLE ftp_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE health_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE progression_levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout_feedback ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- RLS POLICIES - FTP History
-- ============================================================================
CREATE POLICY "Users can view their own FTP history"
    ON ftp_history FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own FTP history"
    ON ftp_history FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own FTP history"
    ON ftp_history FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own FTP history"
    ON ftp_history FOR DELETE
    USING (auth.uid() = user_id);

-- ============================================================================
-- RLS POLICIES - Health Metrics
-- ============================================================================
CREATE POLICY "Users can view their own health metrics"
    ON health_metrics FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own health metrics"
    ON health_metrics FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own health metrics"
    ON health_metrics FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own health metrics"
    ON health_metrics FOR DELETE
    USING (auth.uid() = user_id);

-- ============================================================================
-- RLS POLICIES - Progression Levels
-- ============================================================================
CREATE POLICY "Users can view their own progression levels"
    ON progression_levels FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own progression levels"
    ON progression_levels FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own progression levels"
    ON progression_levels FOR UPDATE
    USING (auth.uid() = user_id);

-- ============================================================================
-- RLS POLICIES - Workout Feedback
-- ============================================================================
CREATE POLICY "Users can view their own workout feedback"
    ON workout_feedback FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own workout feedback"
    ON workout_feedback FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own workout feedback"
    ON workout_feedback FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own workout feedback"
    ON workout_feedback FOR DELETE
    USING (auth.uid() = user_id);

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================
GRANT ALL ON ftp_history TO authenticated;
GRANT ALL ON health_metrics TO authenticated;
GRANT ALL ON progression_levels TO authenticated;
GRANT ALL ON workout_feedback TO authenticated;

GRANT ALL ON ftp_history TO service_role;
GRANT ALL ON health_metrics TO service_role;
GRANT ALL ON progression_levels TO service_role;
GRANT ALL ON workout_feedback TO service_role;

-- ============================================================================
-- HELPER FUNCTION: Calculate readiness score from health metrics
-- ============================================================================
CREATE OR REPLACE FUNCTION calculate_readiness_score(
    p_rhr INTEGER,
    p_hrv NUMERIC,
    p_sleep_hours NUMERIC,
    p_sleep_quality INTEGER,
    p_energy INTEGER,
    p_soreness INTEGER,
    p_stress INTEGER
) RETURNS NUMERIC AS $$
DECLARE
    score NUMERIC := 0;
    factor_count INTEGER := 0;
BEGIN
    -- HRV contribution (higher is better, normalized to 0-25)
    IF p_hrv IS NOT NULL THEN
        score := score + LEAST(25, p_hrv / 4);
        factor_count := factor_count + 1;
    END IF;

    -- Sleep hours contribution (7-9 hours optimal, 0-25)
    IF p_sleep_hours IS NOT NULL THEN
        score := score + CASE
            WHEN p_sleep_hours >= 7 AND p_sleep_hours <= 9 THEN 25
            WHEN p_sleep_hours >= 6 THEN 20
            WHEN p_sleep_hours >= 5 THEN 15
            ELSE 10
        END;
        factor_count := factor_count + 1;
    END IF;

    -- Sleep quality contribution (1-5 scale to 0-25)
    IF p_sleep_quality IS NOT NULL THEN
        score := score + (p_sleep_quality * 5);
        factor_count := factor_count + 1;
    END IF;

    -- Energy level contribution (1-5 scale to 0-25)
    IF p_energy IS NOT NULL THEN
        score := score + (p_energy * 5);
        factor_count := factor_count + 1;
    END IF;

    -- Soreness contribution (inverted: less soreness = better, 0-25)
    IF p_soreness IS NOT NULL THEN
        score := score + ((6 - p_soreness) * 5);
        factor_count := factor_count + 1;
    END IF;

    -- Stress contribution (inverted: less stress = better, 0-25)
    IF p_stress IS NOT NULL THEN
        score := score + ((6 - p_stress) * 5);
        factor_count := factor_count + 1;
    END IF;

    -- Return normalized score (0-100)
    IF factor_count > 0 THEN
        RETURN ROUND((score / (factor_count * 25)) * 100);
    ELSE
        RETURN NULL;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TRIGGER: Auto-calculate readiness score on health metrics insert/update
-- ============================================================================
CREATE OR REPLACE FUNCTION update_readiness_score()
RETURNS TRIGGER AS $$
BEGIN
    NEW.readiness_score := calculate_readiness_score(
        NEW.resting_heart_rate,
        NEW.hrv_score,
        NEW.sleep_hours,
        NEW.sleep_quality,
        NEW.energy_level,
        NEW.muscle_soreness,
        NEW.stress_level
    );
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_readiness_score
    BEFORE INSERT OR UPDATE ON health_metrics
    FOR EACH ROW
    EXECUTE FUNCTION update_readiness_score();
