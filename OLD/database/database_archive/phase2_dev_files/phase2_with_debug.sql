-- ============================================================================
-- Phase 2 with Debug Messages - Find Exactly Where It Fails
-- ============================================================================

DO $$ BEGIN RAISE NOTICE '>>> Starting Phase 2 Installation'; END $$;

-- STEP 1: Create user_ftp_history table
DO $$ BEGIN RAISE NOTICE '>>> Step 1: Creating user_ftp_history table...'; END $$;

CREATE TABLE IF NOT EXISTS user_ftp_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  ftp_watts INTEGER NOT NULL CHECK (ftp_watts > 0 AND ftp_watts < 600),
  lthr_bpm INTEGER CHECK (lthr_bpm > 0 AND lthr_bpm < 220),
  test_date DATE NOT NULL,
  test_type VARCHAR(50) CHECK (test_type IN ('ramp', '20min', '8min', 'auto_detected', 'manual')),
  route_id UUID,
  notes TEXT,
  is_current BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

DO $$ BEGIN RAISE NOTICE '>>> Step 1: ✓ Table created'; END $$;

-- STEP 2: Add foreign keys
DO $$ BEGIN RAISE NOTICE '>>> Step 2: Adding foreign keys...'; END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'user_ftp_history_user_id_fkey'
  ) THEN
    ALTER TABLE user_ftp_history
    ADD CONSTRAINT user_ftp_history_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'user_ftp_history_route_id_fkey'
  ) THEN
    ALTER TABLE user_ftp_history
    ADD CONSTRAINT user_ftp_history_route_id_fkey
    FOREIGN KEY (route_id) REFERENCES routes(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN RAISE NOTICE '>>> Step 2: ✓ Foreign keys added'; END $$;

-- STEP 3: Add indexes
DO $$ BEGIN RAISE NOTICE '>>> Step 3: Adding indexes...'; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_one_current_ftp_per_user
  ON user_ftp_history(user_id) WHERE is_current = TRUE;

CREATE INDEX IF NOT EXISTS idx_ftp_history_user_date
  ON user_ftp_history(user_id, test_date DESC);

DO $$ BEGIN RAISE NOTICE '>>> Step 3: ✓ Indexes added'; END $$;

-- STEP 4: Enable RLS
DO $$ BEGIN RAISE NOTICE '>>> Step 4: Enabling RLS...'; END $$;

ALTER TABLE user_ftp_history ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN RAISE NOTICE '>>> Step 4: ✓ RLS enabled'; END $$;

-- STEP 5: Create RLS policies (THIS IS LIKELY WHERE IT FAILS)
DO $$ BEGIN RAISE NOTICE '>>> Step 5: Creating RLS policies...'; END $$;

DROP POLICY IF EXISTS "Users can view their own FTP history" ON user_ftp_history;

DO $$ BEGIN RAISE NOTICE '>>> Step 5a: Creating SELECT policy...'; END $$;

CREATE POLICY "Users can view their own FTP history"
  ON user_ftp_history FOR SELECT USING (user_id = auth.uid());

DO $$ BEGIN RAISE NOTICE '>>> Step 5a: ✓ SELECT policy created'; END $$;

DROP POLICY IF EXISTS "Users can insert their own FTP history" ON user_ftp_history;

DO $$ BEGIN RAISE NOTICE '>>> Step 5b: Creating INSERT policy...'; END $$;

CREATE POLICY "Users can insert their own FTP history"
  ON user_ftp_history FOR INSERT WITH CHECK (user_id = auth.uid());

DO $$ BEGIN RAISE NOTICE '>>> Step 5b: ✓ INSERT policy created'; END $$;

DROP POLICY IF EXISTS "Users can update their own FTP history" ON user_ftp_history;

DO $$ BEGIN RAISE NOTICE '>>> Step 5c: Creating UPDATE policy...'; END $$;

CREATE POLICY "Users can update their own FTP history"
  ON user_ftp_history FOR UPDATE USING (user_id = auth.uid());

DO $$ BEGIN RAISE NOTICE '>>> Step 5c: ✓ UPDATE policy created'; END $$;

DROP POLICY IF EXISTS "Users can delete their own FTP history" ON user_ftp_history;

DO $$ BEGIN RAISE NOTICE '>>> Step 5d: Creating DELETE policy...'; END $$;

CREATE POLICY "Users can delete their own FTP history"
  ON user_ftp_history FOR DELETE USING (user_id = auth.uid());

DO $$ BEGIN RAISE NOTICE '>>> Step 5d: ✓ DELETE policy created'; END $$;

DO $$ BEGIN RAISE NOTICE '>>> ✓✓✓ ALL STEPS COMPLETED SUCCESSFULLY ✓✓✓'; END $$;

SELECT 'Installation completed - check messages above' as status;
