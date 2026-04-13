-- 066: Adaptive EWA time constants for per-athlete CTL/ATL
--
-- Adds three NULLable columns to user_profiles so the fitness/fatigue
-- exponentially-weighted averages can use per-athlete time constants
-- instead of the hardcoded 42 / 7 defaults:
--
--   metrics_age     — athlete age in years (gating input; adaptive tau only
--                     applies when this is set)
--   ewa_long_tau    — per-athlete tau for the long EWA (fitness / CTL);
--                     NULL means "use the 42-day default"
--   ewa_short_tau   — per-athlete tau for the short EWA (fatigue / ATL);
--                     NULL means "use the 7-day default"
--
-- All columns default to NULL. Existing behavior is preserved for every
-- user until they enter their age in Settings and the nightly cron
-- (/api/recompute-user-tau) populates the tau columns.

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS metrics_age INTEGER
    CHECK (metrics_age IS NULL OR (metrics_age >= 13 AND metrics_age <= 100));

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS ewa_long_tau NUMERIC(5,2)
    CHECK (ewa_long_tau IS NULL OR (ewa_long_tau >= 20 AND ewa_long_tau <= 90));

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS ewa_short_tau NUMERIC(5,2)
    CHECK (ewa_short_tau IS NULL OR (ewa_short_tau >= 3 AND ewa_short_tau <= 21));

COMMENT ON COLUMN user_profiles.metrics_age IS 'Athlete age in years. Required before adaptive EWA time constants apply; NULL means fall back to 42/7-day defaults.';
COMMENT ON COLUMN user_profiles.ewa_long_tau IS 'Per-athlete tau for the long EWA (fitness / CTL), populated by the nightly adaptive-tau cron. NULL means use default 42.';
COMMENT ON COLUMN user_profiles.ewa_short_tau IS 'Per-athlete tau for the short EWA (fatigue / ATL), populated by the nightly adaptive-tau cron. NULL means use default 7.';
