-- Migration 101: The living arc — intent metadata + arc shape on training plans
--
-- Why
-- ----
-- Increment B1 introduces the "living arc": a deterministic, phase-banded plan
-- toward a race that fills the (now user-scoped, visible) flat calendar with
-- real workouts. The block-periodization math is harvested from the retired
-- System B sequencer (sequencerPlanner / sequencerBlockOps), but the OUTPUT is
-- ordinary `planned_workouts` rows attached to a real `training_plans` row — no
-- phantom plan, no separate `training_arcs` table, no `session_prescriptions`.
--
-- Two small, additive changes make an arc a first-class training_plan:
--
-- 1. planned_workouts gains intent tags so the calendar/Today can tell where a
--    workout came from (arc fill vs coach single-add vs manual vs template) and
--    which periodization phase it belongs to. These are display/analytics tags;
--    nothing gates visibility on them.
--
-- 2. training_plans gains the arc shape (`tier` + `blocks`) so a single plan row
--    IS the arc. The calendar header, compliance trigger, and dashboard all keep
--    working unchanged because the arc is just another active primary plan.
--
-- All columns are nullable / additive. Existing rows are unaffected: legacy
-- workouts simply carry NULL `source`/`phase`, legacy plans carry NULL
-- `tier`/`blocks`. No backfill is required for B1 (B3 may retro-tag `source`).

-- ── planned_workouts: intent tags ──────────────────────────────────────────

ALTER TABLE planned_workouts ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE planned_workouts ADD COLUMN IF NOT EXISTS phase TEXT;

COMMENT ON COLUMN planned_workouts.source IS
  'Provenance of this workout for the user-scoped calendar: arc (deterministic living-arc fill), coach (coach single-add via recommend_workout), coach_static (coach static-generator plan, no race), manual (user added on the calendar), template (template plan). NULL for legacy rows predating migration 101.';

COMMENT ON COLUMN planned_workouts.phase IS
  'Periodization phase / block_type this workout belongs to, from the living-arc block chain (e.g. aerobic_build, threshold, vo2, race_specific, taper, reactivation, maintenance, recovery). NULL for non-arc or legacy rows.';

-- ── training_plans: the arc shape ──────────────────────────────────────────

ALTER TABLE training_plans ADD COLUMN IF NOT EXISTS tier TEXT;
ALTER TABLE training_plans ADD COLUMN IF NOT EXISTS blocks JSONB;

COMMENT ON COLUMN training_plans.tier IS
  'For living-arc plans (template_id=''ai_arc''): the target race priority tier (A|B|C) that selected the block chain. NULL for non-arc plans.';

COMMENT ON COLUMN training_plans.blocks IS
  'For living-arc plans (template_id=''ai_arc''): the phase bands as a JSONB array of {block_type,start_date,end_date,duration_days} produced by buildEventAnchoredSequence. The deterministic shape the calendar workouts were filled from. NULL for non-arc plans.';
