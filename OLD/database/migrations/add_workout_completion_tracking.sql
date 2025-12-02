-- Migration: Add Workout Completion Tracking
-- Description: Extends planned_workouts table with completion, feedback, and rating fields
-- Version: 1.0
-- Date: 2025-11-22

-- Add scheduled_date column to planned_workouts (calculated from week/day)
ALTER TABLE planned_workouts
  ADD COLUMN IF NOT EXISTS scheduled_date DATE;

-- Add completion tracking columns to planned_workouts
ALTER TABLE planned_workouts
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS completion_status TEXT CHECK (completion_status IN ('scheduled', 'completed', 'skipped', 'missed')) DEFAULT 'scheduled',
  ADD COLUMN IF NOT EXISTS actual_duration INTEGER, -- in seconds (actual_tss already exists)
  ADD COLUMN IF NOT EXISTS athlete_rating INTEGER CHECK (athlete_rating >= 1 AND athlete_rating <= 5),
  ADD COLUMN IF NOT EXISTS athlete_feedback TEXT,
  ADD COLUMN IF NOT EXISTS skipped_reason TEXT;

-- Update existing rows to set scheduled_date based on plan start date and week/day
-- This will set scheduled_date for existing workouts
UPDATE planned_workouts pw
SET scheduled_date = (
  SELECT tp.started_at::date + ((pw.week_number - 1) * 7 + pw.day_of_week)
  FROM training_plans tp
  WHERE tp.id = pw.plan_id
)
WHERE scheduled_date IS NULL;

-- Create index for completion queries
CREATE INDEX IF NOT EXISTS idx_planned_workouts_completion
  ON planned_workouts(athlete_id, completion_status, scheduled_date);

CREATE INDEX IF NOT EXISTS idx_planned_workouts_completed_at
  ON planned_workouts(completed_at)
  WHERE completed_at IS NOT NULL;

-- Create workout_modification_requests table for athletes to request changes
CREATE TABLE IF NOT EXISTS workout_modification_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  planned_workout_id UUID NOT NULL REFERENCES planned_workouts(id) ON DELETE CASCADE,
  athlete_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_type TEXT NOT NULL CHECK (request_type IN ('too_hard', 'too_easy', 'swap', 'reschedule', 'rest_day', 'other')),
  message TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'declined')) DEFAULT 'pending',
  coach_response TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for modification requests
CREATE INDEX IF NOT EXISTS idx_modification_requests_athlete
  ON workout_modification_requests(athlete_id, status);

CREATE INDEX IF NOT EXISTS idx_modification_requests_workout
  ON workout_modification_requests(planned_workout_id);

-- Enable RLS on workout_modification_requests
ALTER TABLE workout_modification_requests ENABLE ROW LEVEL SECURITY;

-- Policy: Athletes can view their own modification requests
CREATE POLICY "Athletes can view own modification requests"
  ON workout_modification_requests
  FOR SELECT
  USING (auth.uid() = athlete_id);

-- Policy: Athletes can create modification requests for their own workouts
CREATE POLICY "Athletes can create modification requests"
  ON workout_modification_requests
  FOR INSERT
  WITH CHECK (
    auth.uid() = athlete_id
    AND EXISTS (
      SELECT 1 FROM planned_workouts
      WHERE id = planned_workout_id
      AND athlete_id = auth.uid()
    )
  );

-- Policy: Coaches can view modification requests for their athletes
CREATE POLICY "Coaches can view athlete modification requests"
  ON workout_modification_requests
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM planned_workouts pw
      JOIN coach_athlete_relationships car ON pw.athlete_id = car.athlete_id
      WHERE pw.id = workout_modification_requests.planned_workout_id
      AND car.coach_id = auth.uid()
      AND car.status = 'active'
    )
  );

-- Policy: Coaches can update modification requests for their athletes
CREATE POLICY "Coaches can update modification requests"
  ON workout_modification_requests
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM planned_workouts pw
      JOIN coach_athlete_relationships car ON pw.athlete_id = car.athlete_id
      WHERE pw.id = workout_modification_requests.planned_workout_id
      AND car.coach_id = auth.uid()
      AND car.status = 'active'
    )
  );

-- Function: Get athlete's upcoming workouts
CREATE OR REPLACE FUNCTION get_athlete_upcoming_workouts(
  athlete_user_id UUID,
  days_ahead INTEGER DEFAULT 7
)
RETURNS TABLE (
  id UUID,
  plan_id UUID,
  week_number INTEGER,
  day_of_week INTEGER,
  scheduled_date DATE,
  workout_type TEXT,
  target_tss INTEGER,
  target_duration INTEGER,
  completion_status TEXT,
  template_id UUID,
  template_name TEXT,
  template_description TEXT,
  template_structure JSONB,
  coach_notes TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    pw.id,
    pw.plan_id,
    pw.week_number,
    pw.day_of_week,
    pw.scheduled_date,
    pw.workout_type,
    pw.target_tss,
    pw.target_duration,
    pw.completion_status,
    pw.template_id,
    wt.name as template_name,
    wt.description as template_description,
    wt.structure as template_structure,
    pw.coach_notes
  FROM planned_workouts pw
  LEFT JOIN workout_templates wt ON pw.template_id = wt.id
  WHERE pw.athlete_id = athlete_user_id
    AND pw.scheduled_date >= CURRENT_DATE
    AND pw.scheduled_date <= CURRENT_DATE + days_ahead
  ORDER BY pw.scheduled_date, pw.day_of_week;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Get athlete's workout history
CREATE OR REPLACE FUNCTION get_athlete_workout_history(
  athlete_user_id UUID,
  limit_count INTEGER DEFAULT 20
)
RETURNS TABLE (
  id UUID,
  scheduled_date DATE,
  completed_at TIMESTAMP WITH TIME ZONE,
  workout_type TEXT,
  target_tss INTEGER,
  actual_tss INTEGER,
  target_duration INTEGER,
  actual_duration INTEGER,
  completion_status TEXT,
  athlete_rating INTEGER,
  athlete_feedback TEXT,
  template_name TEXT,
  template_id UUID
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    pw.id,
    pw.scheduled_date,
    pw.completed_at,
    pw.workout_type,
    pw.target_tss,
    pw.actual_tss,
    pw.target_duration,
    pw.actual_duration,
    pw.completion_status,
    pw.athlete_rating,
    pw.athlete_feedback,
    wt.name as template_name,
    pw.template_id
  FROM planned_workouts pw
  LEFT JOIN workout_templates wt ON pw.template_id = wt.id
  WHERE pw.athlete_id = athlete_user_id
    AND pw.completion_status IN ('completed', 'skipped')
  ORDER BY pw.scheduled_date DESC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Get workout completion statistics
CREATE OR REPLACE FUNCTION get_athlete_workout_stats(
  athlete_user_id UUID,
  date_from DATE DEFAULT CURRENT_DATE - INTERVAL '30 days',
  date_to DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  total_workouts INTEGER,
  completed_workouts INTEGER,
  skipped_workouts INTEGER,
  missed_workouts INTEGER,
  completion_rate DECIMAL,
  total_tss INTEGER,
  avg_rating DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::INTEGER as total_workouts,
    COUNT(CASE WHEN completion_status = 'completed' THEN 1 END)::INTEGER as completed_workouts,
    COUNT(CASE WHEN completion_status = 'skipped' THEN 1 END)::INTEGER as skipped_workouts,
    COUNT(CASE WHEN completion_status = 'missed' THEN 1 END)::INTEGER as missed_workouts,
    CASE
      WHEN COUNT(*) > 0 THEN
        ROUND(COUNT(CASE WHEN completion_status = 'completed' THEN 1 END)::DECIMAL / COUNT(*)::DECIMAL * 100, 2)
      ELSE 0
    END as completion_rate,
    COALESCE(SUM(CASE WHEN completion_status = 'completed' THEN actual_tss END), 0)::INTEGER as total_tss,
    ROUND(AVG(CASE WHEN athlete_rating IS NOT NULL THEN athlete_rating END), 2) as avg_rating
  FROM planned_workouts
  WHERE athlete_id = athlete_user_id
    AND scheduled_date >= date_from
    AND scheduled_date <= date_to;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add comments for documentation
COMMENT ON COLUMN planned_workouts.completed_at IS 'Timestamp when athlete marked workout as complete';
COMMENT ON COLUMN planned_workouts.completion_status IS 'Workout status: scheduled, completed, skipped, or missed';
COMMENT ON COLUMN planned_workouts.actual_tss IS 'Actual TSS achieved (athlete-reported or from device)';
COMMENT ON COLUMN planned_workouts.actual_duration IS 'Actual workout duration in seconds';
COMMENT ON COLUMN planned_workouts.athlete_rating IS 'Athlete difficulty rating 1-5 (1=too easy, 5=too hard)';
COMMENT ON COLUMN planned_workouts.athlete_feedback IS 'Athlete notes and feedback on the workout';
COMMENT ON COLUMN planned_workouts.skipped_reason IS 'Reason for skipping workout if status is skipped';

COMMENT ON TABLE workout_modification_requests IS 'Athletes can request workout changes or modifications from their coach';

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'Migration completed: Workout completion tracking added successfully';
  RAISE NOTICE 'Added columns: completed_at, completion_status, actual_tss, actual_duration, athlete_rating, athlete_feedback, skipped_reason';
  RAISE NOTICE 'Created table: workout_modification_requests';
  RAISE NOTICE 'Created functions: get_athlete_upcoming_workouts, get_athlete_workout_history, get_athlete_workout_stats';
END $$;
