-- Migration 132: which sports an athlete trains (multisport phase 0B).
--
-- Adds user_profiles.sports — the set of sports the athlete trains, e.g.
-- {cycling,running} for a hybrid athlete — next to the existing
-- primary_sport (migration 042), and constrains both to the two sports the
-- app supports.
--
-- Migration 042's running columns (threshold_pace_sec, vdot, max_hr,
-- resting_hr, lthr, primary_sport) already exist in production (checked
-- 2026-10-15) but had no writer: RunningProfileSettings saved to localStorage.
-- This PR starts writing them; this migration does not touch them.
--
-- `sports` has no legacy twin, so it is written once (CLAUDE.md metrics rules
-- apply to the renamed load columns, not here).
--
-- Idempotent. APPLY BY HAND, then run `npm run audit:schema` and the
-- verification SELECT at the bottom (the audit checks tables, not columns).

-- ── 1. The column ────────────────────────────────────────────────────────────

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS sports text[] NOT NULL DEFAULT ARRAY['cycling']::text[];

COMMENT ON COLUMN public.user_profiles.sports IS
  'Sports the athlete trains: any of cycling, running (at least one). primary_sport says which leads.';

-- ── 2. Normalise, then constrain ─────────────────────────────────────────────

UPDATE public.user_profiles
   SET primary_sport = 'cycling'
 WHERE primary_sport IS NULL
    OR primary_sport NOT IN ('cycling', 'running');

ALTER TABLE public.user_profiles
  DROP CONSTRAINT IF EXISTS user_profiles_primary_sport_check;
ALTER TABLE public.user_profiles
  ADD CONSTRAINT user_profiles_primary_sport_check
  CHECK (primary_sport IN ('cycling', 'running'));

ALTER TABLE public.user_profiles
  DROP CONSTRAINT IF EXISTS user_profiles_sports_check;
ALTER TABLE public.user_profiles
  ADD CONSTRAINT user_profiles_sports_check
  CHECK (sports <@ ARRAY['cycling', 'running']::text[] AND cardinality(sports) >= 1);

-- ── 3. Backfill: athletes who already run ────────────────────────────────────
--
-- Four or more runs in the last 90 days adds 'running' to sports. The run test
-- is the SQL shadow of api/utils/sportTypes.js: any spelling containing RUN in
-- either sport column (Strava 'Run'/'TrailRun', Garmin 'TRAIL_RUNNING',
-- lowercase 'running'). primary_sport stays as it is — the athlete picks.
-- 20 athletes matched on 2026-10-15 (read-only dry run of this subquery).

UPDATE public.user_profiles p
   SET sports = array_append(p.sports, 'running')
 WHERE NOT ('running' = ANY (p.sports))
   AND p.id IN (
     SELECT a.user_id
       FROM public.activities a
      WHERE a.start_date > now() - interval '90 days'
        AND a.duplicate_of IS NULL
        AND COALESCE(a.is_hidden, false) = false
        AND (
          upper(regexp_replace(COALESCE(a.sport_type, ''), '[^A-Za-z]', '', 'g')) LIKE '%RUN%'
          OR upper(regexp_replace(COALESCE(a.type, ''), '[^A-Za-z]', '', 'g')) LIKE '%RUN%'
        )
      GROUP BY a.user_id
     HAVING count(*) >= 4
   );

-- ── Verification (run by hand after applying) ────────────────────────────────
--
-- SELECT column_name, data_type, column_default
--   FROM information_schema.columns
--  WHERE table_schema = 'public' AND table_name = 'user_profiles'
--    AND column_name IN ('sports', 'primary_sport', 'threshold_pace_sec', 'vdot', 'lthr', 'max_hr', 'resting_hr');
--
-- SELECT sports, primary_sport, count(*) FROM public.user_profiles GROUP BY 1, 2;
