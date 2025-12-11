-- Migration: Fix RLS policies for planned_workouts
-- This creates a more permissive INSERT policy and adds a helper function
-- Run this in your Supabase SQL editor if you're getting 403 errors on workout insert

-- ============================================================================
-- Option 1: Simplified RLS Policy
-- This allows authenticated users to insert workouts if they provide a valid plan_id
-- The foreign key constraint ensures the plan exists
-- ============================================================================

-- Drop the existing restrictive INSERT policy
DROP POLICY IF EXISTS "Users can insert their own planned workouts" ON planned_workouts;

-- Create a simpler INSERT policy
-- The plan_id foreign key constraint ensures the plan exists
-- We verify ownership after insert via the SELECT policy
CREATE POLICY "Users can insert their own planned workouts"
    ON planned_workouts FOR INSERT
    TO authenticated
    WITH CHECK (
        plan_id IN (
            SELECT id FROM training_plans WHERE user_id = auth.uid()
        )
    );

-- ============================================================================
-- Option 2: Add a SECURITY DEFINER function for bulk workout creation
-- This bypasses RLS for the insert operation
-- ============================================================================

CREATE OR REPLACE FUNCTION create_planned_workouts(
    p_plan_id UUID,
    p_workouts JSONB
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    workout_count INTEGER := 0;
    workout JSONB;
BEGIN
    -- Verify the user owns the plan
    IF NOT EXISTS (
        SELECT 1 FROM training_plans
        WHERE id = p_plan_id AND user_id = auth.uid()
    ) THEN
        RAISE EXCEPTION 'Plan not found or not owned by user';
    END IF;

    -- Insert each workout
    FOR workout IN SELECT * FROM jsonb_array_elements(p_workouts)
    LOOP
        INSERT INTO planned_workouts (
            plan_id,
            week_number,
            day_of_week,
            scheduled_date,
            workout_type,
            workout_id,
            notes,
            target_tss,
            target_duration,
            completed
        ) VALUES (
            p_plan_id,
            (workout->>'week_number')::INTEGER,
            (workout->>'day_of_week')::INTEGER,
            (workout->>'scheduled_date')::DATE,
            workout->>'workout_type',
            workout->>'workout_id',
            COALESCE(workout->>'notes', ''),
            COALESCE((workout->>'target_tss')::INTEGER, 0),
            COALESCE((workout->>'target_duration')::INTEGER, 0),
            COALESCE((workout->>'completed')::BOOLEAN, false)
        );
        workout_count := workout_count + 1;
    END LOOP;

    RETURN workout_count;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION create_planned_workouts(UUID, JSONB) TO authenticated;

-- ============================================================================
-- Verify the policies are correct
-- ============================================================================

-- Make sure SELECT policy is working
DROP POLICY IF EXISTS "Users can view their own planned workouts" ON planned_workouts;
CREATE POLICY "Users can view their own planned workouts"
    ON planned_workouts FOR SELECT
    TO authenticated
    USING (
        plan_id IN (
            SELECT id FROM training_plans WHERE user_id = auth.uid()
        )
    );

-- Make sure UPDATE policy is working
DROP POLICY IF EXISTS "Users can update their own planned workouts" ON planned_workouts;
CREATE POLICY "Users can update their own planned workouts"
    ON planned_workouts FOR UPDATE
    TO authenticated
    USING (
        plan_id IN (
            SELECT id FROM training_plans WHERE user_id = auth.uid()
        )
    );

-- Make sure DELETE policy is working
DROP POLICY IF EXISTS "Users can delete their own planned workouts" ON planned_workouts;
CREATE POLICY "Users can delete their own planned workouts"
    ON planned_workouts FOR DELETE
    TO authenticated
    USING (
        plan_id IN (
            SELECT id FROM training_plans WHERE user_id = auth.uid()
        )
    );
