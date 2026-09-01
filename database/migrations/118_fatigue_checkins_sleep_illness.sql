-- 118 — Morning readiness: sleep and illness
--
-- Coaching Bible Phase 3 (docs/coaching-bible/IMPLEMENTATION-BRIEF.md).
--
-- fatigue_checkins already carries leg_feel / energy / motivation on a 1–5
-- scale (migration 058), which covers two of the three questions the readiness
-- rules need: fatigue (leg_feel) and mood (motivation). Sleep has no
-- self-reported source anywhere in the schema — health_metrics.sleep_quality
-- exists but is device-derived from Garmin, and the evidence the RDY rules
-- rest on is specifically about SELF-REPORT. So sleep is asked, not inferred.
--
-- `illness` is the other half of RDY-3-skip. Without it that rule can only
-- fire on the all-three-low branch, and a coach that tells a sick athlete to
-- train is the worst failure mode in the whole rules file.
--
-- Both are nullable: every existing row predates the questions, and a check-in
-- that skipped them must read as "not answered" rather than as a low score.
-- The readiness adapter treats null as unknown and skips the rules that need
-- it (never as a 3, never as "fine").

ALTER TABLE public.fatigue_checkins
  ADD COLUMN IF NOT EXISTS sleep integer CHECK (sleep BETWEEN 1 AND 5);

ALTER TABLE public.fatigue_checkins
  ADD COLUMN IF NOT EXISTS illness boolean;

COMMENT ON COLUMN public.fatigue_checkins.sleep IS
  'Self-reported sleep quality last night, 1 (awful) to 5 (great). Nullable: rows predating the question, and check-ins that skipped it, read as unknown.';

COMMENT ON COLUMN public.fatigue_checkins.illness IS
  'Self-reported "I am ill today". Nullable = not asked/not answered, which is NOT the same as false.';

-- The readiness reader always scans a trailing window for one athlete.
CREATE INDEX IF NOT EXISTS idx_fatigue_checkins_user_date
  ON public.fatigue_checkins (user_id, date DESC);
