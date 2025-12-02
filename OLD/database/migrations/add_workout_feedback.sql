-- Workout Feedback Table
-- Stores post-workout surveys (RPE, difficulty, notes) for adaptive training

CREATE TABLE IF NOT EXISTS workout_feedback (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  route_id UUID REFERENCES routes(id) ON DELETE CASCADE,
  planned_workout_id UUID REFERENCES planned_workouts(id) ON DELETE SET NULL,

  -- Perceived Exertion
  perceived_exertion INTEGER NOT NULL CHECK (perceived_exertion >= 1 AND perceived_exertion <= 10),

  -- Difficulty Rating (separate from RPE - how hard relative to expectations)
  difficulty_rating INTEGER CHECK (difficulty_rating >= 1 AND difficulty_rating <= 10),

  -- Completion Quality
  intervals_completed BOOLEAN DEFAULT TRUE, -- Did you complete all prescribed intervals?
  felt_good BOOLEAN, -- Did you feel good during the workout?

  -- Specific Feedback
  struggled_with TEXT CHECK (struggled_with IN ('endurance', 'intensity', 'climbing', 'duration', 'recovery', 'motivation', 'weather', 'equipment', 'other')),

  -- Free-form notes
  notes TEXT,

  -- Context
  workout_date DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Ensure one feedback per ride
  UNIQUE(route_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_workout_feedback_user ON workout_feedback(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_workout_feedback_route ON workout_feedback(route_id);
CREATE INDEX IF NOT EXISTS idx_workout_feedback_planned ON workout_feedback(planned_workout_id);
CREATE INDEX IF NOT EXISTS idx_workout_feedback_rpe ON workout_feedback(user_id, perceived_exertion);

-- Row Level Security
ALTER TABLE workout_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own workout feedback"
  ON workout_feedback FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own workout feedback"
  ON workout_feedback FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own workout feedback"
  ON workout_feedback FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own workout feedback"
  ON workout_feedback FOR DELETE
  USING (auth.uid() = user_id);

-- Function to get average RPE for a user over time
CREATE OR REPLACE FUNCTION get_average_rpe(
  user_uuid UUID,
  days INTEGER DEFAULT 30
)
RETURNS TABLE (
  avg_rpe DECIMAL,
  high_rpe_count INTEGER,
  low_rpe_count INTEGER,
  total_surveys INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ROUND(AVG(perceived_exertion), 1) as avg_rpe,
    COUNT(*) FILTER (WHERE perceived_exertion >= 8)::INTEGER as high_rpe_count,
    COUNT(*) FILTER (WHERE perceived_exertion <= 3)::INTEGER as low_rpe_count,
    COUNT(*)::INTEGER as total_surveys
  FROM workout_feedback
  WHERE user_id = user_uuid
    AND created_at >= NOW() - (days || ' days')::INTERVAL;
END;
$$ LANGUAGE plpgsql;

-- Function to determine if user is overreaching based on feedback
CREATE OR REPLACE FUNCTION check_overreaching_risk(
  user_uuid UUID,
  lookback_days INTEGER DEFAULT 7
)
RETURNS TABLE (
  risk_level TEXT,
  avg_rpe DECIMAL,
  high_rpe_percentage DECIMAL,
  struggled_count INTEGER,
  recommendation TEXT
) AS $$
DECLARE
  avg_rpe_value DECIMAL;
  total_workouts INTEGER;
  high_rpe_count INTEGER;
  struggled_workouts INTEGER;
  high_rpe_pct DECIMAL;
  risk TEXT;
  advice TEXT;
BEGIN
  -- Get recent workout feedback stats
  SELECT
    AVG(perceived_exertion),
    COUNT(*),
    COUNT(*) FILTER (WHERE perceived_exertion >= 8),
    COUNT(*) FILTER (WHERE felt_good = false OR intervals_completed = false)
  INTO
    avg_rpe_value,
    total_workouts,
    high_rpe_count,
    struggled_workouts
  FROM workout_feedback
  WHERE user_id = user_uuid
    AND created_at >= NOW() - (lookback_days || ' days')::INTERVAL;

  -- Not enough data
  IF total_workouts < 3 THEN
    RETURN QUERY SELECT
      'unknown'::TEXT,
      avg_rpe_value,
      0::DECIMAL,
      0::INTEGER,
      'Not enough workout feedback data to assess risk.'::TEXT;
    RETURN;
  END IF;

  -- Calculate percentage of high RPE workouts
  high_rpe_pct := (high_rpe_count::DECIMAL / total_workouts) * 100;

  -- Determine risk level
  IF avg_rpe_value >= 8 OR high_rpe_pct >= 60 OR struggled_workouts >= (total_workouts * 0.5) THEN
    risk := 'high';
    advice := 'Consider adding a recovery day or reducing workout intensity. Multiple high-effort sessions detected.';
  ELSIF avg_rpe_value >= 7 OR high_rpe_pct >= 40 THEN
    risk := 'moderate';
    advice := 'Monitor fatigue closely. Ensure adequate recovery between hard sessions.';
  ELSIF avg_rpe_value <= 4 AND high_rpe_pct <= 10 THEN
    risk := 'undertraining';
    advice := 'Workouts may be too easy. Consider increasing intensity to drive adaptations.';
  ELSE
    risk := 'low';
    advice := 'Training load appears well-balanced. Continue current approach.';
  END IF;

  -- Return results
  RETURN QUERY SELECT
    risk,
    avg_rpe_value,
    ROUND(high_rpe_pct, 1),
    struggled_workouts,
    advice;
END;
$$ LANGUAGE plpgsql;

-- Function to auto-prompt for feedback (checks if route doesn't have feedback yet)
CREATE OR REPLACE FUNCTION should_prompt_feedback(route_uuid UUID)
RETURNS BOOLEAN AS $$
DECLARE
  has_feedback BOOLEAN;
  route_age INTERVAL;
BEGIN
  -- Check if feedback already exists
  SELECT EXISTS (
    SELECT 1 FROM workout_feedback WHERE route_id = route_uuid
  ) INTO has_feedback;

  IF has_feedback THEN
    RETURN FALSE;
  END IF;

  -- Check route age (only prompt for rides from last 7 days)
  SELECT NOW() - recorded_at INTO route_age
  FROM routes
  WHERE id = route_uuid;

  IF route_age > INTERVAL '7 days' THEN
    RETURN FALSE;
  END IF;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Comments
COMMENT ON TABLE workout_feedback IS 'Post-workout surveys for adaptive training and fatigue monitoring';
COMMENT ON COLUMN workout_feedback.perceived_exertion IS 'RPE 1-10 scale (1=very easy, 10=maximum effort)';
COMMENT ON COLUMN workout_feedback.difficulty_rating IS 'How hard was workout relative to what you expected';
COMMENT ON COLUMN workout_feedback.intervals_completed IS 'Did you complete all prescribed work intervals';
COMMENT ON FUNCTION check_overreaching_risk IS 'Analyzes recent feedback to detect overtraining risk';
COMMENT ON FUNCTION should_prompt_feedback IS 'Returns true if user should be prompted for feedback on this ride';
