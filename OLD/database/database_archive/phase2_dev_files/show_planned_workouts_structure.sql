-- Show ALL columns in planned_workouts
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'planned_workouts'
ORDER BY ordinal_position;
