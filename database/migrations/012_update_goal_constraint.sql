-- Migration: Update training_plans goal check constraint
-- Adds new goal types: century, gravel, criterium, ftp_building
-- Run this in your Supabase SQL editor

-- ============================================================================
-- DROP AND RECREATE THE GOAL CHECK CONSTRAINT
-- ============================================================================

-- Drop the existing constraint
ALTER TABLE training_plans
DROP CONSTRAINT IF EXISTS training_plans_goal_check;

-- Create new constraint with all goal types
ALTER TABLE training_plans
ADD CONSTRAINT training_plans_goal_check CHECK (goal IN (
    -- Original goals
    'general_fitness',
    'endurance',
    'climbing',
    'racing',
    'gran_fondo',
    'weight_loss',
    'custom',
    -- New goals from training plan templates
    'century',
    'gravel',
    'criterium',
    'ftp_building',
    'time_trial',
    'cyclocross',
    'track',
    'bikepacking'
));

-- ============================================================================
-- VERIFY THE CHANGE
-- ============================================================================
-- You can verify by running:
-- SELECT conname, pg_get_constraintdef(oid)
-- FROM pg_constraint
-- WHERE conrelid = 'training_plans'::regclass AND conname LIKE '%goal%';
