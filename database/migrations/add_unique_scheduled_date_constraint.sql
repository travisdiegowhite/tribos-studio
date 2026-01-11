-- =====================================================
-- ADD UNIQUE CONSTRAINT ON (plan_id, scheduled_date)
-- =====================================================
-- This ensures only one workout per date per plan,
-- enabling reliable UPSERT operations.
--
-- SAFE FOR EXISTING DATA: First removes duplicates (keeping most recent)
-- =====================================================

-- Step 1: Create a temporary table to identify duplicates
-- Keep the most recently created workout for each plan_id + scheduled_date
CREATE TEMP TABLE workouts_to_keep AS
SELECT DISTINCT ON (plan_id, scheduled_date) id
FROM planned_workouts
WHERE scheduled_date IS NOT NULL
ORDER BY plan_id, scheduled_date, created_at DESC NULLS LAST, id DESC;

-- Step 2: Delete duplicates (workouts NOT in the keep list)
-- Only delete where there are duplicates (scheduled_date is not null)
DELETE FROM planned_workouts
WHERE scheduled_date IS NOT NULL
  AND id NOT IN (SELECT id FROM workouts_to_keep);

-- Step 3: Drop temp table
DROP TABLE workouts_to_keep;

-- Step 4: Add the unique constraint
-- First drop any existing constraint/index with this name
DROP INDEX IF EXISTS idx_planned_workouts_unique_date;
ALTER TABLE planned_workouts DROP CONSTRAINT IF EXISTS unique_plan_scheduled_date;

-- Add as actual constraint (required for Supabase UPSERT onConflict)
ALTER TABLE planned_workouts
ADD CONSTRAINT unique_plan_scheduled_date UNIQUE (plan_id, scheduled_date);

-- Step 5: Add a comment explaining the constraint
COMMENT ON CONSTRAINT unique_plan_scheduled_date ON planned_workouts IS
'Ensures only one workout per date per plan. Enables UPSERT operations.';

-- =====================================================
-- VERIFICATION
-- =====================================================
DO $$
DECLARE
  duplicate_count INTEGER;
BEGIN
  -- Check for any remaining duplicates
  SELECT COUNT(*) INTO duplicate_count
  FROM (
    SELECT plan_id, scheduled_date, COUNT(*) as cnt
    FROM planned_workouts
    WHERE scheduled_date IS NOT NULL
    GROUP BY plan_id, scheduled_date
    HAVING COUNT(*) > 1
  ) duplicates;

  IF duplicate_count > 0 THEN
    RAISE EXCEPTION 'Found % duplicate plan_id + scheduled_date combinations', duplicate_count;
  ELSE
    RAISE NOTICE 'Success! No duplicates found. Unique constraint is active.';
  END IF;
END $$;
