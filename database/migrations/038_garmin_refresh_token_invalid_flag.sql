-- Migration: Add refresh_token_invalid flag for Garmin integrations
-- Purpose: Track when a refresh token has been rejected by Garmin (400/401 errors)
-- This allows the UI to show users when they need to reconnect their Garmin account
-- instead of repeatedly attempting (and failing) token refresh

-- Add refresh_token_invalid column to bike_computer_integrations
ALTER TABLE bike_computer_integrations
  ADD COLUMN IF NOT EXISTS refresh_token_invalid BOOLEAN DEFAULT FALSE;

-- Comment explaining the flag
COMMENT ON COLUMN bike_computer_integrations.refresh_token_invalid IS
  'True when Garmin has rejected the refresh token (400/401 error). User must reconnect their account. Reset to false on successful OAuth reconnect or token refresh.';

-- Index for finding integrations with invalid refresh tokens (for admin monitoring)
CREATE INDEX IF NOT EXISTS idx_integrations_refresh_token_invalid
  ON bike_computer_integrations(refresh_token_invalid)
  WHERE refresh_token_invalid = TRUE;
