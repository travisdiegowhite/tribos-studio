-- Check what Phase 2 tables already exist
SELECT
  table_name,
  CASE
    WHEN table_name IN ('user_ftp_history', 'training_zones', 'progression_levels',
                        'progression_level_history', 'adaptation_history', 'adaptation_settings',
                        'test_phase2_ftp', 'test_auth_reference')
    THEN '⚠ EXISTS'
    ELSE 'OK'
  END as status
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'user_ftp_history',
    'training_zones',
    'progression_levels',
    'progression_level_history',
    'adaptation_history',
    'adaptation_settings',
    'test_phase2_ftp',
    'test_auth_reference'
  )
ORDER BY table_name;

-- Also check for any RLS policies on these tables
SELECT
  schemaname,
  tablename,
  policyname,
  '⚠ Policy exists' as status
FROM pg_policies
WHERE tablename IN (
  'user_ftp_history',
  'training_zones',
  'progression_levels',
  'progression_level_history',
  'adaptation_history',
  'adaptation_settings',
  'test_phase2_ftp',
  'test_auth_reference'
);
