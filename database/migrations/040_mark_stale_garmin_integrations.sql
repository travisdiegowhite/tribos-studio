-- Migration 040: Mark stale Garmin integrations as needing reconnection
--
-- Problem: Users who connected before refresh_token_expires_at was tracked have NULL values.
-- Their tokens have expired but the system can't proactively refresh them because:
-- 1. The proactive refresh cron filters by refresh_token_expires_at
-- 2. Without this field, we can't tell if their refresh token is still valid
--
-- Solution: Mark these integrations as refresh_token_invalid so users see the reconnect prompt.
-- This affects users with:
-- - NULL refresh_token_expires_at (old integrations)
-- - Expired access tokens (token_expires_at < NOW())
-- - Not already marked as invalid

-- Mark stale integrations
UPDATE bike_computer_integrations
SET
  refresh_token_invalid = TRUE,
  updated_at = NOW()
WHERE provider = 'garmin'
  AND refresh_token_expires_at IS NULL
  AND token_expires_at < NOW()
  AND (refresh_token_invalid IS NULL OR refresh_token_invalid = FALSE);

-- Log how many were affected (visible in migration output)
DO $$
DECLARE
  affected_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO affected_count
  FROM bike_computer_integrations
  WHERE provider = 'garmin'
    AND refresh_token_invalid = TRUE
    AND refresh_token_expires_at IS NULL;

  RAISE NOTICE 'Marked % stale Garmin integrations as needing reconnection', affected_count;
END $$;
