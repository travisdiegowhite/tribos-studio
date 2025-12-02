-- Step 2: Reset and Re-seed Your Progression Levels
-- Run this AFTER running reset_and_seed_from_routes.sql and seed_progression_simple.sql

-- First: Delete all existing progression data (fresh start)
SELECT reset_progression_levels(auth.uid());

-- Second: Seed from your actual workout data
SELECT seed_progression_simple(auth.uid());

-- Check the results
SELECT zone, level, workouts_completed
FROM progression_levels
WHERE user_id = auth.uid()
ORDER BY CASE zone
  WHEN 'recovery' THEN 1
  WHEN 'endurance' THEN 2
  WHEN 'tempo' THEN 3
  WHEN 'sweet_spot' THEN 4
  WHEN 'threshold' THEN 5
  WHEN 'vo2max' THEN 6
  WHEN 'anaerobic' THEN 7
END;
