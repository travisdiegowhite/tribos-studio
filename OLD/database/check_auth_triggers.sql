-- Quick check for what's causing the auth 500 error
-- Run this to see if there are any triggers on auth.users

-- 1. List ALL triggers on auth.users (most important)
SELECT
    t.trigger_name,
    t.event_manipulation as event,
    t.action_timing as timing,
    t.action_statement as action,
    'auth.users' as table_name
FROM information_schema.triggers t
WHERE t.event_object_schema = 'auth'
  AND t.event_object_table = 'users'
ORDER BY t.trigger_name;

-- 2. If you see any triggers above (especially 'on_auth_user_created' or 'handle_new_user'),
--    those are likely causing the 500 error.

-- 3. To fix it IMMEDIATELY, uncomment and run this:
/*
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
*/

-- 4. After running the DROP commands above, try demo login again.
