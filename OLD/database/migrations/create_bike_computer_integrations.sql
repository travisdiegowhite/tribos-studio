-- Create bike_computer_integrations table for Garmin, Wahoo, and other device integrations
-- This table stores OAuth tokens and connection information for third-party bike computers

CREATE TABLE IF NOT EXISTS bike_computer_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('garmin', 'wahoo', 'strava')),

  -- OAuth tokens (stored securely)
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,

  -- Provider user info
  provider_user_id TEXT,
  provider_user_data JSONB,

  -- Sync configuration
  sync_enabled BOOLEAN DEFAULT true,
  last_sync_at TIMESTAMPTZ,
  sync_error TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Ensure one integration per user per provider
  UNIQUE(user_id, provider)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_bike_computer_integrations_user_id
  ON bike_computer_integrations(user_id);

CREATE INDEX IF NOT EXISTS idx_bike_computer_integrations_provider
  ON bike_computer_integrations(provider);

CREATE INDEX IF NOT EXISTS idx_bike_computer_integrations_token_expires_at
  ON bike_computer_integrations(token_expires_at);

-- Enable Row Level Security (RLS)
ALTER TABLE bike_computer_integrations ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only access their own integrations
CREATE POLICY "Users can view their own bike computer integrations"
  ON bike_computer_integrations
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own bike computer integrations"
  ON bike_computer_integrations
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own bike computer integrations"
  ON bike_computer_integrations
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own bike computer integrations"
  ON bike_computer_integrations
  FOR DELETE
  USING (auth.uid() = user_id);

-- Create sync history table
CREATE TABLE IF NOT EXISTS bike_computer_sync_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('garmin', 'wahoo', 'strava')),

  -- Sync results
  activities_fetched INTEGER DEFAULT 0,
  activities_imported INTEGER DEFAULT 0,
  activities_skipped INTEGER DEFAULT 0,
  sync_errors JSONB,

  -- Timestamp
  synced_at TIMESTAMPTZ DEFAULT NOW(),

  -- Index for querying
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for sync history
CREATE INDEX IF NOT EXISTS idx_sync_history_user_id
  ON bike_computer_sync_history(user_id);

CREATE INDEX IF NOT EXISTS idx_sync_history_provider
  ON bike_computer_sync_history(provider);

CREATE INDEX IF NOT EXISTS idx_sync_history_synced_at
  ON bike_computer_sync_history(synced_at DESC);

-- Enable RLS for sync history
ALTER TABLE bike_computer_sync_history ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only view their own sync history
CREATE POLICY "Users can view their own sync history"
  ON bike_computer_sync_history
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own sync history"
  ON bike_computer_sync_history
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Add columns to routes table if they don't exist
ALTER TABLE routes
  ADD COLUMN IF NOT EXISTS garmin_id TEXT,
  ADD COLUMN IF NOT EXISTS wahoo_id TEXT,
  ADD COLUMN IF NOT EXISTS garmin_url TEXT,
  ADD COLUMN IF NOT EXISTS wahoo_url TEXT;

-- Create indexes for external IDs
CREATE INDEX IF NOT EXISTS idx_routes_garmin_id
  ON routes(garmin_id) WHERE garmin_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_routes_wahoo_id
  ON routes(wahoo_id) WHERE wahoo_id IS NOT NULL;

-- Add comments for documentation
COMMENT ON TABLE bike_computer_integrations IS 'Stores OAuth tokens and connection info for bike computer integrations (Garmin, Wahoo, etc.)';
COMMENT ON COLUMN bike_computer_integrations.provider IS 'The bike computer/fitness service provider (garmin, wahoo, strava)';
COMMENT ON COLUMN bike_computer_integrations.access_token IS 'OAuth access token for API requests';
COMMENT ON COLUMN bike_computer_integrations.refresh_token IS 'OAuth refresh token (for OAuth 2.0) or token secret (for OAuth 1.0a)';
COMMENT ON COLUMN bike_computer_integrations.provider_user_id IS 'User ID from the provider service';
COMMENT ON COLUMN bike_computer_integrations.provider_user_data IS 'Cached user profile data from provider';
COMMENT ON COLUMN bike_computer_integrations.sync_enabled IS 'Whether automatic syncing is enabled';

COMMENT ON TABLE bike_computer_sync_history IS 'History of sync operations from bike computer services';
COMMENT ON COLUMN bike_computer_sync_history.activities_fetched IS 'Number of activities retrieved from provider';
COMMENT ON COLUMN bike_computer_sync_history.activities_imported IS 'Number of activities successfully imported';
COMMENT ON COLUMN bike_computer_sync_history.activities_skipped IS 'Number of activities skipped (duplicates)';
COMMENT ON COLUMN bike_computer_sync_history.sync_errors IS 'Array of error objects that occurred during sync';
