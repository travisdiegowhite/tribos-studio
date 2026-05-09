-- 089: planned_workouts — add canonical target_rss column + backfill
--
-- Closes the gap left by migration 073, which added `actual_rss` to
-- `planned_workouts` but deliberately skipped `target_rss` (the rename
-- was deferred because src/data/workoutLibrary.ts seeds templates with
-- target_tss). See docs/planned-workouts-target-rss-followup.md for
-- the full context.
--
-- Live impact this fixes:
--   * api/correction-proposal-apply.js (lines 130, 149, 156, 165, 170,
--     184) SELECTs and UPDATEs target_rss. Every "coach correction"
--     workflow that adjusts target intensity has been returning a
--     Supabase 42703 ("column 'target_rss' does not exist"), swallowed
--     upstream as a generic toast.
--   * api/utils/temporalAnchor.js:279 SELECTs target_rss in the same
--     way; same 42703 surfaces in the temporal-anchor pipeline.
--   * api/utils/tfiProjection.js:42 reads w.target_rss and falls back
--     to 0 — projections silently look like there's no planned load.
--
-- This migration is part of the metrics-rollout FREEZE policy
-- (docs/METRICS_ROLLOUT_FREEZE.md). It is *not* a step toward dropping
-- target_tss; both columns are expected to coexist indefinitely. The
-- workoutLibrary template generators continue to seed target_tss; new
-- writers added under the freeze should write canonical target_rss
-- (or dual-write where the same row may be re-read by legacy callers).

-- Step 1: Add the canonical column (idempotent).
ALTER TABLE public.planned_workouts
  ADD COLUMN IF NOT EXISTS target_rss INTEGER;

-- Step 2: Backfill from target_tss for every existing row that has a
-- legacy value but no canonical value yet. Idempotent under re-run.
UPDATE public.planned_workouts
   SET target_rss = target_tss
 WHERE target_rss IS NULL
   AND target_tss IS NOT NULL;

COMMENT ON COLUMN public.planned_workouts.target_rss IS
  'Target Ride Stress Score per spec §2. Coexists with target_tss under '
  'the metrics-rollout freeze (see docs/METRICS_ROLLOUT_FREEZE.md). New '
  'writers should populate target_rss; readers should prefer canonical '
  'with legacy fallback (target_rss ?? target_tss).';
