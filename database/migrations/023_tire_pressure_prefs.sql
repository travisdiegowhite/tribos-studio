-- Migration: Tire Pressure Preferences
-- Purpose: Store user's tire pressure calculator preferences
-- Adds JSONB column to user_profiles for tire setup data

-- ============================================================================
-- ENSURE USER_PROFILES TABLE EXISTS
-- (Creates if missing - normally created by initial schema)
-- ============================================================================
CREATE TABLE IF NOT EXISTS user_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Basic info
    display_name TEXT,
    avatar_url TEXT,
    bio TEXT,
    location TEXT,

    -- Account settings
    units_preference TEXT DEFAULT 'imperial' CHECK (units_preference IN ('metric', 'imperial')),
    timezone TEXT DEFAULT 'America/New_York',

    -- Training data
    ftp INTEGER,
    weight_kg NUMERIC(5,2),
    power_zones JSONB,

    -- Onboarding state
    onboarding_completed BOOLEAN DEFAULT FALSE,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS if not already enabled
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Create policies if they don't exist (will error silently if they do)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_profiles' AND policyname = 'Users can view own profile') THEN
        CREATE POLICY "Users can view own profile" ON user_profiles FOR SELECT USING (auth.uid() = id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_profiles' AND policyname = 'Users can update own profile') THEN
        CREATE POLICY "Users can update own profile" ON user_profiles FOR UPDATE USING (auth.uid() = id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_profiles' AND policyname = 'Users can insert own profile') THEN
        CREATE POLICY "Users can insert own profile" ON user_profiles FOR INSERT WITH CHECK (auth.uid() = id);
    END IF;
END $$;

-- ============================================================================
-- ADD TIRE_PRESSURE_PREFS COLUMN
-- ============================================================================
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
