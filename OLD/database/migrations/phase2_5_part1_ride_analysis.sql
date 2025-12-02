-- Phase 2.5: Ride Intelligence - Part 1: Ride Analysis
-- Created: 2025-11-16
-- Description: Stores detailed analysis metrics for each ride including zone distribution,
--              peak powers, efficiency metrics, and training stress breakdown

-- ============================================================================
-- TABLE: ride_analysis
-- ============================================================================
-- Stores computed insights and metrics for individual rides
-- One analysis record per ride, auto-generated after ride sync

CREATE TABLE IF NOT EXISTS ride_analysis (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  ride_id UUID REFERENCES routes(id) ON DELETE CASCADE NOT NULL,

  -- Zone Time Distribution (seconds in each zone)
  zone_time_distribution JSONB DEFAULT '{
    "recovery": 0,
    "endurance": 0,
    "tempo": 0,
    "sweet_spot": 0,
    "threshold": 0,
    "vo2max": 0,
    "anaerobic": 0
  }'::jsonb,

  -- Peak Power Efforts (watts)
  peak_powers JSONB DEFAULT '{
    "5s": null,
    "1min": null,
    "5min": null,
    "20min": null,
    "60min": null
  }'::jsonb,

  -- Efficiency & Intensity Metrics
  variability_index DECIMAL(4,2), -- VI = NP / AP (ideal: 1.00-1.05)
  intensity_factor DECIMAL(4,2), -- IF = NP / FTP (0.50-1.50)
  efficiency_factor DECIMAL(4,2), -- EF = NP / Avg HR (higher = better)
  hr_power_decoupling DECIMAL(5,2), -- % drift between 1st and 2nd half (< 5% = good)

  -- Training Stress by Zone (TSS contribution per zone)
  training_stress_by_zone JSONB DEFAULT '{
    "recovery": 0,
    "endurance": 0,
    "tempo": 0,
    "sweet_spot": 0,
    "threshold": 0,
    "vo2max": 0,
    "anaerobic": 0
  }'::jsonb,

  -- Pacing & Performance
  pacing_score DECIMAL(3,1), -- 1-10 (even pacing = higher score)
  performance_ratio DECIMAL(4,2), -- Actual vs Expected performance (1.0 = as expected)

  -- Metadata
  analyzed_at TIMESTAMPTZ DEFAULT NOW(),
  analysis_version INTEGER DEFAULT 1, -- For future algorithm updates

  -- Constraints
  UNIQUE(ride_id),
  CHECK(variability_index >= 1.00 OR variability_index IS NULL),
  CHECK(intensity_factor >= 0.00 OR intensity_factor IS NULL),
  CHECK(pacing_score >= 0.0 AND pacing_score <= 10.0 OR pacing_score IS NULL)
);

-- Indexes for performance
CREATE INDEX idx_ride_analysis_user_id ON ride_analysis(user_id);
CREATE INDEX idx_ride_analysis_ride_id ON ride_analysis(ride_id);
CREATE INDEX idx_ride_analysis_analyzed_at ON ride_analysis(analyzed_at DESC);

-- Row Level Security
ALTER TABLE ride_analysis ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own ride analysis"
  ON ride_analysis FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own ride analysis"
  ON ride_analysis FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own ride analysis"
  ON ride_analysis FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own ride analysis"
  ON ride_analysis FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- FUNCTION: calculate_zone_time_distribution
-- ============================================================================
-- Calculates time spent in each training zone based on power data
-- Requires: ride with power stream data, user's current FTP

CREATE OR REPLACE FUNCTION calculate_zone_time_distribution(
  p_ride_id UUID,
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_power_stream INTEGER[];
  v_ftp INTEGER;
  v_zone_times JSONB;
  v_power INTEGER;
  v_zone_name TEXT;
  v_recovery_count INTEGER := 0;
  v_endurance_count INTEGER := 0;
  v_tempo_count INTEGER := 0;
  v_sweetspot_count INTEGER := 0;
  v_threshold_count INTEGER := 0;
  v_vo2max_count INTEGER := 0;
  v_anaerobic_count INTEGER := 0;
BEGIN
  -- Get user's current FTP
  SELECT ftp_watts INTO v_ftp
  FROM user_ftp_history
  WHERE user_id = p_user_id AND is_current = TRUE
  LIMIT 1;

  IF v_ftp IS NULL THEN
    RETURN '{
      "recovery": 0, "endurance": 0, "tempo": 0, "sweet_spot": 0,
      "threshold": 0, "vo2max": 0, "anaerobic": 0
    }'::jsonb;
  END IF;

  -- Get power stream (assuming 1-second intervals)
  SELECT power_stream INTO v_power_stream
  FROM routes
  WHERE id = p_ride_id;

  IF v_power_stream IS NULL OR array_length(v_power_stream, 1) = 0 THEN
    RETURN '{
      "recovery": 0, "endurance": 0, "tempo": 0, "sweet_spot": 0,
      "threshold": 0, "vo2max": 0, "anaerobic": 0
    }'::jsonb;
  END IF;

  -- Count seconds in each zone
  FOREACH v_power IN ARRAY v_power_stream
  LOOP
    CASE
      WHEN v_power::DECIMAL / v_ftp < 0.55 THEN v_recovery_count := v_recovery_count + 1;
      WHEN v_power::DECIMAL / v_ftp < 0.75 THEN v_endurance_count := v_endurance_count + 1;
      WHEN v_power::DECIMAL / v_ftp < 0.88 THEN v_tempo_count := v_tempo_count + 1;
      WHEN v_power::DECIMAL / v_ftp < 0.94 THEN v_sweetspot_count := v_sweetspot_count + 1;
      WHEN v_power::DECIMAL / v_ftp < 1.05 THEN v_threshold_count := v_threshold_count + 1;
      WHEN v_power::DECIMAL / v_ftp < 1.50 THEN v_vo2max_count := v_vo2max_count + 1;
      ELSE v_anaerobic_count := v_anaerobic_count + 1;
    END CASE;
  END LOOP;

  -- Build JSON result
  RETURN jsonb_build_object(
    'recovery', v_recovery_count,
    'endurance', v_endurance_count,
    'tempo', v_tempo_count,
    'sweet_spot', v_sweetspot_count,
    'threshold', v_threshold_count,
    'vo2max', v_vo2max_count,
    'anaerobic', v_anaerobic_count
  );
END;
$$;

-- ============================================================================
-- FUNCTION: calculate_peak_powers
-- ============================================================================
-- Finds best average power for standard durations (5s, 1min, 5min, 20min, 60min)

CREATE OR REPLACE FUNCTION calculate_peak_powers(p_ride_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_power_stream INTEGER[];
  v_stream_length INTEGER;
  v_peak_5s INTEGER;
  v_peak_1min INTEGER;
  v_peak_5min INTEGER;
  v_peak_20min INTEGER;
  v_peak_60min INTEGER;
BEGIN
  -- Get power stream
  SELECT power_stream INTO v_power_stream
  FROM routes
  WHERE id = p_ride_id;

  IF v_power_stream IS NULL THEN
    RETURN '{
      "5s": null, "1min": null, "5min": null, "20min": null, "60min": null
    }'::jsonb;
  END IF;

  v_stream_length := array_length(v_power_stream, 1);

  -- Calculate peak powers for each duration
  -- 5 seconds
  IF v_stream_length >= 5 THEN
    SELECT MAX(avg_power)::INTEGER INTO v_peak_5s
    FROM (
      SELECT AVG(val) as avg_power
      FROM unnest(v_power_stream) WITH ORDINALITY AS t(val, idx)
      WHERE idx BETWEEN generate_series(1, v_stream_length - 4)
        AND generate_series(1, v_stream_length - 4) + 4
      GROUP BY idx
    ) subq;
  END IF;

  -- 1 minute (60 seconds)
  IF v_stream_length >= 60 THEN
    SELECT MAX(avg_power)::INTEGER INTO v_peak_1min
    FROM (
      SELECT AVG(val) as avg_power
      FROM unnest(v_power_stream) WITH ORDINALITY AS t(val, idx)
      WHERE idx BETWEEN generate_series(1, v_stream_length - 59)
        AND generate_series(1, v_stream_length - 59) + 59
      GROUP BY idx
    ) subq;
  END IF;

  -- 5 minutes (300 seconds)
  IF v_stream_length >= 300 THEN
    SELECT MAX(avg_power)::INTEGER INTO v_peak_5min
    FROM (
      SELECT AVG(val) as avg_power
      FROM unnest(v_power_stream) WITH ORDINALITY AS t(val, idx)
      WHERE idx BETWEEN generate_series(1, v_stream_length - 299)
        AND generate_series(1, v_stream_length - 299) + 299
      GROUP BY idx
    ) subq;
  END IF;

  -- 20 minutes (1200 seconds)
  IF v_stream_length >= 1200 THEN
    SELECT MAX(avg_power)::INTEGER INTO v_peak_20min
    FROM (
      SELECT AVG(val) as avg_power
      FROM unnest(v_power_stream) WITH ORDINALITY AS t(val, idx)
      WHERE idx BETWEEN generate_series(1, v_stream_length - 1199)
        AND generate_series(1, v_stream_length - 1199) + 1199
      GROUP BY idx
    ) subq;
  END IF;

  -- 60 minutes (3600 seconds)
  IF v_stream_length >= 3600 THEN
    SELECT MAX(avg_power)::INTEGER INTO v_peak_60min
    FROM (
      SELECT AVG(val) as avg_power
      FROM unnest(v_power_stream) WITH ORDINALITY AS t(val, idx)
      WHERE idx BETWEEN generate_series(1, v_stream_length - 3599)
        AND generate_series(1, v_stream_length - 3599) + 3599
      GROUP BY idx
    ) subq;
  END IF;

  RETURN jsonb_build_object(
    '5s', v_peak_5s,
    '1min', v_peak_1min,
    '5min', v_peak_5min,
    '20min', v_peak_20min,
    '60min', v_peak_60min
  );
END;
$$;

-- ============================================================================
-- FUNCTION: analyze_ride
-- ============================================================================
-- Main function to compute all analysis metrics for a ride
-- Call this after a ride is synced/imported

CREATE OR REPLACE FUNCTION analyze_ride(p_ride_id UUID, p_user_id UUID)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_analysis_id UUID;
  v_zone_distribution JSONB;
  v_peak_powers JSONB;
  v_normalized_power DECIMAL;
  v_average_power DECIMAL;
  v_average_hr DECIMAL;
  v_ftp DECIMAL;
  v_vi DECIMAL;
  v_if DECIMAL;
  v_ef DECIMAL;
BEGIN
  -- Get ride metrics
  SELECT normalized_power, average_power, average_heart_rate
  INTO v_normalized_power, v_average_power, v_average_hr
  FROM routes
  WHERE id = p_ride_id;

  -- Get user's FTP
  SELECT ftp_watts INTO v_ftp
  FROM user_ftp_history
  WHERE user_id = p_user_id AND is_current = TRUE
  LIMIT 1;

  -- Calculate zone distribution
  v_zone_distribution := calculate_zone_time_distribution(p_ride_id, p_user_id);

  -- Calculate peak powers
  v_peak_powers := calculate_peak_powers(p_ride_id);

  -- Calculate efficiency metrics
  IF v_normalized_power IS NOT NULL AND v_average_power IS NOT NULL AND v_average_power > 0 THEN
    v_vi := v_normalized_power / v_average_power;
  END IF;

  IF v_normalized_power IS NOT NULL AND v_ftp IS NOT NULL AND v_ftp > 0 THEN
    v_if := v_normalized_power / v_ftp;
  END IF;

  IF v_normalized_power IS NOT NULL AND v_average_hr IS NOT NULL AND v_average_hr > 0 THEN
    v_ef := v_normalized_power / v_average_hr;
  END IF;

  -- Insert or update analysis
  INSERT INTO ride_analysis (
    user_id,
    ride_id,
    zone_time_distribution,
    peak_powers,
    variability_index,
    intensity_factor,
    efficiency_factor
  )
  VALUES (
    p_user_id,
    p_ride_id,
    v_zone_distribution,
    v_peak_powers,
    v_vi,
    v_if,
    v_ef
  )
  ON CONFLICT (ride_id) DO UPDATE SET
    zone_time_distribution = EXCLUDED.zone_time_distribution,
    peak_powers = EXCLUDED.peak_powers,
    variability_index = EXCLUDED.variability_index,
    intensity_factor = EXCLUDED.intensity_factor,
    efficiency_factor = EXCLUDED.efficiency_factor,
    analyzed_at = NOW()
  RETURNING id INTO v_analysis_id;

  RETURN v_analysis_id;
END;
$$;

-- ============================================================================
-- FUNCTION: get_ride_analysis
-- ============================================================================
-- Retrieves analysis for a ride, computing it if not exists

CREATE OR REPLACE FUNCTION get_ride_analysis(p_ride_id UUID, p_user_id UUID)
RETURNS TABLE (
  zone_distribution JSONB,
  peak_powers JSONB,
  variability_index DECIMAL,
  intensity_factor DECIMAL,
  efficiency_factor DECIMAL,
  analyzed_at TIMESTAMPTZ
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_exists BOOLEAN;
BEGIN
  -- Check if analysis exists
  SELECT EXISTS(
    SELECT 1 FROM ride_analysis WHERE ride_id = p_ride_id
  ) INTO v_exists;

  -- Create analysis if doesn't exist
  IF NOT v_exists THEN
    PERFORM analyze_ride(p_ride_id, p_user_id);
  END IF;

  -- Return analysis
  RETURN QUERY
  SELECT
    ra.zone_time_distribution,
    ra.peak_powers,
    ra.variability_index,
    ra.intensity_factor,
    ra.efficiency_factor,
    ra.analyzed_at
  FROM ride_analysis ra
  WHERE ra.ride_id = p_ride_id;
END;
$$;

COMMENT ON TABLE ride_analysis IS 'Stores detailed analysis metrics for each ride including zone distribution, peak powers, and efficiency metrics';
COMMENT ON FUNCTION analyze_ride IS 'Computes all analysis metrics for a ride - call after ride sync';
COMMENT ON FUNCTION get_ride_analysis IS 'Retrieves ride analysis, computing if not exists';
COMMENT ON FUNCTION calculate_zone_time_distribution IS 'Calculates seconds spent in each training zone';
COMMENT ON FUNCTION calculate_peak_powers IS 'Finds best average power for 5s, 1min, 5min, 20min, 60min durations';
