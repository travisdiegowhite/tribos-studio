-- Route Builder 2.0 — gradual cohort rollout helper
-- =====================================================================
-- Per-user beta access is gated by user_profiles.route_builder_v2_enabled
-- (migration 090) AND the global env flag VITE_ROUTE_BUILDER_V2_ENABLED.
-- Both must be true for a user to see RB2 (see src/hooks/useRouteBuilderV2Access.ts).
--
-- Prefer the admin UI (Admin → Users → "RB2 Beta" toggle) for one-off enables.
-- Use these snippets for batch cohort expansion. Run in Supabase SQL editor.

-- 1) Enable for a single user by email
UPDATE public.user_profiles p
SET route_builder_v2_enabled = TRUE
FROM auth.users u
WHERE u.id = p.id
  AND u.email = 'someone@example.com';

-- 2) Enable for an N-user cohort: most-recently-active users not yet enabled
--    (adjust the LIMIT to grow the cohort gradually)
WITH cohort AS (
  SELECT id
  FROM public.user_profiles
  WHERE route_builder_v2_enabled IS DISTINCT FROM TRUE
  ORDER BY updated_at DESC NULLS LAST
  LIMIT 50
)
UPDATE public.user_profiles p
SET route_builder_v2_enabled = TRUE
FROM cohort c
WHERE p.id = c.id;

-- 3) Count current cohort size
SELECT COUNT(*) AS rb2_enabled_users
FROM public.user_profiles
WHERE route_builder_v2_enabled = TRUE;

-- 4) Rollback: disable for everyone (kill switch; the env flag is the faster one)
-- UPDATE public.user_profiles SET route_builder_v2_enabled = FALSE
-- WHERE route_builder_v2_enabled = TRUE;
