-- Comprehensive fix: Update all progression functions with consistent parameter naming

-- 1. Drop and recreate initialize_progression_levels
DROP FUNCTION IF EXISTS initialize_progression_levels(uuid);

CREATE FUNCTION initialize_progression_levels(p_user_id UUID)
RETURNS VOID AS $$
DECLARE
  zones VARCHAR[] := ARRAY['recovery', 'endurance', 'tempo', 'sweet_spot', 'threshold', 'vo2max', 'anaerobic'];
  zone_name VARCHAR;
BEGIN
  FOREACH zone_name IN ARRAY zones
  LOOP
    INSERT INTO progression_levels (user_id, zone, level)
    VALUES (p_user_id, zone_name, 3.0)
    ON CONFLICT (user_id, zone) DO NOTHING;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Update seed_progression_simple to use correct parameter
DROP FUNCTION IF EXISTS seed_progression_simple(uuid);

CREATE FUNCTION seed_progression_simple(p_user_id UUID)
RETURNS TEXT AS $$
DECLARE
  avg_rpe DECIMAL;
  workout_count INTEGER;
  base_level DECIMAL;
  zones_seeded INTEGER := 0;
BEGIN
  -- Get average RPE and count from all workout feedback (via planned workouts)
  SELECT AVG(wf.perceived_exertion), COUNT(*)
  INTO avg_rpe, workout_count
  FROM workout_feedback wf
  INNER JOIN planned_workouts pw ON wf.planned_workout_id = pw.id
  INNER JOIN training_plans tp ON pw.plan_id = tp.id
  WHERE tp.user_id = p_user_id
    AND wf.perceived_exertion IS NOT NULL;

  IF workout_count > 0 AND avg_rpe IS NOT NULL THEN
    -- Map RPE to base fitness level
    base_level := CASE
      WHEN avg_rpe <= 5 THEN 7.0
      WHEN avg_rpe <= 6 THEN 6.0
      WHEN avg_rpe <= 7 THEN 5.0
      WHEN avg_rpe <= 8 THEN 4.0
      WHEN avg_rpe <= 9 THEN 3.0
      ELSE 2.0
    END;

    -- Seed all zones
    INSERT INTO progression_levels (user_id, zone, level, workouts_completed)
    VALUES (p_user_id, 'recovery', LEAST(10.0, base_level + 1.5), workout_count)
    ON CONFLICT (user_id, zone)
    DO UPDATE SET level = LEAST(10.0, base_level + 1.5), workouts_completed = workout_count, updated_at = NOW();

    INSERT INTO progression_levels (user_id, zone, level, workouts_completed)
    VALUES (p_user_id, 'endurance', base_level, workout_count)
    ON CONFLICT (user_id, zone)
    DO UPDATE SET level = base_level, workouts_completed = workout_count, updated_at = NOW();

    INSERT INTO progression_levels (user_id, zone, level, workouts_completed)
    VALUES (p_user_id, 'tempo', GREATEST(1.0, base_level - 0.5), FLOOR(workout_count * 0.7))
    ON CONFLICT (user_id, zone)
    DO UPDATE SET level = GREATEST(1.0, base_level - 0.5), workouts_completed = FLOOR(workout_count * 0.7), updated_at = NOW();

    INSERT INTO progression_levels (user_id, zone, level, workouts_completed)
    VALUES (p_user_id, 'sweet_spot', GREATEST(1.0, base_level - 1.0), FLOOR(workout_count * 0.5))
    ON CONFLICT (user_id, zone)
    DO UPDATE SET level = GREATEST(1.0, base_level - 1.0), workouts_completed = FLOOR(workout_count * 0.5), updated_at = NOW();

    INSERT INTO progression_levels (user_id, zone, level, workouts_completed)
    VALUES (p_user_id, 'threshold', GREATEST(1.0, base_level - 1.5), FLOOR(workout_count * 0.3))
    ON CONFLICT (user_id, zone)
    DO UPDATE SET level = GREATEST(1.0, base_level - 1.5), workouts_completed = FLOOR(workout_count * 0.3), updated_at = NOW();

    INSERT INTO progression_levels (user_id, zone, level, workouts_completed)
    VALUES (p_user_id, 'vo2max', GREATEST(1.0, base_level - 2.0), FLOOR(workout_count * 0.1))
    ON CONFLICT (user_id, zone)
    DO UPDATE SET level = GREATEST(1.0, base_level - 2.0), workouts_completed = FLOOR(workout_count * 0.1), updated_at = NOW();

    INSERT INTO progression_levels (user_id, zone, level, workouts_completed)
    VALUES (p_user_id, 'anaerobic', GREATEST(1.0, base_level - 2.5), 0)
    ON CONFLICT (user_id, zone)
    DO UPDATE SET level = GREATEST(1.0, base_level - 2.5), workouts_completed = 0, updated_at = NOW();

    zones_seeded := 7;

    RETURN 'Seeded ' || zones_seeded || ' zones from ' || workout_count || ' workouts (avg RPE: ' || ROUND(avg_rpe, 1) || ', base level: ' || base_level || ')';
  ELSE
    -- No RPE data, initialize with defaults manually
    INSERT INTO progression_levels (user_id, zone, level, workouts_completed)
    VALUES
      (p_user_id, 'recovery', 3.0, 0),
      (p_user_id, 'endurance', 3.0, 0),
      (p_user_id, 'tempo', 3.0, 0),
      (p_user_id, 'sweet_spot', 3.0, 0),
      (p_user_id, 'threshold', 3.0, 0),
      (p_user_id, 'vo2max', 3.0, 0),
      (p_user_id, 'anaerobic', 3.0, 0)
    ON CONFLICT (user_id, zone) DO NOTHING;

    RETURN 'No RPE data found. Initialized all zones at level 3.0';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

SELECT 'All progression functions fixed' as status;
