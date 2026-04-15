-- 074: activities — backfill canonical columns + drop legacy columns (§1a)
--
-- Completes the activities-table rename that began in migration 072
-- (which added canonical columns alongside legacy ones for B9
-- dual-write). Readers in api/ cut over to the canonical columns in the
-- §1a PR that carries this migration.
--
-- Legacy → canonical mapping:
--   normalized_power → effective_power   (EP, spec §3.2)
--   intensity_factor → ride_intensity    (RI, spec §3.3)
--   tss              → rss               (RSS, spec §3.1)
--
-- ⚠ DO NOT RUN THIS MIGRATION UNTIL:
--
-- 1. §1a (api/ reader cut-over) has landed. ✓ Carried by this PR.
-- 2. §3b (src/ JS identifier sweep) has landed — otherwise frontend
--    `select('*')` consumers still read legacy keys that no longer exist
--    (Dashboard, TrainingDashboard, PlannerPage, MyRoutes, RouteBuilder,
--    Progress, ActivityMetrics, RideAnalysisModal, etc.).
-- 3. Dual-write covers every ingestion path. Sanity check before drop:
--      SELECT COUNT(*) FROM activities
--       WHERE created_at > NOW() - INTERVAL '24 hours'
--         AND normalized_power IS NOT NULL
--         AND effective_power IS NULL;
--    Expected: 0. Non-zero means a writer is still single-writing the
--    legacy column.
--
-- Once those preconditions hold, uncomment the DROP block below and run.

-- Step 1: Backfill canonical columns from legacy where canonical is NULL.
-- Historical rows predate migration 072's additive columns, so the
-- canonical columns may be NULL even when legacy ones are populated.
-- Safe to run now — this is idempotent and has no reader impact.
UPDATE public.activities
   SET effective_power = normalized_power
 WHERE effective_power IS NULL
   AND normalized_power IS NOT NULL;

UPDATE public.activities
   SET ride_intensity = intensity_factor
 WHERE ride_intensity IS NULL
   AND intensity_factor IS NOT NULL;

UPDATE public.activities
   SET rss = tss
 WHERE rss IS NULL
   AND tss IS NOT NULL;

-- Step 2: Drop legacy columns (gated on §3b landing).
--
-- ALTER TABLE public.activities
--   DROP COLUMN IF EXISTS normalized_power,
--   DROP COLUMN IF EXISTS intensity_factor,
--   DROP COLUMN IF EXISTS tss;
