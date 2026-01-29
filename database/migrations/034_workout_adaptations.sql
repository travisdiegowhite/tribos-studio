-- Migration: Workout Adaptations and Training Insights
-- Enables adaptive training intelligence by tracking workout substitutions,
-- providing AI-powered insights, and learning from user patterns
-- Run this in your Supabase SQL editor

-- ============================================================================
-- WORKOUT ADAPTATIONS TABLE
-- Tracks when users complete workouts differently than planned
-- ============================================================================
CREATE TABLE IF NOT EXISTS workout_adaptations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    planned_workout_id UUID REFERENCES planned_workouts(id) ON DELETE SET NULL,
    activity_id UUID REFERENCES activities(id) ON DELETE SET NULL,

    -- Classification of what happened
    adaptation_type TEXT NOT NULL, -- 'completed_as_planned', 'time_truncated', 'time_extended',
                                   -- 'intensity_swap', 'downgraded', 'upgraded', 'skipped', 'unplanned'

    -- Planned metrics (snapshot at time of detection)
    planned_workout_type TEXT,     -- 'sweet_spot', 'threshold', etc.
    planned_tss NUMERIC,
    planned_duration INTEGER,      -- minutes
    planned_intensity_factor NUMERIC,

    -- Actual metrics from completed activity
    actual_workout_type TEXT,      -- Detected category based on activity data
    actual_tss NUMERIC,
    actual_duration INTEGER,       -- minutes
    actual_intensity_factor NUMERIC,
    actual_normalized_power INTEGER,

    -- Deltas and analysis
    tss_delta NUMERIC,             -- actual - planned (negative = under, positive = over)
    duration_delta INTEGER,        -- minutes
    stimulus_achieved_pct NUMERIC, -- What % of planned stimulus was achieved

    -- Stimulus breakdown (what was lost/gained)
    stimulus_analysis JSONB,       -- {
                                   --   missing: {sweet_spot_minutes: 20, tss: 15},
                                   --   gained: {threshold_minutes: 10, tss: 5},
                                   --   net_assessment: 'acceptable'
                                   -- }

    -- User feedback (optional, collected via UI prompt)
    user_reason TEXT,              -- 'time_constraint', 'felt_tired', 'felt_good',
                                   -- 'weather', 'equipment', 'coach_adjustment', 'other'
    user_notes TEXT,

    -- AI assessment
    ai_assessment TEXT,            -- 'beneficial', 'acceptable', 'minor_concern', 'concerning'
    ai_explanation TEXT,
    ai_recommendations JSONB,      -- [{type: 'add_workout', details: {...}}, ...]

    -- Context at time of adaptation
    week_number INTEGER,
    training_phase TEXT,           -- 'base', 'build', 'peak', 'taper', 'recovery'
    ctg_at_time NUMERIC,           -- CTL when this happened
    atl_at_time NUMERIC,           -- ATL when this happened
    tsb_at_time NUMERIC,           -- TSB when this happened

    -- Metadata
    detected_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for workout_adaptations
CREATE INDEX IF NOT EXISTS idx_workout_adaptations_user_id ON workout_adaptations(user_id);
CREATE INDEX IF NOT EXISTS idx_workout_adaptations_planned_workout ON workout_adaptations(planned_workout_id);
CREATE INDEX IF NOT EXISTS idx_workout_adaptations_activity ON workout_adaptations(activity_id);
CREATE INDEX IF NOT EXISTS idx_workout_adaptations_type ON workout_adaptations(adaptation_type);
CREATE INDEX IF NOT EXISTS idx_workout_adaptations_detected ON workout_adaptations(detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_workout_adaptations_user_week ON workout_adaptations(user_id, week_number);

-- ============================================================================
-- TRAINING INSIGHTS TABLE
-- Persisted AI-generated insights and suggestions
-- ============================================================================
CREATE TABLE IF NOT EXISTS training_insights (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Scope of the insight
    insight_scope TEXT NOT NULL,   -- 'workout', 'day', 'week', 'block', 'trend'
    plan_id UUID REFERENCES training_plans(id) ON DELETE SET NULL,
    week_start DATE,               -- For week-scoped insights
    week_number INTEGER,

    -- Insight content
    insight_type TEXT NOT NULL,    -- 'suggestion', 'warning', 'praise', 'adaptation_needed',
                                   -- 'pattern_detected', 'goal_at_risk', 'recovery_needed'
    priority TEXT NOT NULL DEFAULT 'medium', -- 'low', 'medium', 'high', 'critical'
    title TEXT NOT NULL,
    message TEXT NOT NULL,

    -- Suggested action (optional)
    suggested_action JSONB,        -- {
                                   --   type: 'add_workout' | 'swap_workout' | 'extend_phase' |
                                   --         'add_recovery' | 'adjust_targets' | 'reschedule',
                                   --   details: {...specific to action type...}
                                   -- }

    -- Related entities
    related_workout_ids UUID[],    -- Workouts this insight relates to
    related_adaptation_ids UUID[], -- Adaptations that triggered this insight

    -- Status tracking
    status TEXT NOT NULL DEFAULT 'active', -- 'active', 'dismissed', 'applied', 'expired', 'superseded'
    applied_at TIMESTAMPTZ,
    dismissed_at TIMESTAMPTZ,
    dismissed_reason TEXT,
    expires_at TIMESTAMPTZ,        -- Auto-expire old insights

    -- Learning feedback
    outcome_rating INTEGER,        -- 1-5 user rating if suggestion was applied
    outcome_notes TEXT,

    -- Source tracking
    source TEXT NOT NULL DEFAULT 'system', -- 'system', 'ai_analysis', 'rule_engine', 'user_request'
    ai_model_version TEXT,         -- Track which AI model generated this

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for training_insights
CREATE INDEX IF NOT EXISTS idx_training_insights_user_id ON training_insights(user_id);
CREATE INDEX IF NOT EXISTS idx_training_insights_plan ON training_insights(plan_id);
CREATE INDEX IF NOT EXISTS idx_training_insights_status ON training_insights(status);
CREATE INDEX IF NOT EXISTS idx_training_insights_type ON training_insights(insight_type);
CREATE INDEX IF NOT EXISTS idx_training_insights_priority ON training_insights(priority);
CREATE INDEX IF NOT EXISTS idx_training_insights_week ON training_insights(user_id, week_start);
CREATE INDEX IF NOT EXISTS idx_training_insights_active ON training_insights(user_id, status) WHERE status = 'active';

-- ============================================================================
-- USER TRAINING PATTERNS TABLE
-- Learned patterns from user behavior for predictive suggestions
-- ============================================================================
CREATE TABLE IF NOT EXISTS user_training_patterns (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Overall compliance patterns
    avg_weekly_compliance NUMERIC,          -- 0-100%
    compliance_trend TEXT,                  -- 'improving', 'stable', 'declining'
    total_workouts_tracked INTEGER DEFAULT 0,
    total_adaptations_tracked INTEGER DEFAULT 0,

    -- Day-of-week patterns
    compliance_by_day JSONB,                -- {monday: 0.9, tuesday: 0.7, ...}
    preferred_workout_days JSONB,           -- [1, 2, 4, 6] (day numbers with highest compliance)
    problematic_days JSONB,                 -- [3, 5] (days frequently skipped/adapted)

    -- Adaptation patterns
    common_adaptations JSONB,               -- [{type: 'time_truncated', frequency: 0.3, avg_delta: -20}, ...]
    adaptation_reasons JSONB,               -- {time_constraint: 0.4, felt_tired: 0.2, ...}

    -- Time patterns
    avg_workout_time_preference TEXT,       -- 'morning', 'midday', 'evening', 'variable'
    avg_available_duration_by_day JSONB,    -- {monday: 60, tuesday: 45, ...}

    -- Workout type patterns
    workout_type_compliance JSONB,          -- {sweet_spot: 0.8, vo2max: 0.6, endurance: 0.95, ...}
    preferred_workout_types JSONB,          -- Types with highest compliance
    avoided_workout_types JSONB,            -- Types frequently skipped/downgraded

    -- Response to suggestions
    insights_shown INTEGER DEFAULT 0,
    insights_applied INTEGER DEFAULT 0,
    insights_dismissed INTEGER DEFAULT 0,
    insights_applied_rate NUMERIC,          -- applied / (applied + dismissed)
    successful_suggestion_types JSONB,      -- Types of suggestions user tends to follow

    -- Intensity patterns
    tends_to_overreach BOOLEAN DEFAULT false,
    tends_to_undertrain BOOLEAN DEFAULT false,
    avg_tss_achievement_pct NUMERIC,        -- Avg % of planned TSS achieved

    -- Seasonal/cyclical patterns
    seasonal_patterns JSONB,                -- Any detected seasonal trends

    -- Metadata
    first_tracked_at TIMESTAMPTZ,
    last_updated_at TIMESTAMPTZ DEFAULT NOW(),
    pattern_confidence NUMERIC DEFAULT 0,   -- 0-1, increases with more data
    min_data_for_predictions INTEGER DEFAULT 20 -- Min workouts before patterns are reliable
);

-- ============================================================================
-- ENABLE ROW LEVEL SECURITY
-- ============================================================================
ALTER TABLE workout_adaptations ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_training_patterns ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- RLS POLICIES - Workout Adaptations
-- ============================================================================
DROP POLICY IF EXISTS "Users can view their own workout adaptations" ON workout_adaptations;
CREATE POLICY "Users can view their own workout adaptations"
    ON workout_adaptations FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own workout adaptations" ON workout_adaptations;
CREATE POLICY "Users can insert their own workout adaptations"
    ON workout_adaptations FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own workout adaptations" ON workout_adaptations;
CREATE POLICY "Users can update their own workout adaptations"
    ON workout_adaptations FOR UPDATE
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own workout adaptations" ON workout_adaptations;
CREATE POLICY "Users can delete their own workout adaptations"
    ON workout_adaptations FOR DELETE
    USING (auth.uid() = user_id);

-- ============================================================================
-- RLS POLICIES - Training Insights
-- ============================================================================
DROP POLICY IF EXISTS "Users can view their own training insights" ON training_insights;
CREATE POLICY "Users can view their own training insights"
    ON training_insights FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own training insights" ON training_insights;
CREATE POLICY "Users can insert their own training insights"
    ON training_insights FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own training insights" ON training_insights;
CREATE POLICY "Users can update their own training insights"
    ON training_insights FOR UPDATE
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own training insights" ON training_insights;
CREATE POLICY "Users can delete their own training insights"
    ON training_insights FOR DELETE
    USING (auth.uid() = user_id);

-- ============================================================================
-- RLS POLICIES - User Training Patterns
-- ============================================================================
DROP POLICY IF EXISTS "Users can view their own training patterns" ON user_training_patterns;
CREATE POLICY "Users can view their own training patterns"
    ON user_training_patterns FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own training patterns" ON user_training_patterns;
CREATE POLICY "Users can insert their own training patterns"
    ON user_training_patterns FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own training patterns" ON user_training_patterns;
CREATE POLICY "Users can update their own training patterns"
    ON user_training_patterns FOR UPDATE
    USING (auth.uid() = user_id);

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================
GRANT ALL ON workout_adaptations TO authenticated;
GRANT ALL ON training_insights TO authenticated;
GRANT ALL ON user_training_patterns TO authenticated;
GRANT ALL ON workout_adaptations TO service_role;
GRANT ALL ON training_insights TO service_role;
GRANT ALL ON user_training_patterns TO service_role;

-- ============================================================================
-- TRIGGER: Auto-expire old insights
-- ============================================================================
CREATE OR REPLACE FUNCTION expire_old_insights()
RETURNS TRIGGER AS $$
BEGIN
    -- Mark insights as expired if past their expiration date
    UPDATE training_insights
    SET status = 'expired', updated_at = NOW()
    WHERE status = 'active'
    AND expires_at IS NOT NULL
    AND expires_at < NOW();

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Run expiration check on new insight creation
DROP TRIGGER IF EXISTS trigger_expire_old_insights ON training_insights;
CREATE TRIGGER trigger_expire_old_insights
    AFTER INSERT ON training_insights
    FOR EACH STATEMENT
    EXECUTE FUNCTION expire_old_insights();

-- ============================================================================
-- TRIGGER: Update training_insights timestamp
-- ============================================================================
CREATE OR REPLACE FUNCTION update_training_insights_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_training_insights_timestamp ON training_insights;
CREATE TRIGGER trigger_update_training_insights_timestamp
    BEFORE UPDATE ON training_insights
    FOR EACH ROW
    EXECUTE FUNCTION update_training_insights_timestamp();

-- ============================================================================
-- FUNCTION: Get week's adaptations summary
-- ============================================================================
CREATE OR REPLACE FUNCTION get_week_adaptations_summary(
    p_user_id UUID,
    p_week_start DATE
)
RETURNS TABLE (
    total_planned INTEGER,
    total_completed INTEGER,
    total_adapted INTEGER,
    total_skipped INTEGER,
    avg_stimulus_achieved NUMERIC,
    adaptation_types JSONB,
    tss_planned NUMERIC,
    tss_actual NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(DISTINCT wa.planned_workout_id)::INTEGER AS total_planned,
        COUNT(DISTINCT wa.activity_id)::INTEGER AS total_completed,
        COUNT(*) FILTER (WHERE wa.adaptation_type NOT IN ('completed_as_planned', 'skipped'))::INTEGER AS total_adapted,
        COUNT(*) FILTER (WHERE wa.adaptation_type = 'skipped')::INTEGER AS total_skipped,
        AVG(wa.stimulus_achieved_pct) AS avg_stimulus_achieved,
        jsonb_object_agg(
            wa.adaptation_type,
            COUNT(*) FILTER (WHERE wa.adaptation_type = wa.adaptation_type)
        ) AS adaptation_types,
        SUM(wa.planned_tss) AS tss_planned,
        SUM(wa.actual_tss) AS tss_actual
    FROM workout_adaptations wa
    WHERE wa.user_id = p_user_id
    AND wa.detected_at >= p_week_start
    AND wa.detected_at < p_week_start + INTERVAL '7 days';
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FUNCTION: Get user's active insights count
-- ============================================================================
CREATE OR REPLACE FUNCTION get_active_insights_count(p_user_id UUID)
RETURNS TABLE (
    total INTEGER,
    high_priority INTEGER,
    suggestions INTEGER,
    warnings INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*)::INTEGER AS total,
        COUNT(*) FILTER (WHERE priority IN ('high', 'critical'))::INTEGER AS high_priority,
        COUNT(*) FILTER (WHERE insight_type = 'suggestion')::INTEGER AS suggestions,
        COUNT(*) FILTER (WHERE insight_type = 'warning')::INTEGER AS warnings
    FROM training_insights
    WHERE user_id = p_user_id
    AND status = 'active';
END;
$$ LANGUAGE plpgsql;
