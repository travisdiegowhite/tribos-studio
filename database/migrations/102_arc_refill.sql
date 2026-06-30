-- Migration 102: Adaptive arc refill — readiness-gated easing tags
--
-- Why
-- ----
-- Increment B2 (tight slice) closes the safe half of the adaptive loop: when the
-- athlete is carrying fatigue, the upcoming arc sessions ease automatically and
-- the calendar shows why. A server endpoint (api/arc-refill.js) recomputes the
-- next ~7 days of the active arc from its stored `blocks`, runs the existing
-- readiness gating (evaluateGating: Form Score <= -15 -> Z2; AFI 4-day growth
-- over ceiling -> trim quality 25%), and upserts only the arc-sourced rows that
-- changed. The recompute is stateless, so easing AUTO-REVERTS when Form Score
-- recovers — no latch.
--
-- Two small, additive changes support this:
--
-- 1. planned_workouts.adjustment_reason — the human-readable reason a row was
--    eased (e.g. "FS <= -15: no quality work today. Substituting Z2."). NULL =
--    the row is at its canonical (un-eased) prescription. The calendar renders an
--    "Eased" badge + tooltip from this, mirroring the coach "Adjusted" badge.
--
-- 2. training_plans.last_refill_at — a cheap "skip if refreshed recently"
--    performance backstop for the mount trigger. It is NOT a correctness guard;
--    the refill core is only-write-on-diff and converges on repeated runs.
--
-- Both columns are nullable / additive. Existing rows are unaffected.

ALTER TABLE planned_workouts ADD COLUMN IF NOT EXISTS adjustment_reason TEXT;

COMMENT ON COLUMN planned_workouts.adjustment_reason IS
  'Readiness-gating reason this arc workout was eased by the adaptive refill (api/arc-refill.js), e.g. "FS <= -15: ... Substituting Z2." NULL means the row is at its canonical (un-eased) prescription. Drives the calendar "Eased" badge.';

ALTER TABLE training_plans ADD COLUMN IF NOT EXISTS last_refill_at TIMESTAMPTZ;

COMMENT ON COLUMN training_plans.last_refill_at IS
  'Last time the adaptive arc refill (api/arc-refill.js) ran for this plan. Performance backstop for the mount trigger only — not a correctness guard (the refill is idempotent / only-write-on-diff).';
