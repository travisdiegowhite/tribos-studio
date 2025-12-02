-- Seed progression levels using your actual user ID
-- First, find your user ID, then replace 'YOUR_USER_ID_HERE' below

-- Step 1: Find your user ID
SELECT id, email FROM auth.users ORDER BY created_at DESC LIMIT 5;

-- Step 2: Once you know your ID, replace 'YOUR_USER_ID_HERE' and run this:
-- SELECT seed_progression_simple('YOUR_USER_ID_HERE'::uuid);

-- Example (you'll need to replace with your actual UUID):
-- SELECT seed_progression_simple('71b1e868-7cbc-40fb-8fe1-8962d36f6313'::uuid);
