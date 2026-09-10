-- Migration 124: provider_gear cache + one bike per rider per Strava gear id
-- Date: 2026-09-10
--
-- Supports the ride-backload work (docs/GEAR_TRACKER_STRATEGY_2026-09.md):
--   1. provider_gear caches what Strava's GET /gear/{id} says about a gear id
--      (name, brand, model, frame type, retired) so the "bikes Strava knows
--      about" list on the bike page does not re-hit the Strava API every open.
--      Per rider, keyed by provider + provider id, read before any gear_items
--      row claims the id. Writes are service-role only; riders can read their
--      own rows.
--   2. gear_items.strava_gear_id gets a rider-scoped unique index. The 043
--      index was a plain lookup index; two active bikes of one rider could
--      claim the same Strava id and assignGearToActivity's .single() threw.
--
-- BEFORE APPLYING, check for duplicates that would block the unique index:
--
--   SELECT user_id, strava_gear_id, count(*)
--   FROM public.gear_items
--   WHERE strava_gear_id IS NOT NULL AND status = 'active'
--   GROUP BY 1, 2 HAVING count(*) > 1;
--
-- If any rows come back, clear strava_gear_id on all but one of each group
-- (keep the one with the most activity_gear rows), then apply.
--
-- Apply by hand, then `npm run audit:schema`.

-- ============================================================
-- 1. provider_gear
-- ============================================================

CREATE TABLE IF NOT EXISTS public.provider_gear (
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider         text NOT NULL DEFAULT 'strava' CHECK (provider IN ('strava')),
  provider_gear_id text NOT NULL,
  name             text,
  brand            text,
  model            text,
  frame_type       integer,
  retired          boolean,
  fetched_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, provider, provider_gear_id)
);

COMMENT ON TABLE public.provider_gear IS 'Cache of a provider''s description of a gear id (Strava GET /gear/{id}). Read by api/gear.js list_provider_gear; written by the service role only.';
COMMENT ON COLUMN public.provider_gear.frame_type IS 'Strava frame_type: 1 mtb, 2 cross, 3 road, 4 time trial, 5 gravel; NULL when unknown';

ALTER TABLE public.provider_gear ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS provider_gear_owner_select ON public.provider_gear;
CREATE POLICY provider_gear_owner_select
  ON public.provider_gear FOR SELECT
  USING (auth.uid() = user_id);

-- ============================================================
-- 2. One active bike per rider per Strava gear id
-- ============================================================

DROP INDEX IF EXISTS public.idx_gear_items_strava_gear_id;

CREATE UNIQUE INDEX IF NOT EXISTS gear_items_user_strava_gear_uniq
  ON public.gear_items (user_id, strava_gear_id)
  WHERE strava_gear_id IS NOT NULL AND status = 'active';

COMMENT ON INDEX public.gear_items_user_strava_gear_uniq IS 'A Strava gear id belongs to at most one active bike per rider; replaces 043''s lookup index (this one serves the lookup too)';
