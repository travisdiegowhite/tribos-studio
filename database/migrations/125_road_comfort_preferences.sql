-- Migration 125: "Road comfort" routing preferences
--
-- Two per-rider routing preferences on the existing user_road_preferences
-- row (migration 035), so the Route Builder's "Road comfort" control and the
-- Settings > Road Preferences card share one persisted value:
--
--   traffic_tolerance     low | medium | high  (Quiet / Balanced / Direct)
--                         → Valhalla use_roads / use_living_streets costing,
--                           BRouter profile choice (low → safety), and the
--                           traffic-stress weight in candidate ranking.
--   bike_infra_preference flexible | preferred | required
--                         → candidate filtering by Overpass bike-infra score.
--
-- Read/written by api/road-segments.js (get_preferences / update_preferences).
-- Before this the only traffic preference lived in a `routing_preferences`
-- table that no migration ever created, so it was always the default.
--
-- APPLY BY HAND and confirm with `npm run audit:schema`. Until applied,
-- update_preferences answers 409 { needsMigration: true } for these fields
-- and the Route Builder keeps the choice in local state only.

ALTER TABLE public.user_road_preferences
  ADD COLUMN IF NOT EXISTS traffic_tolerance TEXT NOT NULL DEFAULT 'medium'
    CHECK (traffic_tolerance IN ('low', 'medium', 'high'));

ALTER TABLE public.user_road_preferences
  ADD COLUMN IF NOT EXISTS bike_infra_preference TEXT NOT NULL DEFAULT 'preferred'
    CHECK (bike_infra_preference IN ('flexible', 'preferred', 'required'));

COMMENT ON COLUMN public.user_road_preferences.traffic_tolerance IS
  'Road comfort: low = quiet roads only (LTS ≤ 2), medium = balanced (LTS ≤ 3), high = direct (any road).';
COMMENT ON COLUMN public.user_road_preferences.bike_infra_preference IS
  'How much bike infrastructure matters when ranking candidates: flexible, preferred, or required (filters).';
