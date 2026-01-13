-- Migration: Tire Pressure Preferences
-- Purpose: Store user's tire pressure calculator preferences
-- Adds JSONB column to user_profiles for tire setup data

-- Add tire_pressure_prefs column to existing user_profiles table
ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS tire_pressure_prefs JSONB DEFAULT NULL;

-- Add a comment describing the expected structure
COMMENT ON COLUMN user_profiles.tire_pressure_prefs IS
'User tire pressure calculator preferences. Structure: {
  "bikeWeight": number (lbs),
  "tireWidth": number (mm),
  "ridingStyle": "smooth" | "mixed" | "rough" | "gravel",
  "tubeless": boolean,
  "unit": "psi" | "bar"
}';
