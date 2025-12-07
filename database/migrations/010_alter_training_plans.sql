-- Migration: Alter training_plans table to add missing columns
-- This adds columns needed for the TrainingPlanBrowser component
-- Run this in your Supabase SQL editor

-- ============================================================================
-- ADD MISSING COLUMNS TO training_plans
-- ============================================================================

-- Add template_id for linking to plan templates
ALTER TABLE training_plans
ADD COLUMN IF NOT EXISTS template_id TEXT;

-- Add duration_weeks
ALTER TABLE training_plans
ADD COLUMN IF NOT EXISTS duration_weeks INTEGER;

-- Add methodology (polarized, sweet_spot, etc.)
ALTER TABLE training_plans
ADD COLUMN IF NOT EXISTS methodology TEXT;

-- Add fitness_level
ALTER TABLE training_plans
ADD COLUMN IF NOT EXISTS fitness_level TEXT;

-- Add started_at (alias for start_date as timestamptz)
ALTER TABLE training_plans
ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;

-- Add ended_at (alias for end_date as timestamptz)
ALTER TABLE training_plans
ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ;

-- Add paused_at for pause functionality
ALTER TABLE training_plans
ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ;

-- Add progress tracking columns
ALTER TABLE training_plans
ADD COLUMN IF NOT EXISTS current_week INTEGER DEFAULT 1;

ALTER TABLE training_plans
ADD COLUMN IF NOT EXISTS workouts_completed INTEGER DEFAULT 0;

ALTER TABLE training_plans
ADD COLUMN IF NOT EXISTS workouts_total INTEGER DEFAULT 0;

ALTER TABLE training_plans
ADD COLUMN IF NOT EXISTS compliance_percentage NUMERIC DEFAULT 0;

-- ============================================================================
-- CREATE planned_workouts TABLE IF NOT EXISTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS planned_workouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id UUID NOT NULL REFERENCES training_plans(id) ON DELETE CASCADE,

    -- Scheduling
    week_number INTEGER NOT NULL,
    day_of_week INTEGER NOT NULL,
    scheduled_date DATE,

    -- Workout details
    workout_type TEXT NOT NULL,
    workout_id TEXT,

    -- Targets
    target_tss INTEGER,
    target_duration INTEGER,
    target_distance_km NUMERIC,

    -- Completion tracking
    completed BOOLEAN DEFAULT false,
    completed_at TIMESTAMPTZ,
    activity_id UUID,

    -- Actual results
    actual_tss INTEGER,
    actual_duration INTEGER,
    actual_distance_km NUMERIC,

    -- Feedback
    difficulty_rating INTEGER,
    notes TEXT,
    skipped_reason TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_planned_workouts_plan_id ON planned_workouts(plan_id);
CREATE INDEX IF NOT EXISTS idx_planned_workouts_week ON planned_workouts(week_number);
CREATE INDEX IF NOT EXISTS idx_planned_workouts_scheduled ON planned_workouts(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_planned_workouts_completed ON planned_workouts(completed);

-- ============================================================================
-- ENABLE RLS ON planned_workouts
-- ============================================================================
ALTER TABLE planned_workouts ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (to avoid errors)
DROP POLICY IF EXISTS "Users can view their own planned workouts" ON planned_workouts;
DROP POLICY IF EXISTS "Users can insert their own planned workouts" ON planned_workouts;
DROP POLICY IF EXISTS "Users can update their own planned workouts" ON planned_workouts;
DROP POLICY IF EXISTS "Users can delete their own planned workouts" ON planned_workouts;

-- Create RLS policies
CREATE POLICY "Users can view their own planned workouts"
    ON planned_workouts FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM training_plans
            WHERE training_plans.id = planned_workouts.plan_id
            AND training_plans.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert their own planned workouts"
    ON planned_workouts FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM training_plans
            WHERE training_plans.id = planned_workouts.plan_id
            AND training_plans.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update their own planned workouts"
    ON planned_workouts FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM training_plans
            WHERE training_plans.id = planned_workouts.plan_id
            AND training_plans.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete their own planned workouts"
    ON planned_workouts FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM training_plans
            WHERE training_plans.id = planned_workouts.plan_id
            AND training_plans.user_id = auth.uid()
        )
    );

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================
GRANT ALL ON planned_workouts TO authenticated;
GRANT ALL ON planned_workouts TO service_role;

-- ============================================================================
-- CREATE health_metrics TABLE IF NOT EXISTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS health_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    recorded_date DATE NOT NULL,

    -- Core metrics
    resting_heart_rate INTEGER,
    hrv_score NUMERIC,
    hrv_source TEXT,

    -- Sleep metrics
    sleep_hours NUMERIC,
    sleep_quality INTEGER,
    sleep_score NUMERIC,

    -- Subjective metrics
    energy_level INTEGER,
    muscle_soreness INTEGER,
    mood INTEGER,
    stress_level INTEGER,

    -- Weight tracking
    weight_kg NUMERIC,

    -- Recovery indicators
    readiness_score NUMERIC,

    -- Notes
    notes TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(user_id, recorded_date)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_health_metrics_user_id ON health_metrics(user_id);
CREATE INDEX IF NOT EXISTS idx_health_metrics_date ON health_metrics(recorded_date DESC);

-- Enable RLS
ALTER TABLE health_metrics ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view their own health metrics" ON health_metrics;
DROP POLICY IF EXISTS "Users can insert their own health metrics" ON health_metrics;
DROP POLICY IF EXISTS "Users can update their own health metrics" ON health_metrics;
DROP POLICY IF EXISTS "Users can delete their own health metrics" ON health_metrics;

-- Create RLS policies
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

-- Grant permissions
GRANT ALL ON health_metrics TO authenticated;
GRANT ALL ON health_metrics TO service_role;

-- ============================================================================
-- UPDATE TRIGGER for compliance tracking
-- ============================================================================
CREATE OR REPLACE FUNCTION update_plan_compliance()
RETURNS TRIGGER AS $$
DECLARE
    total_count INTEGER;
    completed_count INTEGER;
BEGIN
    SELECT
        COUNT(*) FILTER (WHERE workout_type != 'rest'),
        COUNT(*) FILTER (WHERE workout_type != 'rest' AND completed = true)
    INTO total_count, completed_count
    FROM planned_workouts
    WHERE plan_id = NEW.plan_id;

    UPDATE training_plans
    SET
        workouts_completed = completed_count,
        workouts_total = total_count,
        compliance_percentage = CASE
            WHEN total_count > 0 THEN ROUND((completed_count::NUMERIC / total_count) * 100, 1)
            ELSE 0
        END,
        updated_at = NOW()
    WHERE id = NEW.plan_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_plan_compliance ON planned_workouts;
CREATE TRIGGER trigger_update_plan_compliance
    AFTER INSERT OR UPDATE OF completed ON planned_workouts
    FOR EACH ROW
    EXECUTE FUNCTION update_plan_compliance();
