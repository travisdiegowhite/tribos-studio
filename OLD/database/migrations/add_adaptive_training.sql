-- Phase 2: Adaptive Training System
-- Automatically adjust upcoming workouts based on performance, fatigue, and progression

-- ============================================================================
-- 1. ADAPTATION HISTORY
-- ============================================================================
-- Audit log of all automatic workout adaptations

CREATE TABLE IF NOT EXISTS adaptation_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  planned_workout_id UUID REFERENCES planned_workouts(id) ON DELETE SET NULL,

  -- What changed
  old_workout_level DECIMAL(3,1),
  new_workout_level DECIMAL(3,1),
  level_change DECIMAL(3,1), -- new - old

  -- Why it changed
  adaptation_type VARCHAR(50) CHECK (adaptation_type IN (
    'increase',      -- User is progressing well
    'decrease',      -- User is struggling
    'substitute',    -- Replace with different workout
    'skip',          -- Skip workout (too fatigued)
    'reschedule',    -- Move to different date
    'no_change'      -- Evaluated but no change needed
  )),
  reason TEXT, -- Detailed explanation

  -- Factors that influenced the decision
  tsb_value DECIMAL(5,1), -- Training Stress Balance at time of adaptation
  recent_completion_rate DECIMAL(4,1), -- % of workouts completed in last 7 days
  zone_progression_level DECIMAL(3,1), -- User's level in target zone
  recent_avg_rpe DECIMAL(3,1), -- Average RPE in last 7 days

  -- Metadata
  was_accepted BOOLEAN DEFAULT NULL, -- Did user accept the adaptation?
  user_feedback TEXT, -- User's response to adaptation
  created_at TIMESTAMP DEFAULT NOW(),
  accepted_at TIMESTAMP,
  rejected_at TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_adaptation_history_user
  ON adaptation_history(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_adaptation_history_workout
  ON adaptation_history(planned_workout_id);

CREATE INDEX IF NOT EXISTS idx_adaptation_pending
  ON adaptation_history(user_id, was_accepted)
  WHERE was_accepted IS NULL; -- Find pending adaptations

-- Enable Row Level Security
ALTER TABLE adaptation_history ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own adaptation history"
  ON adaptation_history FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own adaptation history"
  ON adaptation_history FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own adaptation history"
  ON adaptation_history FOR UPDATE
  USING (user_id = auth.uid());

-- ============================================================================
-- 2. ADAPTATION SETTINGS
-- ============================================================================
-- User preferences for adaptive training

CREATE TABLE IF NOT EXISTS adaptation_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,

  -- Enable/disable adaptive training
  adaptive_enabled BOOLEAN DEFAULT TRUE,

  -- Auto-apply adaptations or require user approval
  auto_apply BOOLEAN DEFAULT FALSE, -- If false, adaptations require approval

  -- Sensitivity settings (how aggressive the adaptations are)
  adaptation_sensitivity VARCHAR(20) DEFAULT 'moderate' CHECK (adaptation_sensitivity IN (
    'conservative', -- Only adapt on clear signals
    'moderate',     -- Balanced approach
    'aggressive'    -- Adapt frequently for optimal training
  )),

  -- Minimum days before adapting a workout
  min_days_before_workout INTEGER DEFAULT 2 CHECK (min_days_before_workout >= 0),

  -- TSB thresholds for adaptation
  tsb_fatigued_threshold DECIMAL(5,1) DEFAULT -30, -- Below this = too fatigued
  tsb_fresh_threshold DECIMAL(5,1) DEFAULT 5, -- Above this = too fresh

  -- Notification preferences
  notify_on_adaptation BOOLEAN DEFAULT TRUE,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE adaptation_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own adaptation settings"
  ON adaptation_settings FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own adaptation settings"
  ON adaptation_settings FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own adaptation settings"
  ON adaptation_settings FOR UPDATE
  USING (user_id = auth.uid());

-- ============================================================================
-- 3. HELPER FUNCTIONS
-- ============================================================================

-- Get or create adaptation settings for a user
CREATE OR REPLACE FUNCTION get_adaptation_settings(user_uuid UUID)
RETURNS TABLE (
  adaptive_enabled BOOLEAN,
  auto_apply BOOLEAN,
  adaptation_sensitivity VARCHAR(20),
  min_days_before_workout INTEGER,
  tsb_fatigued_threshold DECIMAL(5,1),
  tsb_fresh_threshold DECIMAL(5,1)
) AS $$
BEGIN
  -- Create default settings if they don't exist
  INSERT INTO adaptation_settings (user_id)
  VALUES (user_uuid)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN QUERY
  SELECT
    a.adaptive_enabled,
    a.auto_apply,
    a.adaptation_sensitivity,
    a.min_days_before_workout,
    a.tsb_fatigued_threshold,
    a.tsb_fresh_threshold
  FROM adaptation_settings a
  WHERE a.user_id = user_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Calculate recent training metrics for adaptation decisions
CREATE OR REPLACE FUNCTION get_recent_training_metrics(
  user_uuid UUID,
  days_back INTEGER DEFAULT 7
)
RETURNS TABLE (
  completion_rate DECIMAL(4,1),
  avg_rpe DECIMAL(3,1),
  workouts_completed INTEGER,
  workouts_missed INTEGER,
  avg_completion_percentage DECIMAL(4,1),
  current_tsb DECIMAL(5,1)
) AS $$
BEGIN
  RETURN QUERY
  WITH recent_workouts AS (
    SELECT
      pw.id,
      pw.completed,
      pw.completion_percentage,
      wf.perceived_exertion
    FROM planned_workouts pw
    LEFT JOIN workout_feedback wf ON pw.id = wf.planned_workout_id
    WHERE pw.user_id = user_uuid
      AND pw.workout_date >= CURRENT_DATE - days_back
      AND pw.workout_type != 'rest'
  ),
  metrics AS (
    SELECT
      COUNT(*) FILTER (WHERE completed = TRUE)::DECIMAL / NULLIF(COUNT(*), 0) * 100 as comp_rate,
      AVG(perceived_exertion) as avg_rpe_val,
      COUNT(*) FILTER (WHERE completed = TRUE) as completed_count,
      COUNT(*) FILTER (WHERE completed = FALSE) as missed_count,
      AVG(completion_percentage) as avg_comp_pct
    FROM recent_workouts
  ),
  tsb_calc AS (
    SELECT
      ctl - atl as tsb_value
    FROM (
      SELECT
        -- CTL: 42-day exponentially weighted average TSS
        SUM(
          COALESCE(r.tss, pw.target_tss, 0) *
          POWER(EXP(1), -1.0 * (CURRENT_DATE - r.recorded_at::DATE) / 42.0)
        ) / SUM(POWER(EXP(1), -1.0 * (CURRENT_DATE - r.recorded_at::DATE) / 42.0)) as ctl,
        -- ATL: 7-day exponentially weighted average TSS
        SUM(
          COALESCE(r.tss, pw.target_tss, 0) *
          POWER(EXP(1), -1.0 * (CURRENT_DATE - r.recorded_at::DATE) / 7.0)
        ) / SUM(POWER(EXP(1), -1.0 * (CURRENT_DATE - r.recorded_at::DATE) / 7.0)) as atl
      FROM routes r
      LEFT JOIN planned_workouts pw ON r.id = pw.completed_route_id
      WHERE r.user_id = user_uuid
        AND r.recorded_at >= CURRENT_DATE - 90
    ) pmc
  )
  SELECT
    m.comp_rate,
    m.avg_rpe_val,
    m.completed_count::INTEGER,
    m.missed_count::INTEGER,
    m.avg_comp_pct,
    t.tsb_value
  FROM metrics m, tsb_calc t;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Core adaptive training algorithm
-- Analyzes a workout and determines if/how it should be adapted
CREATE OR REPLACE FUNCTION evaluate_workout_adaptation(
  user_uuid UUID,
  workout_id UUID
)
RETURNS TABLE (
  should_adapt BOOLEAN,
  adaptation_type VARCHAR(50),
  new_level DECIMAL(3,1),
  level_change DECIMAL(3,1),
  reason TEXT,
  confidence DECIMAL(3,2) -- 0.0 to 1.0, how confident we are in this recommendation
) AS $$
DECLARE
  workout RECORD;
  settings RECORD;
  metrics RECORD;
  user_progression DECIMAL(3,1);
  level_diff DECIMAL(3,1);
  recommended_type VARCHAR(50);
  recommended_level DECIMAL(3,1);
  change_amount DECIMAL(3,1);
  reason_text TEXT;
  confidence_score DECIMAL(3,2);
  days_until_workout INTEGER;
BEGIN
  -- Get workout details
  SELECT
    pw.id,
    pw.workout_level,
    pw.target_zone,
    pw.workout_date,
    pw.was_adapted,
    (pw.workout_date - CURRENT_DATE) as days_until
  INTO workout
  FROM planned_workouts pw
  WHERE pw.id = workout_id AND pw.user_id = user_uuid;

  -- If workout not found or already adapted recently, skip
  IF workout.id IS NULL OR workout.was_adapted = TRUE THEN
    RETURN QUERY SELECT FALSE, 'no_change'::VARCHAR(50), NULL::DECIMAL(3,1),
                        NULL::DECIMAL(3,1), 'Workout already adapted'::TEXT, 0.0::DECIMAL(3,2);
    RETURN;
  END IF;

  days_until_workout := workout.days_until;

  -- Get settings
  SELECT * INTO settings FROM get_adaptation_settings(user_uuid) LIMIT 1;

  -- If adaptive training disabled or too soon before workout, skip
  IF settings.adaptive_enabled = FALSE OR days_until_workout < settings.min_days_before_workout THEN
    RETURN QUERY SELECT FALSE, 'no_change'::VARCHAR(50), NULL::DECIMAL(3,1),
                        NULL::DECIMAL(3,1), 'Adaptation disabled or too soon'::TEXT, 0.0::DECIMAL(3,2);
    RETURN;
  END IF;

  -- Get recent training metrics
  SELECT * INTO metrics FROM get_recent_training_metrics(user_uuid, 7) LIMIT 1;

  -- Get user's progression level in this zone
  user_progression := get_progression_level_for_zone(user_uuid, workout.target_zone);

  -- Calculate how far the workout is from user's current level
  level_diff := workout.workout_level - user_progression;

  -- Default values
  recommended_type := 'no_change';
  recommended_level := workout.workout_level;
  change_amount := 0;
  confidence_score := 0.5;

  -- ===== DECISION LOGIC =====

  -- 1. Check if user is too fatigued (TSB too negative)
  IF metrics.current_tsb < settings.tsb_fatigued_threshold THEN
    IF workout.target_zone IN ('threshold', 'vo2max', 'anaerobic') THEN
      -- High intensity workout while fatigued = decrease or skip
      IF metrics.current_tsb < (settings.tsb_fatigued_threshold - 10) THEN
        recommended_type := 'skip';
        recommended_level := NULL;
        reason_text := format('TSB very low (%.1f). Recommend rest day.', metrics.current_tsb);
        confidence_score := 0.9;
      ELSE
        recommended_type := 'decrease';
        change_amount := -1.0;
        recommended_level := GREATEST(1.0, workout.workout_level + change_amount);
        reason_text := format('TSB low (%.1f). Reducing intensity.', metrics.current_tsb);
        confidence_score := 0.8;
      END IF;
    END IF;

  -- 2. Check if user is too fresh (TSB too positive)
  ELSIF metrics.current_tsb > settings.tsb_fresh_threshold THEN
    IF workout.target_zone IN ('recovery', 'endurance') THEN
      recommended_type := 'increase';
      change_amount := 0.5;
      recommended_level := LEAST(10.0, workout.workout_level + change_amount);
      reason_text := format('TSB high (%.1f). Room for harder training.', metrics.current_tsb);
      confidence_score := 0.7;
    END IF;

  -- 3. Check recent completion rate
  ELSIF metrics.completion_rate < 60 THEN
    -- User is missing lots of workouts
    IF workout.workout_level > (user_progression - 0.5) THEN
      recommended_type := 'decrease';
      change_amount := -0.5;
      recommended_level := GREATEST(1.0, workout.workout_level + change_amount);
      reason_text := format('Low completion rate (%.0f%%). Making workouts more achievable.', metrics.completion_rate);
      confidence_score := 0.75;
    END IF;

  -- 4. Check if workout is too far above user's level
  ELSIF level_diff > 2.0 THEN
    recommended_type := 'decrease';
    change_amount := -1.0;
    recommended_level := user_progression + 0.5; -- Slightly above their level
    reason_text := format('Workout level (%.1f) too far above progression level (%.1f).',
                          workout.workout_level, user_progression);
    confidence_score := 0.85;

  -- 5. Check if workout is too far below user's level
  ELSIF level_diff < -2.0 AND workout.target_zone != 'recovery' THEN
    recommended_type := 'increase';
    change_amount := 1.0;
    recommended_level := user_progression - 0.5; -- Slightly below their level
    reason_text := format('Workout level (%.1f) too far below progression level (%.1f).',
                          workout.workout_level, user_progression);
    confidence_score := 0.85;

  -- 6. Check average RPE
  ELSIF metrics.avg_rpe >= 9.0 THEN
    -- User has been struggling (high RPE)
    recommended_type := 'decrease';
    change_amount := -0.5;
    recommended_level := GREATEST(1.0, workout.workout_level + change_amount);
    reason_text := format('High average RPE (%.1f) suggests overtraining. Reducing load.', metrics.avg_rpe);
    confidence_score := 0.7;

  -- 7. Check if user is crushing workouts (low RPE + high completion)
  ELSIF metrics.avg_rpe <= 6.0 AND metrics.completion_rate >= 95 THEN
    recommended_type := 'increase';
    change_amount := 0.3;
    recommended_level := LEAST(10.0, workout.workout_level + change_amount);
    reason_text := format('Low RPE (%.1f) and high completion rate. Ready for more challenge.', metrics.avg_rpe);
    confidence_score := 0.8;
  END IF;

  -- Apply sensitivity modifier
  IF settings.adaptation_sensitivity = 'conservative' THEN
    confidence_score := confidence_score * 0.7;
    change_amount := change_amount * 0.7;
  ELSIF settings.adaptation_sensitivity = 'aggressive' THEN
    confidence_score := confidence_score * 1.3;
    change_amount := change_amount * 1.3;
  END IF;

  -- Recalculate recommended level if change amount was modified
  IF change_amount != 0 THEN
    recommended_level := GREATEST(1.0, LEAST(10.0, workout.workout_level + change_amount));
  END IF;

  -- Only recommend adaptation if confidence is high enough
  IF confidence_score < 0.6 THEN
    recommended_type := 'no_change';
    recommended_level := workout.workout_level;
    change_amount := 0;
  END IF;

  RETURN QUERY SELECT
    (recommended_type != 'no_change')::BOOLEAN,
    recommended_type,
    recommended_level,
    change_amount,
    reason_text,
    confidence_score;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Apply an adaptation to a workout
CREATE OR REPLACE FUNCTION apply_adaptation(
  user_uuid UUID,
  workout_id UUID,
  adaptation_type_param VARCHAR(50),
  new_level DECIMAL(3,1),
  reason_param TEXT,
  auto_accept BOOLEAN DEFAULT FALSE
)
RETURNS UUID AS $$
DECLARE
  adaptation_id UUID;
  old_level DECIMAL(3,1);
  metrics RECORD;
  workout RECORD;
BEGIN
  -- Get current workout level
  SELECT workout_level, target_zone, workout_date INTO workout
  FROM planned_workouts
  WHERE id = workout_id AND user_id = user_uuid;

  old_level := workout.workout_level;

  -- Get metrics for context
  SELECT * INTO metrics FROM get_recent_training_metrics(user_uuid, 7) LIMIT 1;

  -- Create adaptation history entry
  INSERT INTO adaptation_history (
    user_id,
    planned_workout_id,
    old_workout_level,
    new_workout_level,
    level_change,
    adaptation_type,
    reason,
    tsb_value,
    recent_completion_rate,
    zone_progression_level,
    recent_avg_rpe,
    was_accepted
  )
  VALUES (
    user_uuid,
    workout_id,
    old_level,
    new_level,
    new_level - old_level,
    adaptation_type_param,
    reason_param,
    metrics.current_tsb,
    metrics.completion_rate,
    get_progression_level_for_zone(user_uuid, workout.target_zone),
    metrics.avg_rpe,
    CASE WHEN auto_accept THEN TRUE ELSE NULL END
  )
  RETURNING id INTO adaptation_id;

  -- If auto-accept, apply the change immediately
  IF auto_accept THEN
    IF adaptation_type_param = 'skip' THEN
      -- Mark workout as skipped/deleted or move to different date
      UPDATE planned_workouts
      SET
        was_adapted = TRUE,
        adaptation_reason = reason_param
      WHERE id = workout_id;
    ELSE
      -- Update workout level
      UPDATE planned_workouts
      SET
        workout_level = new_level,
        was_adapted = TRUE,
        adaptation_reason = reason_param
      WHERE id = workout_id;
    END IF;

    UPDATE adaptation_history
    SET accepted_at = NOW()
    WHERE id = adaptation_id;
  END IF;

  RETURN adaptation_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Accept or reject a pending adaptation
CREATE OR REPLACE FUNCTION respond_to_adaptation(
  adaptation_id_param UUID,
  accept BOOLEAN,
  user_feedback_param TEXT DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
  adaptation RECORD;
BEGIN
  SELECT * INTO adaptation
  FROM adaptation_history
  WHERE id = adaptation_id_param;

  IF accept THEN
    -- Apply the adaptation
    IF adaptation.adaptation_type = 'skip' THEN
      UPDATE planned_workouts
      SET
        was_adapted = TRUE,
        adaptation_reason = adaptation.reason
      WHERE id = adaptation.planned_workout_id;
    ELSE
      UPDATE planned_workouts
      SET
        workout_level = adaptation.new_workout_level,
        was_adapted = TRUE,
        adaptation_reason = adaptation.reason
      WHERE id = adaptation.planned_workout_id;
    END IF;

    UPDATE adaptation_history
    SET
      was_accepted = TRUE,
      accepted_at = NOW(),
      user_feedback = user_feedback_param
    WHERE id = adaptation_id_param;
  ELSE
    UPDATE adaptation_history
    SET
      was_accepted = FALSE,
      rejected_at = NOW(),
      user_feedback = user_feedback_param
    WHERE id = adaptation_id_param;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Run adaptive training evaluation for all upcoming workouts
CREATE OR REPLACE FUNCTION run_adaptive_training(user_uuid UUID)
RETURNS TABLE (
  workout_id UUID,
  workout_date DATE,
  current_level DECIMAL(3,1),
  recommended_level DECIMAL(3,1),
  adaptation_type VARCHAR(50),
  reason TEXT,
  adaptation_id UUID
) AS $$
DECLARE
  workout RECORD;
  evaluation RECORD;
  settings RECORD;
  new_adaptation_id UUID;
BEGIN
  -- Get settings
  SELECT * INTO settings FROM get_adaptation_settings(user_uuid) LIMIT 1;

  IF settings.adaptive_enabled = FALSE THEN
    RETURN;
  END IF;

  -- Evaluate each upcoming workout
  FOR workout IN
    SELECT id, workout_date, workout_level, target_zone
    FROM planned_workouts
    WHERE user_id = user_uuid
      AND workout_date >= CURRENT_DATE
      AND workout_date <= CURRENT_DATE + 14 -- Next 2 weeks
      AND workout_type != 'rest'
      AND was_adapted = FALSE
    ORDER BY workout_date
  LOOP
    -- Evaluate if this workout should be adapted
    SELECT * INTO evaluation
    FROM evaluate_workout_adaptation(user_uuid, workout.id)
    LIMIT 1;

    -- If adaptation is recommended
    IF evaluation.should_adapt THEN
      -- Apply the adaptation
      new_adaptation_id := apply_adaptation(
        user_uuid,
        workout.id,
        evaluation.adaptation_type,
        evaluation.new_level,
        evaluation.reason,
        settings.auto_apply
      );

      RETURN QUERY SELECT
        workout.id,
        workout.workout_date,
        workout.workout_level,
        evaluation.new_level,
        evaluation.adaptation_type,
        evaluation.reason,
        new_adaptation_id;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE adaptation_history IS 'Audit log of all automatic workout adaptations';
COMMENT ON TABLE adaptation_settings IS 'User preferences for adaptive training behavior';
COMMENT ON FUNCTION evaluate_workout_adaptation IS 'Core algorithm: analyzes workout and recommends adaptation';
COMMENT ON FUNCTION apply_adaptation IS 'Applies an adaptation to a workout and creates history entry';
COMMENT ON FUNCTION run_adaptive_training IS 'Evaluates all upcoming workouts and recommends adaptations';
COMMENT ON FUNCTION respond_to_adaptation IS 'User accepts or rejects a recommended adaptation';
