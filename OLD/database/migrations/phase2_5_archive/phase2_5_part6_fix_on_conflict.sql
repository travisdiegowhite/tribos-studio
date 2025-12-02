-- Phase 2.5: Ride Intelligence - Part 6: Fix ON CONFLICT Errors
-- Created: 2025-11-16
-- Description: Removes invalid ON CONFLICT clauses from trend detection functions
--              The performance_trends table has no unique constraint, so ON CONFLICT fails

-- ============================================================================
-- FIX: detect_ftp_trend - Remove invalid ON CONFLICT
-- ============================================================================

CREATE OR REPLACE FUNCTION detect_ftp_trend(
  p_user_id UUID,
  p_lookback_days INTEGER DEFAULT 28
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_current_ftp DECIMAL;
  v_avg_threshold_power DECIMAL;
  v_avg_20min_power DECIMAL;
  v_ride_count INTEGER;
  v_ftp_change DECIMAL;
  v_ftp_change_percent DECIMAL;
  v_confidence DECIMAL;
  v_direction TEXT;
  v_trend_id UUID;
  v_trend_type TEXT;
BEGIN
  -- Get current FTP
  SELECT ftp_watts INTO v_current_ftp
  FROM user_ftp_history
  WHERE user_id = p_user_id AND is_current = TRUE
  LIMIT 1;

  IF v_current_ftp IS NULL THEN
    RETURN NULL;
  END IF;

  -- Get average threshold power from recent rides
  SELECT
    AVG(r.normalized_power) FILTER (WHERE rc.zone = 'threshold'),
    COUNT(*) FILTER (WHERE rc.zone = 'threshold')
  INTO v_avg_threshold_power, v_ride_count
  FROM routes r
  LEFT JOIN ride_classification rc ON rc.ride_id = r.id
  WHERE r.user_id = p_user_id
    AND r.recorded_at >= CURRENT_DATE - p_lookback_days
    AND r.normalized_power IS NOT NULL
    AND rc.zone = 'threshold';

  -- Also check 20-min peak powers from analysis
  SELECT AVG((ra.peak_powers->>'20min')::DECIMAL * 0.95)
  INTO v_avg_20min_power
  FROM ride_analysis ra
  JOIN routes r ON r.id = ra.ride_id
  WHERE ra.user_id = p_user_id
    AND r.recorded_at >= CURRENT_DATE - p_lookback_days
    AND ra.peak_powers->>'20min' IS NOT NULL;

  -- Use the higher of the two estimates
  v_avg_threshold_power := GREATEST(
    COALESCE(v_avg_threshold_power, 0),
    COALESCE(v_avg_20min_power, 0)
  );

  IF v_avg_threshold_power = 0 OR v_ride_count < 3 THEN
    RETURN NULL; -- Not enough data
  END IF;

  -- Calculate change
  v_ftp_change := v_avg_threshold_power - v_current_ftp;
  v_ftp_change_percent := (v_ftp_change / v_current_ftp) * 100;

  -- Determine direction and confidence
  IF ABS(v_ftp_change_percent) < 2 THEN
    v_direction := 'stable';
    v_confidence := 0.60;
  ELSIF v_ftp_change > 0 THEN
    v_direction := 'improving';
    v_trend_type := 'ftp_improvement';
    v_confidence := LEAST(0.95, 0.60 + (ABS(v_ftp_change_percent) / 10));
  ELSE
    v_direction := 'declining';
    v_trend_type := 'ftp_decline';
    v_confidence := LEAST(0.95, 0.60 + (ABS(v_ftp_change_percent) / 10));
  END IF;

  -- Only create trend if significant change (>2%)
  IF ABS(v_ftp_change_percent) < 2 THEN
    RETURN NULL;
  END IF;

  -- Deactivate old FTP trends of this type
  UPDATE performance_trends
  SET is_active = FALSE
  WHERE user_id = p_user_id
    AND trend_type = v_trend_type
    AND is_active = TRUE;

  -- Create new trend (no ON CONFLICT - just insert)
  INSERT INTO performance_trends (
    user_id,
    trend_type,
    direction,
    confidence,
    start_date,
    value_change,
    value_change_percent,
    ride_count,
    metrics,
    is_active
  )
  VALUES (
    p_user_id,
    v_trend_type,
    v_direction,
    v_confidence,
    CURRENT_DATE - p_lookback_days,
    v_ftp_change,
    v_ftp_change_percent,
    v_ride_count,
    jsonb_build_object(
      'current_ftp', v_current_ftp,
      'estimated_ftp', v_avg_threshold_power,
      'threshold_rides', v_ride_count
    ),
    TRUE
  )
  RETURNING id INTO v_trend_id;

  RETURN v_trend_id;
END;
$$;

-- ============================================================================
-- FIX: detect_volume_trends - Remove invalid ON CONFLICT
-- ============================================================================

CREATE OR REPLACE FUNCTION detect_volume_trends(
  p_user_id UUID,
  p_lookback_weeks INTEGER DEFAULT 4
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_recent_avg_tss DECIMAL;
  v_baseline_avg_tss DECIMAL;
  v_tss_change DECIMAL;
  v_tss_change_percent DECIMAL;
  v_direction TEXT;
  v_confidence DECIMAL;
  v_trend_id UUID;
  v_trend_type TEXT;
  v_recent_weeks INTEGER;
  v_baseline_weeks INTEGER;
BEGIN
  -- Calculate average TSS for recent period (last half of lookback)
  SELECT
    COALESCE(AVG(weekly_tss), 0),
    COUNT(*)
  INTO v_recent_avg_tss, v_recent_weeks
  FROM (
    SELECT
      DATE_TRUNC('week', recorded_at) as week,
      SUM(training_stress_score) as weekly_tss
    FROM routes
    WHERE user_id = p_user_id
      AND recorded_at >= CURRENT_DATE - (p_lookback_weeks * 7)
      AND recorded_at >= CURRENT_DATE - ((p_lookback_weeks / 2) * 7)
    GROUP BY DATE_TRUNC('week', recorded_at)
  ) recent_weeks;

  -- Calculate average TSS for baseline period (first half of lookback)
  SELECT
    COALESCE(AVG(weekly_tss), 0),
    COUNT(*)
  INTO v_baseline_avg_tss, v_baseline_weeks
  FROM (
    SELECT
      DATE_TRUNC('week', recorded_at) as week,
      SUM(training_stress_score) as weekly_tss
    FROM routes
    WHERE user_id = p_user_id
      AND recorded_at >= CURRENT_DATE - (p_lookback_weeks * 7)
      AND recorded_at < CURRENT_DATE - ((p_lookback_weeks / 2) * 7)
    GROUP BY DATE_TRUNC('week', recorded_at)
  ) baseline_weeks;

  -- Need at least 2 weeks of data in each period
  IF v_recent_weeks < 2 OR v_baseline_weeks < 2 OR v_baseline_avg_tss = 0 THEN
    RETURN NULL;
  END IF;

  -- Calculate change
  v_tss_change := v_recent_avg_tss - v_baseline_avg_tss;
  v_tss_change_percent := (v_tss_change / v_baseline_avg_tss) * 100;

  -- Determine trend direction
  IF ABS(v_tss_change_percent) < 15 THEN
    RETURN NULL; -- Not significant enough
  ELSIF v_tss_change > 0 THEN
    v_direction := 'improving';
    v_trend_type := 'volume_increase';
    v_confidence := LEAST(0.90, 0.65 + (ABS(v_tss_change_percent) / 50));
  ELSE
    v_direction := 'declining';
    v_trend_type := 'volume_decrease';
    v_confidence := LEAST(0.90, 0.65 + (ABS(v_tss_change_percent) / 50));
  END IF;

  -- Deactivate old volume trends of this type
  UPDATE performance_trends
  SET is_active = FALSE
  WHERE user_id = p_user_id
    AND trend_type = v_trend_type
    AND is_active = TRUE;

  -- Create new trend (no ON CONFLICT - just insert)
  INSERT INTO performance_trends (
    user_id,
    trend_type,
    direction,
    confidence,
    start_date,
    value_change,
    value_change_percent,
    metrics,
    is_active
  )
  VALUES (
    p_user_id,
    v_trend_type,
    v_direction,
    v_confidence,
    CURRENT_DATE - (p_lookback_weeks * 7),
    v_tss_change,
    v_tss_change_percent,
    jsonb_build_object(
      'recent_avg_tss', v_recent_avg_tss,
      'baseline_avg_tss', v_baseline_avg_tss,
      'recent_weeks', v_recent_weeks,
      'baseline_weeks', v_baseline_weeks
    ),
    TRUE
  )
  RETURNING id INTO v_trend_id;

  RETURN v_trend_id;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION detect_ftp_trend TO authenticated;
GRANT EXECUTE ON FUNCTION detect_volume_trends TO authenticated;

-- Comments
COMMENT ON FUNCTION detect_ftp_trend IS 'Detects FTP improvement or decline (FIXED: removed invalid ON CONFLICT)';
COMMENT ON FUNCTION detect_volume_trends IS 'Detects training volume changes (FIXED: removed invalid ON CONFLICT)';
