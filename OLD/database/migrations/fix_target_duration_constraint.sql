-- Fix target_duration constraint to allow 0 for rest days
-- This migration drops and recreates the constraint to allow target_duration >= 0

-- Drop the old constraint
ALTER TABLE planned_workouts
DROP CONSTRAINT IF EXISTS planned_workouts_target_duration_check;

-- Add the new constraint (allow 0 for rest days)
ALTER TABLE planned_workouts
ADD CONSTRAINT planned_workouts_target_duration_check
CHECK (target_duration >= 0);

-- Verify the constraint
COMMENT ON CONSTRAINT planned_workouts_target_duration_check ON planned_workouts
IS 'Target duration in minutes - 0 allowed for rest days';
