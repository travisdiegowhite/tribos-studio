-- ============================================================================
-- Migration 103: routes.is_draft — server-side draft autosave
--
-- Route Builder 2.0 autosaves the in-progress route to a per-user draft row
-- (see src/hooks/route-builder/useDraftAutosave.ts and the save_draft /
-- get_draft / delete_draft actions in api/routes.js). Before this, the only
-- crash safety net was the localStorage mirror — same browser only, and
-- vulnerable to quota failures / cleared site data.
--
-- One draft per user, enforced by a partial unique index. Existing rows get
-- DEFAULT FALSE, and list_routes filters drafts out, so the library is
-- unaffected.
--
-- Applied to production via Supabase MCP on 2026-07-03; this file records it
-- for source-of-truth parity.
-- ============================================================================

ALTER TABLE public.routes
  ADD COLUMN IF NOT EXISTS is_draft BOOLEAN NOT NULL DEFAULT FALSE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_routes_one_draft_per_user
  ON public.routes (user_id)
  WHERE is_draft;
