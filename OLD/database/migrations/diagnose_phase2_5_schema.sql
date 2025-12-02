-- Diagnostic query to check what tables and columns actually exist
-- Run this to understand the current database schema vs what Phase 2.5 expects

-- Check if progression_level_history table exists and its structure
SELECT
  'progression_level_history table structure' as check_type,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'progression_level_history'
ORDER BY ordinal_position;

-- Check if performance_trends table exists and its structure
SELECT
  'performance_trends table structure' as check_type,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'performance_trends'
ORDER BY ordinal_position;

-- Check if ride_analysis table exists and its structure
SELECT
  'ride_analysis table structure' as check_type,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'ride_analysis'
ORDER BY ordinal_position;

-- Check if ride_classification table exists and its structure
SELECT
  'ride_classification table structure' as check_type,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'ride_classification'
ORDER BY ordinal_position;

-- List all Phase 2.5 related functions
SELECT
  'Phase 2.5 functions' as check_type,
  routine_name,
  routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND (
    routine_name LIKE '%trend%' OR
    routine_name LIKE '%classify%' OR
    routine_name LIKE '%analysis%' OR
    routine_name LIKE '%difficulty%'
  )
ORDER BY routine_name;
