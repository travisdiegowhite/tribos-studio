-- 075: fitness_snapshots — backfill canonical columns + drop legacy columns (§1b)
--
-- Completes the fitness_snapshots rename that began in migration 072
-- (additive canonical columns + B9 dual-write in computeWeeklySnapshot).
-- Readers cut over via Supabase column aliasing (`ctl:tfi`) in the §1b
-- PR, so consumer JS code keeps using `.ctl/.atl/.tsb/.weekly_tss`
-- identifiers; only the underlying DB read target changes.
--
-- Legacy → canonical mapping:
--   ctl                  → tfi                  (Training Fitness Index)
--   atl                  → afi                  (Acute Fatigue Index)
--   tsb                  → form_score           (Form Score)
--   weekly_tss           → weekly_rss           (weekly Ride Stress Score total)
--   avg_normalized_power → avg_effective_power  (weekly avg EP)
--
-- ⚠ DO NOT RUN THIS MIGRATION UNTIL:
--
-- 1. §1b (api/ and src/ explicit SELECT aliasing) has landed. ✓ Carried
--    by this PR.
-- 2. `select('*')` consumers in src/ (HistoricalInsights, etc.) have
--    been audited — these still spread legacy column names into JS
--    objects. Once legacy columns are dropped, those consumers will
--    see `undefined` for `.ctl/.atl/.tsb` unless the §3b identifier
--    sweep has also landed, OR the consumer has been rewritten to
--    use explicit SELECT with aliases.
-- 3. Dual-write cover verified:
--      SELECT COUNT(*) FROM fitness_snapshots
--       WHERE snapshot_week > CURRENT_DATE - INTERVAL '4 weeks'
--         AND ctl IS NOT NULL
--         AND tfi IS NULL;
--    Expected: 0.
--
-- Once preconditions hold, uncomment the DROP block below and run.

-- Step 1: Backfill canonical columns from legacy where canonical is NULL.
-- Safe to run immediately (idempotent, no reader impact).
UPDATE public.fitness_snapshots
   SET tfi = ctl
 WHERE tfi IS NULL
   AND ctl IS NOT NULL;

UPDATE public.fitness_snapshots
   SET afi = atl
 WHERE afi IS NULL
   AND atl IS NOT NULL;

UPDATE public.fitness_snapshots
   SET form_score = tsb
 WHERE form_score IS NULL
   AND tsb IS NOT NULL;

UPDATE public.fitness_snapshots
   SET weekly_rss = weekly_tss
 WHERE weekly_rss IS NULL
   AND weekly_tss IS NOT NULL;

UPDATE public.fitness_snapshots
   SET avg_effective_power = avg_normalized_power
 WHERE avg_effective_power IS NULL
   AND avg_normalized_power IS NOT NULL;

-- Step 2: Drop legacy columns (gated on §3b src/ consumer rewrite).
--
-- ALTER TABLE public.fitness_snapshots
--   DROP COLUMN IF EXISTS ctl,
--   DROP COLUMN IF EXISTS atl,
--   DROP COLUMN IF EXISTS tsb,
--   DROP COLUMN IF EXISTS weekly_tss,
--   DROP COLUMN IF EXISTS avg_normalized_power;
