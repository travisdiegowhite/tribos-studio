-- Migration: Fix RLS policies for planned_workouts
-- Run this in your Supabase SQL editor

-- ============================================================================
-- DROP AND RECREATE RLS POLICIES FOR planned_workouts
-- ============================================================================

-- First, disable RLS temporarily to ensure clean state
ALTER TABLE planned_workouts DISABLE ROW LEVEL SECURITY;

-- Drop all existing policies
DROP POLICY IF EXISTS "Users can view their own planned workouts" ON planned_workouts;
DROP POLICY IF EXISTS "Users can insert their own planned workouts" ON planned_workouts;
DROP POLICY IF EXISTS "Users can update their own planned workouts" ON planned_workouts;
DROP POLICY IF EXISTS "Users can delete their own planned workouts" ON planned_workouts;

-- Re-enable RLS
ALTER TABLE planned_workouts ENABLE ROW LEVEL SECURITY;

-- Create simpler, more permissive policies that work correctly
-- SELECT: Users can view workouts for their plans
CREATE POLICY "Users can view their own planned workouts"
    ON planned_workouts FOR SELECT
    USING (
        plan_id IN (
            SELECT id FROM training_plans WHERE user_id = auth.uid()
        )
    );

-- INSERT: Users can insert workouts for their plans
CREATE POLICY "Users can insert their own planned workouts"
    ON planned_workouts FOR INSERT
    WITH CHECK (
        plan_id IN (
            SELECT id FROM training_plans WHERE user_id = auth.uid()
        )
    );

-- UPDATE: Users can update workouts for their plans
CREATE POLICY "Users can update their own planned workouts"
    ON planned_workouts FOR UPDATE
    USING (
        plan_id IN (
            SELECT id FROM training_plans WHERE user_id = auth.uid()
        )
    );

-- DELETE: Users can delete workouts for their plans
CREATE POLICY "Users can delete their own planned workouts"
    ON planned_workouts FOR DELETE
    USING (
        plan_id IN (
            SELECT id FROM training_plans WHERE user_id = auth.uid()
        )
    );

-- ============================================================================
-- ALSO FIX training_plans RLS if needed
-- ============================================================================
ALTER TABLE training_plans DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own training plans" ON training_plans;
DROP POLICY IF EXISTS "Users can insert their own training plans" ON training_plans;
DROP POLICY IF EXISTS "Users can update their own training plans" ON training_plans;
DROP POLICY IF EXISTS "Users can delete their own training plans" ON training_plans;

ALTER TABLE training_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own training plans"
    ON training_plans FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own training plans"
    ON training_plans FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own training plans"
    ON training_plans FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own training plans"
    ON training_plans FOR DELETE
    USING (auth.uid() = user_id);

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================
GRANT ALL ON training_plans TO authenticated;
GRANT ALL ON planned_workouts TO authenticated;
GRANT ALL ON training_plans TO service_role;
GRANT ALL ON planned_workouts TO service_role;

-- ============================================================================
-- FIX health_metrics RLS if it exists
-- ============================================================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'health_metrics') THEN
        ALTER TABLE health_metrics DISABLE ROW LEVEL SECURITY;

        DROP POLICY IF EXISTS "Users can view their own health metrics" ON health_metrics;
        DROP POLICY IF EXISTS "Users can insert their own health metrics" ON health_metrics;
        DROP POLICY IF EXISTS "Users can update their own health metrics" ON health_metrics;
        DROP POLICY IF EXISTS "Users can delete their own health metrics" ON health_metrics;

        ALTER TABLE health_metrics ENABLE ROW LEVEL SECURITY;

        CREATE POLICY "Users can view their own health metrics"
            ON health_metrics FOR SELECT USING (auth.uid() = user_id);
        CREATE POLICY "Users can insert their own health metrics"
            ON health_metrics FOR INSERT WITH CHECK (auth.uid() = user_id);
        CREATE POLICY "Users can update their own health metrics"
            ON health_metrics FOR UPDATE USING (auth.uid() = user_id);
        CREATE POLICY "Users can delete their own health metrics"
            ON health_metrics FOR DELETE USING (auth.uid() = user_id);

        GRANT ALL ON health_metrics TO authenticated;
        GRANT ALL ON health_metrics TO service_role;
    END IF;
END $$;
