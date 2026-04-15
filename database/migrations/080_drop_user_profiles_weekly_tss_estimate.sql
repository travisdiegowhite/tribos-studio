-- 080: user_profiles.weekly_tss_estimate → weekly_rss_estimate (§1f)
--
-- Migration 073 added `weekly_rss_estimate` as a canonical twin of
-- `weekly_tss_estimate` on user_profiles. The onboarding flow writer
-- (`api/onboarding-complete.js`) is updated in the §1f PR to dual-write
-- both columns. This migration backfills historical rows + leaves the
-- drop commented out until we confirm no frontend reads the legacy
-- column.
--
-- Readers of weekly_tss_estimate today:
-- - `src/types/database.ts` (type definition — keep during transition)
-- - none in runtime read paths that I could find; onboarding seeds it
--   once, then TFI/AFI adaptive-tau uses it as a starting bootstrap.
--
-- Once this migration is run + the drop uncommented + deployed, do a
-- final grep to confirm no live code references the legacy column.

-- Step 1: Backfill (idempotent).
UPDATE public.user_profiles
   SET weekly_rss_estimate = weekly_tss_estimate
 WHERE weekly_rss_estimate IS NULL
   AND weekly_tss_estimate IS NOT NULL;

-- Step 2: Drop legacy column (gated on reader audit).
--
-- ALTER TABLE public.user_profiles
--   DROP COLUMN IF EXISTS weekly_tss_estimate;
