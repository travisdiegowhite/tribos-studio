-- Auto-detect FTP from historical ride data
-- Uses best power outputs from 20-60 minute efforts

CREATE OR REPLACE FUNCTION auto_detect_ftp_from_rides(
  p_user_id UUID
)
RETURNS TABLE(
  estimated_ftp INTEGER,
  confidence VARCHAR,
  method VARCHAR,
  sample_size INTEGER,
  based_on_rides TEXT
) AS $$
DECLARE
  best_20min_power INTEGER;
  best_40min_power INTEGER;
  best_60min_power INTEGER;
  rides_with_power INTEGER;
  calculated_ftp INTEGER;
  confidence_level VARCHAR;
  detection_method VARCHAR;
BEGIN
  -- Count rides with power data
  SELECT COUNT(*)
  INTO rides_with_power
  FROM routes
  WHERE user_id = p_user_id
    AND (average_watts > 0 OR normalized_power > 0);

  IF rides_with_power < 5 THEN
    -- Not enough data for reliable FTP estimation
    RETURN QUERY SELECT
      NULL::INTEGER as estimated_ftp,
      'low'::VARCHAR as confidence,
      'insufficient_data'::VARCHAR as method,
      rides_with_power as sample_size,
      'Need at least 5 rides with power data'::TEXT as based_on_rides;
    RETURN;
  END IF;

  -- Get best 20-min power (from rides 15-25 minutes long)
  SELECT MAX(COALESCE(normalized_power, average_watts))
  INTO best_20min_power
  FROM routes
  WHERE user_id = p_user_id
    AND duration_seconds BETWEEN (15 * 60) AND (25 * 60)
    AND COALESCE(normalized_power, average_watts) > 0;

  -- Get best 40-min power (from rides 35-45 minutes long)
  SELECT MAX(COALESCE(normalized_power, average_watts))
  INTO best_40min_power
  FROM routes
  WHERE user_id = p_user_id
    AND duration_seconds BETWEEN (35 * 60) AND (45 * 60)
    AND COALESCE(normalized_power, average_watts) > 0;

  -- Get best 60-min power (from rides 55-70 minutes long)
  SELECT MAX(COALESCE(normalized_power, average_watts))
  INTO best_60min_power
  FROM routes
  WHERE user_id = p_user_id
    AND duration_seconds BETWEEN (55 * 60) AND (70 * 60)
    AND COALESCE(normalized_power, average_watts) > 0;

  -- Estimate FTP using best available method
  IF best_60min_power IS NOT NULL AND best_60min_power > 100 THEN
    -- 60-min power IS FTP (most accurate)
    calculated_ftp := best_60min_power;
    detection_method := '60min_power';
    confidence_level := 'high';
  ELSIF best_20min_power IS NOT NULL AND best_20min_power > 100 THEN
    -- 20-min power * 0.95 = FTP (TrainerRoad method)
    calculated_ftp := ROUND(best_20min_power * 0.95);
    detection_method := '20min_test';
    confidence_level := 'medium';
  ELSIF best_40min_power IS NOT NULL AND best_40min_power > 100 THEN
    -- 40-min power * 0.97 = FTP
    calculated_ftp := ROUND(best_40min_power * 0.97);
    detection_method := '40min_power';
    confidence_level := 'medium';
  ELSE
    -- Fall back to 95th percentile of all normalized power values
    SELECT PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY COALESCE(normalized_power, average_watts))
    INTO calculated_ftp
    FROM routes
    WHERE user_id = p_user_id
      AND duration_seconds > (10 * 60) -- At least 10 minutes
      AND COALESCE(normalized_power, average_watts) > 100;

    calculated_ftp := ROUND(calculated_ftp * 0.90); -- Conservative estimate
    detection_method := '95th_percentile';
    confidence_level := 'low';
  END IF;

  -- Return the result
  RETURN QUERY SELECT
    calculated_ftp as estimated_ftp,
    confidence_level as confidence,
    detection_method as method,
    rides_with_power as sample_size,
    ('Based on ' || rides_with_power || ' rides with power data')::TEXT as based_on_rides;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Full onboarding flow - detect FTP and classify rides
CREATE OR REPLACE FUNCTION initialize_fitness_profile(
  p_user_id UUID
)
RETURNS JSON AS $$
DECLARE
  ftp_result RECORD;
  classification_result RECORD;
  seed_result TEXT;
  result JSON;
BEGIN
  -- Step 1: Auto-detect FTP
  SELECT * INTO ftp_result
  FROM auto_detect_ftp_from_rides(p_user_id)
  LIMIT 1;

  IF ftp_result.estimated_ftp IS NULL THEN
    -- Not enough power data
    RETURN json_build_object(
      'success', false,
      'error', 'insufficient_power_data',
      'message', 'Not enough rides with power data to estimate FTP. Please set FTP manually.',
      'rides_with_power', ftp_result.sample_size
    );
  END IF;

  -- Step 2: Classify all historical rides using detected FTP
  PERFORM classify_historical_rides(p_user_id, ftp_result.estimated_ftp);

  -- Step 3: Seed progression levels from classified rides
  SELECT * INTO seed_result
  FROM seed_progression_from_classified_rides(p_user_id);

  -- Step 4: Get classification summary
  SELECT json_agg(row_to_json(t))
  INTO result
  FROM (
    SELECT zone, ride_count, avg_estimated_rpe
    FROM classify_historical_rides(p_user_id, ftp_result.estimated_ftp)
  ) t;

  -- Return comprehensive result
  RETURN json_build_object(
    'success', true,
    'ftp', json_build_object(
      'estimated', ftp_result.estimated_ftp,
      'confidence', ftp_result.confidence,
      'method', ftp_result.method,
      'based_on_rides', ftp_result.based_on_rides
    ),
    'classification', result,
    'message', seed_result
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

SELECT 'FTP auto-detection functions created successfully' as status;
