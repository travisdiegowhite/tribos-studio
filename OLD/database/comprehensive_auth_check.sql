-- Comprehensive Auth Diagnostic for Demo User
-- This checks ALL possible causes of the 500 error

-- =============================================
-- CHECK 1: Demo user exists and is confirmed
-- =============================================
SELECT
    '1. Demo User Status' as check_name,
    id,
    email,
    email_confirmed_at IS NOT NULL as is_confirmed,
    created_at,
    last_sign_in_at,
    CASE
        WHEN email_confirmed_at IS NULL THEN '❌ User not confirmed'
        ELSE '✅ User confirmed'
    END as status
FROM auth.users
WHERE email = 'demo@tribos.studio';

-- =============================================
-- CHECK 2: Demo user has identity record
-- =============================================
SELECT
    '2. Identity Record' as check_name,
    i.id as identity_id,
    i.provider_id,
    i.provider,
    i.created_at,
    CASE
        WHEN i.id IS NOT NULL THEN '✅ Identity exists'
        ELSE '❌ Identity missing'
    END as status
FROM auth.users u
LEFT JOIN auth.identities i ON u.id = i.user_id
WHERE u.email = 'demo@tribos.studio';

-- =============================================
-- CHECK 3: Check for custom triggers on auth.users
-- =============================================
SELECT
    '3. Auth Triggers' as check_name,
    trigger_name,
    event_manipulation as event,
    action_timing as timing,
    action_statement,
    CASE
        WHEN trigger_name LIKE 'on_%' OR trigger_name LIKE 'handle_%'
        THEN '⚠️  Custom trigger found - might be causing 500 error'
        ELSE '✅ System trigger'
    END as status
FROM information_schema.triggers
WHERE event_object_schema = 'auth'
  AND event_object_table = 'users'
ORDER BY trigger_name;

-- =============================================
-- CHECK 4: Check for functions that reference missing tables
-- =============================================
SELECT
    '4. Problematic Functions' as check_name,
    p.proname as function_name,
    n.nspname as schema_name,
    CASE
        WHEN pg_get_functiondef(p.oid) LIKE '%INSERT INTO%'
        THEN '⚠️  Function does INSERT - check if tables exist'
        ELSE '✅ No INSERT operations'
    END as status
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND (
      p.proname LIKE 'handle_%'
      OR p.proname LIKE 'on_%'
  )
ORDER BY p.proname;

-- =============================================
-- CHECK 5: Verify auth schema tables exist
-- =============================================
SELECT
    '5. Auth Schema Tables' as check_name,
    table_name,
    '✅ Exists' as status
FROM information_schema.tables
WHERE table_schema = 'auth'
  AND table_name IN ('users', 'identities', 'sessions', 'refresh_tokens')
ORDER BY table_name;

-- =============================================
-- CHECK 6: Check for RLS on auth tables (should be disabled)
-- =============================================
SELECT
    '6. Auth Table RLS' as check_name,
    tablename,
    CASE
        WHEN rowsecurity = true THEN '⚠️  RLS is ON (should be OFF for auth tables)'
        ELSE '✅ RLS is OFF'
    END as status
FROM pg_tables
WHERE schemaname = 'auth'
  AND tablename IN ('users', 'identities', 'sessions', 'refresh_tokens')
ORDER BY tablename;

-- =============================================
-- CHECK 7: Check user_preferences table exists (common issue)
-- =============================================
SELECT
    '7. User Preferences Table' as check_name,
    CASE
        WHEN EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = 'user_preferences'
        )
        THEN '✅ Table exists'
        ELSE '⚠️  Table missing - might be referenced by trigger'
    END as status;

-- =============================================
-- CHECK 8: Look for specific handle_new_user function
-- =============================================
SELECT
    '8. handle_new_user Function' as check_name,
    CASE
        WHEN EXISTS (
            SELECT 1 FROM pg_proc p
            JOIN pg_namespace n ON p.pronamespace = n.oid
            WHERE n.nspname = 'public' AND p.proname = 'handle_new_user'
        )
        THEN '⚠️  handle_new_user exists - check if it references missing tables'
        ELSE '✅ No handle_new_user function'
    END as status;

-- =============================================
-- RECOMMENDED FIX
-- =============================================
DO $$
DECLARE
    has_trigger boolean;
    has_identity boolean;
    is_confirmed boolean;
    trigger_rec RECORD;
BEGIN
    -- Check for custom triggers
    SELECT EXISTS (
        SELECT 1 FROM information_schema.triggers
        WHERE event_object_schema = 'auth'
          AND event_object_table = 'users'
          AND (trigger_name LIKE 'on_%' OR trigger_name LIKE 'handle_%')
    ) INTO has_trigger;

    -- Check for identity
    SELECT EXISTS (
        SELECT 1 FROM auth.identities i
        JOIN auth.users u ON i.user_id = u.id
        WHERE u.email = 'demo@tribos.studio'
    ) INTO has_identity;

    -- Check if confirmed
    SELECT email_confirmed_at IS NOT NULL
    FROM auth.users
    WHERE email = 'demo@tribos.studio'
    INTO is_confirmed;

    RAISE NOTICE '========================================';
    RAISE NOTICE 'DIAGNOSTIC SUMMARY';
    RAISE NOTICE '========================================';

    IF NOT is_confirmed THEN
        RAISE NOTICE '❌ User not confirmed';
        RAISE NOTICE 'FIX: Confirm user in Dashboard → Authentication → Users';
    ELSE
        RAISE NOTICE '✅ User is confirmed';
    END IF;

    IF NOT has_identity THEN
        RAISE NOTICE '❌ Identity record missing';
        RAISE NOTICE 'FIX: Run fix_demo_user_identity.sql';
    ELSE
        RAISE NOTICE '✅ Identity exists';
    END IF;

    IF has_trigger THEN
        RAISE NOTICE '⚠️  Custom triggers found on auth.users';
        RAISE NOTICE 'FIX: Drop triggers with these commands:';
        RAISE NOTICE '';
        FOR trigger_rec IN
            SELECT trigger_name
            FROM information_schema.triggers
            WHERE event_object_schema = 'auth'
              AND event_object_table = 'users'
              AND (trigger_name LIKE 'on_%' OR trigger_name LIKE 'handle_%')
        LOOP
            RAISE NOTICE 'DROP TRIGGER IF EXISTS % ON auth.users CASCADE;', trigger_rec.trigger_name;
        END LOOP;
        RAISE NOTICE '';
    ELSE
        RAISE NOTICE '✅ No problematic triggers';
    END IF;

    RAISE NOTICE '========================================';
    RAISE NOTICE 'NEXT STEP: Check Supabase Dashboard → Logs → Postgres Logs';
    RAISE NOTICE 'Try demo login and watch for ERROR messages in logs';
    RAISE NOTICE '========================================';
END $$;
