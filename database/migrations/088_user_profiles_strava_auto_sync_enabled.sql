-- ============================================================================
-- Migration 088: user_profiles.strava_auto_sync_enabled
--
-- When a user has Garmin or Wahoo connected, those FIT-capable providers are
-- the source of truth. Strava's webhook ingestion still races them on every
-- ride and creates a Strava-first row that Garmin's takeover branch is not
-- always able to fully enrich, leaving rides with summary-only data.
--
-- This flag lets us suppress Strava activity auto-import when the user has a
-- higher-priority device-direct provider connected. Default TRUE preserves the
-- behavior for everyone today; the auth success path for Garmin and Wahoo will
-- flip it to FALSE on first connection so existing users only see the new
-- behavior after a deliberate connection event.
--
-- Strava OAuth, token refresh, route export, segment matching, and other
-- non-ingestion features are unaffected.
-- ============================================================================

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS strava_auto_sync_enabled BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN user_profiles.strava_auto_sync_enabled IS
  'When FALSE and the user has a Garmin or Wahoo bike_computer_integrations row, Strava webhook activity creates and Strava manual sync are skipped. The Strava OAuth connection itself stays alive for token refresh and non-ingestion features. Auto-flipped to FALSE when the user first connects Garmin or Wahoo; user can override in Settings.';
