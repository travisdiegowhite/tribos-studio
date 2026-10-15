-- Migration 134: the sport of each calendar entry (multisport phase 3).
--
-- calendar_entries had no sport, so a hybrid athlete's runs and rides were
-- indistinguishable on the calendar, to the coach and to activity matching —
-- and a plan or coach block could not put a run on a day that already held a
-- ride. This adds the column the per-sport occupancy rule keys on.
--
--   cycling | running  — a single-sport session or race
--   multi              — a triathlon / duathlon race
--   other              — anything else an athlete logs on the calendar
--   NULL               — rest days and notes (no sport), or a row written by a
--                        writer that predates this column; readers infer those
--                        via api/utils/entrySport.js inferEntrySport().
--
-- Single-written: no legacy twin. Readers and writers fall back without the
-- column if this migration has not been applied (calendarSportColumn).
--
-- Idempotent. APPLY BY HAND, then run the verification SELECT at the bottom
-- (`npm run audit:schema` checks tables, not columns).

ALTER TABLE public.calendar_entries
  ADD COLUMN IF NOT EXISTS sport text;

ALTER TABLE public.calendar_entries
  DROP CONSTRAINT IF EXISTS calendar_entries_sport_check;
ALTER TABLE public.calendar_entries
  ADD CONSTRAINT calendar_entries_sport_check
  CHECK (sport IS NULL OR sport IN ('cycling', 'running', 'multi', 'other'));

COMMENT ON COLUMN public.calendar_entries.sport IS
  'cycling | running | multi | other; NULL for rest/note. No legacy twin (migration 134). Inference rules: api/utils/entrySport.js.';

-- ── Backfill: the same rules as inferEntrySport, plus the plan's sport ───────
-- Only rows still NULL, so re-running never overwrites a value a writer set.

UPDATE public.calendar_entries e
   SET sport = CASE
     WHEN e.type = 'race' AND e.workout_type IN ('run_5k', 'run_10k', 'half_marathon', 'marathon', 'trail_run', 'ultra_run') THEN 'running'
     WHEN e.type = 'race' AND e.workout_type IN ('triathlon', 'duathlon') THEN 'multi'
     WHEN e.workout_id LIKE 'run\_%' THEN 'running'
     WHEN EXISTS (
       SELECT 1 FROM public.training_plans p
        WHERE p.id = e.plan_id AND p.sport_type = 'running'
     ) THEN 'running'
     ELSE 'cycling'
   END
 WHERE e.sport IS NULL
   AND e.type NOT IN ('rest', 'note');

-- ── Verification (run by hand after applying) ────────────────────────────────
--
-- SELECT type, sport, count(*) FROM public.calendar_entries GROUP BY 1, 2 ORDER BY 1, 2;
--   2026-10-15 expectation: 14 running workouts, 2 multi races, rest rows NULL.
