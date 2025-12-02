-- Create Demo Account for tribos.studio
-- IMPORTANT: This SQL won't work directly. Use the Supabase Dashboard instead!
--
-- Go to: Supabase Dashboard → Authentication → Users → Add User
-- Then click "Create new user" and enter:
--   Email: demo@tribos.studio
--   Password: demo2024tribos
--   ✅ Auto Confirm User: YES (IMPORTANT!)
--
-- Alternatively, use the Supabase Admin API or create via your app's signup.
--
-- Demo credentials (for reference):
-- Email: demo@tribos.studio
-- Password: demo2024tribos

-- To verify if demo account exists, run:
SELECT
  id,
  email,
  email_confirmed_at,
  created_at,
  last_sign_in_at
FROM auth.users
WHERE email = 'demo@tribos.studio';

-- If you see a row with email_confirmed_at populated, the account is ready!
-- If no rows, you need to create it via Dashboard (recommended) or use method below:

/*
ALTERNATIVE: Create via Edge Function (Advanced)
Create a Supabase Edge Function that calls admin.createUser():

const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

await supabase.auth.admin.createUser({
  email: 'demo@tribos.studio',
  password: 'demo2024tribos',
  email_confirm: true,
  user_metadata: { name: 'Demo User' }
})
*/
