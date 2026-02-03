-- Migration: Add duplicate_of column to activities table
-- Tracks when an activity is a duplicate of another (e.g., same ride from both Strava and Garmin)
-- The duplicate_of column points to the "primary" activity (usually from higher-priority provider)
-- Activities with duplicate_of set are excluded from aggregations and UI lists

-- Add duplicate_of column as foreign key to activities
ALTER TABLE activities ADD COLUMN IF NOT EXISTS duplicate_of UUID REFERENCES activities(id) ON DELETE SET NULL;

-- Create index for efficient filtering of duplicates
-- This index helps queries that filter WHERE duplicate_of IS NULL
CREATE INDEX IF NOT EXISTS idx_activities_duplicate_of ON activities(user_id, duplicate_of);

-- Create index to find all duplicates of a given activity
CREATE INDEX IF NOT EXISTS idx_activities_duplicates_lookup ON activities(duplicate_of) WHERE duplicate_of IS NOT NULL;

-- Add comment explaining the column
COMMENT ON COLUMN activities.duplicate_of IS 'References the primary activity when this is a duplicate (e.g., Strava duplicate of Garmin ride). NULL means this is a primary activity.';
