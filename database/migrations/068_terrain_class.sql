-- Migration 068: Terrain-aware stress
--
-- Part of the Tribos Metrics rollout (Track A, PR A3). See
-- docs/prs/A3-terrain-aware-stress-brief.md for the full design rationale.
--
-- Adds a terrain_class column to training_load_daily so the kilojoule
-- and inferred TSS tiers can record the elevation-per-km classification
-- that scales them, and so the UI / AI coach can surface terrain
-- context without recomputing from distance + elevation.
--
-- The classifier and multiplier live in api/utils/fitnessSnapshots.js
-- (classifyTerrain / terrainMultiplier) and src/lib/training/fatigue-estimation.ts.
-- No backfill — historical rows stay NULL, which downstream treats as
-- "unknown / flat". Rewriting a year of TSS values 5–15% upward would
-- cause an artificial CTL spike across the user base on migration day.

ALTER TABLE public.training_load_daily
  ADD COLUMN IF NOT EXISTS terrain_class text
    CHECK (terrain_class IS NULL OR terrain_class IN
      ('flat', 'rolling', 'hilly', 'mountainous'));

COMMENT ON COLUMN public.training_load_daily.terrain_class IS
  'Terrain classification from elevation-per-km (m/km): flat (<8), '
  'rolling (<15), hilly (<25), mountainous (>=25). Used to scale the '
  'kilojoule/inferred TSS tiers (+0/5/10/15%) and surface terrain '
  'context in the UI.';
