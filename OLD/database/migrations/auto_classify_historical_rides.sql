-- Auto-classify historical rides using power/HR data to seed progression levels
-- This allows new users to get realistic fitness estimates from imported rides

-- Function: Classify a ride into a training zone based on power data
CREATE OR REPLACE FUNCTION classify_ride_zone(
  p_average_watts INTEGER,
  p_normalized_power INTEGER,
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
  -- Adjust thresholds slightly for longer rides (fatigue factor)
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

-- Function: Estimate RPE from power data
CREATE OR REPLACE FUNCTION estimate_rpe_from_power(
  p_average_watts INTEGER,
  p_normalized_power INTEGER,
  p_user_ftp INTEGER,
  p_duration_seconds INTEGER,
  p_training_stress_score INTEGER
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

-- Function: Classify all historical rides for a user
CREATE OR REPLACE FUNCTION classify_historical_rides(
  p_user_id UUID,
  p_user_ftp INTEGER
)
RETURNS TABLE(
  zone VARCHAR,
  ride_count BIGINT,
  avg_estimated_rpe DECIMAL
) AS $$
BEGIN
  -- Update routes table with classifications
  UPDATE routes r
  SET
    estimated_zone = classify_ride_zone(
      r.average_watts,
      r.normalized_power,
      p_user_ftp,
      r.duration_seconds
    ),
    estimated_rpe = estimate_rpe_from_power(
      r.average_watts,
      r.normalized_power,
      p_user_ftp,
      r.duration_seconds,
      r.training_stress_score
    ),
    auto_classified = TRUE
  WHERE r.user_id = p_user_id
    AND (r.average_watts IS NOT NULL OR r.normalized_power IS NOT NULL)
    AND r.average_watts > 0;

  -- Return summary of classifications
  RETURN QUERY
  SELECT
    r.estimated_zone as zone,
    COUNT(*) as ride_count,
    ROUND(AVG(r.estimated_rpe), 1) as avg_estimated_rpe
  FROM routes r
  WHERE r.user_id = p_user_id
    AND r.estimated_zone IS NOT NULL
  GROUP BY r.estimated_zone
  ORDER BY CASE r.estimated_zone
    WHEN 'recovery' THEN 1
    WHEN 'endurance' THEN 2
    WHEN 'tempo' THEN 3
    WHEN 'sweet_spot' THEN 4
    WHEN 'threshold' THEN 5
    WHEN 'vo2max' THEN 6
    WHEN 'anaerobic' THEN 7
  END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Seed progression levels from classified rides
CREATE OR REPLACE FUNCTION seed_progression_from_classified_rides(
  p_user_id UUID
)
RETURNS TEXT AS $$
DECLARE
  zone_record RECORD;
  zones_seeded INTEGER := 0;
  total_rides INTEGER := 0;
  initial_level DECIMAL;
BEGIN
  -- For each zone, calculate progression level from classified rides
  FOR zone_record IN
    SELECT
      estimated_zone as zone,
      COUNT(*) as ride_count,
      AVG(estimated_rpe) as avg_rpe
    FROM routes
    WHERE user_id = p_user_id
      AND estimated_zone IS NOT NULL
      AND auto_classified = TRUE
    GROUP BY estimated_zone
  LOOP
    -- Map average RPE to progression level (inverse relationship)
    -- Lower RPE in a zone = higher fitness in that zone
    initial_level := CASE
      WHEN zone_record.avg_rpe <= 5.0 THEN 7.5
      WHEN zone_record.avg_rpe <= 6.0 THEN 6.5
      WHEN zone_record.avg_rpe <= 7.0 THEN 5.5
      WHEN zone_record.avg_rpe <= 8.0 THEN 4.5
      WHEN zone_record.avg_rpe <= 9.0 THEN 3.5
      ELSE 2.5
    END;

    -- Insert or update progression level
    INSERT INTO progression_levels (user_id, zone, level, workouts_completed)
    VALUES (p_user_id, zone_record.zone, initial_level, zone_record.ride_count)
    ON CONFLICT (user_id, zone)
    DO UPDATE SET
      level = initial_level,
      workouts_completed = zone_record.ride_count,
      updated_at = NOW();

    zones_seeded := zones_seeded + 1;
    total_rides := total_rides + zone_record.ride_count;
  END LOOP;

  -- Initialize any missing zones with conservative defaults
  PERFORM initialize_progression_levels(p_user_id);

  RETURN 'Classified ' || total_rides || ' rides into ' || zones_seeded || ' training zones';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add columns to routes table if they don't exist
ALTER TABLE routes
  ADD COLUMN IF NOT EXISTS estimated_zone VARCHAR(50),
  ADD COLUMN IF NOT EXISTS estimated_rpe INTEGER,
  ADD COLUMN IF NOT EXISTS auto_classified BOOLEAN DEFAULT FALSE;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_routes_estimated_zone
  ON routes(user_id, estimated_zone)
  WHERE estimated_zone IS NOT NULL;

SELECT 'Auto-classification functions created successfully' as status;
