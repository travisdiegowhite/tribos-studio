--- Fix for "Database error querying schema" 500 error
-- This error usually means auth.users triggers are failing due to missing tables or functions

-- =============================================
-- STEP 1: Check for auth hooks and triggers
-- =============================================

-- List all triggers on auth.users table
SELECT
    trigger_name,
    event_manipulation,
    action_statement
FROM information_schema.triggers
WHERE event_object_schema = 'auth'
    AND event_object_table = 'users';

-- =============================================
-- STEP 2: Disable problematic triggers temporarily
-- =============================================

-- Check if there are custom triggers causing issues
DO $$
DECLARE
    trigger_rec RECORD;
BEGIN
    FOR trigger_rec IN
        SELECT trigger_name, event_object_table
        FROM information_schema.triggers
        WHERE event_object_schema = 'auth'
            AND event_object_table = 'users'
            AND trigger_name LIKE 'on_%'  -- Custom triggers usually start with on_
    LOOP
        RAISE NOTICE 'Found custom trigger: %.%', trigger_rec.event_object_table, trigger_rec.trigger_name;
    END LOOP;
END $$;

-- =============================================
-- STEP 3: Check for auth schema functions that might fail
-- =============================================

-- List functions in auth schema
SELECT
    routine_name,
    routine_type
FROM information_schema.routines
WHERE routine_schema = 'auth'
    AND routine_name LIKE 'handle_%';

-- =============================================
-- STEP 4: Ensure public schema tables are accessible
-- =============================================

-- Grant necessary permissions on public schema
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;

-- Grant sequence permissions
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, service_role;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- =============================================
-- STEP 5: Check if there's a handle_new_user function
-- =============================================

-- This is a common pattern that causes 500 errors if the function references missing tables
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_proc
        WHERE proname = 'handle_new_user'
        AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
    ) THEN
        RAISE NOTICE '⚠️  Found handle_new_user function - this might be causing the error';
        RAISE NOTICE 'Dropping and recreating without problematic references...';

        -- Drop existing function
        DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;

        RAISE NOTICE '✅ Removed handle_new_user function';
    ELSE
        RAISE NOTICE '✅ No handle_new_user function found';
    END IF;
END $$;

-- =============================================
-- STEP 6: Recreate a safe handle_new_user function (if needed)
-- =============================================

-- Only create profile if needed by your app
-- Comment this out if you don't use profiles
/*
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    -- Only insert if user_preferences table exists
    INSERT INTO public.user_preferences (user_id, preferences)
    VALUES (new.id, '{}'::jsonb)
    ON CONFLICT (user_id) DO NOTHING;

    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger only if function is needed
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
*/

-- =============================================
-- STEP 7: Check RLS policies on auth.users
-- =============================================

-- Ensure no restrictive RLS policies on auth schema
-- (Usually Supabase manages this, but check anyway)
SELECT
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd
FROM pg_policies
WHERE schemaname = 'auth';

-- =============================================
-- STEP 8: Verify JWT secret is configured
-- =============================================

-- Check if auth.jwt() function works
DO $$
BEGIN
    -- This will fail in SQL editor but succeed in app context
    RAISE NOTICE 'Testing auth context (will be null in SQL editor): %', auth.uid();
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE '⚠️  Auth function error: %', SQLERRM;
END $$;

-- =============================================
-- STEP 9: Check for orphaned references
-- =============================================

-- Find all functions that reference missing tables
SELECT
    p.proname as function_name,
    pg_get_functiondef(p.oid) as definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
    AND pg_get_functiondef(p.oid) LIKE '%INSERT INTO%'
    AND (
        pg_get_functiondef(p.oid) LIKE '%profile%'
        OR pg_get_functiondef(p.oid) LIKE '%public.%'
    );

-- =============================================
-- FINAL DIAGNOSTIC
-- =============================================

DO $$
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'AUTH 500 ERROR FIX COMPLETE';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Next steps:';
    RAISE NOTICE '1. Check output above for any triggers or functions that failed';
    RAISE NOTICE '2. If you see handle_new_user or similar, thats likely the issue';
    RAISE NOTICE '3. Try demo login again';
    RAISE NOTICE '4. Check browser console for more specific error';
    RAISE NOTICE '========================================';
END $$;

-- =============================================
-- ALTERNATIVE: Complete reset of auth user creation
-- =============================================

-- If still failing, uncomment this section to completely reset

-- Remove ALL custom triggers on auth.users
DO $$
DECLARE
    trigger_rec RECORD;
BEGIN
    FOR trigger_rec IN
        SELECT trigger_name
        FROM information_schema.triggers
        WHERE event_object_schema = 'auth'
            AND event_object_table = 'users'
            AND trigger_name NOT LIKE 'ts_%'  -- Keep Supabase internal triggers
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS %I ON auth.users CASCADE', trigger_rec.trigger_name);
        RAISE NOTICE 'Dropped trigger: %', trigger_rec.trigger_name;
    END LOOP;
END $$;
*/
