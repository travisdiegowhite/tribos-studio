-- 077: plan_deviations — backfill canonical columns + drop legacy columns (§1d)
--
-- Completes the plan_deviations rename that began in migration 073.
-- Safe additive + cut-over discipline: backfill now, drop later after
-- writer dual-write + §3b identifier sweep land.
--
-- Legacy → canonical mapping:
--   planned_tss → planned_rss
--   actual_tss  → actual_rss
--   tss_delta   → rss_delta
--
-- Writers: api/process-deviation.js builds the deviation payload with
-- legacy keys (planned_tss, actual_tss, tss_delta). Flip that site to
-- dual-write before uncommenting the drop.
--
-- Readers: src/hooks/useWorkoutAdaptations.ts, src/types/training.ts
-- carry these as legacy names. The §3b identifier sweep is the natural
-- home for that rename.

-- Step 1: Backfill canonical columns (idempotent).
UPDATE public.plan_deviations
   SET planned_rss = planned_tss
 WHERE planned_rss IS NULL
   AND planned_tss IS NOT NULL;

UPDATE public.plan_deviations
   SET actual_rss = actual_tss
 WHERE actual_rss IS NULL
   AND actual_tss IS NOT NULL;

UPDATE public.plan_deviations
   SET rss_delta = tss_delta
 WHERE rss_delta IS NULL
   AND tss_delta IS NOT NULL;

-- Step 2: Drop legacy columns (gated on writer dual-write + §3b).
--
-- ALTER TABLE public.plan_deviations
--   DROP COLUMN IF EXISTS planned_tss,
--   DROP COLUMN IF EXISTS actual_tss,
--   DROP COLUMN IF EXISTS tss_delta;
