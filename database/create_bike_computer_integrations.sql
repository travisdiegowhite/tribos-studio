-- Create bike_computer_integrations table for OAuth integrations
-- This matches the schema used by the Strava OAuth API

-- Create bike_computer_integrations table
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

-- Grant permissions
GRANT ALL ON bike_computer_integrations TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON bike_computer_integrations TO authenticated;

-- Enable Row Level Security (RLS)
ALTER TABLE bike_computer_integrations ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only access their own integrations
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

-- Create sync history table (optional, for tracking imports)
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
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for sync history
CREATE INDEX IF NOT EXISTS idx_sync_history_user_id
  ON bike_computer_sync_history(user_id);
CREATE INDEX IF NOT EXISTS idx_sync_history_provider
  ON bike_computer_sync_history(provider);
CREATE INDEX IF NOT EXISTS idx_sync_history_synced_at
  ON bike_computer_sync_history(synced_at DESC);

-- Grant permissions for sync history
GRANT ALL ON bike_computer_sync_history TO service_role;
GRANT SELECT, INSERT ON bike_computer_sync_history TO authenticated;

-- Enable RLS for sync history
ALTER TABLE bike_computer_sync_history ENABLE ROW LEVEL SECURITY;

-- RLS Policies for sync history
CREATE POLICY "Users can view their own sync history"
  ON bike_computer_sync_history
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own sync history"
  ON bike_computer_sync_history
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);
