-- Migration: Add token refresh lock for Garmin integrations
-- Purpose: Prevent race conditions when multiple processes try to refresh the same token
-- The lock prevents two concurrent webhook handlers from both trying to refresh,
-- which would cause the second one to fail (Garmin invalidates old refresh tokens)

-- Add refresh lock column to bike_computer_integrations
ALTER TABLE bike_computer_integrations
  ADD COLUMN IF NOT EXISTS refresh_lock_until TIMESTAMPTZ DEFAULT NULL;

-- Add refresh token expiration tracking (Garmin refresh tokens last ~90 days)
ALTER TABLE bike_computer_integrations
  ADD COLUMN IF NOT EXISTS refresh_token_expires_at TIMESTAMPTZ DEFAULT NULL;

-- Add index for finding locked integrations
CREATE INDEX IF NOT EXISTS idx_integrations_refresh_lock
  ON bike_computer_integrations(refresh_lock_until)
  WHERE refresh_lock_until IS NOT NULL;

-- Comment explaining the lock mechanism
COMMENT ON COLUMN bike_computer_integrations.refresh_lock_until IS
  'Timestamp until which the token refresh lock is held. If NULL or in the past, no lock is active. Used to prevent concurrent refresh attempts.';

COMMENT ON COLUMN bike_computer_integrations.refresh_token_expires_at IS
  'When the refresh token expires (~90 days for Garmin). User needs to reauthorize before this date.';
