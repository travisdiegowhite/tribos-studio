-- 078: planned_workouts — backfill canonical columns + drop legacy columns (§1d)
--
-- Completes the planned_workouts rename that began in migration 073.
--
-- Legacy → canonical mapping (scope limited to actual execution fields;
-- target_tss stays because it seeds plan templates and is not yet on
-- the rename list — see workoutLibrary.ts static data).
--   actual_tss        → actual_rss
--   intensity_factor  → ride_intensity
--
-- Writers: src/hooks/useTrainingPlan.ts upserts `actual_tss` when an
-- activity is linked; src/components/training/ActivityLinkingModal.jsx
-- does the same. Flip those sites to dual-write before running the
-- drop.
--
-- Readers (partial): src/stores/trainingPlannerStore.ts,
-- src/pages/TrainingDashboard.jsx, api/utils/assembleFitnessContext.js.
-- Covered by the broader §3b sweep.

-- Step 1: Backfill canonical columns (idempotent).
UPDATE public.planned_workouts
   SET actual_rss = actual_tss
 WHERE actual_rss IS NULL
   AND actual_tss IS NOT NULL;

UPDATE public.planned_workouts
   SET ride_intensity = intensity_factor
 WHERE ride_intensity IS NULL
   AND intensity_factor IS NOT NULL;

-- Step 2: Drop legacy columns (gated on writer dual-write + §3b).
--
-- ALTER TABLE public.planned_workouts
--   DROP COLUMN IF EXISTS actual_tss,
--   DROP COLUMN IF EXISTS intensity_factor;
