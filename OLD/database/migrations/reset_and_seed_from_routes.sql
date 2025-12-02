-- Reset progression levels and seed from actual ride data (routes with RPE)

-- Function to reset progression levels for a user
CREATE OR REPLACE FUNCTION reset_progression_levels(user_uuid UUID)
RETURNS TEXT AS $$
BEGIN
  DELETE FROM progression_levels WHERE user_id = user_uuid;
  DELETE FROM progression_level_history WHERE user_id = user_uuid;
  RETURN 'Reset complete';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to seed from routes based on ride characteristics
-- Since most rides don't have target_zone, we'll infer zones from ride data
CREATE OR REPLACE FUNCTION seed_progression_from_routes(user_uuid UUID)
RETURNS TEXT AS $$
DECLARE
  route_record RECORD;
  inferred_zone VARCHAR;
  avg_rpe DECIMAL;
  route_count INTEGER;
  initial_level DECIMAL;
  zones_seeded INTEGER := 0;
BEGIN
  -- Get average RPE for all rides (as a baseline)
  SELECT AVG(wf.perceived_exertion)
  INTO avg_rpe
  FROM workout_feedback wf
  INNER JOIN routes r ON wf.route_id = r.id
  WHERE r.user_id = user_uuid
    AND wf.perceived_exertion IS NOT NULL;

  -- Count total rides with feedback
  SELECT COUNT(*)
  INTO route_count
  FROM workout_feedback wf
  INNER JOIN routes r ON wf.route_id = r.id
  WHERE r.user_id = user_uuid
    AND wf.perceived_exertion IS NOT NULL;

  IF route_count > 0 AND avg_rpe IS NOT NULL THEN
    -- Map overall RPE to endurance level (most common zone for recreational cycling)
    initial_level := CASE
      WHEN avg_rpe <= 5 THEN 7.0
      WHEN avg_rpe <= 6 THEN 6.0
      WHEN avg_rpe <= 7 THEN 5.0
      WHEN avg_rpe <= 8 THEN 4.0
      WHEN avg_rpe <= 9 THEN 3.0
      ELSE 2.0
    END;

    -- Seed endurance zone (base aerobic fitness)
    INSERT INTO progression_levels (user_id, zone, level, workouts_completed)
    VALUES (user_uuid, 'endurance', initial_level, route_count)
    ON CONFLICT (user_id, zone)
    DO UPDATE SET
      level = initial_level,
      workouts_completed = route_count,
      updated_at = NOW();

    -- Set recovery slightly higher (easier zone)
    INSERT INTO progression_levels (user_id, zone, level, workouts_completed)
    VALUES (user_uuid, 'recovery', LEAST(10.0, initial_level + 1.0), route_count)
    ON CONFLICT (user_id, zone)
    DO UPDATE SET
      level = LEAST(10.0, initial_level + 1.0),
      workouts_completed = route_count,
      updated_at = NOW();

    -- Set tempo/sweet_spot based on endurance
    INSERT INTO progression_levels (user_id, zone, level, workouts_completed)
    VALUES (user_uuid, 'tempo', GREATEST(1.0, initial_level - 0.5), route_count / 2)
    ON CONFLICT (user_id, zone)
    DO UPDATE SET
      level = GREATEST(1.0, initial_level - 0.5),
      updated_at = NOW();

    INSERT INTO progression_levels (user_id, zone, level, workouts_completed)
    VALUES (user_uuid, 'sweet_spot', GREATEST(1.0, initial_level - 1.0), route_count / 3)
    ON CONFLICT (user_id, zone)
    DO UPDATE SET
      level = GREATEST(1.0, initial_level - 1.0),
      updated_at = NOW();

    -- Set harder zones progressively lower
    INSERT INTO progression_levels (user_id, zone, level, workouts_completed)
    VALUES (user_uuid, 'threshold', GREATEST(1.0, initial_level - 1.5), 0)
    ON CONFLICT (user_id, zone)
    DO UPDATE SET
      level = GREATEST(1.0, initial_level - 1.5),
      updated_at = NOW();

    INSERT INTO progression_levels (user_id, zone, level, workouts_completed)
    VALUES (user_uuid, 'vo2max', GREATEST(1.0, initial_level - 2.0), 0)
    ON CONFLICT (user_id, zone)
    DO UPDATE SET
      level = GREATEST(1.0, initial_level - 2.0),
      updated_at = NOW();

    INSERT INTO progression_levels (user_id, zone, level, workouts_completed)
    VALUES (user_uuid, 'anaerobic', GREATEST(1.0, initial_level - 2.5), 0)
    ON CONFLICT (user_id, zone)
    DO UPDATE SET
      level = GREATEST(1.0, initial_level - 2.5),
      updated_at = NOW();

    zones_seeded := 7;
  ELSE
    -- No RPE data, just initialize with defaults
    PERFORM initialize_progression_levels(user_uuid);
    zones_seeded := 7;
  END IF;

  RETURN 'Seeded ' || zones_seeded || ' zones from ' || route_count || ' rides (avg RPE: ' || ROUND(avg_rpe, 1) || ')';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- To use:
-- 1. Reset: SELECT reset_progression_levels(auth.uid());
-- 2. Re-seed: SELECT seed_progression_from_routes(auth.uid());
