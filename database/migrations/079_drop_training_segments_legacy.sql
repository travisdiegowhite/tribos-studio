-- 079: training_segments — backfill canonical columns + drop legacy columns (§1e)
--
-- Completes the training_segments rename that began in migration 073.
--
-- Legacy → canonical mapping:
--   normalized_power      → effective_power
--   mean_normalized_power → mean_effective_power
--
-- Writers: api/utils/segmentAnalysisPipeline.js — populates
-- normalized_power from stream analysis. Dual-write gap to close before
-- running the drop.
--
-- Readers: api/utils/segmentAnalysisPipeline.js,
-- api/utils/workoutSegmentMatcher.js, api/segment-analysis.js (the
-- segment-analysis SELECT at line 253 pulls normalized_power from the
-- joined training_segment_rides rows — that's a related but separate
-- table; verify its rename status if it also needs backfill).
--
-- ⚠ Note on `workout_templates.intensity_factor`:
-- The remaining-work doc lists training_plan_templates for the
-- intensity_factor rename, but the column actually lives on
-- workout_templates (migration 011 line 83). Migration 073 did NOT add
-- a canonical twin. Leaving that rename to a future PR once the admin
-- workout template UI is ready — it's low-traffic and deferrable.

-- Step 1: Backfill (idempotent).
UPDATE public.training_segments
   SET effective_power = normalized_power
 WHERE effective_power IS NULL
   AND normalized_power IS NOT NULL;

UPDATE public.training_segments
   SET mean_effective_power = mean_normalized_power
 WHERE mean_effective_power IS NULL
   AND mean_normalized_power IS NOT NULL;

-- Step 2: Drop legacy columns (gated on writer + reader cut-over).
--
-- ALTER TABLE public.training_segments
--   DROP COLUMN IF EXISTS normalized_power,
--   DROP COLUMN IF EXISTS mean_normalized_power;
