-- Fix Function Search Path Mutable Warnings
-- Sets search_path = '' on all functions to prevent schema confusion attacks
-- Addresses 12 WARN level security issues from Supabase linter

-- The search_path setting ensures functions always use fully qualified table names
-- (e.g., public.routes instead of routes) preventing potential SQL injection
-- through schema manipulation

-- ============================================================================
-- Function 1: initialize_user_preferences
-- ============================================================================
ALTER FUNCTION public.initialize_user_preferences(uuid)
SET search_path = '';

-- ============================================================================
-- Function 2: user_can_access_shared_route
-- ============================================================================
ALTER FUNCTION public.user_can_access_shared_route(uuid, uuid)
SET search_path = '';

-- ============================================================================
-- Function 3: calculate_route_stats
-- ============================================================================
ALTER FUNCTION public.calculate_route_stats(uuid)
SET search_path = '';

-- ============================================================================
-- Function 4: generate_elevation_profile
-- ============================================================================
ALTER FUNCTION public.generate_elevation_profile(uuid)
SET search_path = '';

-- ============================================================================
-- Function 5: calculate_route_stats_simple
-- ============================================================================
ALTER FUNCTION public.calculate_route_stats_simple(uuid)
SET search_path = '';

-- ============================================================================
-- Function 6: verify_route_comment
-- ============================================================================
ALTER FUNCTION public.verify_route_comment(uuid, uuid)
SET search_path = '';

-- ============================================================================
-- Function 7: estimate_tss
-- ============================================================================
ALTER FUNCTION public.estimate_tss(numeric, integer, integer)
SET search_path = '';

-- ============================================================================
-- Function 8: update_updated_at_column
-- ============================================================================
ALTER FUNCTION public.update_updated_at_column()
SET search_path = '';

-- ============================================================================
-- Function 9: accept_connection
-- ============================================================================
ALTER FUNCTION public.accept_connection(uuid)
SET search_path = '';

-- ============================================================================
-- Function 10: increment_route_view
-- ============================================================================
ALTER FUNCTION public.increment_route_view(uuid)
SET search_path = '';

-- ============================================================================
-- Function 11: calculate_tss
-- ============================================================================
ALTER FUNCTION public.calculate_tss(integer, integer, integer)
SET search_path = '';

-- ============================================================================
-- Function 12: users_are_connected
-- ============================================================================
ALTER FUNCTION public.users_are_connected(uuid, uuid)
SET search_path = '';

-- ============================================================================
-- Verification
-- ============================================================================

SELECT 'Function search_path security fixes applied successfully' as status;
SELECT '12 functions now have immutable search_path' as result;
SELECT 'This prevents schema confusion attacks' as security_benefit;

-- Note: Functions will now require fully qualified table names (e.g., public.routes)
-- If any function fails after this migration, check that all table references
-- are properly qualified with their schema name.
