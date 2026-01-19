-- Migration: Add power metrics columns to activities table
-- These fields enable proper fitness analysis using real power data from Garmin FIT files
-- instead of estimating metrics from average watts

-- Add normalized power (intensity-weighted average power)
-- This is the gold standard for measuring ride intensity
ALTER TABLE activities ADD COLUMN IF NOT EXISTS normalized_power INTEGER;

-- Add max power (peak power during activity)
-- Essential for power curve analysis
ALTER TABLE activities ADD COLUMN IF NOT EXISTS max_watts INTEGER;

-- Add Training Stress Score (calculated from NP, IF, and duration)
-- When available from device, this is more accurate than our estimates
ALTER TABLE activities ADD COLUMN IF NOT EXISTS tss NUMERIC;

-- Add Intensity Factor (NP / FTP ratio)
-- Shows how hard the ride was relative to threshold
ALTER TABLE activities ADD COLUMN IF NOT EXISTS intensity_factor NUMERIC(4,3);

-- Add flag to indicate if power data is from a real power meter
-- vs estimated by Strava/Garmin from speed/HR
ALTER TABLE activities ADD COLUMN IF NOT EXISTS device_watts BOOLEAN DEFAULT FALSE;

-- Add power stream summary (for activities where we have FIT file data)
-- This stores key power curve points without needing full stream storage
-- Format: {"1s": 850, "5s": 720, "30s": 450, "60s": 380, "300s": 310, "1200s": 280}
ALTER TABLE activities ADD COLUMN IF NOT EXISTS power_curve_summary JSONB;

-- Create index on normalized_power for efficient queries
CREATE INDEX IF NOT EXISTS idx_activities_normalized_power
ON activities(normalized_power)
WHERE normalized_power IS NOT NULL;

-- Create index on tss for training load queries
CREATE INDEX IF NOT EXISTS idx_activities_tss
ON activities(tss)
WHERE tss IS NOT NULL;

-- Create index for finding activities with real power data
CREATE INDEX IF NOT EXISTS idx_activities_device_watts
ON activities(device_watts)
WHERE device_watts = TRUE;

COMMENT ON COLUMN activities.normalized_power IS 'Normalized Power (NP) - intensity-weighted average power in watts';
COMMENT ON COLUMN activities.max_watts IS 'Peak power output during the activity';
COMMENT ON COLUMN activities.tss IS 'Training Stress Score - calculated from NP, IF, and duration';
COMMENT ON COLUMN activities.intensity_factor IS 'Intensity Factor - ratio of NP to FTP (0.0 to ~1.5)';
COMMENT ON COLUMN activities.device_watts IS 'True if power data is from actual power meter, false if estimated';
COMMENT ON COLUMN activities.power_curve_summary IS 'Key power curve points (max power at 1s, 5s, 30s, 60s, 5min, 20min)';
