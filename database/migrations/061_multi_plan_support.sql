-- Migration: Multi-plan support
-- Adds priority field and target_event_date to training_plans
-- Allows users to have multiple active plans with primary/secondary priority

-- Add priority column (primary plan takes precedence in scheduling conflicts)
ALTER TABLE training_plans
  ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'primary'
  CHECK (priority IN ('primary', 'secondary'));

-- Add target event date for adaptive plan duration
ALTER TABLE training_plans
  ADD COLUMN IF NOT EXISTS target_event_date DATE;

-- Index for efficient multi-plan queries
CREATE INDEX IF NOT EXISTS idx_training_plans_user_status_priority
  ON training_plans (user_id, status, priority);

-- Ensure at most one primary plan per user per sport_type when active
-- This allows multiple secondary plans but only one primary per sport
CREATE UNIQUE INDEX IF NOT EXISTS idx_training_plans_one_primary_per_sport
  ON training_plans (user_id, sport_type)
  WHERE status = 'active' AND priority = 'primary';

COMMENT ON COLUMN training_plans.priority IS 'primary or secondary - primary plan key workouts take precedence in scheduling conflicts';
COMMENT ON COLUMN training_plans.target_event_date IS 'Target event/race date for adaptive plan duration compression';
