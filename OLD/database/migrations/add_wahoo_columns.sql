-- Add Wahoo integration columns to routes table
-- This migration adds support for Wahoo Fitness bike computer imports

-- Add Wahoo ID column (similar to strava_id)
ALTER TABLE routes
ADD COLUMN IF NOT EXISTS wahoo_id TEXT;

-- Add Wahoo URL column (link to workout on Wahoo Fitness)
ALTER TABLE routes
ADD COLUMN IF NOT EXISTS wahoo_url TEXT;

-- Create index on wahoo_id for efficient lookups
CREATE INDEX IF NOT EXISTS idx_routes_wahoo_id ON routes(wahoo_id);

-- Create unique constraint to prevent duplicate Wahoo imports
CREATE UNIQUE INDEX IF NOT EXISTS idx_routes_user_wahoo_id
ON routes(user_id, wahoo_id)
WHERE wahoo_id IS NOT NULL;

-- Add comments for documentation
COMMENT ON COLUMN routes.wahoo_id IS 'Unique workout ID from Wahoo Fitness API';
COMMENT ON COLUMN routes.wahoo_url IS 'URL to view workout on Wahoo Fitness website';

-- Verify the columns were added
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'routes'
AND column_name IN ('wahoo_id', 'wahoo_url')
ORDER BY column_name;
