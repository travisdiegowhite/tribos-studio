-- Migration: Update bike_computer_integrations schema to match API code
-- This adds provider_user_data (JSONB) and removes columns the API doesn't use

-- Add the missing provider_user_data column (JSONB)
ALTER TABLE bike_computer_integrations
ADD COLUMN IF NOT EXISTS provider_user_data JSONB;

-- Optional: Drop columns that the current API code doesn't use
-- (Commenting these out in case you want to keep them for other providers)
-- ALTER TABLE bike_computer_integrations DROP COLUMN IF EXISTS provider_username;
-- ALTER TABLE bike_computer_integrations DROP COLUMN IF EXISTS scopes;
-- ALTER TABLE bike_computer_integrations DROP COLUMN IF EXISTS status;
-- ALTER TABLE bike_computer_integrations DROP COLUMN IF EXISTS oauth_token_secret;
-- ALTER TABLE bike_computer_integrations DROP COLUMN IF EXISTS webhook_id;
-- ALTER TABLE bike_computer_integrations DROP COLUMN IF EXISTS webhook_verified;
-- ALTER TABLE bike_computer_integrations DROP COLUMN IF EXISTS error_message;

-- Verify the column was added
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'bike_computer_integrations'
  AND column_name = 'provider_user_data';
