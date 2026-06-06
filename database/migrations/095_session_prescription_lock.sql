-- 095_session_prescription_lock.sql
--
-- The daily rollover (api/sequencer-daily-rollover.js) regenerates the next 7
-- days of session_prescriptions from the base generator every night. Without a
-- marker, that would clobber any change the athlete explicitly Applied from a
-- Coach Intel proposal (Phase 1 rebalance or Phase 2 progression) within a day.
--
-- `locked` marks a prescription as a confirmed, athlete-applied change. The
-- rollover skips locked dates when regenerating. Re-anchoring a sequence
-- (sequencer-event-anchored-init, replace=true) still overwrites — that's a
-- fresh plan by intent.

ALTER TABLE public.session_prescriptions
  ADD COLUMN IF NOT EXISTS locked BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.session_prescriptions.locked IS
  'true = athlete-applied change (via a block_modifications proposal); the daily rollover must not regenerate over it.';
