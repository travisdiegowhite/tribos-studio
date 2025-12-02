-- ============================================================================
-- SIMPLE TEST - Create one table with RLS step by step
-- We'll do this in stages to see exactly where it fails
-- ============================================================================

-- Stage 1: Create a simple table
CREATE TABLE IF NOT EXISTS test_phase2_ftp (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  ftp_watts INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Stage 2: Add foreign key constraint
ALTER TABLE test_phase2_ftp
  DROP CONSTRAINT IF EXISTS test_phase2_ftp_user_id_fkey;

ALTER TABLE test_phase2_ftp
  ADD CONSTRAINT test_phase2_ftp_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Stage 3: Enable RLS
ALTER TABLE test_phase2_ftp ENABLE ROW LEVEL SECURITY;

-- Stage 4: Create RLS policy (this is where we've been failing)
DROP POLICY IF EXISTS "test_select_policy" ON test_phase2_ftp;

CREATE POLICY "test_select_policy" ON test_phase2_ftp
  FOR SELECT
  USING (user_id = auth.uid());

-- If we got here, it worked!
SELECT 'SUCCESS: Table created with RLS policy!' as result;

-- Show the table structure
SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'test_phase2_ftp'
ORDER BY ordinal_position;
