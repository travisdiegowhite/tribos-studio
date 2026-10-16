-- Migration 135: the sport a saved route is for (multisport phase 2).
--
-- Route Builder 2 now builds runs (pedestrian routing, run pace, no bike
-- panels). Without a sport column a saved run reopened as a ride: the bike
-- router re-snapped it on the first edit and Discover offered it for rides.
--
--   cycling — every route saved before this migration, and every ride
--   running — a run (routes.surface_type then holds 'run' or 'trail_run')
--
-- Single-written: no legacy twin. api/routes.js writes it through
-- optionalColumn.js, which retries without the column if this migration has
-- not been applied, and the builder infers the sport from surface_type.
--
-- Idempotent. APPLY BY HAND, then run the verification SELECT at the bottom
-- (`npm run audit:schema` checks tables, not columns).

ALTER TABLE public.routes
  ADD COLUMN IF NOT EXISTS sport text NOT NULL DEFAULT 'cycling';

ALTER TABLE public.routes
  DROP CONSTRAINT IF EXISTS routes_sport_check;
ALTER TABLE public.routes
  ADD CONSTRAINT routes_sport_check
  CHECK (sport IN ('cycling', 'running'));

COMMENT ON COLUMN public.routes.sport IS
  'cycling | running. No legacy twin (migration 135). A running route stores surface_type run | trail_run.';

-- Rows a release saved before this migration was applied: their run profile
-- is in surface_type, and the column default made them cycling.
UPDATE public.routes
   SET sport = 'running'
 WHERE sport = 'cycling'
   AND surface_type IN ('run', 'trail_run');

-- ── Verification ────────────────────────────────────────────────────────────
-- Expect one row per sport in use; on first apply, every route is cycling
-- (37 rows on 2026-10-16) unless runs were saved before the apply.
--
-- SELECT sport, surface_type, count(*)
--   FROM public.routes
--  GROUP BY 1, 2
--  ORDER BY 1, 2;
