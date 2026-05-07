-- ============================================================================
-- Migration 087: user_profiles.date_of_birth
--
-- Adds the column that the event-anchored planner reads to derive age for
-- masters-recovery defaulting. Several API routes already SELECT this column
-- (sequencer-today, sequencer-event-anchored-init, sequencer-maintenance-init,
-- sequencer-daily-rollover, RecoveryModeCard); without it the prescription
-- endpoint returns HTTP 500 and anchoring surfaces a "column does not exist"
-- error to users.
--
-- The column is nullable. When NULL, the recovery-mode resolver falls back to
-- 'standard'. Users can populate it from the Profile tab in Settings.
-- ============================================================================

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS date_of_birth DATE;

COMMENT ON COLUMN user_profiles.date_of_birth IS
  'User date of birth. Optional. Used by the event-anchored planner to derive age for masters recovery defaults (>=45 conservative, 35-44 adaptive, <35 standard).';
