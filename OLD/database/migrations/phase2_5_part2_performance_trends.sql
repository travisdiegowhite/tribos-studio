-- Phase 2.5: Ride Intelligence - Part 2: Performance Trends
-- Created: 2025-11-16
-- Description: Detects and tracks performance trends over time including FTP improvements,
--              zone-specific fitness gains, fatigue patterns, and training consistency

-- ============================================================================
-- TABLE: performance_trends
-- ============================================================================
-- Stores detected performance trends with confidence scores and metrics

CREATE TABLE IF NOT EXISTS performance_trends (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,

  -- Trend Classification
  trend_type TEXT NOT NULL, -- 'ftp_improvement', 'zone_fitness', 'fatigue_accumulation', 'consistency_streak', 'volume_change'
  zone TEXT, -- Training zone if applicable (NULL for general trends)
  direction TEXT NOT NULL, -- 'improving', 'declining', 'stable'

  -- Trend Metrics
  confidence DECIMAL(3,2) CHECK (confidence >= 0.00 AND confidence <= 1.00), -- 0.0-1.0 confidence score
  start_date DATE NOT NULL,
  end_date DATE,
  value_change DECIMAL(10,2), -- Numeric change (e.g., +15W FTP, +0.5 progression level)
  value_change_percent DECIMAL(5,2), -- Percentage change

  -- Supporting Data
  metrics JSONB DEFAULT '{}'::jsonb, -- Additional trend-specific metrics
  ride_count INTEGER, -- Number of rides in trend period
  is_active BOOLEAN DEFAULT TRUE, -- Currently active trend

  -- Notifications
  user_notified BOOLEAN DEFAULT FALSE,
  notified_at TIMESTAMPTZ,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CHECK(trend_type IN ('ftp_improvement', 'ftp_decline', 'zone_fitness', 'fatigue_accumulation',
                       'consistency_streak', 'volume_increase', 'volume_decrease', 'recovery_needed'))
);

-- Indexes
CREATE INDEX idx_performance_trends_user_id ON performance_trends(user_id);
CREATE INDEX idx_performance_trends_trend_type ON performance_trends(trend_type);
CREATE INDEX idx_performance_trends_is_active ON performance_trends(is_active);
CREATE INDEX idx_performance_trends_created_at ON performance_trends(created_at DESC);

-- Row Level Security
ALTER TABLE performance_trends ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own trends"
  ON performance_trends FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own trends"
  ON performance_trends FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own trends"
  ON performance_trends FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own trends"
  ON performance_trends FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- FUNCTION: detect_ftp_trend
-- ============================================================================
-- Analyzes recent rides to detect FTP improvement or decline trends

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
    AND r.activity_date >= CURRENT_DATE - p_lookback_days
    AND r.normalized_power IS NOT NULL
    AND rc.zone = 'threshold';

  -- Also check 20-min peak powers from analysis
  SELECT AVG((ra.peak_powers->>'20min')::DECIMAL * 0.95)
  INTO v_avg_20min_power
  FROM ride_analysis ra
  JOIN routes r ON r.id = ra.ride_id
  WHERE ra.user_id = p_user_id
    AND r.activity_date >= CURRENT_DATE - p_lookback_days
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

  -- Insert trend
  INSERT INTO performance_trends (
    user_id,
    trend_type,
    direction,
    confidence,
    start_date,
    end_date,
    value_change,
    value_change_percent,
    ride_count,
    metrics
  )
  VALUES (
    p_user_id,
    v_trend_type,
    v_direction,
    v_confidence,
    CURRENT_DATE - p_lookback_days,
    CURRENT_DATE,
    v_ftp_change,
    v_ftp_change_percent,
    v_ride_count,
    jsonb_build_object(
      'current_ftp', v_current_ftp,
      'estimated_ftp', v_avg_threshold_power,
      'lookback_days', p_lookback_days
    )
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_trend_id;

  RETURN v_trend_id;
END;
$$;

-- ============================================================================
-- FUNCTION: detect_zone_fitness_trends
-- ============================================================================
-- Analyzes progression level changes to detect zone-specific fitness trends

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

    -- Insert trend
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
      metrics
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
      )
    )
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_trend_id;

    IF v_trend_id IS NOT NULL THEN
      RETURN NEXT v_trend_id;
    END IF;
  END LOOP;

  RETURN;
END;
$$;

-- ============================================================================
-- FUNCTION: detect_volume_trends
-- ============================================================================
-- Analyzes weekly TSS to detect training volume changes

CREATE OR REPLACE FUNCTION detect_volume_trends(
  p_user_id UUID,
  p_lookback_weeks INTEGER DEFAULT 4
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_recent_avg_tss DECIMAL;
  v_previous_avg_tss DECIMAL;
  v_tss_change DECIMAL;
  v_tss_change_percent DECIMAL;
  v_direction TEXT;
  v_trend_type TEXT;
  v_confidence DECIMAL;
  v_trend_id UUID;
BEGIN
  -- Calculate average weekly TSS for recent period
  SELECT AVG(weekly_tss) INTO v_recent_avg_tss
  FROM (
    SELECT
      DATE_TRUNC('week', activity_date) as week,
      SUM(COALESCE(training_stress_score, 0)) as weekly_tss
    FROM routes
    WHERE user_id = p_user_id
      AND activity_date >= CURRENT_DATE - (p_lookback_weeks * 7)
      AND activity_date >= CURRENT_DATE - ((p_lookback_weeks / 2) * 7)
    GROUP BY DATE_TRUNC('week', activity_date)
  ) recent;

  -- Calculate average weekly TSS for previous period
  SELECT AVG(weekly_tss) INTO v_previous_avg_tss
  FROM (
    SELECT
      DATE_TRUNC('week', activity_date) as week,
      SUM(COALESCE(training_stress_score, 0)) as weekly_tss
    FROM routes
    WHERE user_id = p_user_id
      AND activity_date >= CURRENT_DATE - (p_lookback_weeks * 7)
      AND activity_date < CURRENT_DATE - ((p_lookback_weeks / 2) * 7)
    GROUP BY DATE_TRUNC('week', activity_date)
  ) previous;

  IF v_recent_avg_tss IS NULL OR v_previous_avg_tss IS NULL OR v_previous_avg_tss = 0 THEN
    RETURN NULL;
  END IF;

  -- Calculate change
  v_tss_change := v_recent_avg_tss - v_previous_avg_tss;
  v_tss_change_percent := (v_tss_change / v_previous_avg_tss) * 100;

  -- Determine direction
  IF v_tss_change_percent > 10 THEN
    v_direction := 'improving';
    v_trend_type := 'volume_increase';
    v_confidence := LEAST(0.90, 0.70 + (v_tss_change_percent / 100));
  ELSIF v_tss_change_percent < -10 THEN
    v_direction := 'declining';
    v_trend_type := 'volume_decrease';
    v_confidence := LEAST(0.90, 0.70 + (ABS(v_tss_change_percent) / 100));
  ELSE
    RETURN NULL; -- Not significant
  END IF;

  -- Insert trend
  INSERT INTO performance_trends (
    user_id,
    trend_type,
    direction,
    confidence,
    start_date,
    end_date,
    value_change,
    value_change_percent,
    metrics
  )
  VALUES (
    p_user_id,
    v_trend_type,
    v_direction,
    v_confidence,
    CURRENT_DATE - (p_lookback_weeks * 7),
    CURRENT_DATE,
    v_tss_change,
    v_tss_change_percent,
    jsonb_build_object(
      'recent_avg_tss', v_recent_avg_tss,
      'previous_avg_tss', v_previous_avg_tss,
      'lookback_weeks', p_lookback_weeks
    )
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_trend_id;

  RETURN v_trend_id;
END;
$$;

-- ============================================================================
-- FUNCTION: detect_all_trends
-- ============================================================================
-- Runs all trend detection algorithms and returns summary

CREATE OR REPLACE FUNCTION detect_all_trends(
  p_user_id UUID,
  p_lookback_days INTEGER DEFAULT 28
)
RETURNS TABLE (
  trend_count INTEGER,
  ftp_trend UUID,
  zone_trends UUID[],
  volume_trend UUID
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_ftp_trend UUID;
  v_zone_trends UUID[];
  v_volume_trend UUID;
  v_total_count INTEGER;
BEGIN
  -- Detect FTP trend
  v_ftp_trend := detect_ftp_trend(p_user_id, p_lookback_days);

  -- Detect zone fitness trends
  SELECT ARRAY_AGG(id) INTO v_zone_trends
  FROM detect_zone_fitness_trends(p_user_id, p_lookback_days);

  -- Detect volume trend
  v_volume_trend := detect_volume_trends(p_user_id, p_lookback_days / 7);

  -- Count total trends
  v_total_count :=
    (CASE WHEN v_ftp_trend IS NOT NULL THEN 1 ELSE 0 END) +
    COALESCE(array_length(v_zone_trends, 1), 0) +
    (CASE WHEN v_volume_trend IS NOT NULL THEN 1 ELSE 0 END);

  RETURN QUERY SELECT
    v_total_count,
    v_ftp_trend,
    v_zone_trends,
    v_volume_trend;
END;
$$;

-- ============================================================================
-- FUNCTION: get_active_trends
-- ============================================================================
-- Retrieves all active trends for a user with formatted descriptions

CREATE OR REPLACE FUNCTION get_active_trends(p_user_id UUID)
RETURNS TABLE (
  id UUID,
  trend_type TEXT,
  zone TEXT,
  direction TEXT,
  confidence DECIMAL,
  description TEXT,
  value_change DECIMAL,
  value_change_percent DECIMAL,
  start_date DATE,
  days_active INTEGER
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    pt.id,
    pt.trend_type,
    pt.zone,
    pt.direction,
    pt.confidence,
    CASE
      WHEN pt.trend_type = 'ftp_improvement' THEN
        'FTP trending up +' || ROUND(pt.value_change) || 'W (+' || ROUND(pt.value_change_percent, 1) || '%)'
      WHEN pt.trend_type = 'ftp_decline' THEN
        'FTP trending down ' || ROUND(pt.value_change) || 'W (' || ROUND(pt.value_change_percent, 1) || '%)'
      WHEN pt.trend_type = 'zone_fitness' AND pt.direction = 'improving' THEN
        UPPER(SUBSTRING(pt.zone, 1, 1)) || SUBSTRING(pt.zone, 2) || ' fitness improving (+' || ROUND(pt.value_change, 1) || ' levels)'
      WHEN pt.trend_type = 'zone_fitness' AND pt.direction = 'declining' THEN
        UPPER(SUBSTRING(pt.zone, 1, 1)) || SUBSTRING(pt.zone, 2) || ' fitness declining (' || ROUND(pt.value_change, 1) || ' levels)'
      WHEN pt.trend_type = 'volume_increase' THEN
        'Training volume up +' || ROUND(pt.value_change) || ' TSS/week (+' || ROUND(pt.value_change_percent, 1) || '%)'
      WHEN pt.trend_type = 'volume_decrease' THEN
        'Training volume down ' || ROUND(pt.value_change) || ' TSS/week (' || ROUND(pt.value_change_percent, 1) || '%)'
      ELSE pt.trend_type
    END as description,
    pt.value_change,
    pt.value_change_percent,
    pt.start_date,
    CURRENT_DATE - pt.start_date as days_active
  FROM performance_trends pt
  WHERE pt.user_id = p_user_id
    AND pt.is_active = TRUE
  ORDER BY pt.confidence DESC, pt.created_at DESC;
END;
$$;

COMMENT ON TABLE performance_trends IS 'Tracks detected performance trends including FTP changes, zone fitness, and training volume patterns';
COMMENT ON FUNCTION detect_ftp_trend IS 'Detects FTP improvement or decline based on recent threshold rides';
COMMENT ON FUNCTION detect_zone_fitness_trends IS 'Detects fitness trends in specific training zones based on progression levels';
COMMENT ON FUNCTION detect_volume_trends IS 'Detects training volume increases or decreases based on weekly TSS';
COMMENT ON FUNCTION detect_all_trends IS 'Runs all trend detection algorithms and returns summary';
COMMENT ON FUNCTION get_active_trends IS 'Retrieves all active trends with human-readable descriptions';
