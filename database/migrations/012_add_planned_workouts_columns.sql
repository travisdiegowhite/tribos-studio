-- Migration: Add user_id, name, and duration_minutes columns to planned_workouts
-- This migration documents columns that exist in production but were missing from initial migrations
-- Run this in your Supabase SQL editor if these columns don't exist

-- ============================================================================
-- ADD user_id COLUMN (required for direct user ownership tracking)
-- ============================================================================
-- Note: Production database already has this column as NOT NULL
-- Only run this if the column doesn't exist

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'planned_workouts' AND column_name = 'user_id'
    ) THEN
        ALTER TABLE planned_workouts
        ADD COLUMN user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE;

        -- Create index for user_id lookups
        CREATE INDEX idx_planned_workouts_user_id ON planned_workouts(user_id);
    END IF;
END $$;

-- ============================================================================
-- ADD name COLUMN (workout name for display purposes)
-- ============================================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'planned_workouts' AND column_name = 'name'
    ) THEN
        ALTER TABLE planned_workouts
        ADD COLUMN name TEXT NOT NULL DEFAULT 'Workout';
    END IF;
END $$;

-- ============================================================================
-- ADD duration_minutes COLUMN (workout duration in minutes)
-- ============================================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'planned_workouts' AND column_name = 'duration_minutes'
    ) THEN
        ALTER TABLE planned_workouts
        ADD COLUMN duration_minutes INTEGER NOT NULL DEFAULT 0;
    END IF;
END $$;

-- ============================================================================
-- Update RLS policies to include user_id checks (optional, for added security)
-- ============================================================================
-- These policies provide an additional layer of security by checking user_id directly
-- in addition to the plan_id ownership check

-- Drop and recreate SELECT policy with user_id check
DROP POLICY IF EXISTS "Users can view their own planned workouts" ON planned_workouts;
CREATE POLICY "Users can view their own planned workouts"
    ON planned_workouts FOR SELECT
    TO authenticated
    USING (
        user_id = auth.uid() OR
        plan_id IN (
            SELECT id FROM training_plans WHERE user_id = auth.uid()
        )
    );

-- Drop and recreate INSERT policy with user_id check
DROP POLICY IF EXISTS "Users can insert their own planned workouts" ON planned_workouts;
CREATE POLICY "Users can insert their own planned workouts"
    ON planned_workouts FOR INSERT
    TO authenticated
    WITH CHECK (
        user_id = auth.uid() AND
        plan_id IN (
            SELECT id FROM training_plans WHERE user_id = auth.uid()
        )
    );

-- Drop and recreate UPDATE policy with user_id check
DROP POLICY IF EXISTS "Users can update their own planned workouts" ON planned_workouts;
CREATE POLICY "Users can update their own planned workouts"
    ON planned_workouts FOR UPDATE
    TO authenticated
    USING (
        user_id = auth.uid() OR
        plan_id IN (
            SELECT id FROM training_plans WHERE user_id = auth.uid()
        )
    );

-- Drop and recreate DELETE policy with user_id check
DROP POLICY IF EXISTS "Users can delete their own planned workouts" ON planned_workouts;
CREATE POLICY "Users can delete their own planned workouts"
    ON planned_workouts FOR DELETE
    TO authenticated
    USING (
        user_id = auth.uid() OR
        plan_id IN (
            SELECT id FROM training_plans WHERE user_id = auth.uid()
        )
    );
