-- Fix Function Search Path Mutable Warnings (Corrected Version)
-- Sets search_path = '' on all functions to prevent schema confusion attacks
-- Addresses 12 WARN level security issues from Supabase linter

-- The search_path setting ensures functions always use fully qualified table names
-- (e.g., public.routes instead of routes) preventing potential SQL injection
-- through schema manipulation

-- Note: This migration will attempt to fix functions that exist in your database.
-- If a function doesn't exist, it will be skipped without error.

-- ============================================================================
-- Approach: Use DO block to handle functions that may not exist
-- ============================================================================

DO $$
BEGIN
    -- Function 1: initialize_user_preferences
    BEGIN
        ALTER FUNCTION public.initialize_user_preferences(uuid) SET search_path = '';
        RAISE NOTICE 'Fixed: initialize_user_preferences';
    EXCEPTION WHEN undefined_function THEN
        RAISE NOTICE 'Skipped: initialize_user_preferences (does not exist)';
    END;

    -- Function 2: user_can_access_shared_route
    BEGIN
        ALTER FUNCTION public.user_can_access_shared_route(uuid, uuid) SET search_path = '';
        RAISE NOTICE 'Fixed: user_can_access_shared_route';
    EXCEPTION WHEN undefined_function THEN
        RAISE NOTICE 'Skipped: user_can_access_shared_route (does not exist)';
    END;

    -- Function 3: calculate_route_stats
    BEGIN
        ALTER FUNCTION public.calculate_route_stats(uuid) SET search_path = '';
        RAISE NOTICE 'Fixed: calculate_route_stats';
    EXCEPTION WHEN undefined_function THEN
        RAISE NOTICE 'Skipped: calculate_route_stats (does not exist)';
    END;

    -- Function 4: generate_elevation_profile
    BEGIN
        ALTER FUNCTION public.generate_elevation_profile(uuid) SET search_path = '';
        RAISE NOTICE 'Fixed: generate_elevation_profile';
    EXCEPTION WHEN undefined_function THEN
        RAISE NOTICE 'Skipped: generate_elevation_profile (does not exist)';
    END;

    -- Function 5: calculate_route_stats_simple
    BEGIN
        ALTER FUNCTION public.calculate_route_stats_simple(uuid) SET search_path = '';
        RAISE NOTICE 'Fixed: calculate_route_stats_simple';
    EXCEPTION WHEN undefined_function THEN
        RAISE NOTICE 'Skipped: calculate_route_stats_simple (does not exist)';
    END;

    -- Function 6: verify_route_comment
    BEGIN
        ALTER FUNCTION public.verify_route_comment(uuid, uuid) SET search_path = '';
        RAISE NOTICE 'Fixed: verify_route_comment';
    EXCEPTION WHEN undefined_function THEN
        RAISE NOTICE 'Skipped: verify_route_comment (does not exist)';
    END;

    -- Function 7: estimate_tss (try different signatures)
    BEGIN
        ALTER FUNCTION public.estimate_tss(numeric, integer, integer) SET search_path = '';
        RAISE NOTICE 'Fixed: estimate_tss(numeric, integer, integer)';
    EXCEPTION WHEN undefined_function THEN
        BEGIN
            ALTER FUNCTION public.estimate_tss(integer, integer, integer) SET search_path = '';
            RAISE NOTICE 'Fixed: estimate_tss(integer, integer, integer)';
        EXCEPTION WHEN undefined_function THEN
            RAISE NOTICE 'Skipped: estimate_tss (does not exist)';
        END;
    END;

    -- Function 8: update_updated_at_column
    BEGIN
        ALTER FUNCTION public.update_updated_at_column() SET search_path = '';
        RAISE NOTICE 'Fixed: update_updated_at_column';
    EXCEPTION WHEN undefined_function THEN
        RAISE NOTICE 'Skipped: update_updated_at_column (does not exist)';
    END;

    -- Function 9: accept_connection
    BEGIN
        ALTER FUNCTION public.accept_connection(uuid) SET search_path = '';
        RAISE NOTICE 'Fixed: accept_connection';
    EXCEPTION WHEN undefined_function THEN
        RAISE NOTICE 'Skipped: accept_connection (does not exist)';
    END;

    -- Function 10: increment_route_view
    BEGIN
        ALTER FUNCTION public.increment_route_view(uuid) SET search_path = '';
        RAISE NOTICE 'Fixed: increment_route_view';
    EXCEPTION WHEN undefined_function THEN
        RAISE NOTICE 'Skipped: increment_route_view (does not exist)';
    END;

    -- Function 11: calculate_tss
    BEGIN
        ALTER FUNCTION public.calculate_tss(integer, integer, integer) SET search_path = '';
        RAISE NOTICE 'Fixed: calculate_tss';
    EXCEPTION WHEN undefined_function THEN
        RAISE NOTICE 'Skipped: calculate_tss (does not exist)';
    END;

    -- Function 12: users_are_connected
    BEGIN
        ALTER FUNCTION public.users_are_connected(uuid, uuid) SET search_path = '';
        RAISE NOTICE 'Fixed: users_are_connected';
    EXCEPTION WHEN undefined_function THEN
        RAISE NOTICE 'Skipped: users_are_connected (does not exist)';
    END;

END $$;

-- ============================================================================
-- Verification
-- ============================================================================

SELECT 'Function search_path security fixes applied' as status;
SELECT 'Check NOTICE messages above to see which functions were fixed' as result;
SELECT 'Any skipped functions either do not exist or have different signatures' as note;
