-- ============================================================================
-- Migration 104: routes.thumb_polyline — static map thumbnails for the library
--
-- A simplified (≤60-point) encoded polyline of the route geometry, computed
-- server-side on save (api/routes.js saveRoute). The route library renders it
-- via the Mapbox Static Images API instead of loading full geometry per row.
-- Old rows stay NULL and show a placeholder until their next save.
--
-- Applied to production via Supabase MCP on 2026-07-03; this file records it
-- for source-of-truth parity.
-- ============================================================================

ALTER TABLE public.routes
  ADD COLUMN IF NOT EXISTS thumb_polyline TEXT;
