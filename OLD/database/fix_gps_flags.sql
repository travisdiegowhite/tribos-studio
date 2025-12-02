-- Diagnostic and fix script for GPS data flags
-- Run this to check and fix GPS data availability

-- First, let's see what we have
SELECT
    'Routes with start coordinates' as type,
    COUNT(*) as count
FROM routes
WHERE start_latitude IS NOT NULL AND start_longitude IS NOT NULL
UNION ALL
SELECT
    'Routes with track points' as type,
    COUNT(DISTINCT route_id) as count
FROM track_points
UNION ALL
SELECT
    'Routes with has_gps_data = true' as type,
    COUNT(*) as count
FROM routes
WHERE has_gps_data = true
UNION ALL
SELECT
    'Total routes' as type,
    COUNT(*) as count
FROM routes;

-- Update has_gps_data for routes with start coordinates
UPDATE routes
SET has_gps_data = true
WHERE (start_latitude IS NOT NULL AND start_longitude IS NOT NULL);

-- Update has_gps_data for routes that have track points
UPDATE routes
SET has_gps_data = true
WHERE id IN (
    SELECT DISTINCT route_id
    FROM track_points
    WHERE latitude IS NOT NULL AND longitude IS NOT NULL
);

-- Update track_points_count for all routes
UPDATE routes
SET track_points_count = (
    SELECT COUNT(*)
    FROM track_points
    WHERE track_points.route_id = routes.id
);

-- Update has_heart_rate_data flag
UPDATE routes
SET has_heart_rate_data = true
WHERE average_heartrate IS NOT NULL AND average_heartrate > 0;

-- Update has_power_data flag
UPDATE routes
SET has_power_data = true
WHERE average_watts IS NOT NULL AND average_watts > 0;

-- Show results after update
SELECT
    'Routes with start coordinates' as type,
    COUNT(*) as count
FROM routes
WHERE start_latitude IS NOT NULL AND start_longitude IS NOT NULL
UNION ALL
SELECT
    'Routes with track points' as type,
    COUNT(DISTINCT route_id) as count
FROM track_points
UNION ALL
SELECT
    'Routes with has_gps_data = true' as type,
    COUNT(*) as count
FROM routes
WHERE has_gps_data = true
UNION ALL
SELECT
    'Routes with track_points_count > 0' as type,
    COUNT(*) as count
FROM routes
WHERE track_points_count > 0
UNION ALL
SELECT
    'Total routes' as type,
    COUNT(*) as count
FROM routes;

-- Show sample of updated routes
SELECT
    id,
    name,
    start_latitude,
    start_longitude,
    has_gps_data,
    track_points_count,
    imported_from
FROM routes
LIMIT 5;