-- Strava Webhook Events Table
-- Stores incoming webhook events for async processing
-- Follows same pattern as garmin_webhook_events for consistency
--
-- Date: 2025-11-26
-- Purpose: Enable real-time activity import from Strava (including Zwift rides)

-- Create the strava_webhook_events table
CREATE TABLE IF NOT EXISTS strava_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Event identification (from Strava webhook payload)
  event_type TEXT NOT NULL DEFAULT 'activity',  -- 'activity' or 'athlete'
  aspect_type TEXT NOT NULL,                     -- 'create', 'update', 'delete'
  object_type TEXT NOT NULL,                     -- 'activity' or 'athlete'
  object_id BIGINT NOT NULL,                     -- Strava activity/athlete ID
  owner_id BIGINT NOT NULL,                      -- Strava athlete ID (who owns the object)
  subscription_id INTEGER,                       -- Our webhook subscription ID
  updates JSONB,                                 -- For 'update' events: which fields changed
  event_time BIGINT,                             -- Unix timestamp from Strava

  -- Links to our database (populated during processing)
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Processing status
  processed BOOLEAN DEFAULT FALSE,
  processed_at TIMESTAMPTZ,
  process_error TEXT,
  route_id UUID REFERENCES routes(id) ON DELETE SET NULL,  -- Created/updated route

  -- Raw payload for debugging/replay
  payload JSONB NOT NULL,

  -- Timestamps
  received_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_strava_webhook_events_processed
  ON strava_webhook_events(processed, received_at);

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
CREATE POLICY "Users can view their own webhook events"
  ON strava_webhook_events
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Service role can do everything (needed for webhook processing)
CREATE POLICY "Service role has full access to webhook events"
  ON strava_webhook_events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Add helpful comments
COMMENT ON TABLE strava_webhook_events IS 'Stores Strava webhook events for async processing. Enables real-time activity import including Zwift rides.';
COMMENT ON COLUMN strava_webhook_events.object_id IS 'Strava activity or athlete ID from the webhook';
COMMENT ON COLUMN strava_webhook_events.owner_id IS 'Strava athlete ID who owns this object - used to look up user in strava_tokens';
COMMENT ON COLUMN strava_webhook_events.aspect_type IS 'Type of change: create, update, or delete';
COMMENT ON COLUMN strava_webhook_events.updates IS 'For update events, contains the fields that changed (e.g., title, type, private)';
COMMENT ON COLUMN strava_webhook_events.processed IS 'Whether this event has been processed (success or failure)';
COMMENT ON COLUMN strava_webhook_events.process_error IS 'Error message if processing failed';
COMMENT ON COLUMN strava_webhook_events.route_id IS 'The route that was created/updated by this webhook event';

-- Verification query
SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'strava_webhook_events'
ORDER BY ordinal_position;
