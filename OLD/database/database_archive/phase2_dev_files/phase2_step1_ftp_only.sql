-- ============================================================================
-- Phase 2 - Step 1: FTP Tables Only (No RLS, No Functions)
-- This is a minimal test to isolate the exact problem
-- ============================================================================

-- Step 1: Create table WITHOUT any constraints
CREATE TABLE IF NOT EXISTS user_ftp_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  ftp_watts INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Step 2: Try to add foreign key
DO $$
BEGIN
  ALTER TABLE user_ftp_history
    DROP CONSTRAINT IF EXISTS user_ftp_history_user_id_fkey;

  ALTER TABLE user_ftp_history
    ADD CONSTRAINT user_ftp_history_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

  RAISE NOTICE '✓ Foreign key added successfully';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '✗ Foreign key failed: %', SQLERRM;
END $$;

-- Step 3: Try to enable RLS
DO $$
BEGIN
  ALTER TABLE user_ftp_history ENABLE ROW LEVEL SECURITY;
  RAISE NOTICE '✓ RLS enabled successfully';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '✗ RLS enable failed: %', SQLERRM;
END $$;

-- Step 4: Try to create ONE simple policy
DO $$
BEGIN
  DROP POLICY IF EXISTS "test_policy" ON user_ftp_history;

  CREATE POLICY "test_policy"
    ON user_ftp_history
    FOR SELECT
    USING (user_id = auth.uid());

  RAISE NOTICE '✓ RLS policy created successfully';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '✗ RLS policy failed: %', SQLERRM;
END $$;

-- Show results
SELECT 'Test complete - check messages above' as status;
