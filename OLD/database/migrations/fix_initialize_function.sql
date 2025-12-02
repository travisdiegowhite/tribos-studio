-- Fix initialize_progression_levels function - parameter naming issue

-- Drop the old function first
DROP FUNCTION IF EXISTS initialize_progression_levels(uuid);

-- Recreate with proper parameter name
CREATE OR REPLACE FUNCTION initialize_progression_levels(p_user_id UUID)
RETURNS VOID AS $$
DECLARE
  zones VARCHAR[] := ARRAY['recovery', 'endurance', 'tempo', 'sweet_spot', 'threshold', 'vo2max', 'anaerobic'];
  zone_name VARCHAR;
BEGIN
  FOREACH zone_name IN ARRAY zones
  LOOP
    INSERT INTO progression_levels (user_id, zone, level)
    VALUES (p_user_id, zone_name, 3.0)
    ON CONFLICT (user_id, zone) DO NOTHING;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

SELECT 'Fixed initialize_progression_levels function' as status;
