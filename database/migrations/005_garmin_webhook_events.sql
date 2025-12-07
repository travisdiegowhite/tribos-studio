-- Migration: Create garmin_webhook_events table for tracking webhook events
-- This logs all incoming webhooks and allows async processing

-- Create table for Garmin webhook events
CREATE TABLE IF NOT EXISTS garmin_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Event identification
  event_type TEXT NOT NULL, -- 'activity', 'health', 'backfill'
  garmin_user_id TEXT NOT NULL, -- Garmin's user ID (different from our user_id)

  -- Links to our database
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  integration_id UUID REFERENCES bike_computer_integrations(id) ON DELETE SET NULL,

  -- Activity-specific data
  activity_id TEXT, -- Garmin activity ID
  file_url TEXT, -- URL to download FIT file
  file_type TEXT, -- 'FIT', 'GPX', 'TCX'
  upload_timestamp TIMESTAMPTZ, -- When Garmin received the activity

  -- Processing status
  processed BOOLEAN DEFAULT FALSE,
  processed_at TIMESTAMPTZ,
  process_error TEXT,
  activity_imported_id UUID REFERENCES activities(id) ON DELETE SET NULL, -- Created activity after processing

  -- Raw webhook payload (for debugging)
  payload JSONB NOT NULL,

  -- Timestamps
  received_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_garmin_webhooks_processed ON garmin_webhook_events(processed, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_garmin_webhooks_user ON garmin_webhook_events(user_id);
CREATE INDEX IF NOT EXISTS idx_garmin_webhooks_garmin_user ON garmin_webhook_events(garmin_user_id);
CREATE INDEX IF NOT EXISTS idx_garmin_webhooks_activity ON garmin_webhook_events(activity_id);

-- Enable RLS
ALTER TABLE garmin_webhook_events ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own webhook events"
  ON garmin_webhook_events
  FOR SELECT
  USING (auth.uid() = user_id);

-- Allow system to insert (webhooks come from Garmin, not users)
CREATE POLICY "System can insert webhook events"
  ON garmin_webhook_events
  FOR INSERT
  WITH CHECK (true);

-- Allow system to update processing status
CREATE POLICY "System can update webhook events"
  ON garmin_webhook_events
  FOR UPDATE
  USING (true);

-- Service role has full access
CREATE POLICY "Service role has full access to webhook events"
  ON garmin_webhook_events FOR ALL
  USING (auth.role() = 'service_role');

-- Grant permissions
GRANT ALL ON garmin_webhook_events TO service_role;
GRANT SELECT ON garmin_webhook_events TO authenticated;

-- Add imported_from column to activities table if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'activities' AND column_name = 'imported_from'
  ) THEN
    ALTER TABLE activities ADD COLUMN imported_from TEXT;
  END IF;
END $$;

-- Add average_cadence column to activities table if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'activities' AND column_name = 'average_cadence'
  ) THEN
    ALTER TABLE activities ADD COLUMN average_cadence NUMERIC;
  END IF;
END $$;

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';

-- Verification
SELECT 'garmin_webhook_events table created successfully' AS status;
