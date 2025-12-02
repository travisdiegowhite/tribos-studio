-- Fix bike_computer_sync_history schema to match wahoo-sync implementation
-- Add columns for aggregate sync stats

-- Add columns for aggregate sync statistics (per sync session)
ALTER TABLE bike_computer_sync_history
ADD COLUMN IF NOT EXISTS activities_fetched INTEGER DEFAULT 0;

ALTER TABLE bike_computer_sync_history
ADD COLUMN IF NOT EXISTS activities_imported INTEGER DEFAULT 0;

ALTER TABLE bike_computer_sync_history
ADD COLUMN IF NOT EXISTS activities_skipped INTEGER DEFAULT 0;

ALTER TABLE bike_computer_sync_history
ADD COLUMN IF NOT EXISTS sync_errors JSONB;

-- Make activity_id nullable (not all history records are per-activity)
ALTER TABLE bike_computer_sync_history
ALTER COLUMN activity_id DROP NOT NULL;

-- Remove sync_status column (redundant with error_message)
ALTER TABLE bike_computer_sync_history
DROP COLUMN IF EXISTS sync_status;

-- Remove activity_data column (use sync_errors for error details)
ALTER TABLE bike_computer_sync_history
DROP COLUMN IF EXISTS activity_data;

-- Drop the unique constraint on activity_id since we're tracking sync sessions now
ALTER TABLE bike_computer_sync_history
DROP CONSTRAINT IF EXISTS bike_computer_sync_history_integration_id_activity_id_key;

-- Add comments
COMMENT ON COLUMN bike_computer_sync_history.activities_fetched IS 'Number of activities fetched from provider in this sync';
COMMENT ON COLUMN bike_computer_sync_history.activities_imported IS 'Number of activities successfully imported';
COMMENT ON COLUMN bike_computer_sync_history.activities_skipped IS 'Number of activities skipped (duplicates)';
COMMENT ON COLUMN bike_computer_sync_history.sync_errors IS 'Array of error details for failed imports';

-- Verify the changes
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'bike_computer_sync_history'
ORDER BY ordinal_position;
