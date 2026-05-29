-- ============================================================================
-- Migration 093: Garmin activity completeness model + reconciliation state
--
-- Closes the "silently summary-only" failure mode that has cost three weeks of
-- whack-a-mole on the Garmin pipeline. The pipeline tries to fill in every
-- activity with FIT streams/power/GPS, but Garmin's ACTIVITY_FILE_DATA "ping"
-- webhook arrives for only ~25-30% of activities. The processor currently
-- has no way to *flag* an activity as "we know this is missing data" — it
-- marks the webhook event processed=true and the row sits incomplete forever
-- with zero signal.
--
-- This migration introduces:
--   * activities.data_completeness — a stored, indexed completeness flag
--     ('summary_only' | 'full' | 'needs_resync' | 'unrecoverable'). NULL for
--     non-Garmin rows (Strava/fit_upload have their own ingestion paths and
--     don't populate activity_streams as a rule).
--   * activities.last_resync_requested_at / resync_attempt_count — scheduler
--     state owned by the future reconciliation cron (Phase 4).
--   * garmin_completeness_audit view — derives completeness from existing
--     data columns so we can validate the stored value (stored vs derived).
--
-- Per the metrics-rollout freeze (docs/METRICS_ROLLOUT_FREEZE.md): these are
-- net-new columns, not renames. No legacy fallback needed. Code reading them
-- treats NULL as "completeness unknown / not tracked" (i.e. non-Garmin).
-- ============================================================================

-- Step 1: New columns (idempotent).
ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS data_completeness TEXT,
  ADD COLUMN IF NOT EXISTS last_resync_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resync_attempt_count INTEGER NOT NULL DEFAULT 0;

-- Step 2: CHECK constraint on allowed states. Allows NULL for non-Garmin rows.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'activities_data_completeness_chk'
  ) THEN
    ALTER TABLE public.activities
      ADD CONSTRAINT activities_data_completeness_chk
      CHECK (data_completeness IS NULL
             OR data_completeness IN ('summary_only','full','needs_resync','unrecoverable'));
  END IF;
END $$;

-- Step 3: Derived-completeness view. Source of truth for Phase 1 backfill and
-- ongoing QA. Predicate is intentionally conservative — a row is 'full' only
-- when the type-appropriate streams/power columns are populated.
--
-- Type buckets:
--   * ride-with-power (device_watts=true on Ride/VirtualRide/GravelRide/
--     MountainBikeRide/EBikeRide): needs streams + power_curve_summary +
--     (normalized_power OR effective_power).
--   * ride-no-power (same types, device_watts=false/null): needs streams,
--     and polyline if NOT a trainer ride.
--   * run (Run/TrailRun): needs streams.
--   * any other Garmin type (Walk/Training/Swim/etc.): needs streams.
--   * non-Garmin: NULL (not tracked).
CREATE OR REPLACE VIEW public.garmin_completeness_audit AS
SELECT
  a.id,
  a.provider,
  a.type,
  a.device_watts,
  a.trainer,
  (a.activity_streams IS NOT NULL) AS has_streams,
  (a.map_summary_polyline IS NOT NULL) AS has_polyline,
  (a.power_curve_summary IS NOT NULL) AS has_pcurve,
  (a.normalized_power IS NOT NULL OR a.effective_power IS NOT NULL) AS has_np,
  a.data_completeness AS stored_completeness,
  CASE
    WHEN a.provider <> 'garmin' THEN NULL
    -- Ride with power meter: needs streams + power curve + NP
    WHEN a.type IN ('Ride','VirtualRide','GravelRide','MountainBikeRide','EBikeRide')
         AND a.device_watts = true THEN
      CASE
        WHEN a.activity_streams IS NOT NULL
             AND a.power_curve_summary IS NOT NULL
             AND (a.normalized_power IS NOT NULL OR a.effective_power IS NOT NULL)
        THEN 'full'
        ELSE 'summary_only'
      END
    -- Ride without power: needs streams (and polyline if outdoor)
    WHEN a.type IN ('Ride','VirtualRide','GravelRide','MountainBikeRide','EBikeRide') THEN
      CASE
        WHEN a.activity_streams IS NOT NULL
             AND (a.trainer = true OR a.map_summary_polyline IS NOT NULL)
        THEN 'full'
        ELSE 'summary_only'
      END
    -- Run: needs streams
    WHEN a.type IN ('Run','TrailRun') THEN
      CASE WHEN a.activity_streams IS NOT NULL THEN 'full' ELSE 'summary_only' END
    -- Any other Garmin activity type: needs streams
    ELSE
      CASE WHEN a.activity_streams IS NOT NULL THEN 'full' ELSE 'summary_only' END
  END AS derived_completeness
FROM public.activities a;

COMMENT ON VIEW public.garmin_completeness_audit IS
'QA surface: compares stored activities.data_completeness vs derived value. '
'Used by the reconciliation cron health endpoint and one-shot SELECT to '
'verify backfill correctness.';

-- Step 4: One-shot backfill of stored column from the derived value. Only
-- touches Garmin rows; non-Garmin stays NULL. Does NOT mark anything as
-- needs_resync/unrecoverable — Phase 4's reconciliation cron owns those
-- transitions. Anything not 'full' starts as 'summary_only' and the cron
-- decides whether to give up.
UPDATE public.activities a
SET data_completeness = v.derived_completeness
FROM public.garmin_completeness_audit v
WHERE a.id = v.id
  AND a.provider = 'garmin'
  AND a.data_completeness IS NULL;

-- Step 5: Partial index for the reconciliation cron's scan target.
CREATE INDEX IF NOT EXISTS activities_data_completeness_idx
  ON public.activities (data_completeness, start_date DESC)
  WHERE data_completeness IN ('summary_only','needs_resync');

COMMENT ON COLUMN public.activities.data_completeness IS
'Garmin only: summary_only | full | needs_resync | unrecoverable. NULL for '
'other providers (Strava/fit_upload use different ingestion paths). Written '
'by api/garmin-webhook-process.js on insert/update and by the reconciliation '
'cron when give-up criteria are reached.';

COMMENT ON COLUMN public.activities.last_resync_requested_at IS
'When the reconciliation cron last asked Garmin to re-deliver this activity''s '
'FIT file (via /wellness-api/rest/backfill/activities). Used to throttle '
'requests under Garmin''s 409 window-dedup; backoff is anchored to the 24h '
'callbackURL validity.';

COMMENT ON COLUMN public.activities.resync_attempt_count IS
'Number of times the reconciliation cron has requested a re-delivery. '
'Capped at ~5 over ~48h before transitioning data_completeness to '
'needs_resync (loud Sentry event + user-actionable UI badge).';
