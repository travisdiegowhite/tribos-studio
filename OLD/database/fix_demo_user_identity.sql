-- Fix Demo User Missing Identity Record
-- This is the #1 cause of "Database error querying schema" 500 errors

-- =============================================
-- STEP 1: Check if demo user has an identity
-- =============================================
SELECT
    u.id as user_id,
    u.email,
    u.email_confirmed_at,
    i.id as identity_id,
    i.provider,
    CASE
        WHEN i.id IS NULL THEN '❌ MISSING IDENTITY - This is the problem!'
        ELSE '✅ Identity exists'
    END as status
FROM auth.users u
LEFT JOIN auth.identities i ON u.id = i.user_id
WHERE u.email = 'demo@tribos.studio';

-- =============================================
-- STEP 2: Create missing identity for demo user
-- =============================================
-- This fixes the 500 error by creating the required identity record

INSERT INTO auth.identities (
    provider_id,
    user_id,
    identity_data,
    provider,
    last_sign_in_at,
    created_at,
    updated_at
)
SELECT
    u.id::text,  -- provider_id is the user's ID as a string for email provider
    u.id,
    jsonb_build_object(
        'sub', u.id::text,
        'email', u.email,
        'email_verified', true,
        'phone_verified', false
    ),
    'email',
    now(),
    u.created_at,
    now()
FROM auth.users u
WHERE u.email = 'demo@tribos.studio'
  AND NOT EXISTS (
      SELECT 1 FROM auth.identities
      WHERE user_id = u.id
      AND provider = 'email'
  );

-- =============================================
-- STEP 3: Verify the fix
-- =============================================
SELECT
    u.id as user_id,
    u.email,
    u.email_confirmed_at IS NOT NULL as is_confirmed,
    i.id as identity_id,
    i.provider,
    i.created_at as identity_created_at,
    '✅ Identity now exists - demo login should work!' as status
FROM auth.users u
JOIN auth.identities i ON u.id = i.user_id
WHERE u.email = 'demo@tribos.studio'
  AND i.provider = 'email';

-- =============================================
-- FINAL CHECK
-- =============================================
DO $$
DECLARE
    has_identity boolean;
BEGIN
    SELECT EXISTS (
        SELECT 1
        FROM auth.users u
        JOIN auth.identities i ON u.id = i.user_id
        WHERE u.email = 'demo@tribos.studio'
          AND i.provider = 'email'
    ) INTO has_identity;

    IF has_identity THEN
        RAISE NOTICE '========================================';
        RAISE NOTICE '✅ SUCCESS! Demo user now has identity';
        RAISE NOTICE '========================================';
        RAISE NOTICE 'Next steps:';
        RAISE NOTICE '1. Try demo login at your app';
        RAISE NOTICE '2. Should now work without 500 error';
        RAISE NOTICE '3. Check browser console to confirm';
        RAISE NOTICE '========================================';
    ELSE
        RAISE NOTICE '❌ Identity still missing - check if demo user exists';
        RAISE NOTICE 'Run: SELECT * FROM auth.users WHERE email = ''demo@tribos.studio''';
    END IF;
END $$;
