-- Delete Demo User Completely
-- Run this in Supabase SQL Editor to remove the problematic demo user

-- Delete in the correct order to avoid foreign key issues
DELETE FROM auth.sessions
WHERE user_id IN (SELECT id FROM auth.users WHERE email = 'demo@tribos.studio');

DELETE FROM auth.refresh_tokens
WHERE user_id IN (SELECT id FROM auth.users WHERE email = 'demo@tribos.studio');

DELETE FROM auth.identities
WHERE user_id IN (SELECT id FROM auth.users WHERE email = 'demo@tribos.studio');

DELETE FROM auth.users
WHERE email = 'demo@tribos.studio';

-- Verify deletion
SELECT
    CASE
        WHEN EXISTS (SELECT 1 FROM auth.users WHERE email = 'demo@tribos.studio')
        THEN '❌ User still exists'
        ELSE '✅ User deleted successfully'
    END as status;
