-- 069: Adaptive EWA tau rename — spec §3.4 / §3.5 (part of B1)
--
-- Adds tfi_tau / afi_tau alongside the existing ewa_long_tau /
-- ewa_short_tau columns (from migration 066). This is the first half
-- of the safe additive + cut-over rollout (D5): new columns land here,
-- dual-write ships in api/utils/adaptiveTau.js, and the reader cut-over
-- + old-column drops happen in B3 / B4.
--
-- Spec rename: ewa_long_tau → tfi_tau (Training Fitness Index),
--              ewa_short_tau → afi_tau (Acute Fatigue Index).
--
-- Bounds match 066 so the eventual drop is a pure column removal and
-- not a values migration. metrics_age already exists on user_profiles
-- from 066, so it is NOT re-added here.

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS tfi_tau INTEGER
    CHECK (tfi_tau IS NULL OR (tfi_tau >= 20 AND tfi_tau <= 90));

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS afi_tau NUMERIC(4,1)
    CHECK (afi_tau IS NULL OR (afi_tau >= 3 AND afi_tau <= 21));

COMMENT ON COLUMN user_profiles.tfi_tau IS
  'Per-athlete tau for Training Fitness Index (TFI) EWA. Spec §3.4 discrete age brackets. Populated by the adaptive-tau cron when metrics_age is set; NULL means fall back to the 42-day default.';
COMMENT ON COLUMN user_profiles.afi_tau IS
  'Per-athlete tau for Acute Fatigue Index (AFI) EWA. Spec §3.5 discrete age brackets. Populated by the adaptive-tau cron when metrics_age is set; NULL means fall back to the 7-day default.';
