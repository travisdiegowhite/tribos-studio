-- Migration 130: Event catalog — a browsable list of public events (Train → Events).
--
-- Seeded from a researched dataset (US gravel events 2027, migration 131) and
-- kept fresh by a weekly cron (api/event-catalog-refresh.js) that re-checks
-- projected dates on the web. See docs/event-catalog.md.
--
-- Different from race_directory (migration 129): that table only holds races
-- athletes saved through race search. This one is curated: every row came from
-- the seed or from the refresh, and athletes never write to it.
--
-- `id` is a stable slug (e.g. 'unbound-gravel-ks') and the upsert key, so a
-- later dataset can update rows in place.
--
-- No PostGIS (dropped in migration 108): lat/lng stay NULL until a geocoding
-- step fills them from city + state.
--
-- APPLY BY HAND, then apply 131 (the seed), then confirm with `npm run audit:schema`.

CREATE TABLE IF NOT EXISTS public.event_catalog (
  id               TEXT PRIMARY KEY,
  name             TEXT NOT NULL,
  discipline       TEXT NOT NULL DEFAULT 'gravel',
  city             TEXT,
  state            CHAR(2) NOT NULL,
  region           TEXT NOT NULL,
  -- A plain calendar day with no time zone. Never a timestamp.
  event_date       DATE NOT NULL,
  date_status      TEXT NOT NULL CHECK (date_status IN ('confirmed', 'partial', 'est', 'risk')),
  date_label       TEXT,
  previous_date    DATE,
  event_type       TEXT NOT NULL,
  distances_text   TEXT,
  distances_mi     NUMERIC[] NOT NULL DEFAULT '{}',
  max_distance_mi  NUMERIC,
  series           TEXT,
  url              TEXT,
  notes            TEXT,
  lat              NUMERIC,
  lng              NUMERIC,
  season           INTEGER NOT NULL DEFAULT 2027,
  -- 'seed' until the weekly refresh changes the row.
  source           TEXT NOT NULL DEFAULT 'seed' CHECK (source IN ('seed', 'refresh')),
  -- When the refresh last looked this event up, and what it found (outcome, page, note).
  last_checked_at  TIMESTAMPTZ,
  last_check       JSONB,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_event_catalog_date ON public.event_catalog(event_date);
CREATE INDEX IF NOT EXISTS idx_event_catalog_state ON public.event_catalog(state);
-- The refresh picks unconfirmed events, least recently checked first.
CREATE INDEX IF NOT EXISTS idx_event_catalog_refresh ON public.event_catalog(date_status, last_checked_at NULLS FIRST);

COMMENT ON TABLE public.event_catalog IS
  'Train → Events: curated public events. Seeded by migration 131, refreshed weekly by api/event-catalog-refresh.js. Athletes read only.';
COMMENT ON COLUMN public.event_catalog.date_status IS
  'confirmed: published by the organizer or registration site; partial: month known or third-party date only; est: projected from previous_date (same weekday, one year on); risk: recently cancelled or no sign of plans. Never present est as official.';

ALTER TABLE public.event_catalog ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "event_catalog read" ON public.event_catalog;
CREATE POLICY "event_catalog read" ON public.event_catalog
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "event_catalog service role" ON public.event_catalog;
CREATE POLICY "event_catalog service role" ON public.event_catalog
  FOR ALL USING (auth.role() = 'service_role');
