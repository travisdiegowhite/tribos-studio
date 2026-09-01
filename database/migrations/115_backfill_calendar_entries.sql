-- ============================================================================
-- Migration 115: backfill calendar_entries from planned_workouts + race_goals
--
-- Idempotent: ON CONFLICT (id) DO NOTHING, so re-running is a no-op. Safe to
-- run, verify, and run again.
--
-- IDS ARE CARRIED, NOT REGENERATED. `activities.matched_planned_workout_id`
-- points at planned_workouts.id and is rewritten every 5 minutes by the Garmin
-- webhook path; new keys would dangle it for every historical activity.
--
-- SLOT ASSIGNMENT. `UNIQUE (user_id, date, slot)` means the union of workouts
-- and races must be numbered per athlete-day, not defaulted to 0. This is not
-- a hypothetical: at the time of writing 96 athlete-days carry more than one
-- entry (max 3) — historically overlapping plans, plus races sharing a day
-- with a workout, plus one day with two races. Ordering is deliberate:
--   1. races first, so a race day's primary entry is the race;
--   2. then entries with an activity linked, so a completed session outranks
--      an untouched generated one;
--   3. then oldest first, stable by id.
--
-- DANGLING ACTIVITY LINKS. `planned_workouts.activity_id` has NO foreign key,
-- so it can and does point at deleted activities — 5 of 124 links at the time
-- of writing. calendar_entries.activity_id IS a real FK, so those are nulled on
-- the way across. Nothing meaningful is lost: the activity is already gone.
-- `pinned` and `status='done'` both derive from the SOURCE row, so the fact the
-- session was completed survives; only the pointer to a deleted ride does not.
--
-- PINNED derives from the old touch markers — an activity link, a manual move,
-- a workout swap, or a coach adjustment reason. Those are the columns
-- supersedePlans used to distinguish "the athlete touched this" from "untouched
-- machine fill", and they are the same signal a generator needs to leave a row
-- alone.
-- ============================================================================

INSERT INTO calendar_entries (
  id, user_id, date, slot, type, title, workout_id, workout_type,
  target_load, target_duration_min, target_distance_km,
  actual_load, actual_duration_min, actual_distance_km,
  status, completed_at, skipped_reason, activity_id,
  notes, coach_rationale, details, provenance,
  source, plan_id, generation_id, pinned, created_at, updated_at
)
SELECT
  e.id,
  e.user_id,
  e.date,
  (ROW_NUMBER() OVER (
     PARTITION BY e.user_id, e.date
     ORDER BY e.race_first, e.has_activity DESC, e.created_at ASC NULLS LAST, e.id ASC
   ) - 1)::smallint AS slot,
  e.type,
  e.title,
  e.workout_id,
  e.workout_type,
  e.target_load,
  e.target_duration_min,
  e.target_distance_km,
  e.actual_load,
  e.actual_duration_min,
  e.actual_distance_km,
  e.status,
  e.completed_at,
  e.skipped_reason,
  e.activity_id,
  e.notes,
  e.coach_rationale,
  e.details,
  e.provenance,
  e.source,
  e.plan_id,
  NULL::uuid AS generation_id,   -- pre-existing rows predate generation tracking
  e.pinned,
  e.created_at,
  e.updated_at
FROM (
  -- ── planned workouts ────────────────────────────────────────────────────
  SELECT
    p.id,
    p.user_id,
    p.scheduled_date                                    AS date,
    1                                                   AS race_first,
    (p.activity_id IS NOT NULL)                         AS has_activity,
    CASE WHEN p.workout_type = 'rest' THEN 'rest' ELSE 'workout' END AS type,
    COALESCE(NULLIF(TRIM(p.name), ''), p.workout_id, INITCAP(REPLACE(COALESCE(p.workout_type, 'workout'), '_', ' '))) AS title,
    p.workout_id,
    p.workout_type,
    -- canonical-first; the pair diverges in production, see migration header
    COALESCE(p.target_rss, p.target_tss)                AS target_load,
    COALESCE(p.target_duration, p.duration_minutes)     AS target_duration_min,
    p.target_distance_km,
    COALESCE(p.actual_rss, p.actual_tss)                AS actual_load,
    p.actual_duration                                   AS actual_duration_min,
    p.actual_distance_km,
    CASE
      WHEN p.completed IS TRUE               THEN 'done'
      WHEN p.skipped_reason IS NOT NULL      THEN 'skipped'
      -- A rest day in the past is a rest day TAKEN, not a session missed.
      -- Doing nothing is how you complete one, so there is no evidence of
      -- non-compliance to record. Without this branch the date test below
      -- swept up every historical rest day (354 rows on the first run,
      -- corrected in place afterwards); keep it ahead of that test so a
      -- re-run for Phase E's reconciling upsert cannot reintroduce them.
      WHEN p.workout_type = 'rest'           THEN 'done'
      WHEN p.scheduled_date < CURRENT_DATE   THEN 'missed'
      ELSE 'planned'
    END                                                 AS status,
    p.completed_at,
    p.skipped_reason,
    act.id                                              AS activity_id,
    -- `notes` did three jobs; the coach's own rationale is prefixed "Coach:"
    CASE WHEN p.notes LIKE 'Coach:%' OR p.notes LIKE 'Coach recommendation:%'
         THEN NULL ELSE p.notes END                     AS notes,
    CASE WHEN p.notes LIKE 'Coach:%' OR p.notes LIKE 'Coach recommendation:%'
         THEN p.notes ELSE NULL END                     AS coach_rationale,
    NULL::jsonb                                         AS details,
    CASE WHEN p.original_scheduled_date IS NOT NULL
           OR p.original_workout_id IS NOT NULL
           OR p.adjustment_reason IS NOT NULL
         THEN jsonb_strip_nulls(jsonb_build_object(
                'original_date',       p.original_scheduled_date,
                'original_workout_id', p.original_workout_id,
                'adjustment_reason',   p.adjustment_reason))
         ELSE NULL END                                  AS provenance,
    COALESCE(p.source, 'manual')                        AS source,
    p.plan_id,
    (p.activity_id IS NOT NULL
      OR p.original_scheduled_date IS NOT NULL
      OR p.original_workout_id IS NOT NULL
      OR p.adjustment_reason IS NOT NULL)               AS pinned,
    p.created_at,
    p.updated_at
  FROM planned_workouts p
  LEFT JOIN activities act ON act.id = p.activity_id
  WHERE p.scheduled_date IS NOT NULL

  UNION ALL

  -- ── races ───────────────────────────────────────────────────────────────
  SELECT
    r.id,
    r.user_id,
    r.race_date                                         AS date,
    0                                                   AS race_first,
    false                                               AS has_activity,
    'race'                                              AS type,
    COALESCE(NULLIF(TRIM(r.name), ''), 'Race')          AS title,
    NULL                                                AS workout_id,
    r.race_type                                         AS workout_type,
    NULL::numeric                                       AS target_load,
    r.goal_time_minutes                                 AS target_duration_min,
    r.distance_km                                       AS target_distance_km,
    NULL::numeric                                       AS actual_load,
    r.actual_time_minutes                               AS actual_duration_min,
    NULL::numeric                                       AS actual_distance_km,
    CASE
      WHEN r.status = 'completed'          THEN 'done'
      WHEN r.status = 'cancelled'          THEN 'skipped'
      WHEN r.race_date < CURRENT_DATE      THEN 'missed'
      ELSE 'planned'
    END                                                 AS status,
    r.completed_at,
    NULL                                                AS skipped_reason,
    NULL::uuid                                          AS activity_id,
    r.notes,
    NULL                                                AS coach_rationale,
    jsonb_strip_nulls(jsonb_build_object(
      'priority',           r.priority,
      'race_type',          r.race_type,
      'distance_km',        r.distance_km,
      'elevation_gain_m',   r.elevation_gain_m,
      'location',           r.location,
      'course_description', r.course_description,
      'goal_time_minutes',  r.goal_time_minutes,
      'goal_power_watts',   r.goal_power_watts,
      'goal_placement',     r.goal_placement,
      'route_id',           r.route_id,
      'target_tfi_min',     r.target_tfi_min,
      'target_tfi_max',     r.target_tfi_max,
      'actual_time_minutes',  r.actual_time_minutes,
      'actual_power_watts',   r.actual_power_watts,
      'actual_placement',     r.actual_placement,
      'result_notes',         r.result_notes
    ))                                                  AS details,
    NULL::jsonb                                         AS provenance,
    'manual'                                            AS source,
    NULL::uuid                                          AS plan_id,
    -- a race is always the athlete's own intent; a generator must never move it
    true                                                AS pinned,
    r.created_at,
    r.updated_at
  FROM race_goals r
  WHERE r.race_date IS NOT NULL
) e
ON CONFLICT (id) DO NOTHING;
