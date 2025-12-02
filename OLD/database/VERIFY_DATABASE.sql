-- Quick verification script for bike_computer_integrations setup
-- Run this in Supabase SQL Editor to verify everything is set up correctly

-- 1. Check if tables exist
SELECT
  'Tables Exist' as check_type,
  expected.table_name,
  CASE WHEN t.table_name IS NOT NULL THEN '✅ EXISTS' ELSE '❌ MISSING' END as status
FROM (
  SELECT 'bike_computer_integrations' as table_name
  UNION ALL
  SELECT 'bike_computer_sync_history'
) expected
LEFT JOIN information_schema.tables t
  ON t.table_name = expected.table_name
  AND t.table_schema = 'public';

-- 2. Check columns on bike_computer_integrations
SELECT
  'Columns on bike_computer_integrations' as check_type,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'bike_computer_integrations'
  AND table_schema = 'public'
ORDER BY ordinal_position;

-- 3. Check RLS policies
SELECT
  'RLS Policies' as check_type,
  tablename,
  policyname,
  cmd as command_type
FROM pg_policies
WHERE tablename IN ('bike_computer_integrations', 'bike_computer_sync_history')
ORDER BY tablename, policyname;

-- 4. Check permissions (CRITICAL!)
SELECT
  'Permissions (GRANT)' as check_type,
  table_name,
  grantee,
  string_agg(privilege_type, ', ') as privileges
FROM information_schema.table_privileges
WHERE table_name IN ('bike_computer_integrations', 'bike_computer_sync_history')
  AND grantee IN ('service_role', 'authenticated', 'anon')
GROUP BY table_name, grantee
ORDER BY table_name, grantee;

-- 5. Check if table is readable (should NOT error)
-- This will fail with RLS error if not authenticated, but that's OK
SELECT
  'Data Check' as check_type,
  COUNT(*) as row_count,
  'Table is accessible' as status
FROM bike_computer_integrations;

-- 6. Summary
SELECT
  'SUMMARY' as check_type,
  CASE
    WHEN (SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'bike_computer_integrations') = 0
    THEN '❌ TABLES MISSING - RUN DEFINITIVE_FIX_bike_computer_integrations.sql'
    WHEN (SELECT COUNT(*) FROM information_schema.table_privileges WHERE table_name = 'bike_computer_integrations' AND grantee = 'authenticated') = 0
    THEN '❌ PERMISSIONS MISSING - RUN DEFINITIVE_FIX_bike_computer_integrations.sql'
    WHEN (SELECT COUNT(*) FROM pg_policies WHERE tablename = 'bike_computer_integrations') < 4
    THEN '❌ RLS POLICIES MISSING - RUN DEFINITIVE_FIX_bike_computer_integrations.sql'
    ELSE '✅ ALL GOOD! Database is set up correctly'
  END as status,
  '' as action;
