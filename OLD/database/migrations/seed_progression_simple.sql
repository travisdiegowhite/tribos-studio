-- Simple progression seeding that doesn't require target_zone
-- Uses overall RPE average to estimate fitness across all zones

CREATE OR REPLACE FUNCTION seed_progression_simple(user_uuid UUID)
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
  WHERE tp.user_id = user_uuid
    AND wf.perceived_exertion IS NOT NULL;

  IF workout_count > 0 AND avg_rpe IS NOT NULL THEN
    -- Map RPE to base fitness level
    base_level := CASE
      WHEN avg_rpe <= 5 THEN 7.0  -- Rides feel easy = high fitness
      WHEN avg_rpe <= 6 THEN 6.0
      WHEN avg_rpe <= 7 THEN 5.0
      WHEN avg_rpe <= 8 THEN 4.0
      WHEN avg_rpe <= 9 THEN 3.0
      ELSE 2.0                     -- Rides feel very hard = low fitness
    END;

    -- Seed all zones with intelligent defaults based on base fitness
    -- Recovery: Easiest zone, set higher
    INSERT INTO progression_levels (user_id, zone, level, workouts_completed)
    VALUES (user_uuid, 'recovery', LEAST(10.0, base_level + 1.5), workout_count)
    ON CONFLICT (user_id, zone)
    DO UPDATE SET level = LEAST(10.0, base_level + 1.5), workouts_completed = workout_count, updated_at = NOW();

    -- Endurance: Base aerobic fitness (most common)
    INSERT INTO progression_levels (user_id, zone, level, workouts_completed)
    VALUES (user_uuid, 'endurance', base_level, workout_count)
    ON CONFLICT (user_id, zone)
    DO UPDATE SET level = base_level, workouts_completed = workout_count, updated_at = NOW();

    -- Tempo: Moderate intensity
    INSERT INTO progression_levels (user_id, zone, level, workouts_completed)
    VALUES (user_uuid, 'tempo', GREATEST(1.0, base_level - 0.5), FLOOR(workout_count * 0.7))
    ON CONFLICT (user_id, zone)
    DO UPDATE SET level = GREATEST(1.0, base_level - 0.5), workouts_completed = FLOOR(workout_count * 0.7), updated_at = NOW();

    -- Sweet Spot: Upper tempo
    INSERT INTO progression_levels (user_id, zone, level, workouts_completed)
    VALUES (user_uuid, 'sweet_spot', GREATEST(1.0, base_level - 1.0), FLOOR(workout_count * 0.5))
    ON CONFLICT (user_id, zone)
    DO UPDATE SET level = GREATEST(1.0, base_level - 1.0), workouts_completed = FLOOR(workout_count * 0.5), updated_at = NOW();

    -- Threshold: Hard intensity
    INSERT INTO progression_levels (user_id, zone, level, workouts_completed)
    VALUES (user_uuid, 'threshold', GREATEST(1.0, base_level - 1.5), FLOOR(workout_count * 0.3))
    ON CONFLICT (user_id, zone)
    DO UPDATE SET level = GREATEST(1.0, base_level - 1.5), workouts_completed = FLOOR(workout_count * 0.3), updated_at = NOW();

    -- VO2max: Very hard
    INSERT INTO progression_levels (user_id, zone, level, workouts_completed)
    VALUES (user_uuid, 'vo2max', GREATEST(1.0, base_level - 2.0), FLOOR(workout_count * 0.1))
    ON CONFLICT (user_id, zone)
    DO UPDATE SET level = GREATEST(1.0, base_level - 2.0), workouts_completed = FLOOR(workout_count * 0.1), updated_at = NOW();

    -- Anaerobic: Extremely hard
    INSERT INTO progression_levels (user_id, zone, level, workouts_completed)
    VALUES (user_uuid, 'anaerobic', GREATEST(1.0, base_level - 2.5), 0)
    ON CONFLICT (user_id, zone)
    DO UPDATE SET level = GREATEST(1.0, base_level - 2.5), workouts_completed = 0, updated_at = NOW();

    zones_seeded := 7;

    RETURN 'Seeded ' || zones_seeded || ' zones from ' || workout_count || ' workouts (avg RPE: ' || ROUND(avg_rpe, 1) || ', base level: ' || base_level || ')';
  ELSE
    -- No RPE data, initialize with defaults
    PERFORM initialize_progression_levels(user_uuid);
    RETURN 'No RPE data found. Initialized all zones at level 3.0';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Usage:
-- SELECT seed_progression_simple(auth.uid());
