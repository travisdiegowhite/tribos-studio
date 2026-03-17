-- Migration: Fix Supabase Security Linter Errors
-- Description: Addresses two ERROR-level findings from the Supabase database linter
-- Date: 2026-03-17
--
-- Issues addressed:
-- 1. daily_training_load: View defined with SECURITY DEFINER (bypasses RLS)
-- 2. spatial_ref_sys: PostGIS system table without RLS enabled

-- ============================================================================
-- Issue 1: daily_training_load — SECURITY DEFINER view
-- The view (created in migration 033) defaults to SECURITY DEFINER, meaning
-- it executes with the view creator's permissions rather than the querying
-- user's. This bypasses RLS on cross_training_activities.
-- Fix: Set security_invoker = true so the querying user's RLS applies.
-- (Same fix applied to user_activity_summary in migration 025.)
-- ============================================================================

ALTER VIEW public.daily_training_load SET (security_invoker = true);

COMMENT ON VIEW public.daily_training_load IS
'Daily cross-training load summary. Uses security_invoker for proper RLS enforcement.';

-- ============================================================================
-- Issue 2: spatial_ref_sys — RLS disabled on public table
-- PostGIS system table. Migration 025 revoked API access from anon/authenticated,
-- but the linter still flags it because RLS is not enabled.
-- Enabling RLS with no policies means:
--   - anon/authenticated: blocked (already revoked + no RLS policy)
--   - service_role: bypasses RLS by default, PostGIS operations unaffected
--   - postgres superuser: bypasses RLS, unaffected
-- ============================================================================

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'spatial_ref_sys'
    ) THEN
        ALTER TABLE public.spatial_ref_sys ENABLE ROW LEVEL SECURITY;
        RAISE NOTICE 'Enabled RLS on spatial_ref_sys';
    ELSE
        RAISE NOTICE 'spatial_ref_sys table does not exist, skipping';
    END IF;
END $$;
