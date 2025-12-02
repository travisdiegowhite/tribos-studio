-- Bike Computer Integration Schema
-- Stores OAuth tokens for direct bike computer integrations (Wahoo, Garmin, etc.)

-- Create the bike_computer_integrations table
CREATE TABLE IF NOT EXISTS bike_computer_integrations (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    provider text NOT NULL CHECK (provider IN ('wahoo', 'garmin', 'hammerhead')),
    access_token text NOT NULL,
    refresh_token text,
    expires_at timestamp WITH TIME ZONE,
    athlete_id text, -- Provider's user ID
    athlete_data jsonb, -- Cached athlete/user information from provider
    scopes text[], -- OAuth scopes granted
    webhook_id text, -- For providers that use webhooks (e.g., Garmin)
    last_sync_at timestamp WITH TIME ZONE,
    sync_enabled boolean DEFAULT true,
    created_at timestamp WITH TIME ZONE DEFAULT now(),
    updated_at timestamp WITH TIME ZONE DEFAULT now(),

    -- Ensure one integration per user per provider
    UNIQUE(user_id, provider)
);

-- Enable Row Level Security
ALTER TABLE bike_computer_integrations ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only access their own integrations
CREATE POLICY "Users can only access their own bike computer integrations"
    ON bike_computer_integrations
    FOR ALL USING (auth.uid() = user_id);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_bike_computer_integrations_user_id
    ON bike_computer_integrations(user_id);
CREATE INDEX IF NOT EXISTS idx_bike_computer_integrations_provider
    ON bike_computer_integrations(provider);
CREATE INDEX IF NOT EXISTS idx_bike_computer_integrations_user_provider
    ON bike_computer_integrations(user_id, provider);
CREATE INDEX IF NOT EXISTS idx_bike_computer_integrations_expires_at
    ON bike_computer_integrations(expires_at);
CREATE INDEX IF NOT EXISTS idx_bike_computer_integrations_last_sync
    ON bike_computer_integrations(last_sync_at);

-- Create updated_at trigger
CREATE TRIGGER update_bike_computer_integrations_updated_at
    BEFORE UPDATE ON bike_computer_integrations
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- Grant appropriate permissions
GRANT ALL ON bike_computer_integrations TO service_role;
GRANT SELECT ON bike_computer_integrations TO authenticated;

-- Add comments for documentation
COMMENT ON TABLE bike_computer_integrations IS 'Stores OAuth tokens for bike computer integrations';
COMMENT ON COLUMN bike_computer_integrations.provider IS 'Integration provider: wahoo, garmin, or hammerhead';
COMMENT ON COLUMN bike_computer_integrations.access_token IS 'Provider API access token - sensitive data';
COMMENT ON COLUMN bike_computer_integrations.refresh_token IS 'Provider API refresh token - sensitive data';
COMMENT ON COLUMN bike_computer_integrations.expires_at IS 'When the access token expires';
COMMENT ON COLUMN bike_computer_integrations.athlete_data IS 'Cached user information from provider';
COMMENT ON COLUMN bike_computer_integrations.scopes IS 'OAuth scopes granted by user';
COMMENT ON COLUMN bike_computer_integrations.webhook_id IS 'Webhook subscription ID for push-based providers';
COMMENT ON COLUMN bike_computer_integrations.last_sync_at IS 'Last successful activity sync timestamp';
COMMENT ON COLUMN bike_computer_integrations.sync_enabled IS 'Whether automatic syncing is enabled';


-- Create sync history table to track imports
CREATE TABLE IF NOT EXISTS bike_computer_sync_history (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    integration_id uuid REFERENCES bike_computer_integrations(id) ON DELETE CASCADE,
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    provider text NOT NULL,
    activity_id text NOT NULL, -- Provider's activity ID
    route_id uuid REFERENCES routes(id) ON DELETE SET NULL, -- Our route record
    synced_at timestamp WITH TIME ZONE DEFAULT now(),
    sync_status text NOT NULL CHECK (sync_status IN ('success', 'error', 'skipped')),
    error_message text,
    activity_data jsonb, -- Raw activity data from provider

    -- Prevent duplicate imports
    UNIQUE(integration_id, activity_id)
);

-- Enable RLS on sync history
ALTER TABLE bike_computer_sync_history ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only see their own sync history
CREATE POLICY "Users can only see their own sync history"
    ON bike_computer_sync_history
    FOR ALL USING (auth.uid() = user_id);

-- Indexes for sync history
CREATE INDEX IF NOT EXISTS idx_sync_history_integration
    ON bike_computer_sync_history(integration_id);
CREATE INDEX IF NOT EXISTS idx_sync_history_user
    ON bike_computer_sync_history(user_id);
CREATE INDEX IF NOT EXISTS idx_sync_history_route
    ON bike_computer_sync_history(route_id);
CREATE INDEX IF NOT EXISTS idx_sync_history_activity
    ON bike_computer_sync_history(activity_id);
CREATE INDEX IF NOT EXISTS idx_sync_history_synced_at
    ON bike_computer_sync_history(synced_at DESC);

-- Grant permissions
GRANT ALL ON bike_computer_sync_history TO service_role;
GRANT SELECT ON bike_computer_sync_history TO authenticated;

COMMENT ON TABLE bike_computer_sync_history IS 'Tracks history of activity imports from bike computers';
COMMENT ON COLUMN bike_computer_sync_history.activity_id IS 'Unique activity ID from provider';
COMMENT ON COLUMN bike_computer_sync_history.route_id IS 'Reference to imported route in our database';
COMMENT ON COLUMN bike_computer_sync_history.sync_status IS 'Import status: success, error, or skipped';
COMMENT ON COLUMN bike_computer_sync_history.activity_data IS 'Raw activity data for debugging';
