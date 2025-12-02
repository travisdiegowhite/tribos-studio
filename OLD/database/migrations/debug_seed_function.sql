-- Debug: Check what auth.uid() returns and test the function step by step

-- Step 1: Check auth.uid()
SELECT 'Step 1 - Your User ID:' as step, auth.uid() as user_id;

-- Step 2: Check workout feedback
SELECT 'Step 2 - Workout Feedback Count:' as step,
       COUNT(*) as total_feedback,
       COUNT(wf.perceived_exertion) as with_rpe,
       AVG(wf.perceived_exertion) as avg_rpe
FROM workout_feedback wf
INNER JOIN planned_workouts pw ON wf.planned_workout_id = pw.id
INNER JOIN training_plans tp ON pw.plan_id = tp.id
WHERE tp.user_id = auth.uid()
  AND wf.perceived_exertion IS NOT NULL;

-- Step 3: Try inserting directly
DO $$
DECLARE
  my_user_id UUID;
BEGIN
  my_user_id := auth.uid();
  RAISE NOTICE 'User ID: %', my_user_id;

  -- Try direct insert
  INSERT INTO progression_levels (user_id, zone, level, workouts_completed)
  VALUES (my_user_id, 'recovery', 3.0, 0)
  ON CONFLICT (user_id, zone) DO UPDATE SET updated_at = NOW();

  RAISE NOTICE 'Insert successful';
END $$;

-- Step 4: Check if it was inserted
SELECT 'Step 4 - Check Inserted Data:' as step,
       zone, level, workouts_completed
FROM progression_levels
WHERE user_id = auth.uid() AND zone = 'recovery';
