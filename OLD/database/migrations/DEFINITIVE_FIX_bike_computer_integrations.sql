-- DEFINITIVE FIX: Drop and recreate bike_computer_integrations with correct schema
-- This fixes 406 errors by ensuring table exists with proper permissions

-- Drop existing tables if they exist (to clear any wrong schema)
DROP TABLE IF EXISTS bike_computer_sync_history CASCADE;
DROP TABLE IF EXISTS bike_computer_integrations CASCADE;

-- Create bike_computer_integrations table with correct schema
CREATE TABLE bike_computer_integrations (
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
CREATE INDEX idx_bike_computer_integrations_user_id ON bike_computer_integrations(user_id);
CREATE INDEX idx_bike_computer_integrations_provider ON bike_computer_integrations(provider);
CREATE INDEX idx_bike_computer_integrations_token_expires_at ON bike_computer_integrations(token_expires_at);

-- CRITICAL: Grant permissions (this was missing!)
GRANT ALL ON bike_computer_integrations TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON bike_computer_integrations TO authenticated;

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
CREATE TABLE bike_computer_sync_history (
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
CREATE INDEX idx_sync_history_user_id ON bike_computer_sync_history(user_id);
CREATE INDEX idx_sync_history_provider ON bike_computer_sync_history(provider);
CREATE INDEX idx_sync_history_synced_at ON bike_computer_sync_history(synced_at DESC);

-- CRITICAL: Grant permissions (this was missing!)
GRANT ALL ON bike_computer_sync_history TO service_role;
GRANT SELECT, INSERT ON bike_computer_sync_history TO authenticated;

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
ALTER TABLE routes ADD COLUMN IF NOT EXISTS garmin_id TEXT;
ALTER TABLE routes ADD COLUMN IF NOT EXISTS wahoo_id TEXT;
ALTER TABLE routes ADD COLUMN IF NOT EXISTS garmin_url TEXT;
ALTER TABLE routes ADD COLUMN IF NOT EXISTS wahoo_url TEXT;

-- Create indexes for external IDs
CREATE INDEX IF NOT EXISTS idx_routes_garmin_id ON routes(garmin_id) WHERE garmin_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_routes_wahoo_id ON routes(wahoo_id) WHERE wahoo_id IS NOT NULL;

-- Force PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';

-- Verify tables were created
SELECT
  table_name,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = t.table_name) as column_count
FROM information_schema.tables t
WHERE table_schema = 'public'
  AND table_name IN ('bike_computer_integrations', 'bike_computer_sync_history')
ORDER BY table_name;

-- Verify RLS policies
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE tablename IN ('bike_computer_integrations', 'bike_computer_sync_history')
ORDER BY tablename, policyname;

-- Verify permissions
SELECT
  table_name,
  grantee,
  string_agg(privilege_type, ', ') as privileges
FROM information_schema.table_privileges
WHERE table_name IN ('bike_computer_integrations', 'bike_computer_sync_history')
  AND grantee IN ('service_role', 'authenticated', 'anon')
GROUP BY table_name, grantee
ORDER BY table_name, grantee;
