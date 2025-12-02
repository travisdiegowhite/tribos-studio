-- ============================================================================
-- DIAGNOSTIC SCRIPT - Understand Supabase Auth Schema
-- This will help us figure out the correct way to reference auth.users
-- ============================================================================

-- Check 1: What columns exist in auth.users?
SELECT
  'auth.users columns:' as info,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'auth' AND table_name = 'users'
ORDER BY ordinal_position;

-- Check 2: What's the primary key of auth.users?
SELECT
  'auth.users primary key:' as info,
  a.attname as column_name
FROM pg_index i
JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
WHERE i.indrelid = 'auth.users'::regclass AND i.indisprimary;

-- Check 3: Can we create a simple test table with a foreign key to auth.users?
DO $$
BEGIN
  -- Try to create a simple test table
  CREATE TABLE IF NOT EXISTS test_auth_reference (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL,
    test_data TEXT,
    created_at TIMESTAMP DEFAULT NOW()
  );

  RAISE NOTICE 'Test table created successfully';

  -- Try to add foreign key constraint
  BEGIN
    ALTER TABLE test_auth_reference
      ADD CONSTRAINT test_auth_reference_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
    RAISE NOTICE '✓ Foreign key to auth.users(id) works!';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '✗ Foreign key failed: %', SQLERRM;
  END;

  -- Try to enable RLS
  ALTER TABLE test_auth_reference ENABLE ROW LEVEL SECURITY;
  RAISE NOTICE '✓ RLS enabled successfully';

  -- Try to create a simple RLS policy (THIS IS WHERE WE'VE BEEN FAILING)
  BEGIN
    CREATE POLICY test_policy_1 ON test_auth_reference
      FOR SELECT
      USING (user_id = auth.uid());
    RAISE NOTICE '✓ RLS policy with "user_id = auth.uid()" works!';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '✗ Policy 1 failed: %', SQLERRM;
  END;

  -- Try alternative RLS syntax
  BEGIN
    CREATE POLICY test_policy_2 ON test_auth_reference
      FOR INSERT
      WITH CHECK (user_id = (SELECT auth.uid()));
    RAISE NOTICE '✓ RLS policy with "(SELECT auth.uid())" works!';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '✗ Policy 2 failed: %', SQLERRM;
  END;

  -- Clean up test
  DROP TABLE IF EXISTS test_auth_reference CASCADE;
  RAISE NOTICE '✓ Test table cleaned up';

END $$;

-- Check 4: Can we call auth.uid() directly?
SELECT
  'Current auth.uid():' as info,
  auth.uid() as current_user_id;

-- Check 5: What schema are we in?
SELECT
  'Current schema:' as info,
  current_schema() as schema_name;
