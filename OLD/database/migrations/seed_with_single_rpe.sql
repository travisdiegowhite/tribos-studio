-- Seed progression levels even with limited RPE data
-- Works with as little as 1 workout feedback entry

-- First, let's see what RPE data you have
SELECT
  wf.perceived_exertion,
  pw.target_zone,
  wf.created_at::date as date
FROM workout_feedback wf
INNER JOIN planned_workouts pw ON wf.planned_workout_id = pw.id
INNER JOIN training_plans tp ON pw.plan_id = tp.id
WHERE tp.user_id = '71b1e868-7cbc-40fb-8fe1-8962d36f6313'
  AND wf.perceived_exertion IS NOT NULL;

-- Now seed with whatever data we have (minimum 1 entry)
CREATE OR REPLACE FUNCTION seed_progression_from_limited_data(p_user_id UUID)
RETURNS TEXT AS $$
DECLARE
  avg_rpe DECIMAL;
  workout_count INTEGER;
  base_level DECIMAL;
BEGIN
  -- Get RPE data (works with 1 or more entries)
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
    VALUES
      (p_user_id, 'recovery', LEAST(10.0, base_level + 1.5), workout_count),
      (p_user_id, 'endurance', base_level, workout_count),
      (p_user_id, 'tempo', GREATEST(1.0, base_level - 0.5), GREATEST(0, FLOOR(workout_count * 0.7))),
      (p_user_id, 'sweet_spot', GREATEST(1.0, base_level - 1.0), GREATEST(0, FLOOR(workout_count * 0.5))),
      (p_user_id, 'threshold', GREATEST(1.0, base_level - 1.5), GREATEST(0, FLOOR(workout_count * 0.3))),
      (p_user_id, 'vo2max', GREATEST(1.0, base_level - 2.0), 0),
      (p_user_id, 'anaerobic', GREATEST(1.0, base_level - 2.5), 0)
    ON CONFLICT (user_id, zone)
    DO UPDATE SET
      level = EXCLUDED.level,
      workouts_completed = EXCLUDED.workouts_completed,
      updated_at = NOW();

    RETURN 'Seeded 7 zones from ' || workout_count || ' workout(s) with RPE (avg: ' || ROUND(avg_rpe, 1) || ', base level: ' || base_level || ')';
  ELSE
    -- No RPE data at all, use reasonable defaults
    INSERT INTO progression_levels (user_id, zone, level, workouts_completed)
    VALUES
      (p_user_id, 'recovery', 5.0, 0),
      (p_user_id, 'endurance', 4.0, 0),
      (p_user_id, 'tempo', 3.5, 0),
      (p_user_id, 'sweet_spot', 3.0, 0),
      (p_user_id, 'threshold', 2.5, 0),
      (p_user_id, 'vo2max', 2.0, 0),
      (p_user_id, 'anaerobic', 1.5, 0)
    ON CONFLICT (user_id, zone) DO NOTHING;

    RETURN 'No RPE data found. Seeded with default levels (assuming intermediate fitness)';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Run the seeding
SELECT seed_progression_from_limited_data('71b1e868-7cbc-40fb-8fe1-8962d36f6313'::uuid);

-- Check results
SELECT zone, level, workouts_completed
FROM progression_levels
WHERE user_id = '71b1e868-7cbc-40fb-8fe1-8962d36f6313'
ORDER BY CASE zone
  WHEN 'recovery' THEN 1
  WHEN 'endurance' THEN 2
  WHEN 'tempo' THEN 3
  WHEN 'sweet_spot' THEN 4
  WHEN 'threshold' THEN 5
  WHEN 'vo2max' THEN 6
  WHEN 'anaerobic' THEN 7
END;
