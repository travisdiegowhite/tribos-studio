-- ============================================================================
-- Migration 114: calendar_entries — one table for everything on the calendar
--
-- WHY
-- ---
-- `planned_workouts` is owned by a training plan: `plan_id` is the identity,
-- and `UNIQUE (plan_id, scheduled_date)` makes the plan part of the key. That
-- is the root of the duplicate-session outage of 2026-08-22 (two plans stacked
-- a session on every day for five weeks) and of the park/move/restore dance in
-- api/coach.js, which exists only to free a slot for a swap.
--
-- Here the athlete owns the entry. `plan_id` becomes provenance, not identity.
-- A plan seeds entries and stamps them with a `generation_id`; regenerating
-- replaces that generation's own un-pinned output and nothing else.
--
-- Races live here too, as type='race' — a race is a thing on the calendar, and
-- keeping it in a separate table is why the coach could not schedule one.
--
-- NOTES ON THE SHAPE
-- ------------------
-- * `id` is NOT generated. The backfill (115) carries the existing
--   planned_workouts.id and race_goals.id across, because
--   `activities.matched_planned_workout_id` points at planned_workouts.id and
--   is rewritten every 5 minutes by the Garmin webhook path. Regenerating keys
--   would dangle that pointer for every historical activity.
-- * `slot` disambiguates two things on one day. It is NOT hypothetical: 96
--   user-days in the current data already carry more than one entry (up to 3),
--   from historically overlapping plans and from races sharing a day with a
--   workout. The old key permitted this only because the plan was part of it.
-- * `status` replaces the completed / status / completed_at triplet.
--   NOT NULL removes the `.or('completed.eq.false,completed.is.null')`
--   workaround that temporalAnchor.js and coach.js both carry today.
-- * One load column and one duration column. The tss/rss split is not
--   cosmetic: deviation-resolve.js reduces target_tss to 70% and leaves
--   target_rss stale, and check-in-apply.js zeroes target_tss for a rest
--   conversion leaving target_rss non-zero — so the Today view, which reads
--   rss first, shows the un-reduced load.
-- * Dropped from planned_workouts because nothing reads AND nothing writes
--   them: template_id, scheduled_time, description, intervals, target_if, the
--   old status, completed_route_id, ai_recommended, ai_metadata,
--   adaptation_reason, ride_intensity. Also dropped: phase (4 writers, no
--   reader — phase is authoritative in training_plans.blocks), session_type
--   and is_quality (readers, no writer — now derived in
--   api/utils/qualitySession.js), and week_number / day_of_week, which are
--   derivable from the date and actively harmful: each row's week is measured
--   from its OWN plan's start, so three plans' "Week 4" collided in one bucket.
-- ============================================================================

CREATE TABLE IF NOT EXISTS calendar_entries (
  id            uuid PRIMARY KEY,
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date          date NOT NULL,
  slot          smallint NOT NULL DEFAULT 0,
  type          text NOT NULL DEFAULT 'workout'
                  CHECK (type IN ('workout', 'race', 'rest', 'note')),

  title         text NOT NULL,
  workout_id    text,
  workout_type  text,

  target_load          numeric,
  target_duration_min  integer,
  target_distance_km   numeric,
  actual_load          numeric,
  actual_duration_min  integer,
  actual_distance_km   numeric,

  status        text NOT NULL DEFAULT 'planned'
                  CHECK (status IN ('planned', 'done', 'skipped', 'missed')),
  completed_at  timestamptz,
  skipped_reason text,
  activity_id   uuid REFERENCES activities(id) ON DELETE SET NULL,

  notes           text,
  coach_rationale text,

  details       jsonb,
  provenance    jsonb,

  source        text NOT NULL DEFAULT 'manual',
  plan_id       uuid REFERENCES training_plans(id) ON DELETE SET NULL,
  generation_id uuid,
  pinned        boolean NOT NULL DEFAULT false,

  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- The athlete's day is the identity. No plan in the key — that is the whole
-- point. `slot` allows a double day or a brick, which the old key forbade.
CREATE UNIQUE INDEX IF NOT EXISTS calendar_entries_user_date_slot
  ON calendar_entries (user_id, date, slot);

-- Every read is "this athlete, this date range".
CREATE INDEX IF NOT EXISTS idx_calendar_entries_user_date
  ON calendar_entries (user_id, date);

-- Provenance lookups: "replace what generation X produced".
CREATE INDEX IF NOT EXISTS idx_calendar_entries_generation
  ON calendar_entries (generation_id) WHERE generation_id IS NOT NULL;

-- Reverse lookup from a synced activity.
CREATE INDEX IF NOT EXISTS idx_calendar_entries_activity
  ON calendar_entries (activity_id) WHERE activity_id IS NOT NULL;

ALTER TABLE calendar_entries ENABLE ROW LEVEL SECURITY;

-- ONE policy, keyed on the athlete. planned_workouts carries five overlapping
-- policies, four of which resolve ownership through a `plan_id IN (SELECT …)`
-- subquery — which is exactly why a plan-free row there is a special case.
DROP POLICY IF EXISTS "Athletes manage their own calendar" ON calendar_entries;
CREATE POLICY "Athletes manage their own calendar" ON calendar_entries
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_calendar_entries_updated_at ON calendar_entries;
CREATE TRIGGER update_calendar_entries_updated_at
  BEFORE UPDATE ON calendar_entries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE calendar_entries IS
  'The training calendar. One row per thing on one day. Entries belong to the athlete; plan_id is provenance, not ownership. Replaces planned_workouts and the calendar half of race_goals.';
COMMENT ON COLUMN calendar_entries.slot IS
  'Disambiguates multiple entries on one day (double day, brick, race + shakeout). 0 is the primary entry.';
COMMENT ON COLUMN calendar_entries.pinned IS
  'The athlete or an approved coach edit touched this entry. Generators must never overwrite a pinned entry.';
COMMENT ON COLUMN calendar_entries.generation_id IS
  'Which generation run produced this entry. Regenerating a plan replaces its own generation''s un-pinned output only.';
COMMENT ON COLUMN calendar_entries.provenance IS
  'Where this entry came from if it moved: {original_date, original_workout_id, adjustment_reason}.';
COMMENT ON COLUMN calendar_entries.details IS
  'Type-specific detail. For type=race: priority, race_type, distance_km, elevation_gain_m, location, goal_*, route_id, target_tfi_*, and results.';
