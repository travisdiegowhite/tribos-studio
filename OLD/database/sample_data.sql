-- Sample data for testing the routes display
-- This creates some test routes and track points

-- Insert a sample route (replace the user_id with an actual user ID)
INSERT INTO routes (
    id,
    user_id, 
    name,
    description,
    distance_km,
    duration_seconds,
    elevation_gain_m,
    elevation_loss_m,
    imported_from,
    recorded_at,
    has_gps_data,
    start_latitude,
    start_longitude
) VALUES (
    'sample-route-1',
    'user-uuid-here', -- Replace with actual user UUID
    'Morning Ride in Denver',
    'A nice ride through the Denver area',
    25.5,
    3600,
    350,
    340,
    'strava',
    NOW() - INTERVAL '2 days',
    true,
    39.7392,
    -104.9903
);

-- Insert sample track points for the route
INSERT INTO track_points (
    route_id,
    latitude,
    longitude,
    elevation,
    time_seconds,
    distance_m,
    point_index
) VALUES 
    ('sample-route-1', 39.7392, -104.9903, 1600, 0, 0, 0),
    ('sample-route-1', 39.7400, -104.9900, 1605, 30, 100, 1),
    ('sample-route-1', 39.7410, -104.9890, 1610, 60, 250, 2),
    ('sample-route-1', 39.7420, -104.9880, 1615, 90, 400, 3),
    ('sample-route-1', 39.7430, -104.9870, 1620, 120, 600, 4),
    ('sample-route-1', 39.7440, -104.9860, 1625, 150, 800, 5);

-- Insert another sample route
INSERT INTO routes (
    id,
    user_id,
    name,
    distance_km,
    duration_seconds,
    elevation_gain_m,
    imported_from,
    recorded_at,
    has_gps_data,
    start_latitude,
    start_longitude
) VALUES (
    'sample-route-2',
    'user-uuid-here', -- Replace with actual user UUID  
    'Evening Loop',
    15.2,
    2400,
    200,
    'manual',
    NOW() - INTERVAL '5 days',
    true,
    39.7350,
    -104.9950
);

-- Track points for second route
INSERT INTO track_points (
    route_id,
    latitude,
    longitude,
    elevation,
    time_seconds,
    distance_m,
    point_index
) VALUES 
    ('sample-route-2', 39.7350, -104.9950, 1590, 0, 0, 0),
    ('sample-route-2', 39.7360, -104.9940, 1595, 40, 150, 1),
    ('sample-route-2', 39.7370, -104.9930, 1600, 80, 300, 2),
    ('sample-route-2', 39.7380, -104.9920, 1605, 120, 480, 3);