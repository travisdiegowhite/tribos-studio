-- Migration: User Day Availability and Date Overrides
-- Enables users to block/prefer certain days for training plans
-- Run this in your Supabase SQL editor

-- ============================================================================
-- USER DAY AVAILABILITY TABLE
-- Global weekly availability settings (which days are blocked/preferred)
-- ============================================================================
CREATE TABLE IF NOT EXISTS user_day_availability (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Day configuration
    day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6), -- 0=Sunday, 6=Saturday
    is_blocked BOOLEAN DEFAULT false,
    is_preferred BOOLEAN DEFAULT false,
    max_duration_minutes INTEGER NULL, -- Optional time constraint for this day
    notes TEXT, -- e.g., "Work meetings all day"

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Each user can only have one entry per day of week
    UNIQUE(user_id, day_of_week)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_day_availability_user_id ON user_day_availability(user_id);

-- ============================================================================
-- USER DATE OVERRIDES TABLE
-- Date-specific overrides for when schedule changes temporarily
-- ============================================================================
CREATE TABLE IF NOT EXISTS user_date_overrides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Date configuration
    specific_date DATE NOT NULL,
    is_blocked BOOLEAN, -- NULL means use global default
    is_preferred BOOLEAN, -- NULL means use global default
    max_duration_minutes INTEGER NULL,
    notes TEXT, -- e.g., "Taking day off work"

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Each user can only have one override per date
    UNIQUE(user_id, specific_date)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_date_overrides_user_id ON user_date_overrides(user_id);
CREATE INDEX IF NOT EXISTS idx_user_date_overrides_date ON user_date_overrides(specific_date);
CREATE INDEX IF NOT EXISTS idx_user_date_overrides_user_date ON user_date_overrides(user_id, specific_date);

-- ============================================================================
-- USER TRAINING PREFERENCES TABLE
-- Global training preferences including max workouts per week
-- ============================================================================
CREATE TABLE IF NOT EXISTS user_training_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,

    -- Weekly constraints
    max_workouts_per_week INTEGER NULL CHECK (max_workouts_per_week >= 1 AND max_workouts_per_week <= 7),
    max_hours_per_week NUMERIC NULL CHECK (max_hours_per_week >= 1 AND max_hours_per_week <= 40),
    max_hard_days_per_week INTEGER NULL CHECK (max_hard_days_per_week >= 0 AND max_hard_days_per_week <= 4),

    -- Preferences
    prefer_morning_workouts BOOLEAN DEFAULT NULL,
    prefer_weekend_long_rides BOOLEAN DEFAULT true,
    min_rest_days_per_week INTEGER DEFAULT 1 CHECK (min_rest_days_per_week >= 0 AND min_rest_days_per_week <= 4),

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index
CREATE INDEX IF NOT EXISTS idx_user_training_preferences_user_id ON user_training_preferences(user_id);

-- ============================================================================
-- ENABLE ROW LEVEL SECURITY
-- ============================================================================
ALTER TABLE user_day_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_date_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_training_preferences ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- RLS POLICIES - User Day Availability
-- ============================================================================
DROP POLICY IF EXISTS "Users can view their own day availability" ON user_day_availability;
CREATE POLICY "Users can view their own day availability"
    ON user_day_availability FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own day availability" ON user_day_availability;
CREATE POLICY "Users can insert their own day availability"
    ON user_day_availability FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own day availability" ON user_day_availability;
CREATE POLICY "Users can update their own day availability"
    ON user_day_availability FOR UPDATE
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own day availability" ON user_day_availability;
CREATE POLICY "Users can delete their own day availability"
    ON user_day_availability FOR DELETE
    USING (auth.uid() = user_id);

-- ============================================================================
-- RLS POLICIES - User Date Overrides
-- ============================================================================
DROP POLICY IF EXISTS "Users can view their own date overrides" ON user_date_overrides;
CREATE POLICY "Users can view their own date overrides"
    ON user_date_overrides FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own date overrides" ON user_date_overrides;
CREATE POLICY "Users can insert their own date overrides"
    ON user_date_overrides FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own date overrides" ON user_date_overrides;
CREATE POLICY "Users can update their own date overrides"
    ON user_date_overrides FOR UPDATE
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own date overrides" ON user_date_overrides;
CREATE POLICY "Users can delete their own date overrides"
    ON user_date_overrides FOR DELETE
    USING (auth.uid() = user_id);

-- ============================================================================
-- RLS POLICIES - User Training Preferences
-- ============================================================================
DROP POLICY IF EXISTS "Users can view their own training preferences" ON user_training_preferences;
CREATE POLICY "Users can view their own training preferences"
    ON user_training_preferences FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own training preferences" ON user_training_preferences;
CREATE POLICY "Users can insert their own training preferences"
    ON user_training_preferences FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own training preferences" ON user_training_preferences;
CREATE POLICY "Users can update their own training preferences"
    ON user_training_preferences FOR UPDATE
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own training preferences" ON user_training_preferences;
CREATE POLICY "Users can delete their own training preferences"
    ON user_training_preferences FOR DELETE
    USING (auth.uid() = user_id);

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================
GRANT ALL ON user_day_availability TO authenticated;
GRANT ALL ON user_date_overrides TO authenticated;
GRANT ALL ON user_training_preferences TO authenticated;
GRANT ALL ON user_day_availability TO service_role;
GRANT ALL ON user_date_overrides TO service_role;
GRANT ALL ON user_training_preferences TO service_role;

-- ============================================================================
-- TRIGGER: Update timestamps
-- ============================================================================
CREATE OR REPLACE FUNCTION update_user_availability_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_user_day_availability_timestamp ON user_day_availability;
CREATE TRIGGER trigger_update_user_day_availability_timestamp
    BEFORE UPDATE ON user_day_availability
    FOR EACH ROW
    EXECUTE FUNCTION update_user_availability_timestamp();

DROP TRIGGER IF EXISTS trigger_update_user_date_overrides_timestamp ON user_date_overrides;
CREATE TRIGGER trigger_update_user_date_overrides_timestamp
    BEFORE UPDATE ON user_date_overrides
    FOR EACH ROW
    EXECUTE FUNCTION update_user_availability_timestamp();

DROP TRIGGER IF EXISTS trigger_update_user_training_preferences_timestamp ON user_training_preferences;
CREATE TRIGGER trigger_update_user_training_preferences_timestamp
    BEFORE UPDATE ON user_training_preferences
    FOR EACH ROW
    EXECUTE FUNCTION update_user_availability_timestamp();

-- ============================================================================
-- HELPER FUNCTION: Get effective availability for a specific date
-- Returns: 'blocked', 'preferred', or 'available'
-- ============================================================================
CREATE OR REPLACE FUNCTION get_date_availability(
    p_user_id UUID,
    p_date DATE
)
RETURNS TABLE (
    status TEXT,
    is_override BOOLEAN,
    max_duration_minutes INTEGER,
    notes TEXT
) AS $$
DECLARE
    v_day_of_week INTEGER;
    v_override RECORD;
    v_global RECORD;
BEGIN
    -- Get day of week (0=Sunday in PostgreSQL's EXTRACT)
    v_day_of_week := EXTRACT(DOW FROM p_date)::INTEGER;

    -- First check for date-specific override
    SELECT * INTO v_override
    FROM user_date_overrides udo
    WHERE udo.user_id = p_user_id
    AND udo.specific_date = p_date;

    IF FOUND THEN
        -- Use override values
        RETURN QUERY SELECT
            CASE
                WHEN v_override.is_blocked = true THEN 'blocked'
                WHEN v_override.is_preferred = true THEN 'preferred'
                ELSE 'available'
            END,
            true,
            v_override.max_duration_minutes,
            v_override.notes;
        RETURN;
    END IF;

    -- Fall back to global day-of-week setting
    SELECT * INTO v_global
    FROM user_day_availability uda
    WHERE uda.user_id = p_user_id
    AND uda.day_of_week = v_day_of_week;

    IF FOUND THEN
        RETURN QUERY SELECT
            CASE
                WHEN v_global.is_blocked = true THEN 'blocked'
                WHEN v_global.is_preferred = true THEN 'preferred'
                ELSE 'available'
            END,
            false,
            v_global.max_duration_minutes,
            v_global.notes;
        RETURN;
    END IF;

    -- Default: available
    RETURN QUERY SELECT 'available'::TEXT, false, NULL::INTEGER, NULL::TEXT;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- HELPER FUNCTION: Get all availability for a date range
-- Useful for displaying calendar with availability indicators
-- ============================================================================
CREATE OR REPLACE FUNCTION get_availability_range(
    p_user_id UUID,
    p_start_date DATE,
    p_end_date DATE
)
RETURNS TABLE (
    date DATE,
    status TEXT,
    is_override BOOLEAN,
    max_duration_minutes INTEGER,
    notes TEXT
) AS $$
DECLARE
    v_current_date DATE;
BEGIN
    v_current_date := p_start_date;

    WHILE v_current_date <= p_end_date LOOP
        RETURN QUERY
        SELECT
            v_current_date,
            (get_date_availability(p_user_id, v_current_date)).*;

        v_current_date := v_current_date + INTERVAL '1 day';
    END LOOP;
END;
$$ LANGUAGE plpgsql STABLE;
