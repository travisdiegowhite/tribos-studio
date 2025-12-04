-- Migration: Add FTP and power zones to user_profiles
-- Run this in your Supabase SQL editor

-- Add FTP and weight columns to user_profiles
ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS ftp INTEGER, -- Functional Threshold Power in watts
ADD COLUMN IF NOT EXISTS weight_kg NUMERIC(5,2), -- Weight in kg for W/kg calculations
ADD COLUMN IF NOT EXISTS power_zones JSONB; -- Calculated power zones

-- Add comment for clarity
COMMENT ON COLUMN user_profiles.ftp IS 'Functional Threshold Power in watts';
COMMENT ON COLUMN user_profiles.weight_kg IS 'Rider weight in kilograms';
COMMENT ON COLUMN user_profiles.power_zones IS 'Calculated power zones based on FTP (Z1-Z7 with watts ranges)';

-- Create a function to calculate power zones from FTP
CREATE OR REPLACE FUNCTION calculate_power_zones(ftp_watts INTEGER)
RETURNS JSONB AS $$
DECLARE
  zones JSONB;
BEGIN
  IF ftp_watts IS NULL OR ftp_watts <= 0 THEN
    RETURN NULL;
  END IF;

  zones := jsonb_build_object(
    'z1', jsonb_build_object(
      'name', 'Recovery',
      'min', 0,
      'max', ROUND(ftp_watts * 0.55),
      'description', 'Active recovery, very easy spinning'
    ),
    'z2', jsonb_build_object(
      'name', 'Endurance',
      'min', ROUND(ftp_watts * 0.55),
      'max', ROUND(ftp_watts * 0.75),
      'description', 'All-day pace, fat burning, base building'
    ),
    'z3', jsonb_build_object(
      'name', 'Tempo',
      'min', ROUND(ftp_watts * 0.75),
      'max', ROUND(ftp_watts * 0.90),
      'description', 'Moderate effort, sustainable for hours'
    ),
    'z4', jsonb_build_object(
      'name', 'Threshold',
      'min', ROUND(ftp_watts * 0.90),
      'max', ROUND(ftp_watts * 1.05),
      'description', 'Race pace, sustainable for 20-60 minutes'
    ),
    'z5', jsonb_build_object(
      'name', 'VO2max',
      'min', ROUND(ftp_watts * 1.05),
      'max', ROUND(ftp_watts * 1.20),
      'description', 'High intensity intervals, 3-8 minutes'
    ),
    'z6', jsonb_build_object(
      'name', 'Anaerobic',
      'min', ROUND(ftp_watts * 1.20),
      'max', ROUND(ftp_watts * 1.50),
      'description', 'Short hard efforts, 30 seconds to 2 minutes'
    ),
    'z7', jsonb_build_object(
      'name', 'Neuromuscular',
      'min', ROUND(ftp_watts * 1.50),
      'max', NULL,
      'description', 'Maximum power sprints, under 30 seconds'
    )
  );

  RETURN zones;
END;
$$ LANGUAGE plpgsql;

-- Create a trigger to auto-calculate power zones when FTP is updated
CREATE OR REPLACE FUNCTION update_power_zones()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.ftp IS DISTINCT FROM OLD.ftp THEN
    NEW.power_zones := calculate_power_zones(NEW.ftp);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists, then create
DROP TRIGGER IF EXISTS trigger_update_power_zones ON user_profiles;

CREATE TRIGGER trigger_update_power_zones
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_power_zones();

-- Also trigger on insert
DROP TRIGGER IF EXISTS trigger_insert_power_zones ON user_profiles;

CREATE TRIGGER trigger_insert_power_zones
  BEFORE INSERT ON user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_power_zones();
