-- Migration: Fix Supabase Security Issues
-- Description: Addresses security linter findings for RLS and SECURITY DEFINER views
-- Date: 2025-01-14
--
-- Issues addressed:
-- 1. bike_computer_integrations: RLS policies exist but RLS not enabled
-- 2. user_activity_summary: View has SECURITY DEFINER property
-- 3. spatial_ref_sys: PostGIS system table without RLS

-- ============================================================================
-- Issue 1 & 4 & 5: bike_computer_integrations - Enable RLS
-- The table has policies but RLS is not actually enabled
-- Also contains sensitive columns (access_token, refresh_token)
-- ============================================================================

-- Enable RLS on the table (policies already exist)
ALTER TABLE IF EXISTS public.bike_computer_integrations ENABLE ROW LEVEL SECURITY;

-- Ensure the existing policies are in place (recreate if missing)
-- First drop to avoid conflicts
DROP POLICY IF EXISTS "Users can view their own bike computer integrations" ON public.bike_computer_integrations;
DROP POLICY IF EXISTS "Users can insert their own bike computer integrations" ON public.bike_computer_integrations;
DROP POLICY IF EXISTS "Users can update their own bike computer integrations" ON public.bike_computer_integrations;
DROP POLICY IF EXISTS "Users can delete their own bike computer integrations" ON public.bike_computer_integrations;
DROP POLICY IF EXISTS "Users manage own integrations" ON public.bike_computer_integrations;

-- Recreate RLS policies
CREATE POLICY "Users can view their own bike computer integrations"
    ON public.bike_computer_integrations
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own bike computer integrations"
    ON public.bike_computer_integrations
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own bike computer integrations"
    ON public.bike_computer_integrations
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own bike computer integrations"
    ON public.bike_computer_integrations
    FOR DELETE
    TO authenticated
    USING (auth.uid() = user_id);

-- Ensure proper grants
GRANT ALL ON public.bike_computer_integrations TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bike_computer_integrations TO authenticated;

COMMENT ON TABLE public.bike_computer_integrations IS
'Stores OAuth integrations for bike computers (Garmin, Wahoo, Strava). RLS enabled to protect sensitive tokens.';

-- ============================================================================
-- Issue 2: user_activity_summary - Remove SECURITY DEFINER
-- Recreate view with SECURITY INVOKER to enforce proper RLS
-- ============================================================================

-- Drop and recreate the view without SECURITY DEFINER
DROP VIEW IF EXISTS public.user_activity_summary CASCADE;

CREATE VIEW public.user_activity_summary AS
SELECT
    user_id,
    COUNT(*) as total_events,
    COUNT(DISTINCT DATE(created_at)) as active_days,
    COUNT(DISTINCT session_id) as total_sessions,
    MIN(created_at) as first_activity,
    MAX(created_at) as last_activity,
    COUNT(*) FILTER (WHERE event_category = 'page_view') as page_views,
    COUNT(*) FILTER (WHERE event_category = 'sync') as sync_events,
    COUNT(*) FILTER (WHERE event_category = 'upload') as upload_events,
    COUNT(*) FILTER (WHERE event_category = 'feature') as feature_uses
FROM public.user_activity_events
GROUP BY user_id;

-- Explicitly set security_invoker (RLS of querying user is used)
ALTER VIEW public.user_activity_summary SET (security_invoker = true);

-- Grant access
GRANT SELECT ON public.user_activity_summary TO authenticated;

COMMENT ON VIEW public.user_activity_summary IS
'Aggregated user activity statistics. Uses security_invoker for proper RLS enforcement.';

-- ============================================================================
-- Issue 3: spatial_ref_sys - PostGIS system table without RLS
-- This table is owned by PostGIS extension, so we cannot enable RLS directly.
-- Instead, we revoke API access to prevent exposure via PostgREST.
-- The table remains accessible for internal database/PostGIS operations.
-- ============================================================================

-- Revoke API access from spatial_ref_sys (anon and authenticated roles)
-- This prevents the table from being accessible via Supabase's REST API
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'spatial_ref_sys') THEN
        -- Revoke access from API roles (anon, authenticated)
        REVOKE ALL ON public.spatial_ref_sys FROM anon;
        REVOKE ALL ON public.spatial_ref_sys FROM authenticated;

        -- Keep access for service_role and postgres for internal operations
        -- (These roles typically have access by default)

        RAISE NOTICE 'Revoked API access from spatial_ref_sys table';
    END IF;
END $$;

-- ============================================================================
-- Verification queries (for manual checking)
-- ============================================================================

-- Check RLS status on bike_computer_integrations
SELECT
    'bike_computer_integrations' as table_name,
    relrowsecurity as rls_enabled,
    relforcerowsecurity as rls_forced
FROM pg_class
WHERE relname = 'bike_computer_integrations';

-- Check view security settings
SELECT
    'user_activity_summary' as view_name,
    relname,
    reloptions
FROM pg_class
WHERE relname = 'user_activity_summary';

-- Verify spatial_ref_sys API access has been revoked
SELECT
    'spatial_ref_sys' as table_name,
    grantee,
    privilege_type
FROM information_schema.table_privileges
WHERE table_name = 'spatial_ref_sys'
  AND grantee IN ('anon', 'authenticated');
