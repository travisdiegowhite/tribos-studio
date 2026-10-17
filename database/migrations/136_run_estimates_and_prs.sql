-- Migration 136: stored run threshold estimates and automatic race PRs
-- (multisport phase 5).
--
-- 1. user_profiles gains the run thresholds ESTIMATED from an athlete's
--    history (api/utils/runLoad.js estimateRunThresholds). The nightly load
--    rollforward and the per-ingest refresh already compute them for run load;
--    storing them lets the browser (route pace, pace zones, Settings) use them
--    too. They sit beside the athlete's own threshold_pace_sec / lthr and never
--    replace them: an entered value always wins, and Settings only OFFERS the
--    estimate.
--
--      estimated_threshold_pace_sec  seconds per km
--      estimated_lthr                bpm (0.89 x estimated max HR)
--      run_estimates_at              when they were last written
--
-- 2. running_race_prs (migration 042, unused until now) gains `source`:
--      manual — the athlete saved it (race estimator "Save as PR")
--      auto   — found in their races (api/utils/runRacePrs.js)
--    and a CHECK on the four distance keys its comment already listed.
--
-- No legacy twins: single-written. Every reader and writer goes through
-- api/utils/optionalColumn.js, so a release ahead of this migration behaves
-- as before.
--
-- Idempotent. APPLY BY HAND, then run the verification SELECTs at the bottom
-- (`npm run audit:schema` checks tables, not columns).

-- Pre-check (2026-10-17): running_race_prs had 0 rows, so the CHECKs below
-- cannot reject existing data.
--
-- SELECT distance, count(*) FROM public.running_race_prs GROUP BY 1;

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS estimated_threshold_pace_sec integer,
  ADD COLUMN IF NOT EXISTS estimated_lthr integer,
  ADD COLUMN IF NOT EXISTS run_estimates_at timestamptz;

COMMENT ON COLUMN public.user_profiles.estimated_threshold_pace_sec IS
  'Threshold pace (s/km) estimated from run history (migration 136). Never overrides threshold_pace_sec.';
COMMENT ON COLUMN public.user_profiles.estimated_lthr IS
  'LTHR (bpm) estimated from run history (migration 136). Never overrides lthr.';
COMMENT ON COLUMN public.user_profiles.run_estimates_at IS
  'When the estimated run thresholds were last written (migration 136).';

ALTER TABLE public.running_race_prs
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual';

ALTER TABLE public.running_race_prs
  DROP CONSTRAINT IF EXISTS running_race_prs_source_check;
ALTER TABLE public.running_race_prs
  ADD CONSTRAINT running_race_prs_source_check
  CHECK (source IN ('manual', 'auto'));

ALTER TABLE public.running_race_prs
  DROP CONSTRAINT IF EXISTS running_race_prs_distance_check;
ALTER TABLE public.running_race_prs
  ADD CONSTRAINT running_race_prs_distance_check
  CHECK (distance IN ('5k', '10k', 'half_marathon', 'marathon'));

COMMENT ON COLUMN public.running_race_prs.source IS
  'manual | auto. auto rows come from the athlete''s races (api/utils/runRacePrs.js); a faster manual row is never overwritten.';

-- ── Verification ────────────────────────────────────────────────────────────
-- Expect the three user_profiles columns and running_race_prs.source:
--
-- SELECT table_name, column_name, data_type
--   FROM information_schema.columns
--  WHERE table_schema = 'public'
--    AND ((table_name = 'user_profiles'
--          AND column_name IN ('estimated_threshold_pace_sec', 'estimated_lthr', 'run_estimates_at'))
--      OR (table_name = 'running_race_prs' AND column_name = 'source'))
--  ORDER BY 1, 2;
--
-- After the next rollforward (or a refresh for one runner):
--
-- SELECT count(*) FILTER (WHERE estimated_threshold_pace_sec IS NOT NULL) AS with_pace,
--        count(*) FILTER (WHERE estimated_lthr IS NOT NULL) AS with_lthr
--   FROM public.user_profiles;
--
-- SELECT source, distance, count(*) FROM public.running_race_prs GROUP BY 1, 2 ORDER BY 1, 2;
