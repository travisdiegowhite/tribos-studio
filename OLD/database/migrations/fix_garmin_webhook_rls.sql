-- Fix RLS policies to allow Garmin webhooks (via service_role) to create routes and track points
-- This allows the Cloudflare worker to insert data when processing webhook events

-- =============================================
-- ROUTES TABLE - Add service role policy
-- =============================================

-- Drop existing service role policy if it exists
DROP POLICY IF EXISTS "Service role can manage routes" ON routes;

-- Allow service role to insert/update routes (for webhook processing)
CREATE POLICY "Service role can manage routes" ON routes
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- =============================================
-- TRACK POINTS TABLE - Add service role policy
-- =============================================

-- Drop existing service role policy if it exists
DROP POLICY IF EXISTS "Service role can manage track points" ON track_points;

-- Allow service role to insert track points (for webhook processing)
CREATE POLICY "Service role can manage track points" ON track_points
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- =============================================
-- BIKE COMPUTER SYNC HISTORY - Add service role policy
-- =============================================

-- Drop existing service role policy if it exists
DROP POLICY IF EXISTS "Service role can manage sync history" ON bike_computer_sync_history;

-- Allow service role to insert sync history
CREATE POLICY "Service role can manage sync history" ON bike_computer_sync_history
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- =============================================
-- VERIFICATION
-- =============================================

-- Verify policies were created
SELECT
    schemaname,
    tablename,
    policyname,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE tablename IN ('routes', 'track_points', 'bike_computer_sync_history')
    AND policyname LIKE '%service role%'
ORDER BY tablename, policyname;

-- Show success message
SELECT 'Service role policies added successfully for Garmin webhook processing' AS status;
