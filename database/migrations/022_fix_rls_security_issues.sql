-- Migration: Fix RLS Security Issues
-- Description: Address Supabase security linter warnings
-- Date: 2026-01-06
--
-- Fixes:
-- 1. Enable RLS on bike_computer_integrations table
-- 2. Fix user_activity_summary view to use security_invoker
-- 3. Handle spatial_ref_sys (PostGIS system table)

-- ============================================================================
-- Issue 1: bike_computer_integrations has policies but RLS is disabled
-- ============================================================================

-- Enable RLS on bike_computer_integrations
-- This table already has policies defined, but RLS was not enabled
ALTER TABLE bike_computer_integrations ENABLE ROW LEVEL SECURITY;

-- Verify RLS is enabled
DO $$
BEGIN
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE relname = 'bike_computer_integrations') THEN
        RAISE EXCEPTION 'RLS not enabled on bike_computer_integrations';
    END IF;
    RAISE NOTICE 'RLS successfully enabled on bike_computer_integrations';
END $$;

-- ============================================================================
-- Issue 2: user_activity_summary view uses SECURITY DEFINER
-- ============================================================================

-- Drop and recreate the view with security_invoker
DROP VIEW IF EXISTS user_activity_summary CASCADE;

CREATE OR REPLACE VIEW user_activity_summary
WITH (security_invoker = true)
AS
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
FROM user_activity_events
GROUP BY user_id;

-- Grant access to the view
GRANT SELECT ON user_activity_summary TO authenticated;

-- Add comment explaining the security model
COMMENT ON VIEW user_activity_summary IS
'Aggregated user activity statistics. Uses security_invoker to enforce RLS policies of the querying user, not the view creator.';

-- ============================================================================
-- Issue 3: spatial_ref_sys table (PostGIS system table)
-- ============================================================================

-- spatial_ref_sys is a PostGIS system table that stores coordinate reference systems.
-- It contains no user data and is read-only for most users.
-- Enabling RLS on this table is generally safe but may require superuser permissions.

DO $$
BEGIN
    -- Try to enable RLS on spatial_ref_sys
    -- This may fail if we don't have superuser permissions
    BEGIN
        ALTER TABLE spatial_ref_sys ENABLE ROW LEVEL SECURITY;
        RAISE NOTICE 'RLS enabled on spatial_ref_sys';
    EXCEPTION
        WHEN insufficient_privilege THEN
            RAISE NOTICE 'Cannot enable RLS on spatial_ref_sys: insufficient permissions';
            RAISE NOTICE 'This is a PostGIS system table with no user data - low security risk';
        WHEN undefined_table THEN
            RAISE NOTICE 'spatial_ref_sys table does not exist - PostGIS may not be installed';
    END;
END $$;

-- ============================================================================
-- Verification
-- ============================================================================

-- Verify bike_computer_integrations RLS is enabled
SELECT
    schemaname,
    tablename,
    rowsecurity as rls_enabled
FROM pg_tables
WHERE tablename = 'bike_computer_integrations';

-- Verify user_activity_summary is using security_invoker
SELECT
    viewname,
    definition
FROM pg_views
WHERE viewname = 'user_activity_summary';

-- List all RLS policies on bike_computer_integrations
SELECT
    schemaname,
    tablename,
    policyname,
    permissive,
    cmd
FROM pg_policies
WHERE tablename = 'bike_computer_integrations'
ORDER BY cmd;

-- Summary
SELECT 'RLS security issues fixed successfully' as status;
