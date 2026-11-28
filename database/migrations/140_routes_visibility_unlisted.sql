-- Migration 140: routes.visibility — allow 'unlisted'
--
-- Sharing a route (Phase 2, docs/ROUTE-BUILDER-COMPETITIVE-PLAN.md §3.6) now
-- offers "anyone with the link" (unlisted) as well as public. An unlisted
-- route is readable through the share link (/r/:id, /r/:id/embed, oEmbed)
-- but is never listed or discoverable. Writers store is_private = true for
-- it, so legacy readers that only look at is_private keep treating it as
-- not public.
--
-- The live constraint is routes_visibility_check (checked 2026-11-28 via
-- pg_constraint): CHECK (visibility IN ('private','friends','public')).
-- Additive: existing rows are untouched.
--
-- APPLY BY HAND and confirm with `npm run audit:schema` (applied to
-- production 2026-11-28).

ALTER TABLE public.routes DROP CONSTRAINT IF EXISTS routes_visibility_check;

ALTER TABLE public.routes ADD CONSTRAINT routes_visibility_check
  CHECK (visibility IN ('private', 'friends', 'public', 'unlisted'));
