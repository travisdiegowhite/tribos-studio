-- Update routes table to support hybrid import tracking
-- Note: imported_from column already exists with CHECK constraint
-- This migration updates it to support 'garmin' value and creates indexes

-- Step 1: Drop existing CHECK constraint
ALTER TABLE routes DROP CONSTRAINT IF EXISTS routes_imported_from_check;

-- Step 2: Add new CHECK constraint that includes 'garmin'
ALTER TABLE routes ADD CONSTRAINT routes_imported_from_check
CHECK (imported_from IN ('manual', 'strava', 'file_upload', 'garmin'));

-- Step 3: Add comment explaining the column
COMMENT ON COLUMN routes.imported_from IS 'Source of the route import: manual, strava, file_upload, garmin';

-- Step 4: Create index for filtering by source (if not exists)
CREATE INDEX IF NOT EXISTS idx_routes_imported_from ON routes(imported_from);

-- Step 5: Create index for duplicate detection (time + distance)
CREATE INDEX IF NOT EXISTS idx_routes_recorded_at_distance ON routes(recorded_at, distance_km)
WHERE recorded_at IS NOT NULL AND distance_km IS NOT NULL;

-- Step 6: Update existing routes to mark their source if identifiable
-- (Only update routes that are currently NULL or need correction)
UPDATE routes
SET imported_from = CASE
  WHEN strava_id IS NOT NULL THEN 'strava'
  WHEN external_id IS NOT NULL THEN 'garmin'
  WHEN imported_from IS NULL THEN 'manual'
  ELSE imported_from
END
WHERE imported_from IS NULL
   OR (imported_from = 'file_upload' AND strava_id IS NOT NULL)
   OR (imported_from = 'file_upload' AND external_id IS NOT NULL);

-- Verification query
SELECT
  imported_from,
  COUNT(*) as count
FROM routes
GROUP BY imported_from
ORDER BY count DESC;

SELECT 'imported_from column updated to support garmin, indexes created' AS status;
