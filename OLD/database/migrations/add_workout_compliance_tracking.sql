-- Workout Compliance Tracking Enhancement
-- Adds additional columns and functionality for tracking workout completion

-- Add completion percentage column (if not exists)
ALTER TABLE planned_workouts
ADD COLUMN IF NOT EXISTS completion_percentage INTEGER DEFAULT 0 CHECK (completion_percentage >= 0 AND completion_percentage <= 100);

-- Add actual metrics columns for comparison with targets
ALTER TABLE planned_workouts
ADD COLUMN IF NOT EXISTS actual_duration INTEGER, -- actual duration in minutes
ADD COLUMN IF NOT EXISTS actual_distance DECIMAL, -- actual distance in km
ADD COLUMN IF NOT EXISTS completion_quality TEXT CHECK (completion_quality IN ('excellent', 'good', 'partial', 'poor', 'skipped'));

-- Update existing completed rows to set default completion quality
UPDATE planned_workouts
SET completion_quality = 'good'
WHERE completed = true AND completion_quality IS NULL;

-- Add index for querying completed workouts
CREATE INDEX IF NOT EXISTS idx_planned_workouts_completed ON planned_workouts(plan_id, completed);

-- Function to automatically calculate completion percentage and quality
CREATE OR REPLACE FUNCTION calculate_workout_completion()
RETURNS TRIGGER AS $$
DECLARE
  duration_match DECIMAL;
  tss_match DECIMAL;
  overall_score INTEGER;
BEGIN
  -- Only calculate if workout is marked as completed
  IF NEW.completed = true AND NEW.route_id IS NOT NULL THEN

    -- Calculate duration match (0-100%)
    IF NEW.target_duration > 0 AND NEW.actual_duration > 0 THEN
      duration_match := LEAST(100, (NEW.actual_duration::DECIMAL / NEW.target_duration::DECIMAL) * 100);
    ELSE
      duration_match := 50; -- Default if no target
    END IF;

    -- Calculate TSS match (0-100%)
    IF NEW.target_tss > 0 AND NEW.actual_tss > 0 THEN
      tss_match := LEAST(100, (NEW.actual_tss::DECIMAL / NEW.target_tss::DECIMAL) * 100);
    ELSE
      tss_match := 50; -- Default if no target
    END IF;

    -- Overall completion percentage (weighted average: 60% duration, 40% TSS)
    overall_score := ROUND((duration_match * 0.6) + (tss_match * 0.4));
    NEW.completion_percentage := overall_score;

    -- Set completion quality based on score
    IF overall_score >= 90 THEN
      NEW.completion_quality := 'excellent';
    ELSIF overall_score >= 75 THEN
      NEW.completion_quality := 'good';
    ELSIF overall_score >= 50 THEN
      NEW.completion_quality := 'partial';
    ELSE
      NEW.completion_quality := 'poor';
    END IF;

  ELSIF NEW.completed = false THEN
    -- Reset values if marked as incomplete
    NEW.completion_percentage := 0;
    NEW.completion_quality := NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-calculate completion on insert/update
DROP TRIGGER IF EXISTS trigger_calculate_completion ON planned_workouts;
CREATE TRIGGER trigger_calculate_completion
  BEFORE INSERT OR UPDATE OF completed, actual_duration, actual_tss, route_id
  ON planned_workouts
  FOR EACH ROW
  EXECUTE FUNCTION calculate_workout_completion();

-- Function to get plan completion stats
CREATE OR REPLACE FUNCTION get_plan_completion_stats(plan_uuid UUID)
RETURNS TABLE (
  total_workouts INTEGER,
  completed_workouts INTEGER,
  completion_rate DECIMAL,
  excellent_count INTEGER,
  good_count INTEGER,
  partial_count INTEGER,
  poor_count INTEGER,
  skipped_count INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::INTEGER as total_workouts,
    COUNT(*) FILTER (WHERE completed = true)::INTEGER as completed_workouts,
    ROUND((COUNT(*) FILTER (WHERE completed = true)::DECIMAL / NULLIF(COUNT(*), 0)) * 100, 1) as completion_rate,
    COUNT(*) FILTER (WHERE completion_quality = 'excellent')::INTEGER as excellent_count,
    COUNT(*) FILTER (WHERE completion_quality = 'good')::INTEGER as good_count,
    COUNT(*) FILTER (WHERE completion_quality = 'partial')::INTEGER as partial_count,
    COUNT(*) FILTER (WHERE completion_quality = 'poor')::INTEGER as poor_count,
    COUNT(*) FILTER (WHERE completion_quality = 'skipped')::INTEGER as skipped_count
  FROM planned_workouts
  WHERE plan_id = plan_uuid
    AND workout_type != 'rest'; -- Don't count rest days
END;
$$ LANGUAGE plpgsql;

-- Comment the new columns
COMMENT ON COLUMN planned_workouts.completion_percentage IS 'Auto-calculated completion score 0-100% based on target vs actual';
COMMENT ON COLUMN planned_workouts.actual_duration IS 'Actual workout duration in minutes from linked route';
COMMENT ON COLUMN planned_workouts.actual_distance IS 'Actual distance in km from linked route';
COMMENT ON COLUMN planned_workouts.completion_quality IS 'Auto-calculated quality rating based on how well targets were met';
