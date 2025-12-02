-- Phase 2.5: Ride Intelligence - Part 5: Fix Column Name References
-- Created: 2025-11-16
-- Description: Fixes all references to activity_date (which doesn't exist) to use recorded_at
--              This fixes the 400 errors in detect_all_trends and related functions

-- ============================================================================
-- FIX: detect_ftp_trend - Replace activity_date with recorded_at
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
    AND r.recorded_at >= CURRENT_DATE - p_lookback_days  -- FIXED: activity_date → recorded_at
    AND r.normalized_power IS NOT NULL
    AND rc.zone = 'threshold';

  -- Also check 20-min peak powers from analysis
  SELECT AVG((ra.peak_powers->>'20min')::DECIMAL * 0.95)
  INTO v_avg_20min_power
  FROM ride_analysis ra
  JOIN routes r ON r.id = ra.ride_id
  WHERE ra.user_id = p_user_id
    AND r.recorded_at >= CURRENT_DATE - p_lookback_days  -- FIXED: activity_date → recorded_at
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

  -- Create or update trend
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
  ON CONFLICT (user_id, trend_type, zone)
    WHERE is_active = TRUE
  DO UPDATE SET
    confidence = EXCLUDED.confidence,
    value_change = EXCLUDED.value_change,
    value_change_percent = EXCLUDED.value_change_percent,
    ride_count = EXCLUDED.ride_count,
    metrics = EXCLUDED.metrics,
    updated_at = NOW()
  RETURNING id INTO v_trend_id;

  RETURN v_trend_id;
END;
$$;

-- ============================================================================
-- FIX: detect_volume_trends - Replace activity_date with recorded_at
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
      DATE_TRUNC('week', recorded_at) as week,  -- FIXED: activity_date → recorded_at
      SUM(training_stress_score) as weekly_tss
    FROM routes
    WHERE user_id = p_user_id
      AND recorded_at >= CURRENT_DATE - (p_lookback_weeks * 7)  -- FIXED: activity_date → recorded_at
      AND recorded_at >= CURRENT_DATE - ((p_lookback_weeks / 2) * 7)  -- FIXED: activity_date → recorded_at
    GROUP BY DATE_TRUNC('week', recorded_at)  -- FIXED: activity_date → recorded_at
  ) recent_weeks;

  -- Calculate average TSS for baseline period (first half of lookback)
  SELECT
    COALESCE(AVG(weekly_tss), 0),
    COUNT(*)
  INTO v_baseline_avg_tss, v_baseline_weeks
  FROM (
    SELECT
      DATE_TRUNC('week', recorded_at) as week,  -- FIXED: activity_date → recorded_at
      SUM(training_stress_score) as weekly_tss
    FROM routes
    WHERE user_id = p_user_id
      AND recorded_at >= CURRENT_DATE - (p_lookback_weeks * 7)  -- FIXED: activity_date → recorded_at
      AND recorded_at < CURRENT_DATE - ((p_lookback_weeks / 2) * 7)  -- FIXED: activity_date → recorded_at
    GROUP BY DATE_TRUNC('week', recorded_at)  -- FIXED: activity_date → recorded_at
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

  -- Create or update trend
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
  ON CONFLICT (user_id, trend_type, zone)
    WHERE is_active = TRUE
  DO UPDATE SET
    confidence = EXCLUDED.confidence,
    value_change = EXCLUDED.value_change,
    value_change_percent = EXCLUDED.value_change_percent,
    metrics = EXCLUDED.metrics,
    updated_at = NOW()
  RETURNING id INTO v_trend_id;

  RETURN v_trend_id;
END;
$$;

-- ============================================================================
-- FIX: get_route_recommendations - Replace activity_date with recorded_at
-- ============================================================================
-- Drop the existing function first to avoid ambiguity

DROP FUNCTION IF EXISTS get_route_recommendations(UUID, TEXT, DECIMAL, DECIMAL, INTEGER);

-- Recreate with the original signature but fixed column references
CREATE OR REPLACE FUNCTION get_route_recommendations(
  p_user_id UUID,
  p_target_zone TEXT DEFAULT NULL,
  p_target_difficulty_min DECIMAL DEFAULT NULL,
  p_target_difficulty_max DECIMAL DEFAULT NULL,
  p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
  route_id UUID,
  route_name TEXT,
  difficulty_score DECIMAL,
  distance DECIMAL,
  elevation_gain DECIMAL,
  estimated_duration INTEGER,
  match_score DECIMAL,
  recommendation_reason TEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_user_avg_level DECIMAL;
  v_zone_level DECIMAL;
BEGIN
  -- Get user's average progression level
  SELECT AVG(level) INTO v_user_avg_level
  FROM progression_levels
  WHERE user_id = p_user_id;

  -- Get zone-specific level if target zone provided
  IF p_target_zone IS NOT NULL THEN
    SELECT level INTO v_zone_level
    FROM progression_levels
    WHERE user_id = p_user_id AND zone = p_target_zone;
  END IF;

  -- Return recommended routes
  RETURN QUERY
  SELECT
    r.id,
    r.name,
    r.difficulty_score,
    r.distance_km,
    r.elevation_gain_m,
    r.duration_seconds,
    -- Match score based on difficulty vs user fitness
    (10.0 - ABS(r.difficulty_score - COALESCE(v_zone_level, v_user_avg_level)))::DECIMAL as match_score,
    -- Recommendation reason
    CASE
      WHEN r.difficulty_score < COALESCE(v_zone_level, v_user_avg_level) - 2 THEN
        'Good recovery ride - easier than your current fitness'
      WHEN r.difficulty_score > COALESCE(v_zone_level, v_user_avg_level) + 2 THEN
        'Challenging ride - harder than your current fitness'
      ELSE
        'Good match for your current fitness level'
    END as recommendation_reason
  FROM routes r
  WHERE r.user_id = p_user_id
    AND r.difficulty_score IS NOT NULL
    AND (p_target_difficulty_min IS NULL OR r.difficulty_score >= p_target_difficulty_min)
    AND (p_target_difficulty_max IS NULL OR r.difficulty_score <= p_target_difficulty_max)
  ORDER BY
    r.recorded_at DESC  -- FIXED: activity_date → recorded_at
  LIMIT p_limit;
END;
$$;

-- Grant permissions (re-grant to ensure they're set)
GRANT EXECUTE ON FUNCTION detect_ftp_trend TO authenticated;
GRANT EXECUTE ON FUNCTION detect_volume_trends TO authenticated;
GRANT EXECUTE ON FUNCTION get_route_recommendations TO authenticated;

-- Comments
COMMENT ON FUNCTION detect_ftp_trend IS 'Detects FTP improvement or decline based on recent threshold rides (FIXED: uses recorded_at)';
COMMENT ON FUNCTION detect_volume_trends IS 'Detects training volume increases or decreases based on weekly TSS (FIXED: uses recorded_at)';
COMMENT ON FUNCTION get_route_recommendations IS 'Returns route recommendations based on difficulty and distance targets (FIXED: uses recorded_at)';
