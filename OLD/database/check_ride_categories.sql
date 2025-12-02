-- Check what ride categorization data exists in the database

-- Activity types from Strava
SELECT
    activity_type,
    COUNT(*) as count,
    ROUND(AVG(distance_km), 1) as avg_distance_km,
    ROUND(AVG(elevation_gain_m), 0) as avg_elevation_m
FROM routes
WHERE activity_type IS NOT NULL
GROUP BY activity_type
ORDER BY count DESC;

-- Surface types (if any)
SELECT
    'Surface Types' as category,
    surface_type as value,
    COUNT(*) as count
FROM routes
WHERE surface_type IS NOT NULL
GROUP BY surface_type
ORDER BY count DESC;

-- Route types (if any)
SELECT
    'Route Types' as category,
    route_type as value,
    COUNT(*) as count
FROM routes
WHERE route_type IS NOT NULL
GROUP BY route_type
ORDER BY count DESC;

-- Tags (if any)
SELECT
    'Tags' as category,
    unnest(tags) as value,
    COUNT(*) as count
FROM routes
WHERE tags IS NOT NULL AND array_length(tags, 1) > 0
GROUP BY unnest(tags)
ORDER BY count DESC;

-- Training goals (if any)
SELECT
    'Training Goals' as category,
    training_goal as value,
    COUNT(*) as count
FROM routes
WHERE training_goal IS NOT NULL
GROUP BY training_goal
ORDER BY count DESC;

-- Overall summary
SELECT
    COUNT(*) as total_routes,
    COUNT(CASE WHEN activity_type IS NOT NULL THEN 1 END) as with_activity_type,
    COUNT(CASE WHEN surface_type IS NOT NULL THEN 1 END) as with_surface_type,
    COUNT(CASE WHEN route_type IS NOT NULL THEN 1 END) as with_route_type,
    COUNT(CASE WHEN tags IS NOT NULL AND array_length(tags, 1) > 0 THEN 1 END) as with_tags,
    COUNT(CASE WHEN training_goal IS NOT NULL THEN 1 END) as with_training_goal
FROM routes;

-- Sample routes with available categorization data
SELECT
    name,
    activity_type,
    surface_type,
    route_type,
    tags,
    training_goal,
    distance_km,
    recorded_at
FROM routes
WHERE activity_type IS NOT NULL
   OR surface_type IS NOT NULL
   OR route_type IS NOT NULL
   OR (tags IS NOT NULL AND array_length(tags, 1) > 0)
   OR training_goal IS NOT NULL
ORDER BY recorded_at DESC
LIMIT 10;