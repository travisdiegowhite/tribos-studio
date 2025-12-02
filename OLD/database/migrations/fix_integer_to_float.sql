-- Fix schema to accept decimal values for metrics that aren't truly integers
-- Strava API returns floats for elevation and power, rounding loses precision

-- Step 1: Drop dependent views
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

-- Step 4: Recreate the route_summary view
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

-- Keep as INTEGER (these make sense as whole numbers):
-- - duration_seconds (whole seconds)
-- - average_heartrate (BPM is whole numbers)
-- - max_heartrate (BPM is whole numbers)
-- - kilojoules (energy, typically whole numbers)
-- - training_stress_score (computed metric, whole numbers)

COMMENT ON COLUMN routes.elevation_gain_m IS 'Elevation gain in meters (float for precision)';
COMMENT ON COLUMN routes.elevation_loss_m IS 'Elevation loss in meters (float for precision)';
COMMENT ON COLUMN routes.average_watts IS 'Average power in watts (float for precision)';
COMMENT ON COLUMN routes.max_watts IS 'Maximum power in watts (float for precision)';
