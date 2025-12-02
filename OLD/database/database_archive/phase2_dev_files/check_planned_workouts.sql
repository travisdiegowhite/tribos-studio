-- Check planned_workouts table structure
SELECT 
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'planned_workouts'
ORDER BY ordinal_position;

-- Check if user_id column exists
SELECT 
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'planned_workouts' AND column_name = 'user_id'
    ) THEN 'user_id column EXISTS'
    ELSE 'user_id column MISSING'
  END as status;
