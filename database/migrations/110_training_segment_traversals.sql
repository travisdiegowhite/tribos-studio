-- ============================================================================
-- Migration 110: Training segment traversals
--
-- Two problems with "times ridden" in the Familiar Segments panel:
--
-- 1. Segments built from a bare polyline have no speed stream, and the
--    pipeline substituted a flat 5 m/s default. That fabricated an 18 km/h
--    time axis and wrote invented durations into training_segment_rides,
--    where they became the baseline the comparison UI displayed. 83% of the
--    production library is affected. Those values are fiction and are
--    cleared here; the traversal rows stay, so "you have ridden this road"
--    survives while "you rode it in 42 minutes" does not.
--
-- 2. Traversals are only recorded when a ride's own boundary detection
--    happened to match an existing segment's endpoints. Coverage-based
--    matching (api/utils/segmentCoverage.js) records them from the ride's
--    track instead, which needs somewhere to record how a row was matched
--    and a bbox to prefilter candidates on.
--
-- Additive plus one constraint relaxation. Nothing is dropped.
--
-- NOTE: the duration/speed clear in section C is not reversible without
-- re-running the polyline pipeline. scripts/rebuild-training-segments.js
-- --report snapshots the values first; take that snapshot before applying.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- A. training_segment_rides: distinguish real efforts from familiarity rows
-- ----------------------------------------------------------------------------

ALTER TABLE public.training_segment_rides
  ADD COLUMN IF NOT EXISTS match_method TEXT NOT NULL DEFAULT 'detector'
    CHECK (match_method IN ('detector', 'coverage')),
  ADD COLUMN IF NOT EXISTS coverage_ratio NUMERIC(4,3),
  ADD COLUMN IF NOT EXISTS direction TEXT
    CHECK (direction IS NULL OR direction IN ('forward', 'reverse')),
  ADD COLUMN IF NOT EXISTS data_quality_tier TEXT NOT NULL DEFAULT 'measured'
    CHECK (data_quality_tier IN ('measured', 'geometry_only'));

-- Required for section C. A traversal without timing is a legitimate row —
-- it says the rider was here — so the column can no longer be mandatory.
ALTER TABLE public.training_segment_rides
  ALTER COLUMN duration_seconds DROP NOT NULL;

-- ----------------------------------------------------------------------------
-- B. Tag each row by what its source activity actually carried
--
-- Derived per row from the activity, not inferred from the parent segment's
-- tier: a segment can hold both measured and geometry-only traversals, and
-- the parent tier is upgraded in place when better data arrives.
-- ----------------------------------------------------------------------------

UPDATE public.training_segment_rides r
SET data_quality_tier = 'geometry_only'
FROM public.activities a
WHERE a.id = r.activity_id
  AND (
    a.activity_streams IS NULL
    OR jsonb_array_length(COALESCE(a.activity_streams -> 'coords', '[]'::jsonb)) = 0
  );

-- ----------------------------------------------------------------------------
-- C. Clear the fabricated efforts
--
-- avg_speed goes too: it was derived from the same invented time axis.
-- Power and HR are left alone — those were never synthesised, they are
-- simply absent on this tier.
-- ----------------------------------------------------------------------------

UPDATE public.training_segment_rides
SET duration_seconds = NULL,
    avg_speed = NULL
WHERE data_quality_tier = 'geometry_only';

-- ----------------------------------------------------------------------------
-- D. training_segments: bbox prefilter, retirement, merge tombstone
-- ----------------------------------------------------------------------------

ALTER TABLE public.training_segments
  ADD COLUMN IF NOT EXISTS bbox_min_lat NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS bbox_min_lng NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS bbox_max_lat NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS bbox_max_lng NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS merged_into_id UUID
    REFERENCES public.training_segments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS retired_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS retired_reason TEXT
    CHECK (retired_reason IS NULL OR retired_reason IN
      ('merged', 'oversized', 'whole_ride', 'low_quality')),
  ADD COLUMN IF NOT EXISTS measured_ride_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS traversal_analysis_version INTEGER NOT NULL DEFAULT 0;

-- Candidate prefilter. The old query filtered on start_lat/start_lng only,
-- so a long segment whose start sat outside the box was invisible even when
-- the ride ran along the whole of it.
CREATE INDEX IF NOT EXISTS idx_training_segments_bbox
  ON public.training_segments(user_id, bbox_min_lat, bbox_max_lat, bbox_min_lng, bbox_max_lng)
  WHERE retired_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_training_segments_active
  ON public.training_segments(user_id)
  WHERE retired_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_training_segments_merged_into
  ON public.training_segments(merged_into_id)
  WHERE merged_into_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- E. Backfill the bboxes from stored geometry (no PostGIS — dropped in 108)
-- ----------------------------------------------------------------------------

UPDATE public.training_segments ts
SET bbox_min_lat = b.min_lat,
    bbox_max_lat = b.max_lat,
    bbox_min_lng = b.min_lng,
    bbox_max_lng = b.max_lng
FROM (
  SELECT s.id,
         MIN((c ->> 1)::numeric) AS min_lat,
         MAX((c ->> 1)::numeric) AS max_lat,
         MIN((c ->> 0)::numeric) AS min_lng,
         MAX((c ->> 0)::numeric) AS max_lng
  FROM public.training_segments s,
       LATERAL jsonb_array_elements(s.geojson -> 'coordinates') c
  WHERE jsonb_typeof(s.geojson -> 'coordinates') = 'array'
  GROUP BY s.id
) b
WHERE b.id = ts.id
  AND ts.bbox_min_lat IS NULL;

-- ----------------------------------------------------------------------------
-- F. activities: retryable analysis watermarks
--
-- The existing watermarks are stamped even when analysis fails, with an
-- explicit "mark regardless of outcome" comment, so an activity that hit a
-- transient elevation-API rate limit is never retried. An attempt counter
-- lets failures retry a bounded number of times instead.
-- ----------------------------------------------------------------------------

ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS segment_coverage_analyzed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS segment_coverage_version INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS segment_analysis_attempts SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS segment_analysis_error TEXT;

CREATE INDEX IF NOT EXISTS idx_activities_segment_coverage_pending
  ON public.activities(user_id, start_date DESC)
  WHERE duplicate_of IS NULL AND segment_coverage_analyzed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_segment_rides_user_segment
  ON public.training_segment_rides(user_id, segment_id);

-- ----------------------------------------------------------------------------
-- G. Rollup: also track how many traversals are actually comparable
--
-- Same signature as migration 092, replaced in place. This remains the
-- single writer of ride_count — the competing writes in the JS pipeline are
-- removed in the same change that adds this.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION recompute_training_segment_rollup(p_segment_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.training_segments ts
  SET
    ride_count          = COALESCE(sub.cnt, 0),
    measured_ride_count = COALESCE(sub.measured, 0),
    first_ridden_at     = sub.first_at,
    last_ridden_at      = sub.last_at,
    updated_at          = NOW()
  FROM (
    SELECT
      COUNT(*)                                              AS cnt,
      COUNT(*) FILTER (WHERE duration_seconds IS NOT NULL)  AS measured,
      MIN(ridden_at)                                        AS first_at,
      MAX(ridden_at)                                        AS last_at
    FROM public.training_segment_rides
    WHERE segment_id = p_segment_id
  ) sub
  WHERE ts.id = p_segment_id;
END;
$$;

COMMENT ON FUNCTION recompute_training_segment_rollup(UUID) IS
  'Recompute training_segments.ride_count, measured_ride_count and first/last_ridden_at from training_segment_rides. Sole writer of ride_count. Idempotent.';

GRANT EXECUTE ON FUNCTION recompute_training_segment_rollup(UUID) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- H. Bring measured_ride_count up to date for existing segments
-- ----------------------------------------------------------------------------

UPDATE public.training_segments ts
SET measured_ride_count = COALESCE(sub.measured, 0)
FROM (
  SELECT segment_id,
         COUNT(*) FILTER (WHERE duration_seconds IS NOT NULL) AS measured
  FROM public.training_segment_rides
  GROUP BY segment_id
) sub
WHERE sub.segment_id = ts.id;
