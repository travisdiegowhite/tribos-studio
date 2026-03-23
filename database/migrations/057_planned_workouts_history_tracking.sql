-- Migration: Add history tracking columns to planned_workouts
-- Tracks original schedule/workout when coach adjustments are made,
-- enabling users to see what was originally planned vs what changed.

-- ============================================================================
-- ADD original_scheduled_date COLUMN
-- Records the original date this workout was planned for before any moves/swaps
-- ============================================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'planned_workouts' AND column_name = 'original_scheduled_date'
    ) THEN
        ALTER TABLE planned_workouts
        ADD COLUMN original_scheduled_date DATE;

        COMMENT ON COLUMN planned_workouts.original_scheduled_date IS
        'The date this workout was originally scheduled for before coach adjustments. NULL means the workout has not been moved.';
    END IF;
END $$;

-- ============================================================================
-- ADD original_workout_id COLUMN
-- Records the original workout_id before any replacements
-- ============================================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'planned_workouts' AND column_name = 'original_workout_id'
    ) THEN
        ALTER TABLE planned_workouts
        ADD COLUMN original_workout_id TEXT;

        COMMENT ON COLUMN planned_workouts.original_workout_id IS
        'The original workout_id before coach replacements. NULL means the workout type has not been changed.';
    END IF;
END $$;
