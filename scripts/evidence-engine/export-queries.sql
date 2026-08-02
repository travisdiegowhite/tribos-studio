-- Performance Evidence Engine — Phase 1 data exports (READ-ONLY).
--
-- Each query's json_agg output is saved as the named file in the data dir
-- passed to run-calibration.mjs / sensitivity-sweep.mjs. All activity queries
-- apply the cleaned-input contract from the 2026-08-02 cleanup:
--   (is_hidden = false OR is_hidden IS NULL) AND duplicate_of IS NULL.
-- Replace :user_id with the athlete's user id.

-- ── evidence_rides.json ──────────────────────────────────────────────────
-- Cycling activities with the fields the three signals read. Curve keys are
-- trimmed to the durations the PD signal uses (60s / 300s / 1200s).
select json_agg(row_to_json(t) order by t.start_date) from (
  select id, start_date, type, sport_type, trainer, moving_time,
    round((distance/1000)::numeric,1) as distance_km, total_elevation_gain::int as elev_m,
    average_watts::int as avg_w, average_heartrate::int as avg_hr,
    effective_power::int as ep, kilojoules::int as kj,
    (power_curve_summary->>'60s')::int as p60, (power_curve_summary->>'300s')::int as p300,
    (power_curve_summary->>'1200s')::int as p1200,
    round((ride_analytics->>'efficiency_factor')::numeric,3) as ef,
    round((ride_analytics->>'variability_index')::numeric,3) as vi
  from activities
  where user_id = :user_id
    and (is_hidden = false or is_hidden is null) and duplicate_of is null
    and start_date >= '2024-05-01'   -- 90d + 21d lookback before the first analysis week
    and coalesce(sport_type,'cycling') not in ('running','trail_running','walking','hiking')
    and type not in ('Run','TrailRun','Walk','Hike','VirtualRun')
) t;

-- ── evidence_segments.json ───────────────────────────────────────────────
-- Traversals of segments with >=3 rides. The engine applies its own
-- per-traversal sanity filter (implied speed, power+HR present) because the
-- detector emits partial matches with impossible speeds.
-- Field names in the JSON: seg, dist_m, activity_id, ridden_at, dur_s, w, hr.
select json_agg(json_build_object(
  'seg', coalesce(s.display_name, s.auto_name),
  'dist_m', s.distance_meters::int,
  'activity_id', r.activity_id,
  'ridden_at', r.ridden_at,
  'dur_s', r.duration_seconds,
  'w', r.avg_power::int,
  'hr', r.avg_hr) order by r.ridden_at)
from training_segment_rides r
join training_segments s on s.id = r.segment_id
where s.user_id = :user_id
  and r.segment_id in (
    select segment_id from training_segment_rides group by segment_id having count(*) >= 3);

-- ── recomputed_daily.json ────────────────────────────────────────────────
-- The clean daily load-model series (model_divergence + residual reference).
-- Only date / tfi / form_score are read by the engine.
select json_agg(row_to_json(t) order by t.date) from (
  select date, rss, tfi, afi, form_score
  from training_load_daily
  where user_id = :user_id
) t;
