-- Fix schema to accept decimal values for elevation and power metrics
-- This resolves webhook errors: "invalid input syntax for type integer: "11.363""
--
-- Root Cause: Garmin FIT files return float values for elevation and power,
-- but database columns were defined as INTEGER, causing PostgreSQL to reject the inserts.
--
-- Date: 2025-11-25
-- Related Issue: Garmin webhook failures with integer type mismatch

-- Step 1: Drop dependent views (if they exist)
DROP VIEW IF EXISTS public.route_summary CASCADE;

-- Step 2: Change elevation fields from INTEGER to FLOAT
ALTER TABLE routes
  ALTER COLUMN elevation_gain_m TYPE FLOAT USING elevation_gain_m::FLOAT;

ALTER TABLE routes
  ALTER COLUMN elevation_loss_m TYPE FLOAT USING elevation_loss_m::FLOAT;

-- Step 3: Change power fields from INTEGER to FLOAT
ALTER TABLE routes
  ALTER COLUMN average_watts TYPE FLOAT USING average_watts::FLOAT;

ALTER TABLE routes
  ALTER COLUMN max_watts TYPE FLOAT USING max_watts::FLOAT;

ALTER TABLE routes
  ALTER COLUMN normalized_power TYPE FLOAT USING normalized_power::FLOAT;

-- Step 4: Fix track_points table as well
ALTER TABLE track_points
  ALTER COLUMN elevation TYPE FLOAT USING elevation::FLOAT;

ALTER TABLE track_points
  ALTER COLUMN distance_m TYPE FLOAT USING distance_m::FLOAT;

-- Step 5: Recreate the route_summary view
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

-- Use security_invoker for safety
ALTER VIEW public.route_summary SET (security_invoker = true);

-- Add helpful comments
COMMENT ON COLUMN routes.elevation_gain_m IS 'Elevation gain in meters (float for precision from Garmin/Strava)';
COMMENT ON COLUMN routes.elevation_loss_m IS 'Elevation loss in meters (float for precision from Garmin/Strava)';
COMMENT ON COLUMN routes.average_watts IS 'Average power in watts (float for precision)';
COMMENT ON COLUMN routes.max_watts IS 'Maximum power in watts (float for precision)';
COMMENT ON COLUMN routes.normalized_power IS 'Normalized power in watts (float for precision)';

-- Verification query to confirm types are now FLOAT/double precision
SELECT
  table_name,
  column_name,
  data_type
FROM information_schema.columns
WHERE table_name IN ('routes', 'track_points')
  AND column_name IN ('elevation_gain_m', 'elevation_loss_m', 'average_watts', 'max_watts', 'normalized_power', 'elevation', 'distance_m')
ORDER BY table_name, column_name;

-- Expected output after migration:
-- table_name   | column_name       | data_type
-- -------------|-------------------|----------------
-- routes       | average_watts     | double precision
-- routes       | elevation_gain_m  | double precision
-- routes       | elevation_loss_m  | double precision
-- routes       | max_watts         | double precision
-- routes       | normalized_power  | double precision
-- track_points | distance_m        | double precision
-- track_points | elevation         | double precision

-- Note: These columns remain INTEGER (appropriate for whole numbers):
-- - routes.duration_seconds (whole seconds)
-- - routes.average_heartrate (BPM is whole numbers)
-- - routes.max_heartrate (BPM is whole numbers)
-- - routes.kilojoules (energy, typically whole numbers)
-- - routes.training_stress_score (computed metric, whole numbers)
