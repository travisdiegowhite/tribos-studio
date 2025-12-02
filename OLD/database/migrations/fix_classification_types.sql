-- Fix type casting issues in classification functions

-- Drop and recreate with correct types
DROP FUNCTION IF EXISTS classify_ride_zone(INTEGER, INTEGER, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS estimate_rpe_from_power(INTEGER, INTEGER, INTEGER, INTEGER, INTEGER);

-- Function: Classify a ride into a training zone (with DOUBLE PRECISION support)
CREATE OR REPLACE FUNCTION classify_ride_zone(
  p_average_watts DOUBLE PRECISION,
  p_normalized_power DOUBLE PRECISION,
  p_user_ftp INTEGER,
  p_duration_seconds INTEGER
)
RETURNS VARCHAR AS $$
DECLARE
  intensity_factor DECIMAL;
  duration_hours DECIMAL;
BEGIN
  -- Use normalized power if available, otherwise average watts
  IF p_normalized_power IS NOT NULL AND p_normalized_power > 0 AND p_user_ftp > 0 THEN
    intensity_factor := p_normalized_power::DECIMAL / p_user_ftp::DECIMAL;
  ELSIF p_average_watts IS NOT NULL AND p_average_watts > 0 AND p_user_ftp > 0 THEN
    intensity_factor := p_average_watts::DECIMAL / p_user_ftp::DECIMAL;
  ELSE
    RETURN NULL; -- Can't classify without power data
  END IF;

  duration_hours := p_duration_seconds::DECIMAL / 3600.0;

  -- Classify based on intensity factor
  IF intensity_factor < 0.55 THEN
    RETURN 'recovery';
  ELSIF intensity_factor < 0.75 THEN
    RETURN 'endurance';
  ELSIF intensity_factor < 0.88 THEN
    RETURN 'tempo';
  ELSIF intensity_factor < 0.94 THEN
    RETURN 'sweet_spot';
  ELSIF intensity_factor < 1.05 THEN
    RETURN 'threshold';
  ELSIF intensity_factor < 1.50 THEN
    RETURN 'vo2max';
  ELSE
    RETURN 'anaerobic';
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function: Estimate RPE from power data (with DOUBLE PRECISION support)
CREATE OR REPLACE FUNCTION estimate_rpe_from_power(
  p_average_watts DOUBLE PRECISION,
  p_normalized_power DOUBLE PRECISION,
  p_user_ftp INTEGER,
  p_duration_seconds INTEGER,
  p_training_stress_score DOUBLE PRECISION
)
RETURNS INTEGER AS $$
DECLARE
  intensity_factor DECIMAL;
  duration_hours DECIMAL;
  base_rpe DECIMAL;
  estimated_rpe INTEGER;
BEGIN
  -- Use normalized power if available
  IF p_normalized_power IS NOT NULL AND p_normalized_power > 0 AND p_user_ftp > 0 THEN
    intensity_factor := p_normalized_power::DECIMAL / p_user_ftp::DECIMAL;
  ELSIF p_average_watts IS NOT NULL AND p_average_watts > 0 AND p_user_ftp > 0 THEN
    intensity_factor := p_average_watts::DECIMAL / p_user_ftp::DECIMAL;
  ELSE
    RETURN 5; -- Default moderate effort
  END IF;

  duration_hours := p_duration_seconds::DECIMAL / 3600.0;

  -- Base RPE from intensity (0.5 IF = RPE 5, 1.0 IF = RPE 10)
  base_rpe := intensity_factor * 10.0;

  -- Adjust for duration (longer rides feel harder)
  IF duration_hours > 3.0 THEN
    base_rpe := base_rpe + 0.5;
  END IF;
  IF duration_hours > 4.0 THEN
    base_rpe := base_rpe + 0.5;
  END IF;
  IF duration_hours > 5.0 THEN
    base_rpe := base_rpe + 0.5;
  END IF;

  -- Consider TSS if available (high TSS = harder perceived effort)
  IF p_training_stress_score IS NOT NULL AND p_training_stress_score > 150 THEN
    base_rpe := base_rpe + 0.5;
  END IF;

  -- Clamp to 1-10 range
  estimated_rpe := GREATEST(1, LEAST(10, ROUND(base_rpe)));

  RETURN estimated_rpe;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

SELECT 'Fixed type casting for classification functions' as status;
