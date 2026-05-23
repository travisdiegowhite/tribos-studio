-- ============================================================================
-- Migration 092: Training segment rollup functions
--
-- The pipeline at api/utils/segmentAnalysisPipeline.js calls
-- `increment_segment_ride_count` (never defined in any migration) with a
-- JS-side fallback that uses `supabase.raw('ride_count + 1')` — which is
-- a knex method and does not exist on the Supabase JS client. The error
-- is silently swallowed because the fallback update's result is not
-- checked. Net effect: every training_segments.ride_count reads `1` and
-- every training_segment_profiles.frequency_tier reads `'rare'`.
--
-- This migration replaces the broken increment with idempotent
-- recompute-from-truth functions that read training_segment_rides as
-- the source of truth and rewrite both the parent segment row and its
-- profile row in one round trip. Idempotent so backfills and live
-- writes use the same code path.
-- ============================================================================

CREATE OR REPLACE FUNCTION recompute_training_segment_rollup(p_segment_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.training_segments ts
  SET
    ride_count      = COALESCE(sub.cnt, 0),
    first_ridden_at = sub.first_at,
    last_ridden_at  = sub.last_at,
    updated_at      = NOW()
  FROM (
    SELECT
      COUNT(*)        AS cnt,
      MIN(ridden_at)  AS first_at,
      MAX(ridden_at)  AS last_at
    FROM public.training_segment_rides
    WHERE segment_id = p_segment_id
  ) sub
  WHERE ts.id = p_segment_id;
END;
$$;

COMMENT ON FUNCTION recompute_training_segment_rollup(UUID) IS
  'Recompute training_segments.ride_count + first/last_ridden_at from training_segment_rides. Idempotent.';


CREATE OR REPLACE FUNCTION recompute_training_segment_profile(p_segment_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_30      INT;
  v_90      INT;
  v_total   INT;
  v_first   TIMESTAMPTZ;
  v_per_month NUMERIC;
  v_tier    TEXT;
BEGIN
  SELECT
    COUNT(*) FILTER (WHERE ridden_at >= NOW() - INTERVAL '30 days'),
    COUNT(*) FILTER (WHERE ridden_at >= NOW() - INTERVAL '90 days'),
    COUNT(*),
    MIN(ridden_at)
  INTO v_30, v_90, v_total, v_first
  FROM public.training_segment_rides
  WHERE segment_id = p_segment_id;

  -- avg_rides_per_month is still useful as a long-run engagement metric,
  -- but the JS-side rides_per_month / GREATEST(1, ...) formula produces
  -- mostly 'rare' tiers when segments span years of history. Use a
  -- sliding window for the tier instead: recent engagement matters more
  -- than long-run average.
  IF v_total = 0 OR v_first IS NULL THEN
    v_per_month := 0;
  ELSE
    v_per_month := v_total::NUMERIC / GREATEST(
      1,
      EXTRACT(EPOCH FROM (NOW() - v_first)) / (30 * 86400)
    );
  END IF;

  v_tier := CASE
    WHEN v_30 >= 4                          THEN 'primary'
    WHEN v_30 >= 2 OR v_90 >= 6             THEN 'regular'
    WHEN v_90 >= 2 OR v_total >= 4          THEN 'occasional'
    ELSE 'rare'
  END;

  -- UPDATE (not UPSERT) — caller guarantees the profile row exists
  -- via createSegmentProfile() during the new-segment path. No-op if
  -- the row is missing, which is correct: the JS-side updateSegmentProfile
  -- will create it on the next traversal.
  UPDATE public.training_segment_profiles SET
    rides_last_30_days  = v_30,
    rides_last_90_days  = v_90,
    avg_rides_per_month = ROUND(v_per_month::NUMERIC, 1),
    frequency_tier      = v_tier,
    updated_at          = NOW()
  WHERE segment_id = p_segment_id;
END;
$$;

COMMENT ON FUNCTION recompute_training_segment_profile(UUID) IS
  'Recompute training_segment_profiles.rides_last_30/90_days, avg_rides_per_month and frequency_tier from training_segment_rides. Idempotent.';


-- Grant execute to authenticated role so the service-role client (and
-- in principle any future RLS-aware client) can invoke via PostgREST.
GRANT EXECUTE ON FUNCTION recompute_training_segment_rollup(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION recompute_training_segment_profile(UUID) TO authenticated, service_role;
