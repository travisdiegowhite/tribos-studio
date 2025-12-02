-- Phase 2.5: Ride Intelligence - Part 4: Ride Classification Table
-- Created: 2025-11-16
-- Description: Creates ride_classification table to persist zone classifications from Phase 2
--              This table stores the output of classify_historical_rides() function

-- ============================================================================
-- TABLE: ride_classification
-- ============================================================================
-- Stores zone classification for each ride based on power/HR data

CREATE TABLE IF NOT EXISTS ride_classification (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ride_id UUID REFERENCES routes(id) ON DELETE CASCADE NOT NULL UNIQUE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,

  -- Classification
  zone TEXT NOT NULL CHECK(zone IN ('recovery', 'endurance', 'tempo', 'sweet_spot', 'threshold', 'vo2max', 'anaerobic')),
  estimated_rpe DECIMAL(3,1) CHECK (estimated_rpe >= 1.0 AND estimated_rpe <= 10.0),

  -- Classification metadata
  intensity_factor DECIMAL(4,2), -- IF = NP / FTP
  used_ftp INTEGER, -- FTP value used for classification
  classification_method TEXT, -- 'power', 'heart_rate', 'manual'
  confidence DECIMAL(3,2) DEFAULT 0.80, -- Confidence in classification (0.0-1.0)

  -- Metadata
  classified_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Indexes for fast lookups
  CONSTRAINT unique_ride_classification UNIQUE (ride_id, user_id)
);

-- Indexes
CREATE INDEX idx_ride_classification_user_id ON ride_classification(user_id);
CREATE INDEX idx_ride_classification_ride_id ON ride_classification(ride_id);
CREATE INDEX idx_ride_classification_zone ON ride_classification(zone);
CREATE INDEX idx_ride_classification_classified_at ON ride_classification(classified_at DESC);

-- Row Level Security
ALTER TABLE ride_classification ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own ride classifications"
  ON ride_classification FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own ride classifications"
  ON ride_classification FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own ride classifications"
  ON ride_classification FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own ride classifications"
  ON ride_classification FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- FUNCTION: classify_and_store_ride
-- ============================================================================
-- Classifies a single ride and stores the result in ride_classification table

CREATE OR REPLACE FUNCTION classify_and_store_ride(
  p_ride_id UUID,
  p_user_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_average_watts DOUBLE PRECISION;
  v_normalized_power DOUBLE PRECISION;
  v_user_ftp INTEGER;
  v_duration_seconds INTEGER;
  v_zone TEXT;
  v_estimated_rpe DECIMAL;
  v_intensity_factor DECIMAL;
  v_classification_id UUID;
BEGIN
  -- Get ride data
  SELECT
    average_watts,
    normalized_power,
    duration_seconds
  INTO v_average_watts, v_normalized_power, v_duration_seconds
  FROM routes
  WHERE id = p_ride_id AND user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ride not found: %', p_ride_id;
  END IF;

  -- Get user's FTP
  SELECT ftp_watts INTO v_user_ftp
  FROM user_ftp_history
  WHERE user_id = p_user_id AND is_current = TRUE
  LIMIT 1;

  IF v_user_ftp IS NULL THEN
    RAISE EXCEPTION 'User has no FTP set. Please set FTP before classifying rides.';
  END IF;

  -- Classify the ride
  v_zone := classify_ride_zone(
    v_average_watts::INTEGER,
    v_normalized_power::INTEGER,
    v_user_ftp,
    v_duration_seconds
  );

  -- Estimate RPE
  v_estimated_rpe := estimate_rpe_from_power(
    v_average_watts::INTEGER,
    v_normalized_power::INTEGER,
    v_user_ftp,
    v_duration_seconds,
    NULL -- TSS not needed for RPE estimation
  );

  -- Calculate intensity factor
  IF v_normalized_power IS NOT NULL AND v_normalized_power > 0 THEN
    v_intensity_factor := v_normalized_power / v_user_ftp;
  ELSIF v_average_watts IS NOT NULL AND v_average_watts > 0 THEN
    v_intensity_factor := v_average_watts / v_user_ftp;
  END IF;

  -- Insert or update classification
  INSERT INTO ride_classification (
    ride_id,
    user_id,
    zone,
    estimated_rpe,
    intensity_factor,
    used_ftp,
    classification_method,
    confidence
  )
  VALUES (
    p_ride_id,
    p_user_id,
    v_zone,
    v_estimated_rpe,
    v_intensity_factor,
    v_user_ftp,
    'power',
    0.85
  )
  ON CONFLICT (ride_id, user_id)
  DO UPDATE SET
    zone = EXCLUDED.zone,
    estimated_rpe = EXCLUDED.estimated_rpe,
    intensity_factor = EXCLUDED.intensity_factor,
    used_ftp = EXCLUDED.used_ftp,
    updated_at = NOW()
  RETURNING id INTO v_classification_id;

  RETURN v_classification_id;
END;
$$;

-- ============================================================================
-- FUNCTION: classify_all_user_rides
-- ============================================================================
-- Classifies all rides for a user that have power data

CREATE OR REPLACE FUNCTION classify_all_user_rides(p_user_id UUID)
RETURNS TABLE (
  total_rides INTEGER,
  classified_count INTEGER,
  skipped_count INTEGER,
  zone_breakdown JSONB
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_ride RECORD;
  v_total INTEGER := 0;
  v_classified INTEGER := 0;
  v_skipped INTEGER := 0;
  v_zone_counts JSONB := '{}'::jsonb;
  v_classification_id UUID;
BEGIN
  -- Loop through all rides with power data
  FOR v_ride IN
    SELECT id
    FROM routes
    WHERE user_id = p_user_id
      AND (average_watts IS NOT NULL OR normalized_power IS NOT NULL)
      AND (average_watts > 0 OR normalized_power > 0)
    ORDER BY recorded_at DESC
  LOOP
    v_total := v_total + 1;

    BEGIN
      -- Try to classify the ride
      v_classification_id := classify_and_store_ride(v_ride.id, p_user_id);

      IF v_classification_id IS NOT NULL THEN
        v_classified := v_classified + 1;
      ELSE
        v_skipped := v_skipped + 1;
      END IF;

    EXCEPTION WHEN OTHERS THEN
      -- Skip rides that can't be classified
      v_skipped := v_skipped + 1;
      CONTINUE;
    END;
  END LOOP;

  -- Get zone breakdown
  SELECT jsonb_object_agg(zone, zone_count)
  INTO v_zone_counts
  FROM (
    SELECT zone, COUNT(*) as zone_count
    FROM ride_classification
    WHERE user_id = p_user_id
    GROUP BY zone
  ) zone_summary;

  RETURN QUERY SELECT
    v_total,
    v_classified,
    v_skipped,
    COALESCE(v_zone_counts, '{}'::jsonb);
END;
$$;

-- ============================================================================
-- FUNCTION: get_ride_zone
-- ============================================================================
-- Quick lookup to get a ride's classified zone

CREATE OR REPLACE FUNCTION get_ride_zone(p_ride_id UUID)
RETURNS TEXT
LANGUAGE sql STABLE
AS $$
  SELECT zone
  FROM ride_classification
  WHERE ride_id = p_ride_id
  LIMIT 1;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION classify_and_store_ride TO authenticated;
GRANT EXECUTE ON FUNCTION classify_all_user_rides TO authenticated;
GRANT EXECUTE ON FUNCTION get_ride_zone TO authenticated;

-- Comments
COMMENT ON TABLE ride_classification IS 'Stores persistent zone classifications for rides based on power/HR analysis';
COMMENT ON FUNCTION classify_and_store_ride IS 'Classifies a single ride and stores result in ride_classification table';
COMMENT ON FUNCTION classify_all_user_rides IS 'Batch classifies all rides with power data for a user';
COMMENT ON FUNCTION get_ride_zone IS 'Quick lookup for a ride''s training zone';
