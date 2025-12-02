-- Create a sample route with GPS data for testing
-- Replace 'your-user-id-here' with your actual user UUID

-- Insert a test route with GPS coordinates
INSERT INTO routes (
    id,
    user_id,
    name,
    description,
    distance_km,
    duration_seconds,
    elevation_gain_m,
    elevation_loss_m,
    average_speed,
    imported_from,
    recorded_at,
    has_gps_data,
    track_points_count,
    start_latitude,
    start_longitude,
    end_latitude,
    end_longitude
) VALUES (
    gen_random_uuid(),
    'your-user-id-here', -- REPLACE THIS WITH YOUR USER ID
    'Test GPS Route - Mountain Loop',
    'Sample route with GPS data for testing maps',
    25.5,
    3600, -- 1 hour
    450,
    440,
    25.2, -- km/h
    'manual',
    NOW() - INTERVAL '1 day',
    true,
    20, -- Will be updated after inserting track points
    39.7392, -- Denver area start
    -104.9903,
    39.7500, -- Denver area end
    -104.9800
) RETURNING id;

-- Note: After running this, you'll need to replace the route_id below with the actual ID returned
-- Then insert sample track points for the route
INSERT INTO track_points (
    route_id,
    latitude,
    longitude,
    elevation,
    time_seconds,
    distance_m,
    point_index
) VALUES
    -- Replace 'route-id-here' with the actual route ID from above
    ('route-id-here', 39.7392, -104.9903, 1600, 0, 0, 0),
    ('route-id-here', 39.7400, -104.9900, 1605, 120, 500, 1),
    ('route-id-here', 39.7410, -104.9890, 1610, 240, 1200, 2),
    ('route-id-here', 39.7420, -104.9880, 1615, 360, 2000, 3),
    ('route-id-here', 39.7430, -104.9870, 1620, 480, 2800, 4),
    ('route-id-here', 39.7440, -104.9860, 1625, 600, 3600, 5),
    ('route-id-here', 39.7445, -104.9850, 1630, 720, 4400, 6),
    ('route-id-here', 39.7450, -104.9840, 1635, 840, 5200, 7),
    ('route-id-here', 39.7460, -104.9830, 1640, 960, 6000, 8),
    ('route-id-here', 39.7470, -104.9820, 1645, 1080, 6800, 9),
    ('route-id-here', 39.7480, -104.9810, 1650, 1200, 7600, 10),
    ('route-id-here', 39.7485, -104.9805, 1655, 1320, 8400, 11),
    ('route-id-here', 39.7490, -104.9800, 1660, 1440, 9200, 12),
    ('route-id-here', 39.7495, -104.9795, 1665, 1560, 10000, 13),
    ('route-id-here', 39.7500, -104.9790, 1670, 1680, 10800, 14),
    ('route-id-here', 39.7500, -104.9795, 1665, 1800, 11600, 15),
    ('route-id-here', 39.7500, -104.9800, 1660, 1920, 12400, 16),
    ('route-id-here', 39.7502, -104.9802, 1658, 2040, 13200, 17),
    ('route-id-here', 39.7504, -104.9804, 1656, 2160, 14000, 18),
    ('route-id-here', 39.7500, -104.9800, 1655, 2280, 14800, 19);

-- Update the track points count
UPDATE routes
SET track_points_count = 20
WHERE name = 'Test GPS Route - Mountain Loop';

-- Verify the data was inserted correctly
SELECT
    r.name,
    r.has_gps_data,
    r.track_points_count,
    r.start_latitude,
    r.start_longitude,
    COUNT(tp.id) as actual_track_points
FROM routes r
LEFT JOIN track_points tp ON r.id = tp.route_id
WHERE r.name = 'Test GPS Route - Mountain Loop'
GROUP BY r.id, r.name, r.has_gps_data, r.track_points_count, r.start_latitude, r.start_longitude;