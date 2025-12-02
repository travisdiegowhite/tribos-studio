-- Migration: Add Garmin Course Sync Tracking
-- Purpose: Track routes uploaded to Garmin Connect as courses
-- Author: Claude Code
-- Date: 2025-11-25

-- Add columns to routes table for tracking Garmin course uploads
ALTER TABLE routes
  ADD COLUMN IF NOT EXISTS garmin_course_id TEXT,
  ADD COLUMN IF NOT EXISTS garmin_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS garmin_sync_status TEXT
    CHECK (garmin_sync_status IN ('pending', 'success', 'error')),
  ADD COLUMN IF NOT EXISTS garmin_sync_error TEXT;

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_routes_garmin_course_id
  ON routes(garmin_course_id)
  WHERE garmin_course_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_routes_garmin_sync_status
  ON routes(garmin_sync_status)
  WHERE garmin_sync_status IS NOT NULL;

-- Add column comments for documentation
COMMENT ON COLUMN routes.garmin_course_id IS
  'Garmin Connect Course ID returned after successful upload. Used to track and update courses.';

COMMENT ON COLUMN routes.garmin_synced_at IS
  'Timestamp when route was last successfully synced to Garmin Connect';

COMMENT ON COLUMN routes.garmin_sync_status IS
  'Status of last Garmin sync attempt: pending (upload in progress), success (uploaded), error (failed)';

COMMENT ON COLUMN routes.garmin_sync_error IS
  'Error message from last failed sync attempt. NULL if successful or not yet synced.';

-- Support bidirectional sync in existing history table
-- This allows tracking both imports (activities FROM Garmin) and exports (routes TO Garmin)
ALTER TABLE bike_computer_sync_history
  ADD COLUMN IF NOT EXISTS sync_direction TEXT DEFAULT 'import'
    CHECK (sync_direction IN ('import', 'export'));

COMMENT ON COLUMN bike_computer_sync_history.sync_direction IS
  'Direction of sync: import (activities from Garmin to app), export (routes from app to Garmin)';

-- Verify migration
DO $$
BEGIN
  RAISE NOTICE 'Garmin course sync migration completed successfully';
  RAISE NOTICE 'Added columns: garmin_course_id, garmin_synced_at, garmin_sync_status, garmin_sync_error to routes';
  RAISE NOTICE 'Added column: sync_direction to bike_computer_sync_history';
  RAISE NOTICE 'Created indexes: idx_routes_garmin_course_id, idx_routes_garmin_sync_status';
END $$;
