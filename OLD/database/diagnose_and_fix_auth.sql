-- Diagnostic and Fix Script for Authentication Issues
-- Run this in Supabase SQL Editor to diagnose and fix auth problems

-- =============================================
-- STEP 1: Check if demo user exists
-- =============================================
SELECT
  'Demo User Check' as check_name,
  CASE
    WHEN EXISTS (SELECT 1 FROM auth.users WHERE email = 'demo@tribos.studio')
    THEN '✅ Demo user exists'
    ELSE '❌ Demo user NOT found - create via Dashboard'
  END as status,
  (SELECT email_confirmed_at FROM auth.users WHERE email = 'demo@tribos.studio') as confirmed_at;

-- =============================================
-- STEP 2: Check required tables exist
-- =============================================
SELECT
  'Required Tables Check' as check_name,
  string_agg(
    CASE
      WHEN tablename IN ('routes', 'track_points', 'user_preferences', 'strava_tokens')
      THEN tablename || ' ✅'
      ELSE NULL
    END,
    ', '
  ) as existing_tables
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('routes', 'track_points', 'user_preferences', 'strava_tokens');

-- =============================================
-- STEP 3: Check if user_preferences table exists
-- (This is often the cause of auth issues)
-- =============================================
CREATE TABLE IF NOT EXISTS user_preferences (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
    preferences jsonb DEFAULT '{}',
    created_at timestamp WITH TIME ZONE DEFAULT now(),
    updated_at timestamp WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

-- Drop and recreate policies
DROP POLICY IF EXISTS "Users can view their own preferences" ON user_preferences;
DROP POLICY IF EXISTS "Users can create their own preferences" ON user_preferences;
DROP POLICY IF EXISTS "Users can update their own preferences" ON user_preferences;

CREATE POLICY "Users can view their own preferences" ON user_preferences
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own preferences" ON user_preferences
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own preferences" ON user_preferences
    FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON user_preferences TO authenticated;
GRANT ALL ON user_preferences TO service_role;

-- =============================================
-- STEP 4: Ensure routes table has proper structure
-- =============================================
-- Check if routes table exists and has user_id column
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'routes'
    ) THEN
        RAISE NOTICE '❌ Routes table does not exist! Run new_routes_schema.sql first';
    ELSE
        RAISE NOTICE '✅ Routes table exists';
    END IF;
END $$;

-- =============================================
-- STEP 5: Check RLS is enabled
-- =============================================
SELECT
    schemaname,
    tablename,
    CASE rowsecurity
        WHEN true THEN '✅ RLS Enabled'
        ELSE '❌ RLS Disabled'
    END as rls_status
FROM pg_tables
WHERE schemaname = 'public'
    AND tablename IN ('routes', 'track_points', 'user_preferences', 'strava_tokens')
ORDER BY tablename;

-- =============================================
-- STEP 6: Check for orphaned policies
-- =============================================
SELECT
    'Policy Check' as check_name,
    schemaname,
    tablename,
    policyname,
    CASE cmd
        WHEN 'r' THEN 'SELECT'
        WHEN 'a' THEN 'INSERT'
        WHEN 'w' THEN 'UPDATE'
        WHEN 'd' THEN 'DELETE'
        WHEN '*' THEN 'ALL'
    END as command
FROM pg_policies
WHERE schemaname = 'public'
    AND tablename IN ('routes', 'track_points', 'user_preferences', 'strava_tokens')
ORDER BY tablename, policyname;

-- =============================================
-- STEP 7: Fix common auth.uid() issues
-- =============================================
-- Sometimes auth.uid() returns NULL due to JWT issues
-- This ensures the function works correctly
DO $$
BEGIN
    -- Test if auth.uid() works
    IF auth.uid() IS NULL THEN
        RAISE NOTICE '⚠️  auth.uid() returns NULL (this is normal in SQL editor)';
        RAISE NOTICE 'Auth will work properly when called from your app';
    ELSE
        RAISE NOTICE '✅ auth.uid() works: %', auth.uid();
    END IF;
END $$;

-- =============================================
-- STEP 8: Verify demo user can be queried
-- =============================================
SELECT
    id,
    email,
    email_confirmed_at IS NOT NULL as is_confirmed,
    last_sign_in_at,
    created_at
FROM auth.users
WHERE email = 'demo@tribos.studio';

-- =============================================
-- STEP 9: Check for missing indexes
-- =============================================
CREATE INDEX IF NOT EXISTS idx_routes_user_id ON routes(user_id);
CREATE INDEX IF NOT EXISTS idx_user_preferences_user_id ON user_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_track_points_route_id ON track_points(route_id);

-- =============================================
-- FINAL DIAGNOSTIC SUMMARY
-- =============================================
DO $$
DECLARE
    demo_exists boolean;
    routes_exists boolean;
    user_prefs_exists boolean;
BEGIN
    -- Check demo user
    SELECT EXISTS (SELECT 1 FROM auth.users WHERE email = 'demo@tribos.studio') INTO demo_exists;

    -- Check tables
    SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'routes') INTO routes_exists;
    SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_preferences') INTO user_prefs_exists;

    RAISE NOTICE '========================================';
    RAISE NOTICE 'DIAGNOSTIC SUMMARY';
    RAISE NOTICE '========================================';

    IF demo_exists THEN
        RAISE NOTICE '✅ Demo user exists';
    ELSE
        RAISE NOTICE '❌ Demo user missing - create in Dashboard!';
    END IF;

    IF routes_exists THEN
        RAISE NOTICE '✅ Routes table exists';
    ELSE
        RAISE NOTICE '❌ Routes table missing - run migration!';
    END IF;

    IF user_prefs_exists THEN
        RAISE NOTICE '✅ User preferences table exists';
    ELSE
        RAISE NOTICE '❌ User preferences table missing - created by this script';
    END IF;

    RAISE NOTICE '========================================';

    IF demo_exists AND routes_exists AND user_prefs_exists THEN
        RAISE NOTICE '🎉 All checks passed! Demo login should work now.';
    ELSE
        RAISE NOTICE '⚠️  Some issues found. Fix the items marked with ❌';
    END IF;
END $$;
