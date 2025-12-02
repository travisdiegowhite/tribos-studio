-- Add device_model column to routes table for Garmin API brand compliance
-- Garmin Developer API Brand Guidelines require "Garmin [device model]" attribution
-- for all displays of Garmin device-sourced data

-- Step 1: Add device_model column
ALTER TABLE routes ADD COLUMN IF NOT EXISTS device_model VARCHAR(100);

-- Step 2: Add comment explaining the column
COMMENT ON COLUMN routes.device_model IS 'Device model name for imported activities (e.g., "Edge 530", "Forerunner 945"). Required for Garmin brand compliance attribution.';

-- Step 3: Create index for filtering/grouping by device model
CREATE INDEX IF NOT EXISTS idx_routes_device_model ON routes(device_model)
WHERE device_model IS NOT NULL;

-- Step 4: Create index for Garmin routes (imported_from = 'garmin')
CREATE INDEX IF NOT EXISTS idx_routes_garmin_device ON routes(imported_from, device_model)
WHERE imported_from = 'garmin';

-- Verification query
SELECT
  imported_from,
  device_model,
  COUNT(*) as count
FROM routes
WHERE imported_from = 'garmin'
GROUP BY imported_from, device_model
ORDER BY count DESC;

SELECT 'device_model column added for Garmin brand compliance' AS status;
