-- Migration 129: Season planner race search — a shared directory of confirmed races.
--
-- See docs/season-planner-build-plan.md (Race search v1). When an athlete adds
-- a race found by search and saves it, api/race-search.js (action 'confirm')
-- copies THEIR saved race_goals values here, deduplicated by name + date
-- (+ 25 km when both rows have coordinates), and bumps confirmed_count. The
-- next athlete who searches for that race finds it here without a web search.
--
-- Only the server (service role) writes; signed-in athletes can read. No row
-- references a user: the directory holds public race facts only.
--
-- APPLY BY HAND and confirm with `npm run audit:schema`.

CREATE TABLE IF NOT EXISTS public.race_directory (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT NOT NULL,
  -- Lowercase name without years, edition numbers or punctuation: the search and dedupe key.
  name_key          TEXT NOT NULL,
  race_date         DATE NOT NULL,
  race_type         TEXT,
  distance_km       NUMERIC,
  elevation_gain_m  NUMERIC,
  location          TEXT,
  lat               NUMERIC,
  lng               NUMERIC,
  url               TEXT,
  source            TEXT NOT NULL DEFAULT 'athlete' CHECK (source IN ('web', 'athlete')),
  confirmed_count   INTEGER NOT NULL DEFAULT 1,
  last_confirmed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_race_directory_key_date ON public.race_directory(name_key, race_date);
CREATE INDEX IF NOT EXISTS idx_race_directory_date ON public.race_directory(race_date);

COMMENT ON TABLE public.race_directory IS
  'Season planner race search: races athletes confirmed, shared so later searches skip the web. Written only by api/race-search.js.';

ALTER TABLE public.race_directory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "race_directory read" ON public.race_directory;
CREATE POLICY "race_directory read" ON public.race_directory
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "race_directory service role" ON public.race_directory;
CREATE POLICY "race_directory service role" ON public.race_directory
  FOR ALL USING (auth.role() = 'service_role');
