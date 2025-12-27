-- Migration: Add is_hidden column to activities table
-- Allows users to hide rides from their history without permanently deleting them

-- Add is_hidden column with default false
ALTER TABLE activities ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN DEFAULT FALSE;

-- Create index for efficient filtering of hidden activities
CREATE INDEX IF NOT EXISTS idx_activities_is_hidden ON activities(user_id, is_hidden);

-- Add comment explaining the column
COMMENT ON COLUMN activities.is_hidden IS 'When true, the activity is hidden from the user''s ride history but not deleted';
