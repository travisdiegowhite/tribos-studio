-- Phase 2.5: Ride Intelligence - Part 7: Fix detect_zone_fitness_trends
-- Created: 2025-11-16
-- Description: Fixes detect_zone_fitness_trends function - removes invalid ON CONFLICT
--              and fixes the RETURN NEXT pattern for SETOF UUID

-- ============================================================================
-- FIX: detect_zone_fitness_trends - Remove invalid ON CONFLICT, fix RETURN
-- ============================================================================

CREATE OR REPLACE FUNCTION detect_zone_fitness_trends(
  p_user_id UUID,
  p_lookback_days INTEGER DEFAULT 28
)
RETURNS SETOF UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_zone RECORD;
  v_level_change DECIMAL;
  v_change_count INTEGER;
  v_direction TEXT;
  v_confidence DECIMAL;
  v_trend_id UUID;
BEGIN
  -- Check each training zone
  FOR v_zone IN
    SELECT
      zone,
      level,
      last_level_change,
      workouts_completed
    FROM progression_levels
    WHERE user_id = p_user_id
  LOOP
    -- Get level changes in lookback period
    SELECT
      SUM(level_change),
      COUNT(*)
    INTO v_level_change, v_change_count
    FROM progression_level_history
    WHERE user_id = p_user_id
      AND zone = v_zone.zone
      AND changed_at >= CURRENT_DATE - p_lookback_days;

    -- Need at least 3 workouts in the zone
    IF v_change_count < 3 THEN
      CONTINUE;
    END IF;

    -- Determine trend direction
    IF v_level_change > 0.5 THEN
      v_direction := 'improving';
      v_confidence := LEAST(0.90, 0.65 + (v_level_change / 5));
    ELSIF v_level_change < -0.5 THEN
      v_direction := 'declining';
      v_confidence := LEAST(0.90, 0.65 + (ABS(v_level_change) / 5));
    ELSE
      v_direction := 'stable';
      v_confidence := 0.70;
      CONTINUE; -- Don't create trend for stable zones
    END IF;

    -- Deactivate old zone fitness trends for this zone
    UPDATE performance_trends
    SET is_active = FALSE
    WHERE user_id = p_user_id
      AND trend_type = 'zone_fitness'
      AND zone = v_zone.zone
      AND is_active = TRUE;

    -- Insert new trend (no ON CONFLICT - just insert)
    INSERT INTO performance_trends (
      user_id,
      trend_type,
      zone,
      direction,
      confidence,
      start_date,
      end_date,
      value_change,
      ride_count,
      metrics,
      is_active
    )
    VALUES (
      p_user_id,
      'zone_fitness',
      v_zone.zone,
      v_direction,
      v_confidence,
      CURRENT_DATE - p_lookback_days,
      CURRENT_DATE,
      v_level_change,
      v_change_count,
      jsonb_build_object(
        'current_level', v_zone.level,
        'workouts_completed', v_zone.workouts_completed,
        'lookback_days', p_lookback_days
      ),
      TRUE
    )
    RETURNING id INTO v_trend_id;

    -- Return the trend ID (for SETOF UUID return type)
    IF v_trend_id IS NOT NULL THEN
      RETURN NEXT v_trend_id;
    END IF;

  END LOOP;

  RETURN;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION detect_zone_fitness_trends TO authenticated;

-- Comments
COMMENT ON FUNCTION detect_zone_fitness_trends IS 'Detects fitness trends in specific training zones (FIXED: removed invalid ON CONFLICT, fixed RETURN NEXT)';
