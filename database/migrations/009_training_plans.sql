-- Migration: Training Plans and Planned Workouts
-- Enables structured training plan management with weekly workout scheduling
-- Run this in your Supabase SQL editor

-- ============================================================================
-- TRAINING PLANS TABLE
-- Store user's active and completed training plans
-- ============================================================================
CREATE TABLE IF NOT EXISTS training_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Plan identification
    template_id TEXT NOT NULL, -- Reference to trainingPlanTemplates.js
    name TEXT NOT NULL,

    -- Plan configuration
    duration_weeks INTEGER NOT NULL,
    methodology TEXT, -- 'polarized', 'sweet_spot', 'pyramidal', 'threshold', 'endurance'
    goal TEXT, -- 'general_fitness', 'century', 'climbing', 'racing', etc.
    fitness_level TEXT, -- 'beginner', 'intermediate', 'advanced'

    -- Status tracking
    status TEXT NOT NULL DEFAULT 'active', -- 'active', 'paused', 'completed', 'cancelled'
    started_at TIMESTAMPTZ NOT NULL,
    ended_at TIMESTAMPTZ,
    paused_at TIMESTAMPTZ,

    -- Progress tracking
    current_week INTEGER DEFAULT 1,
    workouts_completed INTEGER DEFAULT 0,
    workouts_total INTEGER DEFAULT 0,
    compliance_percentage NUMERIC DEFAULT 0,

    -- Customization
    custom_start_day INTEGER DEFAULT 1, -- 0=Sunday, 1=Monday, etc.
    auto_adjust_enabled BOOLEAN DEFAULT false, -- Allow AI to adjust plan

    -- Metadata
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_training_plans_user_id ON training_plans(user_id);
CREATE INDEX IF NOT EXISTS idx_training_plans_status ON training_plans(status);
CREATE INDEX IF NOT EXISTS idx_training_plans_started_at ON training_plans(started_at DESC);

-- ============================================================================
-- PLANNED WORKOUTS TABLE
-- Individual workouts scheduled as part of a training plan
-- ============================================================================
CREATE TABLE IF NOT EXISTS planned_workouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id UUID NOT NULL REFERENCES training_plans(id) ON DELETE CASCADE,

    -- Scheduling
    week_number INTEGER NOT NULL,
    day_of_week INTEGER NOT NULL, -- 0=Sunday, 1=Monday, ..., 6=Saturday
    scheduled_date DATE, -- Optional: specific date if plan has start date

    -- Workout details
    workout_type TEXT NOT NULL, -- 'rest', 'recovery', 'endurance', 'tempo', 'threshold', 'vo2max', etc.
    workout_id TEXT, -- Reference to workoutLibrary.js if applicable

    -- Targets
    target_tss INTEGER,
    target_duration INTEGER, -- minutes
    target_distance_km NUMERIC,

    -- Completion tracking
    completed BOOLEAN DEFAULT false,
    completed_at TIMESTAMPTZ,
    activity_id UUID, -- Link to actual activity if completed

    -- Actual results (filled when completed)
    actual_tss INTEGER,
    actual_duration INTEGER,
    actual_distance_km NUMERIC,

    -- Feedback
    difficulty_rating INTEGER, -- 1-5
    notes TEXT,
    skipped_reason TEXT, -- If workout was skipped

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_planned_workouts_plan_id ON planned_workouts(plan_id);
CREATE INDEX IF NOT EXISTS idx_planned_workouts_week ON planned_workouts(week_number);
CREATE INDEX IF NOT EXISTS idx_planned_workouts_scheduled ON planned_workouts(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_planned_workouts_completed ON planned_workouts(completed);

-- ============================================================================
-- ENABLE ROW LEVEL SECURITY
-- ============================================================================
ALTER TABLE training_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE planned_workouts ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- RLS POLICIES - Training Plans
-- ============================================================================
DROP POLICY IF EXISTS "Users can view their own training plans" ON training_plans;
CREATE POLICY "Users can view their own training plans"
    ON training_plans FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own training plans" ON training_plans;
CREATE POLICY "Users can insert their own training plans"
    ON training_plans FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own training plans" ON training_plans;
CREATE POLICY "Users can update their own training plans"
    ON training_plans FOR UPDATE
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own training plans" ON training_plans;
CREATE POLICY "Users can delete their own training plans"
    ON training_plans FOR DELETE
    USING (auth.uid() = user_id);

-- ============================================================================
-- RLS POLICIES - Planned Workouts
-- Users can access workouts through their plans
-- ============================================================================
DROP POLICY IF EXISTS "Users can view their own planned workouts" ON planned_workouts;
CREATE POLICY "Users can view their own planned workouts"
    ON planned_workouts FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM training_plans
            WHERE training_plans.id = planned_workouts.plan_id
            AND training_plans.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Users can insert their own planned workouts" ON planned_workouts;
CREATE POLICY "Users can insert their own planned workouts"
    ON planned_workouts FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM training_plans
            WHERE training_plans.id = planned_workouts.plan_id
            AND training_plans.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Users can update their own planned workouts" ON planned_workouts;
CREATE POLICY "Users can update their own planned workouts"
    ON planned_workouts FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM training_plans
            WHERE training_plans.id = planned_workouts.plan_id
            AND training_plans.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Users can delete their own planned workouts" ON planned_workouts;
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
GRANT ALL ON training_plans TO authenticated;
GRANT ALL ON planned_workouts TO authenticated;
GRANT ALL ON training_plans TO service_role;
GRANT ALL ON planned_workouts TO service_role;

-- ============================================================================
-- TRIGGER: Update plan compliance when workouts are completed
-- ============================================================================
CREATE OR REPLACE FUNCTION update_plan_compliance()
RETURNS TRIGGER AS $$
DECLARE
    total_count INTEGER;
    completed_count INTEGER;
BEGIN
    -- Count total and completed workouts for this plan (excluding rest days)
    SELECT
        COUNT(*) FILTER (WHERE workout_type != 'rest'),
        COUNT(*) FILTER (WHERE workout_type != 'rest' AND completed = true)
    INTO total_count, completed_count
    FROM planned_workouts
    WHERE plan_id = NEW.plan_id;

    -- Update the training plan stats
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

-- ============================================================================
-- TRIGGER: Update training plan timestamps
-- ============================================================================
CREATE OR REPLACE FUNCTION update_training_plan_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_training_plan_timestamp ON training_plans;
CREATE TRIGGER trigger_update_training_plan_timestamp
    BEFORE UPDATE ON training_plans
    FOR EACH ROW
    EXECUTE FUNCTION update_training_plan_timestamp();

-- ============================================================================
-- FUNCTION: Calculate current week of a training plan
-- ============================================================================
CREATE OR REPLACE FUNCTION get_plan_current_week(plan_started_at TIMESTAMPTZ)
RETURNS INTEGER AS $$
BEGIN
    RETURN GREATEST(1, FLOOR(EXTRACT(EPOCH FROM (NOW() - plan_started_at)) / (7 * 24 * 60 * 60))::INTEGER + 1);
END;
$$ LANGUAGE plpgsql;
