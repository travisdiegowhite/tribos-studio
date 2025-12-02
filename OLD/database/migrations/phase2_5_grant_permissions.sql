-- Phase 2.5: Grant RPC permissions for all functions
-- This allows the functions to be called from the client via supabase.rpc()

-- Ride Analysis Functions
GRANT EXECUTE ON FUNCTION analyze_ride(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_ride_analysis(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_zone_time_distribution(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_peak_powers(UUID) TO authenticated;

-- Performance Trend Functions
GRANT EXECUTE ON FUNCTION detect_ftp_trend(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION detect_zone_fitness_trends(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION detect_volume_trends(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION detect_all_trends(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION get_active_trends(UUID) TO authenticated;

-- Route Difficulty Functions
GRANT EXECUTE ON FUNCTION calculate_route_difficulty(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_all_route_difficulties(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_performance_ratio(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_route_recommendations(UUID, TEXT, DECIMAL, DECIMAL, INTEGER) TO authenticated;
