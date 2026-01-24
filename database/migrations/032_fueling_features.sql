-- Migration: Fueling Features
-- Purpose: Enable on-bike fueling recommendations and optional fuel tracking
-- Philosophy: Contextual guidance that integrates naturally with training data

-- ============================================================================
-- EXTEND health_metrics WITH DAILY FUEL CHECK FIELDS
-- Optional Level 2 tracking - quick daily check for users who want more insight
-- ============================================================================
ALTER TABLE health_metrics
ADD COLUMN IF NOT EXISTS meals_eaten INTEGER CHECK (meals_eaten >= 1 AND meals_eaten <= 6),
ADD COLUMN IF NOT EXISTS protein_at_meals TEXT CHECK (protein_at_meals IN ('yes', 'kinda', 'no')),
ADD COLUMN IF NOT EXISTS hydration_level TEXT CHECK (hydration_level IN ('low', 'ok', 'good')),
ADD COLUMN IF NOT EXISTS pre_workout_fuel TEXT CHECK (pre_workout_fuel IN ('yes', 'no', 'no_workout'));

COMMENT ON COLUMN health_metrics.meals_eaten IS 'Number of meals eaten yesterday (1-6)';
COMMENT ON COLUMN health_metrics.protein_at_meals IS 'Had protein at most meals?';
COMMENT ON COLUMN health_metrics.hydration_level IS 'Subjective hydration assessment';
COMMENT ON COLUMN health_metrics.pre_workout_fuel IS 'Pre-workout fueling for any workouts';

-- ============================================================================
-- EXTEND cafe_check_ins WITH WEEKLY FUEL CHECK FIELDS
-- Integrated into weekly Cafe reflection for lower friction
-- ============================================================================
ALTER TABLE cafe_check_ins
ADD COLUMN IF NOT EXISTS energy_rating TEXT CHECK (
    energy_rating IN ('running_on_empty', 'flat', 'dialed', 'overfueled')
),
ADD COLUMN IF NOT EXISTS had_bonks BOOLEAN,
ADD COLUMN IF NOT EXISTS bonk_details TEXT CHECK (char_length(bonk_details) <= 300),
ADD COLUMN IF NOT EXISTS energy_factors TEXT[] DEFAULT ARRAY[]::TEXT[];

COMMENT ON COLUMN cafe_check_ins.energy_rating IS 'How did energy feel this week?';
COMMENT ON COLUMN cafe_check_ins.had_bonks IS 'Any bonks or energy crashes?';
COMMENT ON COLUMN cafe_check_ins.bonk_details IS 'Details about bonks if any';
COMMENT ON COLUMN cafe_check_ins.energy_factors IS 'Factors affecting energy (stress, illness, travel, etc.)';

-- ============================================================================
-- EXTEND user_profiles WITH FUELING PREFERENCES
-- Used to personalize recommendations
-- ============================================================================
ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS fueling_preferences JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN user_profiles.fueling_preferences IS 'User fueling preferences: dietary_restrictions, gi_sensitivity, preferred_products, etc.';

-- Example structure:
-- {
--   "dietary_restrictions": ["vegetarian", "gluten_free"],
--   "gi_sensitivity": "normal", // "normal", "sensitive", "very_sensitive"
--   "preferred_products": ["gel", "chews", "bars"],
--   "caffeine_tolerance": "normal", // "none", "low", "normal", "high"
--   "show_fuel_cards": true,
--   "fuel_check_enabled": false // opt-in for daily checks
-- }

-- ============================================================================
-- FUEL FEEDBACK TABLE
-- Post-ride fueling feedback to improve recommendations
-- ============================================================================
CREATE TABLE IF NOT EXISTS fuel_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Link to what was fueled
    activity_id UUID REFERENCES activities(id) ON DELETE SET NULL,
    planned_workout_id UUID REFERENCES planned_workouts(id) ON DELETE SET NULL,
    route_id UUID REFERENCES routes(id) ON DELETE SET NULL,

    -- Ride context
    ride_date DATE NOT NULL,
    duration_minutes INTEGER NOT NULL,
    intensity TEXT CHECK (intensity IN ('recovery', 'easy', 'moderate', 'tempo', 'threshold', 'race')),

    -- Fueling assessment
    fueling_rating TEXT NOT NULL CHECK (
        fueling_rating IN ('bonked', 'underfueled', 'good', 'overfueled')
    ),

    -- What they actually consumed (optional detail)
    carbs_consumed_grams INTEGER,
    fluid_consumed_ml INTEGER,
    pre_ride_meal BOOLEAN,

    -- Specific issues
    had_gi_issues BOOLEAN DEFAULT false,
    gi_issue_notes TEXT CHECK (char_length(gi_issue_notes) <= 300),

    -- Free-form notes
    notes TEXT CHECK (char_length(notes) <= 500),

    -- Weather context at time of ride
    weather_conditions JSONB,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_fuel_feedback_user ON fuel_feedback(user_id);
CREATE INDEX idx_fuel_feedback_activity ON fuel_feedback(activity_id);
CREATE INDEX idx_fuel_feedback_date ON fuel_feedback(ride_date DESC);
CREATE INDEX idx_fuel_feedback_rating ON fuel_feedback(user_id, fueling_rating);

-- ============================================================================
-- FUEL INSIGHTS TABLE
-- Store computed fueling insights/patterns for users
-- ============================================================================
CREATE TABLE IF NOT EXISTS fuel_insights (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Insight metadata
    insight_type TEXT NOT NULL CHECK (
        insight_type IN (
            'bonk_pattern',        -- Pattern in when bonks occur
            'pre_ride_correlation', -- Pre-ride fueling correlations
            'high_volume_needs',    -- Fueling needs on high-volume weeks
            'duration_threshold',   -- Duration at which fueling becomes critical
            'weekly_energy_trend',  -- Energy ratings over time
            'gi_sensitivity',       -- GI issue patterns
            'custom'               -- AI-generated custom insight
        )
    ),

    -- The insight content
    title TEXT NOT NULL CHECK (char_length(title) <= 100),
    description TEXT NOT NULL CHECK (char_length(description) <= 500),

    -- Supporting data
    data JSONB,  -- Supporting metrics, charts, etc.

    -- Confidence and actions
    confidence_score NUMERIC CHECK (confidence_score >= 0 AND confidence_score <= 1),
    suggested_action TEXT CHECK (char_length(suggested_action) <= 300),

    -- Status
    is_active BOOLEAN DEFAULT true,
    dismissed_at TIMESTAMPTZ,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_fuel_insights_user ON fuel_insights(user_id);
CREATE INDEX idx_fuel_insights_active ON fuel_insights(user_id, is_active) WHERE is_active = true;
CREATE INDEX idx_fuel_insights_type ON fuel_insights(user_id, insight_type);

-- ============================================================================
-- RACE FUEL PLANS TABLE
-- Pre-generated fuel plans for race goals
-- ============================================================================
CREATE TABLE IF NOT EXISTS race_fuel_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    race_goal_id UUID NOT NULL REFERENCES race_goals(id) ON DELETE CASCADE,

    -- Plan content (generated, can be regenerated)
    plan_data JSONB NOT NULL,
    -- Structure:
    -- {
    --   "night_before": { "carbs_grams": 150, "notes": "..." },
    --   "race_morning": { "carbs_grams": 250, "timing_hours": 3, "notes": "..." },
    --   "on_course": {
    --     "carbs_per_hour_min": 80,
    --     "carbs_per_hour_max": 100,
    --     "total_carbs_min": 720,
    --     "total_carbs_max": 1100,
    --     "hydration_ml_per_hour": 800
    --   },
    --   "aid_station_strategy": [...],
    --   "warnings": [...],
    --   "plain_english_summary": "..."
    -- }

    -- Generation context
    weather_forecast JSONB,  -- Forecast at time of generation
    generated_at TIMESTAMPTZ DEFAULT NOW(),

    -- User modifications
    user_notes TEXT CHECK (char_length(user_notes) <= 1000),
    is_customized BOOLEAN DEFAULT false,

    -- Reminders sent
    reminder_sent_week_before BOOLEAN DEFAULT false,
    reminder_sent_day_before BOOLEAN DEFAULT false,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- One plan per race goal
    UNIQUE(race_goal_id)
);

-- Indexes
CREATE INDEX idx_race_fuel_plans_user ON race_fuel_plans(user_id);
CREATE INDEX idx_race_fuel_plans_race ON race_fuel_plans(race_goal_id);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

-- fuel_feedback RLS
ALTER TABLE fuel_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own fuel feedback"
    ON fuel_feedback FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own fuel feedback"
    ON fuel_feedback FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own fuel feedback"
    ON fuel_feedback FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own fuel feedback"
    ON fuel_feedback FOR DELETE
    TO authenticated
    USING (auth.uid() = user_id);

-- fuel_insights RLS
ALTER TABLE fuel_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own fuel insights"
    ON fuel_insights FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own fuel insights"
    ON fuel_insights FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own fuel insights"
    ON fuel_insights FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own fuel insights"
    ON fuel_insights FOR DELETE
    TO authenticated
    USING (auth.uid() = user_id);

-- race_fuel_plans RLS
ALTER TABLE race_fuel_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own race fuel plans"
    ON race_fuel_plans FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own race fuel plans"
    ON race_fuel_plans FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own race fuel plans"
    ON race_fuel_plans FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own race fuel plans"
    ON race_fuel_plans FOR DELETE
    TO authenticated
    USING (auth.uid() = user_id);

-- ============================================================================
-- UPDATED_AT TRIGGERS
-- ============================================================================

CREATE OR REPLACE FUNCTION update_fuel_insights_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_fuel_insights_updated_at
    BEFORE UPDATE ON fuel_insights
    FOR EACH ROW
    EXECUTE FUNCTION update_fuel_insights_updated_at();

CREATE OR REPLACE FUNCTION update_race_fuel_plans_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_race_fuel_plans_updated_at
    BEFORE UPDATE ON race_fuel_plans
    FOR EACH ROW
    EXECUTE FUNCTION update_race_fuel_plans_updated_at();
