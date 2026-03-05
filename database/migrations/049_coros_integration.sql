-- Migration: Add COROS as an activity provider
-- Creates coros_webhook_events table and updates provider constraints

-- Update provider CHECK constraint on bike_computer_integrations
-- First drop old constraint, then add new one including 'coros'
DO $$
BEGIN
  -- Drop existing constraint if it exists (name may vary)
  ALTER TABLE bike_computer_integrations
    DROP CONSTRAINT IF EXISTS bike_computer_integrations_provider_check;

  -- Add updated constraint
  ALTER TABLE bike_computer_integrations
    ADD CONSTRAINT bike_computer_integrations_provider_check
    CHECK (provider IN ('garmin', 'wahoo', 'strava', 'coros'));
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Could not update provider constraint: %', SQLERRM;
END $$;

-- Update provider constraint on bike_computer_sync_history if it exists
DO $$
BEGIN
  ALTER TABLE bike_computer_sync_history
    DROP CONSTRAINT IF EXISTS bike_computer_sync_history_provider_check;

  ALTER TABLE bike_computer_sync_history
    ADD CONSTRAINT bike_computer_sync_history_provider_check
    CHECK (provider IN ('garmin', 'wahoo', 'strava', 'coros'));
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Could not update sync_history provider constraint: %', SQLERRM;
END $$;

-- Create table for COROS webhook events (mirrors garmin_webhook_events)
CREATE TABLE IF NOT EXISTS coros_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Event identification
  event_type TEXT NOT NULL DEFAULT 'WORKOUT', -- 'WORKOUT'
  coros_user_id TEXT NOT NULL, -- COROS openId

  -- Links to our database
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  integration_id UUID REFERENCES bike_computer_integrations(id) ON DELETE SET NULL,

  -- Workout-specific data
  workout_id TEXT, -- COROS labelId
  file_url TEXT, -- fitUrl for FIT file download
  mode INTEGER, -- COROS parent workout type
  sub_mode INTEGER, -- COROS child workout type

  -- Processing status
  processed BOOLEAN DEFAULT FALSE,
  processed_at TIMESTAMPTZ,
  process_error TEXT,
  activity_imported_id UUID REFERENCES activities(id) ON DELETE SET NULL,

  -- Retry management
  retry_count INTEGER DEFAULT 0,
  next_retry_at TIMESTAMPTZ,

  -- Raw webhook payload (for debugging)
  payload JSONB NOT NULL,

  -- Timestamps
  received_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_coros_webhooks_processed ON coros_webhook_events(processed, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_coros_webhooks_user ON coros_webhook_events(user_id);
CREATE INDEX IF NOT EXISTS idx_coros_webhooks_coros_user ON coros_webhook_events(coros_user_id);
CREATE INDEX IF NOT EXISTS idx_coros_webhooks_workout ON coros_webhook_events(workout_id);

-- Enable RLS
ALTER TABLE coros_webhook_events ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own COROS webhook events"
  ON coros_webhook_events
  FOR SELECT
  USING (auth.uid() = user_id);

-- Allow system to insert webhook events (webhooks come from COROS, not users)
CREATE POLICY "System can insert COROS webhook events"
  ON coros_webhook_events
  FOR INSERT
  WITH CHECK (true);

-- Allow system to update processing status
CREATE POLICY "System can update COROS webhook events"
  ON coros_webhook_events
  FOR UPDATE
  USING (true);

-- Service role has full access
CREATE POLICY "Service role has full access to COROS webhook events"
  ON coros_webhook_events FOR ALL
  USING (auth.role() = 'service_role');

-- Grant permissions
GRANT ALL ON coros_webhook_events TO service_role;
GRANT SELECT ON coros_webhook_events TO authenticated;

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';

-- Verification
SELECT 'COROS integration migration completed successfully' AS status;
