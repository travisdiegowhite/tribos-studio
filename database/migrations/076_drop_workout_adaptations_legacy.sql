-- 076: workout_adaptations — backfill canonical columns + drop legacy columns (§1c)
--
-- Completes the workout_adaptations rename that began in migration 073.
-- The spec §2 canonical columns exist; writers still only populate legacy
-- ones. This migration backfills historical rows + leaves the drop
-- commented out pending §3b (the src/ JS identifier sweep that retires
-- every `.planned_tss` / `.actual_tss` / `.tss_delta` object access).
--
-- Legacy → canonical mapping on workout_adaptations:
--   planned_tss              → planned_rss
--   actual_tss               → actual_rss
--   planned_intensity_factor → planned_ride_intensity
--   actual_intensity_factor  → actual_ride_intensity
--   actual_normalized_power  → actual_effective_power
--   ctg_at_time              → tfi_at_time   (B10 fixed the typo on the source side too)
--   atl_at_time              → afi_at_time
--   tsb_at_time              → form_score_at_time
--
-- ⚠ DO NOT RUN THE DROP BLOCK UNTIL:
--
-- 1. Writers dual-write both columns. Today `src/hooks/useWorkoutAdaptations.ts`,
--    `src/utils/adaptationTrigger.ts`, and `src/utils/adaptationDetection.ts`
--    only populate the legacy names.
-- 2. The §3b identifier sweep has renamed every `.planned_tss`,
--    `.actual_tss`, `.tss_delta`, etc. consumer, or those readers have
--    been switched to explicit aliased SELECTs (`planned_tss:planned_rss`).

-- Step 1: Backfill canonical columns from legacy (idempotent, safe).
UPDATE public.workout_adaptations
   SET planned_rss = planned_tss
 WHERE planned_rss IS NULL
   AND planned_tss IS NOT NULL;

UPDATE public.workout_adaptations
   SET actual_rss = actual_tss
 WHERE actual_rss IS NULL
   AND actual_tss IS NOT NULL;

UPDATE public.workout_adaptations
   SET planned_ride_intensity = planned_intensity_factor
 WHERE planned_ride_intensity IS NULL
   AND planned_intensity_factor IS NOT NULL;

UPDATE public.workout_adaptations
   SET actual_ride_intensity = actual_intensity_factor
 WHERE actual_ride_intensity IS NULL
   AND actual_intensity_factor IS NOT NULL;

UPDATE public.workout_adaptations
   SET actual_effective_power = actual_normalized_power
 WHERE actual_effective_power IS NULL
   AND actual_normalized_power IS NOT NULL;

-- The `tfi_at_time` / `afi_at_time` / `form_score_at_time` backfill
-- depends on which legacy column actually carries the value. The table
-- historically has `ctg_at_time` (typo for "ctl"), `atl_at_time`, and
-- `tsb_at_time`. Backfill each conditionally.
UPDATE public.workout_adaptations
   SET tfi_at_time = ctg_at_time
 WHERE tfi_at_time IS NULL
   AND ctg_at_time IS NOT NULL;

UPDATE public.workout_adaptations
   SET afi_at_time = atl_at_time
 WHERE afi_at_time IS NULL
   AND atl_at_time IS NOT NULL;

UPDATE public.workout_adaptations
   SET form_score_at_time = tsb_at_time
 WHERE form_score_at_time IS NULL
   AND tsb_at_time IS NOT NULL;

-- Step 2: Drop legacy columns (gated on writer dual-write + §3b).
--
-- ALTER TABLE public.workout_adaptations
--   DROP COLUMN IF EXISTS planned_tss,
--   DROP COLUMN IF EXISTS actual_tss,
--   DROP COLUMN IF EXISTS planned_intensity_factor,
--   DROP COLUMN IF EXISTS actual_intensity_factor,
--   DROP COLUMN IF EXISTS actual_normalized_power,
--   DROP COLUMN IF EXISTS ctg_at_time,
--   DROP COLUMN IF EXISTS atl_at_time,
--   DROP COLUMN IF EXISTS tsb_at_time;
