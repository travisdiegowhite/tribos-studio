-- Check the structure of your workout feedback data

-- 1. Total workout feedback entries
SELECT 'Total workout feedback:' as check_type, COUNT(*) as count
FROM workout_feedback;

-- 2. Workout feedback with RPE
SELECT 'Feedback with RPE:' as check_type, COUNT(*) as count
FROM workout_feedback
WHERE perceived_exertion IS NOT NULL;

-- 3. Check if feedback is linked to planned_workouts
SELECT 'Feedback linked to planned_workouts:' as check_type, COUNT(*) as count
FROM workout_feedback
WHERE planned_workout_id IS NOT NULL;

-- 4. Check if feedback is linked to routes instead
SELECT 'Feedback linked to routes only:' as check_type, COUNT(*) as count
FROM workout_feedback
WHERE planned_workout_id IS NULL AND route_id IS NOT NULL;

-- 5. Sample of your workout feedback
SELECT
  wf.id,
  wf.perceived_exertion,
  wf.planned_workout_id,
  wf.route_id,
  wf.created_at::date as feedback_date
FROM workout_feedback wf
ORDER BY wf.created_at DESC
LIMIT 10;

-- 6. Check training plans
SELECT 'Your training plans:' as check_type, COUNT(*) as count
FROM training_plans
WHERE user_id = '71b1e868-7cbc-40fb-8fe1-8962d36f6313';

-- 7. Check planned workouts
SELECT 'Your planned workouts:' as check_type, COUNT(*) as count
FROM planned_workouts pw
INNER JOIN training_plans tp ON pw.plan_id = tp.id
WHERE tp.user_id = '71b1e868-7cbc-40fb-8fe1-8962d36f6313';
