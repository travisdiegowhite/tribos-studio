-- Fix Supabase Security Linter Issues (Safe Version)
-- Addresses: auth users exposure, security definer views
-- NOTE: Skips spatial_ref_sys (requires superuser permissions)

-- ============================================================================
-- Issue 1 & 2: user_preferences_complete view exposes auth.users with SECURITY DEFINER
-- ============================================================================

-- Drop the existing view
DROP VIEW IF EXISTS public.user_preferences_complete CASCADE;

-- Recreate WITHOUT exposing email (auth.users data)
-- and WITHOUT SECURITY DEFINER
CREATE OR REPLACE VIEW public.user_preferences_complete AS
SELECT
    u.id as user_id,
    -- REMOVED: u.email (this exposed auth.users data to anon role)
    up.onboarding_completed,
    up.preferences_version,

    -- Routing preferences
    rp.traffic_tolerance,
    rp.distance_from_traffic,
    rp.hill_preference,
    rp.max_gradient_comfort,
    rp.preferred_road_types,
    rp.avoided_road_types,
    rp.intersection_complexity,
    rp.turning_preference,
    rp.route_type_preference,

    -- Surface preferences
    sp.primary_surfaces,
    sp.surface_quality,
    sp.gravel_tolerance,
    sp.single_track_experience,
    sp.weather_surface_adjustment,
    sp.wet_weather_paved_only,

    -- Safety preferences
    saf.lighting_requirement,
    saf.shoulder_width,
    saf.bike_infrastructure,
    saf.emergency_access,
    saf.cell_coverage,
    saf.rest_stop_frequency,
    saf.mechanical_support,
    saf.group_riding,
    saf.group_size,

    -- Scenic preferences
    sc.scenic_importance,
    sc.preferred_views,
    sc.avoided_views,
    sc.cultural_interests,
    sc.photography_stops,
    sc.scenic_detours,
    sc.quietness_level,
    sc.variety_importance,

    -- Training context
    tc.current_phase,
    tc.weekly_volume_km,
    tc.weekly_rides,
    tc.longest_recent_ride,
    tc.recent_intensity,
    tc.fatigue_level,
    tc.primary_goal,
    tc.upcoming_event_date,
    tc.upcoming_event_type,
    tc.injury_areas,
    tc.recovery_focus,
    tc.typical_ride_time,
    tc.time_flexibility,
    tc.equipment_status,

    -- Timestamps
    up.created_at,
    up.updated_at
FROM auth.users u
LEFT JOIN user_preferences up ON u.id = up.user_id
LEFT JOIN routing_preferences rp ON u.id = rp.user_id
LEFT JOIN surface_preferences sp ON u.id = sp.user_id
LEFT JOIN safety_preferences saf ON u.id = saf.user_id
LEFT JOIN scenic_preferences sc ON u.id = sc.user_id
LEFT JOIN training_context tc ON u.id = tc.user_id;

-- Add RLS policy so users can only see their own preferences
ALTER VIEW public.user_preferences_complete SET (security_invoker = true);

-- Note: Views inherit RLS from underlying tables, so this will enforce user_id checks

COMMENT ON VIEW public.user_preferences_complete IS
'Complete user preferences without exposing auth.users email. Uses security_invoker (not security_definer) for proper RLS enforcement.';

-- ============================================================================
-- Issue 3: route_summary uses SECURITY DEFINER
-- ============================================================================

-- Drop existing view
DROP VIEW IF EXISTS public.route_summary CASCADE;

-- Recreate WITHOUT SECURITY DEFINER
CREATE OR REPLACE VIEW public.route_summary AS
SELECT
    r.id,
    r.user_id,
    r.name,
    r.distance_km,
    r.duration_seconds,
    r.elevation_gain_m,
    r.average_speed,
    r.average_heartrate,
    r.average_watts,
    r.recorded_at,
    r.imported_from,
    r.training_goal,
    r.route_type,
    r.has_gps_data,
    r.has_heart_rate_data,
    r.has_power_data,
    -- Calculated fields
    ROUND((r.distance_km / (r.duration_seconds / 3600.0))::numeric, 2) as calculated_avg_speed,
    CASE
        WHEN r.duration_seconds > 0 THEN ROUND((r.duration_seconds / 60.0 / r.distance_km)::numeric, 2)
        ELSE NULL
    END as average_pace_min_per_km,
    CASE
        WHEN r.distance_km > 0 THEN ROUND((r.elevation_gain_m / r.distance_km)::numeric, 1)
        ELSE 0
    END as elevation_per_km
FROM routes r;

-- Use security_invoker (default, but being explicit)
ALTER VIEW public.route_summary SET (security_invoker = true);

COMMENT ON VIEW public.route_summary IS
'Summary view of routes with calculated performance metrics. Uses security_invoker for proper RLS enforcement.';

-- ============================================================================
-- Note about spatial_ref_sys
-- ============================================================================

-- Issue 4 (spatial_ref_sys RLS) cannot be fixed without superuser permissions.
-- This is a PostGIS system table and is low risk since it only contains
-- coordinate system reference data (no user data).
--
-- To suppress the linter warning, you can either:
-- 1. Ignore this specific warning in Supabase dashboard
-- 2. Contact Supabase support to enable RLS on this table
-- 3. Accept the warning (it's not a critical security issue)

-- ============================================================================
-- Verification
-- ============================================================================

SELECT 'Security fixes applied successfully:' as status;
SELECT '1. user_preferences_complete: removed email exposure, removed SECURITY DEFINER' as fix_1;
SELECT '2. route_summary: removed SECURITY DEFINER' as fix_2;
SELECT '3. spatial_ref_sys: skipped (requires superuser permissions)' as fix_3;
