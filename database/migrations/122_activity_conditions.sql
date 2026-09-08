-- Migration 122: Per-ride conditions (weather at ride time)
--
-- One row per outdoor activity recording what the ride was ridden in. Feeds
-- the gear wear model (wet miles wear a chain ~2x) and the coach's receipts
-- ("410 of those miles were in the wet"). Populated by the
-- gear-conditions-process cron from Open-Meteo's historical archive using
-- activities.raw_data->'start_latlng' and start_date; Strava's average_temp
-- and FIT per-record temperature are cross-checks, not the source.
--
-- APPLY BY HAND and confirm with `npm run audit:schema` before deploying the
-- cron — a missing table makes the cron go green while writing nothing
-- (see CLAUDE.md, migration 106).

CREATE TABLE IF NOT EXISTS public.activity_conditions (
  activity_id         uuid PRIMARY KEY REFERENCES public.activities(id) ON DELETE CASCADE,
  user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source              text NOT NULL CHECK (source IN ('open_meteo', 'strava_device', 'fit_device', 'manual')),
  temp_c              numeric,
  precip_mm           numeric,            -- total precipitation during the ride window
  precip_prior_6h_mm  numeric,            -- wet-road proxy: rain in the 6h before the start
  wind_kmh            numeric,
  humidity_pct        numeric,
  -- Derived so the threshold can move without a code change. ~1 mm during the
  -- ride, or ~3 mm in the preceding 6 hours, counts as wet roads.
  is_wet              boolean GENERATED ALWAYS AS (
                        coalesce(precip_mm, 0) >= 1 OR coalesce(precip_prior_6h_mm, 0) >= 3
                      ) STORED,
  fetched_at          timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.activity_conditions IS
  'Weather during each outdoor activity, for gear wear and coach receipts. One row per activity.';
COMMENT ON COLUMN public.activity_conditions.precip_mm IS 'Precipitation (mm) summed over the ride window';
COMMENT ON COLUMN public.activity_conditions.precip_prior_6h_mm IS 'Precipitation (mm) in the 6 hours before the ride started — wet-road proxy';
COMMENT ON COLUMN public.activity_conditions.is_wet IS 'Generated: precip_mm >= 1 OR precip_prior_6h_mm >= 3';

CREATE INDEX IF NOT EXISTS idx_activity_conditions_user
  ON public.activity_conditions(user_id);

CREATE INDEX IF NOT EXISTS idx_activity_conditions_user_wet
  ON public.activity_conditions(user_id) WHERE is_wet;

ALTER TABLE public.activity_conditions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own activity conditions"
  ON public.activity_conditions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role full access to activity conditions"
  ON public.activity_conditions FOR ALL
  USING (auth.role() = 'service_role');
