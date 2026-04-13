-- Migration 067: TSS Confidence + Form Score confidence gating
--
-- Part of the Tribos Metrics rollout (Track A, PR #2). Builds on migration
-- 058 which introduced training_load_daily.tss_source / confidence but did
-- not populate them consistently and gated tss_source to a too-narrow set
-- of tiers.
--
-- Changes:
--   1. Widen tss_source CHECK to allow every tier emitted by
--      estimateTSSWithSource(): device | power | kilojoules | hr | rpe |
--      inferred. The 'device' tier is for stored TSS from the activity file
--      and 'kilojoules' is for the (NP proxy via work / FTP) tier.
--   2. Widen confidence precision from (4,2) → (4,3) so sub-0.01 deltas
--      (e.g. 0.503 vs 0.500) survive the round-trip.
--   3. Add fs_confidence — 7-day weighted rolling average of daily
--      confidence, used to gate Form Score display in the UI.

-- 1. Widen tss_source CHECK --------------------------------------------------
ALTER TABLE public.training_load_daily
  DROP CONSTRAINT IF EXISTS training_load_daily_tss_source_check;
ALTER TABLE public.training_load_daily
  ADD CONSTRAINT training_load_daily_tss_source_check
    CHECK (tss_source IS NULL OR tss_source IN
      ('device', 'power', 'kilojoules', 'hr', 'rpe', 'inferred'));

-- 2. Widen confidence precision ---------------------------------------------
ALTER TABLE public.training_load_daily
  ALTER COLUMN confidence TYPE numeric(4,3);

-- 3. fs_confidence -----------------------------------------------------------
ALTER TABLE public.training_load_daily
  ADD COLUMN IF NOT EXISTS fs_confidence numeric(4,3)
    CHECK (fs_confidence IS NULL OR (fs_confidence >= 0 AND fs_confidence <= 1));

COMMENT ON COLUMN public.training_load_daily.fs_confidence IS
  '7-day weighted average of daily TSS confidence, used to gate Form Score display.';
