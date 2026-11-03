-- Migration 139: Comfort level 1–5 (docs/COMFORT-ROUTING-SPEC.md §5.4)
--
-- Adds user_road_preferences.comfort_level alongside the existing
-- traffic_tolerance (low | medium | high, migration 125). traffic_tolerance is
-- NOT changed or dropped: migrations are applied by hand, so changing its type
-- in place would leave a window where deployed code and the database disagree.
--
--   comfort_level  1 calm … 5 direct (src/utils/comfortLevels.ts)
--                  NULL = not chosen yet; readers derive it from
--                  traffic_tolerance (low → 2, medium → 3, high → 4).
--
-- Writers dual-write both columns (api/road-segments.js update_preferences):
-- a level writes its tolerance (1–2 → low, 3 → medium, 4–5 → high), and a
-- tolerance from the three-choice controls writes its mapped level.
--
-- No column DEFAULT on purpose. A default of 2 would contradict the row's
-- traffic_tolerance default ('medium' → 3) for any row an older release
-- inserts. Riders with no row read as Comfort 2 in the API instead.
--
-- APPLY BY HAND and confirm with `npm run audit:schema`. Until it's applied,
-- update_preferences drops comfort_level and still saves traffic_tolerance
-- (api/utils/optionalColumn.js), and get_preferences derives the level.

ALTER TABLE public.user_road_preferences
  ADD COLUMN IF NOT EXISTS comfort_level SMALLINT
    CHECK (comfort_level BETWEEN 1 AND 5);

-- Backfill: existing riders keep the level their tolerance maps to.
UPDATE public.user_road_preferences
SET comfort_level = CASE traffic_tolerance
    WHEN 'low' THEN 2
    WHEN 'medium' THEN 3
    WHEN 'high' THEN 4
  END
WHERE comfort_level IS NULL
  AND traffic_tolerance IN ('low', 'medium', 'high');

COMMENT ON COLUMN public.user_road_preferences.comfort_level IS
  'Comfort level 1 (calm) to 5 (direct), docs/COMFORT-ROUTING-SPEC.md. Dual-written with traffic_tolerance (1–2 low, 3 medium, 4–5 high). NULL = derive from traffic_tolerance.';
