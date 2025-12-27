-- Migration: Create strava_webhook_events table for tracking Strava webhook events
-- This enables real-time activity import from Strava (including Zwift rides)
-- Similar structure to garmin_webhook_events for consistency
--
-- Run this in your Supabase SQL editor

-- Create the strava_webhook_events table
CREATE TABLE IF NOT EXISTS strava_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Event identification (from Strava webhook payload)
  event_type TEXT NOT NULL DEFAULT 'activity',  -- 'activity' or 'athlete'
  aspect_type TEXT NOT NULL,                     -- 'create', 'update', 'delete'
  object_id BIGINT NOT NULL,                     -- Strava activity/athlete ID
  owner_id BIGINT NOT NULL,                      -- Strava athlete ID (who owns the object)
  subscription_id INTEGER,                       -- Our webhook subscription ID
  updates JSONB,                                 -- For 'update' events: which fields changed
  event_time BIGINT,                             -- Unix timestamp from Strava

  -- Links to our database (populated during processing)
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  activity_id UUID REFERENCES activities(id) ON DELETE SET NULL,  -- Created/updated activity

  -- Processing status
  processed BOOLEAN DEFAULT FALSE,
  processed_at TIMESTAMPTZ,
  process_error TEXT,

  -- Raw payload for debugging/replay
  payload JSONB NOT NULL,

  -- Timestamps
  received_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_strava_webhook_events_processed
  ON strava_webhook_events(processed, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_strava_webhook_events_owner
  ON strava_webhook_events(owner_id);

CREATE INDEX IF NOT EXISTS idx_strava_webhook_events_object
  ON strava_webhook_events(object_id);

CREATE INDEX IF NOT EXISTS idx_strava_webhook_events_user
  ON strava_webhook_events(user_id);

CREATE INDEX IF NOT EXISTS idx_strava_webhook_events_aspect
  ON strava_webhook_events(aspect_type);

-- Enable Row Level Security
ALTER TABLE strava_webhook_events ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Users can only view their own webhook events
CREATE POLICY "Users can view their own Strava webhook events"
  ON strava_webhook_events
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Allow system to insert (webhooks come from Strava, not users)
CREATE POLICY "System can insert Strava webhook events"
  ON strava_webhook_events
  FOR INSERT
  WITH CHECK (true);

-- Allow system to update processing status
CREATE POLICY "System can update Strava webhook events"
  ON strava_webhook_events
  FOR UPDATE
  USING (true);

-- Service role has full access (needed for webhook processing)
CREATE POLICY "Service role has full access to Strava webhook events"
  ON strava_webhook_events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Grant permissions
GRANT ALL ON strava_webhook_events TO service_role;
GRANT SELECT ON strava_webhook_events TO authenticated;

-- Add helpful comments
COMMENT ON TABLE strava_webhook_events IS 'Stores Strava webhook events for tracking and debugging. Enables real-time activity import including Zwift rides.';
COMMENT ON COLUMN strava_webhook_events.object_id IS 'Strava activity or athlete ID from the webhook';
COMMENT ON COLUMN strava_webhook_events.owner_id IS 'Strava athlete ID who owns this object - used to look up user in bike_computer_integrations';
COMMENT ON COLUMN strava_webhook_events.aspect_type IS 'Type of change: create, update, or delete';
COMMENT ON COLUMN strava_webhook_events.updates IS 'For update events, contains the fields that changed (e.g., title, type, private)';
COMMENT ON COLUMN strava_webhook_events.processed IS 'Whether this event has been processed (success or failure)';
COMMENT ON COLUMN strava_webhook_events.process_error IS 'Error message if processing failed';
COMMENT ON COLUMN strava_webhook_events.activity_id IS 'The activity that was created/updated by this webhook event';

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';

-- Verification
SELECT 'strava_webhook_events table created successfully' AS status;
