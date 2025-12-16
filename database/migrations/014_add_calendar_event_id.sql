-- Migration: Add Google Calendar event tracking to scheduled_workouts
-- This allows workouts to be synced with Google Calendar

-- Add google_calendar_event_id column to scheduled_workouts
ALTER TABLE scheduled_workouts
ADD COLUMN IF NOT EXISTS google_calendar_event_id TEXT;

-- Add index for looking up workouts by their calendar event ID
CREATE INDEX IF NOT EXISTS idx_scheduled_workouts_calendar_event
ON scheduled_workouts(google_calendar_event_id)
WHERE google_calendar_event_id IS NOT NULL;

-- Add calendar_sync_status column for tracking sync state
ALTER TABLE scheduled_workouts
ADD COLUMN IF NOT EXISTS calendar_sync_status TEXT DEFAULT 'not_synced'
CHECK (calendar_sync_status IN ('not_synced', 'synced', 'sync_failed', 'deleted'));

-- Add last_synced_at timestamp
ALTER TABLE scheduled_workouts
ADD COLUMN IF NOT EXISTS calendar_synced_at TIMESTAMPTZ;

-- Comment on columns for documentation
COMMENT ON COLUMN scheduled_workouts.google_calendar_event_id IS 'The Google Calendar event ID for this workout';
COMMENT ON COLUMN scheduled_workouts.calendar_sync_status IS 'Status of calendar synchronization: not_synced, synced, sync_failed, deleted';
COMMENT ON COLUMN scheduled_workouts.calendar_synced_at IS 'Timestamp when the workout was last synced to Google Calendar';
