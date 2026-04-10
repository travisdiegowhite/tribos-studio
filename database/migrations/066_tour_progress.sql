-- Migration 066: Per-user tour completion state
-- Extends the existing user_activation record with a `tours` JSONB column
-- rather than creating a new table. Follows the same pattern as the
-- existing `steps` JSONB used for activation step tracking.
--
-- Shape:
--   tours: {
--     [tour_key]: {
--       completed_at: timestamptz | null,
--       dismissed_at: timestamptz | null
--     }
--   }
--
-- Tour keys currently in use:
--   - route_builder
--   - training_plan_setup
--
-- The existing RLS policies on user_activation cover this new column, and
-- the existing create_user_activation trigger auto-inserts the row on signup
-- with default `{}`.

ALTER TABLE public.user_activation
  ADD COLUMN IF NOT EXISTS tours JSONB DEFAULT '{}'::jsonb NOT NULL;

COMMENT ON COLUMN public.user_activation.tours IS
  'Per-tour state keyed by tour_key (e.g. route_builder, training_plan_setup). Shape: { [tour_key]: { completed_at: timestamptz|null, dismissed_at: timestamptz|null } }';
