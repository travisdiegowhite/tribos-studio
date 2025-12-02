-- Debug: Check what workout feedback and zone data exists

-- 1. Check current progression levels
SELECT 'Current Progression Levels:' as debug_step;
SELECT zone, level, workouts_completed, last_workout_date
FROM progression_levels
WHERE user_id = auth.uid()
ORDER BY CASE zone
  WHEN 'recovery' THEN 1 WHEN 'endurance' THEN 2 WHEN 'tempo' THEN 3
  WHEN 'sweet_spot' THEN 4 WHEN 'threshold' THEN 5 WHEN 'vo2max' THEN 6 WHEN 'anaerobic' THEN 7
END;

-- 2. Check workout feedback count
SELECT 'Total Workout Feedback Entries:' as debug_step;
SELECT COUNT(*) as total_feedback,
       COUNT(perceived_exertion) as with_rpe,
       AVG(perceived_exertion) as avg_rpe
FROM workout_feedback;

-- 3. Check planned workouts with zones
SELECT 'Planned Workouts with Target Zones:' as debug_step;
SELECT pw.target_zone, COUNT(*) as workout_count, pw.completed
FROM planned_workouts pw
INNER JOIN training_plans tp ON pw.plan_id = tp.id
WHERE tp.user_id = auth.uid()
GROUP BY pw.target_zone, pw.completed
ORDER BY pw.target_zone;

-- 4. Check workout feedback with RPE scores
SELECT 'Workout Feedback Details:' as debug_step;
SELECT
  wf.perceived_exertion,
  pw.completion_percentage,
  wf.created_at::date as feedback_date,
  pw.target_zone,
  pw.completed
FROM workout_feedback wf
INNER JOIN planned_workouts pw ON wf.planned_workout_id = pw.id
INNER JOIN training_plans tp ON pw.plan_id = tp.id
WHERE tp.user_id = auth.uid()
ORDER BY wf.created_at DESC
LIMIT 20;

-- 5. Alternative: Check if we have RPE from routes (not linked to workouts)
SELECT 'Routes with RPE (not linked to planned workouts):' as debug_step;
SELECT COUNT(*) as routes_with_feedback
FROM workout_feedback wf
WHERE wf.planned_workout_id IS NULL
  AND wf.route_id IS NOT NULL;
