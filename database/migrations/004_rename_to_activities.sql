-- Migration: Rename strava_activities to activities
-- This makes the table name generic for multiple data sources (Strava, FIT uploads, Garmin, Wahoo, etc.)
-- Run this in your Supabase SQL editor

-- Step 1: Drop existing RLS policies
DROP POLICY IF EXISTS "Users can view their own activities" ON strava_activities;
DROP POLICY IF EXISTS "Users can insert their own activities" ON strava_activities;
DROP POLICY IF EXISTS "Users can update their own activities" ON strava_activities;
DROP POLICY IF EXISTS "Users can delete their own activities" ON strava_activities;
DROP POLICY IF EXISTS "Service role has full access to activities" ON strava_activities;

-- Step 2: Rename the table
ALTER TABLE strava_activities RENAME TO activities;

-- Step 3: Rename indexes
ALTER INDEX IF EXISTS idx_strava_activities_user_id RENAME TO idx_activities_user_id;
ALTER INDEX IF EXISTS idx_strava_activities_start_date RENAME TO idx_activities_start_date;
ALTER INDEX IF EXISTS idx_strava_activities_type RENAME TO idx_activities_type;

-- Step 4: Recreate RLS policies with new table name
CREATE POLICY "Users can view their own activities"
    ON activities FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own activities"
    ON activities FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own activities"
    ON activities FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own activities"
    ON activities FOR DELETE
    USING (auth.uid() = user_id);

CREATE POLICY "Service role has full access to activities"
    ON activities FOR ALL
    USING (auth.role() = 'service_role');

-- Step 5: Re-grant permissions
GRANT ALL ON activities TO authenticated;
GRANT ALL ON activities TO service_role;

-- Note: The unique constraint on (user_id, provider_activity_id) is automatically renamed
-- Foreign key references in other tables will automatically point to the renamed table
