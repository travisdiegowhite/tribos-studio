-- Migration 128: Season planner — focus flag on race_goals, season plans, change log.
--
-- See docs/season-planner-build-plan.md. Races are NOT copied anywhere: the
-- season planner reads and writes race_goals (mirrored to calendar_entries by
-- src/lib/calendar/raceEntrySync.ts), so the coach, the calendar and the
-- season view agree on every race date. Phases are never stored; the pure
-- engine (src/lib/season/engine.ts) recomputes them from the races.
--
-- APPLY BY HAND and confirm with `npm run audit:schema`.

-- ============================================================
-- 1. race_goals.is_focus — the athlete's pick inside a block of A races
-- ============================================================
-- A races at most 2 weeks apart share one build ("block"); the build aims at
-- the focus race. FALSE everywhere means "not chosen": the engine defaults to
-- the block's last race and the UI asks the athlete to confirm.

ALTER TABLE public.race_goals
  ADD COLUMN IF NOT EXISTS is_focus BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.race_goals.is_focus IS
  'Season planner: TRUE when the athlete marked this A race as the most important in its block of back-to-back A races.';

-- ============================================================
-- 2. season_plans — one per athlete per season
-- ============================================================

CREATE TABLE IF NOT EXISTS public.season_plans (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name                  TEXT NOT NULL DEFAULT 'Season',
  -- A plain calendar date, always a Monday (ISO day 1). Never a timestamp.
  start_date            DATE NOT NULL CHECK (EXTRACT(ISODOW FROM start_date) = 1),
  weeks                 INTEGER NOT NULL DEFAULT 52 CHECK (weeks BETWEEN 4 AND 104),
  -- Used when the athlete has no fitness_snapshots weekly-hours history.
  fallback_weekly_hours NUMERIC(4,1) CHECK (fallback_weekly_hours IS NULL OR fallback_weekly_hours > 0),
  -- The plan as last discussed with the coach: the baseline for the next diff
  -- and the target of Reset. Engine output (SeasonPlan JSON), not raw races.
  discussed_snapshot    JSONB,
  discussed_at          TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT season_plans_user_start_unique UNIQUE (user_id, start_date)
);

CREATE INDEX IF NOT EXISTS idx_season_plans_user ON public.season_plans(user_id, start_date DESC);

COMMENT ON TABLE public.season_plans IS
  'Season planner: one row per athlete per season window. Races live in race_goals; phases are computed, never stored.';

-- ============================================================
-- 3. season_plan_events — change log feeding the coach diff
-- ============================================================

CREATE TABLE IF NOT EXISTS public.season_plan_events (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id    UUID NOT NULL REFERENCES public.season_plans(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Kept when the race is later deleted: a 'remove' event outlives its race.
  race_id    UUID REFERENCES public.race_goals(id) ON DELETE SET NULL,
  kind       TEXT NOT NULL CHECK (kind IN ('add', 'move', 'remove', 'priority', 'focus')),
  before     JSONB,
  after      JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_season_plan_events_plan ON public.season_plan_events(plan_id, created_at);

COMMENT ON TABLE public.season_plan_events IS
  'Season planner: append-only log of race add/move/remove/priority/focus changes, used to build coach diffs.';

-- ============================================================
-- 4. RLS — athletes own their rows; the service role sees everything
-- ============================================================

ALTER TABLE public.season_plans       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.season_plan_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "season_plans owner all" ON public.season_plans;
CREATE POLICY "season_plans owner all" ON public.season_plans
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "season_plans service role" ON public.season_plans;
CREATE POLICY "season_plans service role" ON public.season_plans
  FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "season_plan_events owner all" ON public.season_plan_events;
-- The plan must be the athlete's own too, so an event can't be filed under someone else's plan.
CREATE POLICY "season_plan_events owner all" ON public.season_plan_events
  FOR ALL TO authenticated USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.season_plans p WHERE p.id = plan_id AND p.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "season_plan_events service role" ON public.season_plan_events;
CREATE POLICY "season_plan_events service role" ON public.season_plan_events
  FOR ALL USING (auth.role() = 'service_role');
