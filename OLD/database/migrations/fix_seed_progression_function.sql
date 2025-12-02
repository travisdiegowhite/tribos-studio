-- Fix seed_progression_from_rpe_data to work with plan_id-based schema
-- planned_workouts doesn't have user_id, it has plan_id

CREATE OR REPLACE FUNCTION seed_progression_from_rpe_data(user_uuid UUID)
RETURNS TEXT AS $$
DECLARE
  zone_record RECORD;
  avg_rpe DECIMAL;
  workout_count INTEGER;
  initial_level DECIMAL;
  zones_updated INTEGER := 0;
BEGIN
  -- Get zones from completed workouts with feedback
  FOR zone_record IN
    SELECT DISTINCT pw.target_zone as zone
    FROM planned_workouts pw
    INNER JOIN training_plans tp ON pw.plan_id = tp.id
    WHERE tp.user_id = user_uuid
      AND pw.target_zone IS NOT NULL
      AND pw.completed = TRUE
  LOOP
    -- Calculate average RPE for this zone
    SELECT AVG(wf.perceived_exertion), COUNT(*)
    INTO avg_rpe, workout_count
    FROM workout_feedback wf
    INNER JOIN planned_workouts pw ON wf.planned_workout_id = pw.id
    INNER JOIN training_plans tp ON pw.plan_id = tp.id
    WHERE tp.user_id = user_uuid
      AND pw.target_zone = zone_record.zone
      AND wf.perceived_exertion IS NOT NULL;

    IF workout_count > 0 THEN
      -- Map RPE to initial progression level
      initial_level := CASE
        WHEN avg_rpe <= 5 THEN 7.0  -- Very easy = high level
        WHEN avg_rpe <= 6 THEN 6.0  -- Easy = good level
        WHEN avg_rpe <= 7 THEN 5.0  -- Moderate = average level
        WHEN avg_rpe <= 8 THEN 4.0  -- Hard = below average
        WHEN avg_rpe <= 9 THEN 3.0  -- Very hard = low level
        ELSE 2.0                     -- Extremely hard = very low level
      END;

      -- Insert or update progression level
      INSERT INTO progression_levels (user_id, zone, level, workouts_completed)
      VALUES (user_uuid, zone_record.zone, initial_level, workout_count)
      ON CONFLICT (user_id, zone)
      DO UPDATE SET
        level = initial_level,
        workouts_completed = workout_count,
        updated_at = NOW();

      zones_updated := zones_updated + 1;
    END IF;
  END LOOP;

  -- Initialize any missing zones with default level 3.0
  PERFORM initialize_progression_levels(user_uuid);

  RETURN 'Seeded ' || zones_updated || ' zones from RPE data';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

SELECT 'Fixed seed_progression_from_rpe_data function' as status;
