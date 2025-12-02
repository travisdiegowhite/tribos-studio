-- Fix bike_computer_integrations schema to match our implementation
-- Rename columns to match the naming convention in our code

-- Rename athlete_id to provider_user_id
ALTER TABLE bike_computer_integrations
RENAME COLUMN athlete_id TO provider_user_id;

-- Rename athlete_data to provider_user_data
ALTER TABLE bike_computer_integrations
RENAME COLUMN athlete_data TO provider_user_data;

-- Rename expires_at to token_expires_at for clarity
ALTER TABLE bike_computer_integrations
RENAME COLUMN expires_at TO token_expires_at;

-- Add sync_error column to track sync failures
ALTER TABLE bike_computer_integrations
ADD COLUMN IF NOT EXISTS sync_error TEXT;

-- Update comments
COMMENT ON COLUMN bike_computer_integrations.provider_user_id IS 'User ID from the provider (Wahoo, Garmin, etc.)';
COMMENT ON COLUMN bike_computer_integrations.provider_user_data IS 'Cached user information from provider (JSON)';
COMMENT ON COLUMN bike_computer_integrations.token_expires_at IS 'When the access token expires';
COMMENT ON COLUMN bike_computer_integrations.sync_error IS 'Last sync error message, if any';

-- Update index name
DROP INDEX IF EXISTS idx_bike_computer_integrations_expires_at;
CREATE INDEX IF NOT EXISTS idx_bike_computer_integrations_token_expires_at
ON bike_computer_integrations(token_expires_at);

-- Verify the changes
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'bike_computer_integrations'
ORDER BY ordinal_position;
