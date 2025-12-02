-- Phase 2.5: Ride Intelligence - Part 3: Route Difficulty Scoring
-- Created: 2025-11-16
-- Description: Adds difficulty scoring to routes and performance ratio tracking

-- ============================================================================
-- ALTER TABLE: routes
-- ============================================================================
-- Add difficulty scoring columns to existing routes table

ALTER TABLE routes ADD COLUMN IF NOT EXISTS difficulty_score DECIMAL(3,1);
ALTER TABLE routes ADD COLUMN IF NOT EXISTS difficulty_factors JSONB DEFAULT '{}'::jsonb;

-- Add check constraint
ALTER TABLE routes ADD CONSTRAINT check_difficulty_score
  CHECK (difficulty_score >= 1.0 AND difficulty_score <= 10.0 OR difficulty_score IS NULL);

-- Add index for filtering by difficulty
CREATE INDEX IF NOT EXISTS idx_routes_difficulty_score ON routes(difficulty_score);

COMMENT ON COLUMN routes.difficulty_score IS 'Route difficulty on 1-10 scale based on elevation, distance, gradient, and other factors';
COMMENT ON COLUMN routes.difficulty_factors IS 'JSON breakdown of difficulty components: elevation_score, gradient_score, distance_score, etc.';

-- ============================================================================
-- FUNCTION: calculate_route_difficulty
-- ============================================================================
-- Calculates comprehensive difficulty score (1-10) for a route

CREATE OR REPLACE FUNCTION calculate_route_difficulty(p_route_id UUID)
RETURNS DECIMAL
LANGUAGE plpgsql
AS $$
DECLARE
  v_distance DECIMAL;
  v_elevation_gain DECIMAL;
  v_max_gradient DECIMAL;
  v_duration INTEGER;
  v_avg_grade DECIMAL;

  -- Component scores (1-10 each)
  v_elevation_score DECIMAL;
  v_gradient_score DECIMAL;
  v_distance_score DECIMAL;
  v_duration_score DECIMAL;

  -- Weights
  v_elevation_weight DECIMAL := 0.40;
  v_gradient_weight DECIMAL := 0.30;
  v_distance_weight DECIMAL := 0.20;
  v_duration_weight DECIMAL := 0.10;

  -- Final score
  v_difficulty_score DECIMAL;
  v_factors JSONB;
BEGIN
  -- Get route metrics
  SELECT
    distance,
    elevation_gain,
    max_gradient,
    moving_time
  INTO
    v_distance,
    v_elevation_gain,
    v_max_gradient,
    v_duration
  FROM routes
  WHERE id = p_route_id;

  -- Validation
  IF v_distance IS NULL OR v_distance = 0 THEN
    RETURN NULL;
  END IF;

  -- Calculate average grade (elevation gain per km)
  v_avg_grade := (v_elevation_gain / v_distance) * 100;

  -- ========================================
  -- ELEVATION SCORE (1-10)
  -- ========================================
  -- Based on elevation gain
  -- 0-500m: 1-3 (easy)
  -- 500-1000m: 4-6 (moderate)
  -- 1000-2000m: 7-9 (hard)
  -- >2000m: 10 (extreme)

  v_elevation_score := CASE
    WHEN v_elevation_gain < 100 THEN 1.0
    WHEN v_elevation_gain < 300 THEN 2.0
    WHEN v_elevation_gain < 500 THEN 3.0
    WHEN v_elevation_gain < 750 THEN 4.5
    WHEN v_elevation_gain < 1000 THEN 6.0
    WHEN v_elevation_gain < 1500 THEN 7.5
    WHEN v_elevation_gain < 2000 THEN 9.0
    ELSE 10.0
  END;

  -- ========================================
  -- GRADIENT SCORE (1-10)
  -- ========================================
  -- Based on max gradient and average grade

  v_gradient_score := CASE
    WHEN v_max_gradient < 5 THEN 1.0 + (v_avg_grade * 0.5)
    WHEN v_max_gradient < 10 THEN 3.0 + (v_avg_grade * 0.8)
    WHEN v_max_gradient < 15 THEN 5.0 + (v_avg_grade * 1.0)
    WHEN v_max_gradient < 20 THEN 7.0 + (v_avg_grade * 1.2)
    ELSE 9.0 + LEAST(1.0, v_avg_grade * 0.2)
  END;

  -- Cap at 10
  v_gradient_score := LEAST(10.0, v_gradient_score);

  -- ========================================
  -- DISTANCE SCORE (1-10)
  -- ========================================
  -- Based on total distance
  -- <20km: 1-3 (short)
  -- 20-50km: 4-6 (medium)
  -- 50-100km: 7-8 (long)
  -- >100km: 9-10 (very long)

  v_distance_score := CASE
    WHEN v_distance < 10 THEN 1.0
    WHEN v_distance < 20 THEN 2.0
    WHEN v_distance < 35 THEN 3.5
    WHEN v_distance < 50 THEN 5.0
    WHEN v_distance < 75 THEN 6.5
    WHEN v_distance < 100 THEN 7.5
    WHEN v_distance < 150 THEN 8.5
    WHEN v_distance < 200 THEN 9.5
    ELSE 10.0
  END;

  -- ========================================
  -- DURATION SCORE (1-10)
  -- ========================================
  -- Based on moving time (fatigue factor)
  -- <1hr: 1-2
  -- 1-2hr: 3-5
  -- 2-4hr: 6-8
  -- >4hr: 9-10

  v_duration_score := CASE
    WHEN v_duration < 1800 THEN 1.0  -- <30min
    WHEN v_duration < 3600 THEN 2.0  -- <1hr
    WHEN v_duration < 5400 THEN 3.5  -- <1.5hr
    WHEN v_duration < 7200 THEN 5.0  -- <2hr
    WHEN v_duration < 10800 THEN 6.5 -- <3hr
    WHEN v_duration < 14400 THEN 8.0 -- <4hr
    WHEN v_duration < 18000 THEN 9.0 -- <5hr
    ELSE 10.0
  END;

  -- ========================================
  -- WEIGHTED AVERAGE
  -- ========================================

  v_difficulty_score :=
    (v_elevation_score * v_elevation_weight) +
    (v_gradient_score * v_gradient_weight) +
    (v_distance_score * v_distance_weight) +
    (v_duration_score * v_duration_weight);

  -- Round to 1 decimal place
  v_difficulty_score := ROUND(v_difficulty_score, 1);

  -- Build factors JSON
  v_factors := jsonb_build_object(
    'elevation_score', ROUND(v_elevation_score, 1),
    'gradient_score', ROUND(v_gradient_score, 1),
    'distance_score', ROUND(v_distance_score, 1),
    'duration_score', ROUND(v_duration_score, 1),
    'elevation_gain', v_elevation_gain,
    'max_gradient', v_max_gradient,
    'avg_grade', ROUND(v_avg_grade, 2),
    'distance', v_distance
  );

  -- Update route
  UPDATE routes
  SET
    difficulty_score = v_difficulty_score,
    difficulty_factors = v_factors
  WHERE id = p_route_id;

  RETURN v_difficulty_score;
END;
$$;

-- ============================================================================
-- FUNCTION: calculate_all_route_difficulties
-- ============================================================================
-- Batch calculates difficulty for all routes

CREATE OR REPLACE FUNCTION calculate_all_route_difficulties(p_user_id UUID DEFAULT NULL)
RETURNS TABLE (
  routes_processed INTEGER,
  avg_difficulty DECIMAL,
  max_difficulty DECIMAL,
  min_difficulty DECIMAL
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_route RECORD;
  v_count INTEGER := 0;
  v_avg DECIMAL;
  v_max DECIMAL;
  v_min DECIMAL;
BEGIN
  -- Process all routes (user-specific or all)
  FOR v_route IN
    SELECT id
    FROM routes
    WHERE (p_user_id IS NULL OR user_id = p_user_id)
      AND distance IS NOT NULL
      AND distance > 0
  LOOP
    PERFORM calculate_route_difficulty(v_route.id);
    v_count := v_count + 1;
  END LOOP;

  -- Calculate statistics
  SELECT
    AVG(difficulty_score),
    MAX(difficulty_score),
    MIN(difficulty_score)
  INTO v_avg, v_max, v_min
  FROM routes
  WHERE (p_user_id IS NULL OR user_id = p_user_id)
    AND difficulty_score IS NOT NULL;

  RETURN QUERY SELECT v_count, v_avg, v_max, v_min;
END;
$$;

-- ============================================================================
-- FUNCTION: calculate_performance_ratio
-- ============================================================================
-- Compares actual ride performance vs expected based on user fitness
-- Returns: >1.0 = overperformed, <1.0 = underperformed, 1.0 = as expected

CREATE OR REPLACE FUNCTION calculate_performance_ratio(
  p_ride_id UUID,
  p_user_id UUID
)
RETURNS DECIMAL
LANGUAGE plpgsql
AS $$
DECLARE
  v_ride_if DECIMAL; -- Actual Intensity Factor
  v_ride_duration INTEGER;
  v_ride_zone TEXT;
  v_user_zone_level DECIMAL;
  v_expected_if DECIMAL;
  v_performance_ratio DECIMAL;
BEGIN
  -- Get ride metrics
  SELECT
    ra.intensity_factor,
    r.moving_time,
    rc.zone
  INTO
    v_ride_if,
    v_ride_duration,
    v_ride_zone
  FROM ride_analysis ra
  JOIN routes r ON r.id = ra.ride_id
  LEFT JOIN ride_classification rc ON rc.ride_id = ra.ride_id
  WHERE ra.ride_id = p_ride_id;

  IF v_ride_if IS NULL OR v_ride_zone IS NULL THEN
    RETURN NULL;
  END IF;

  -- Get user's progression level for this zone
  SELECT level INTO v_user_zone_level
  FROM progression_levels
  WHERE user_id = p_user_id AND zone = v_ride_zone;

  IF v_user_zone_level IS NULL THEN
    RETURN NULL;
  END IF;

  -- Calculate expected IF based on zone and user level
  -- Higher progression level = can sustain higher IF for longer
  v_expected_if := CASE v_ride_zone
    WHEN 'recovery' THEN 0.50
    WHEN 'endurance' THEN 0.65 + (v_user_zone_level / 100)
    WHEN 'tempo' THEN 0.80 + (v_user_zone_level / 100)
    WHEN 'sweet_spot' THEN 0.90 + (v_user_zone_level / 100)
    WHEN 'threshold' THEN 0.95 + (v_user_zone_level / 100)
    WHEN 'vo2max' THEN 1.10 + (v_user_zone_level / 100)
    WHEN 'anaerobic' THEN 1.30
    ELSE 0.70
  END;

  -- Adjust expected IF for ride duration (longer = harder to sustain)
  IF v_ride_duration > 7200 THEN -- >2 hours
    v_expected_if := v_expected_if * 0.95;
  ELSIF v_ride_duration > 10800 THEN -- >3 hours
    v_expected_if := v_expected_if * 0.90;
  END IF;

  -- Calculate performance ratio
  v_performance_ratio := v_ride_if / v_expected_if;

  -- Update ride_analysis
  UPDATE ride_analysis
  SET performance_ratio = v_performance_ratio
  WHERE ride_id = p_ride_id;

  RETURN v_performance_ratio;
END;
$$;

-- ============================================================================
-- FUNCTION: get_route_recommendations
-- ============================================================================
-- Recommends routes based on user fitness and training goals

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
    r.route_name,
    r.difficulty_score,
    r.distance,
    r.elevation_gain,
    r.moving_time,
    -- Match score based on difficulty vs user fitness
    (10.0 - ABS(r.difficulty_score - COALESCE(v_zone_level, v_user_avg_level)))::DECIMAL as match_score,
    -- Recommendation reason
    CASE
      WHEN r.difficulty_score < COALESCE(v_zone_level, v_user_avg_level) - 2 THEN
        'Good recovery ride - easier than your current fitness'
      WHEN r.difficulty_score > COALESCE(v_zone_level, v_user_avg_level) + 2 THEN
        'Challenging ride - will push your limits'
      ELSE
        'Well-matched to your current fitness level'
    END as recommendation_reason
  FROM routes r
  WHERE r.user_id = p_user_id
    AND r.difficulty_score IS NOT NULL
    AND (p_target_difficulty_min IS NULL OR r.difficulty_score >= p_target_difficulty_min)
    AND (p_target_difficulty_max IS NULL OR r.difficulty_score <= p_target_difficulty_max)
  ORDER BY
    -- Prioritize routes close to user's level
    ABS(r.difficulty_score - COALESCE(v_zone_level, v_user_avg_level)) ASC,
    r.activity_date DESC
  LIMIT p_limit;
END;
$$;

COMMENT ON FUNCTION calculate_route_difficulty IS 'Calculates 1-10 difficulty score based on elevation, gradient, distance, and duration';
COMMENT ON FUNCTION calculate_all_route_difficulties IS 'Batch processes all routes to calculate difficulty scores';
COMMENT ON FUNCTION calculate_performance_ratio IS 'Calculates how well user performed vs expected based on fitness level';
COMMENT ON FUNCTION get_route_recommendations IS 'Recommends routes based on user fitness and training goals';
