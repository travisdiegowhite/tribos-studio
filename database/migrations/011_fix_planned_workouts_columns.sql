-- Migration: Fix planned_workouts table columns
-- Run this if you get "column week_number does not exist" error
-- Run this in your Supabase SQL editor

-- ============================================================================
-- ADD MISSING COLUMNS TO planned_workouts
-- ============================================================================

-- Add week_number column
ALTER TABLE planned_workouts
ADD COLUMN IF NOT EXISTS week_number INTEGER;

-- Add day_of_week column
ALTER TABLE planned_workouts
ADD COLUMN IF NOT EXISTS day_of_week INTEGER;

-- Add scheduled_date column
ALTER TABLE planned_workouts
ADD COLUMN IF NOT EXISTS scheduled_date DATE;

-- Add workout_type column
ALTER TABLE planned_workouts
ADD COLUMN IF NOT EXISTS workout_type TEXT;

-- Add workout_id column
ALTER TABLE planned_workouts
ADD COLUMN IF NOT EXISTS workout_id TEXT;

-- Add target columns
ALTER TABLE planned_workouts
ADD COLUMN IF NOT EXISTS target_tss INTEGER;

ALTER TABLE planned_workouts
ADD COLUMN IF NOT EXISTS target_duration INTEGER;

ALTER TABLE planned_workouts
ADD COLUMN IF NOT EXISTS target_distance_km NUMERIC;

-- Add completion tracking
ALTER TABLE planned_workouts
ADD COLUMN IF NOT EXISTS completed BOOLEAN DEFAULT false;

ALTER TABLE planned_workouts
ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

ALTER TABLE planned_workouts
ADD COLUMN IF NOT EXISTS activity_id UUID;

-- Add actual results columns
ALTER TABLE planned_workouts
ADD COLUMN IF NOT EXISTS actual_tss INTEGER;

ALTER TABLE planned_workouts
ADD COLUMN IF NOT EXISTS actual_duration INTEGER;

ALTER TABLE planned_workouts
ADD COLUMN IF NOT EXISTS actual_distance_km NUMERIC;

-- Add feedback columns
ALTER TABLE planned_workouts
ADD COLUMN IF NOT EXISTS difficulty_rating INTEGER;

ALTER TABLE planned_workouts
ADD COLUMN IF NOT EXISTS notes TEXT;

ALTER TABLE planned_workouts
ADD COLUMN IF NOT EXISTS skipped_reason TEXT;

-- Add timestamps if missing
ALTER TABLE planned_workouts
ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE planned_workouts
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- ============================================================================
-- CREATE INDEXES (if they don't exist)
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_planned_workouts_plan_id ON planned_workouts(plan_id);
CREATE INDEX IF NOT EXISTS idx_planned_workouts_week ON planned_workouts(week_number);
CREATE INDEX IF NOT EXISTS idx_planned_workouts_scheduled ON planned_workouts(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_planned_workouts_completed ON planned_workouts(completed);

-- ============================================================================
-- Verify the table structure
-- ============================================================================
-- You can run this to verify:
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'planned_workouts';
