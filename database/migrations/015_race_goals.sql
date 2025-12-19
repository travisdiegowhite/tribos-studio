-- Migration: Race Goals
-- Enables athletes to set target races and events that AI coaches can use for training planning
-- Run this in your Supabase SQL editor

-- ============================================================================
-- RACE GOALS TABLE
-- Store user's target races and events for training periodization
-- ============================================================================
CREATE TABLE IF NOT EXISTS race_goals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Race identification
    name TEXT NOT NULL,
    race_date DATE NOT NULL,

    -- Race type and details
    race_type TEXT NOT NULL DEFAULT 'road_race', -- 'road_race', 'criterium', 'time_trial', 'gran_fondo', 'century', 'gravel', 'cyclocross', 'mtb', 'triathlon', 'other'
    distance_km NUMERIC,
    elevation_gain_m NUMERIC,
    location TEXT,

    -- Priority for training periodization
    priority TEXT NOT NULL DEFAULT 'B', -- 'A' (main goal), 'B' (important), 'C' (training race)

    -- Performance goals (optional)
    goal_time_minutes INTEGER, -- Target finish time in minutes
    goal_power_watts INTEGER, -- Target average power
    goal_placement TEXT, -- e.g., 'Top 10', 'Finish', 'Podium', 'Win'

    -- Training plan linkage
    training_plan_id UUID REFERENCES training_plans(id) ON DELETE SET NULL,

    -- Status tracking
    status TEXT NOT NULL DEFAULT 'upcoming', -- 'upcoming', 'completed', 'cancelled', 'dns' (did not start)
    completed_at TIMESTAMPTZ,

    -- Actual results (filled after race)
    actual_time_minutes INTEGER,
    actual_power_watts INTEGER,
    actual_placement TEXT,
    result_notes TEXT,

    -- User notes
    notes TEXT,
    course_description TEXT,

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_race_goals_user_id ON race_goals(user_id);
CREATE INDEX IF NOT EXISTS idx_race_goals_race_date ON race_goals(race_date);
CREATE INDEX IF NOT EXISTS idx_race_goals_status ON race_goals(status);
CREATE INDEX IF NOT EXISTS idx_race_goals_priority ON race_goals(priority);

-- ============================================================================
-- ENABLE ROW LEVEL SECURITY
-- ============================================================================
ALTER TABLE race_goals ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- RLS POLICIES - Race Goals
-- ============================================================================
DROP POLICY IF EXISTS "Users can view their own race goals" ON race_goals;
CREATE POLICY "Users can view their own race goals"
    ON race_goals FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own race goals" ON race_goals;
CREATE POLICY "Users can insert their own race goals"
    ON race_goals FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own race goals" ON race_goals;
CREATE POLICY "Users can update their own race goals"
    ON race_goals FOR UPDATE
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own race goals" ON race_goals;
CREATE POLICY "Users can delete their own race goals"
    ON race_goals FOR DELETE
    USING (auth.uid() = user_id);

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================
GRANT ALL ON race_goals TO authenticated;
GRANT ALL ON race_goals TO service_role;

-- ============================================================================
-- TRIGGER: Update race_goals timestamps
-- ============================================================================
CREATE OR REPLACE FUNCTION update_race_goals_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_race_goals_timestamp ON race_goals;
CREATE TRIGGER trigger_update_race_goals_timestamp
    BEFORE UPDATE ON race_goals
    FOR EACH ROW
    EXECUTE FUNCTION update_race_goals_timestamp();

-- ============================================================================
-- FUNCTION: Get upcoming races for a user
-- Returns races within a given number of days, ordered by date
-- ============================================================================
CREATE OR REPLACE FUNCTION get_upcoming_races(p_user_id UUID, p_days_ahead INTEGER DEFAULT 180)
RETURNS TABLE (
    id UUID,
    name TEXT,
    race_date DATE,
    race_type TEXT,
    distance_km NUMERIC,
    priority TEXT,
    days_until INTEGER,
    goal_time_minutes INTEGER,
    goal_power_watts INTEGER,
    goal_placement TEXT,
    notes TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        rg.id,
        rg.name,
        rg.race_date,
        rg.race_type,
        rg.distance_km,
        rg.priority,
        (rg.race_date - CURRENT_DATE)::INTEGER as days_until,
        rg.goal_time_minutes,
        rg.goal_power_watts,
        rg.goal_placement,
        rg.notes
    FROM race_goals rg
    WHERE rg.user_id = p_user_id
      AND rg.status = 'upcoming'
      AND rg.race_date >= CURRENT_DATE
      AND rg.race_date <= CURRENT_DATE + p_days_ahead
    ORDER BY rg.race_date ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- FUNCTION: Get next A-priority race
-- Returns the next main goal race for periodization
-- ============================================================================
CREATE OR REPLACE FUNCTION get_next_a_race(p_user_id UUID)
RETURNS TABLE (
    id UUID,
    name TEXT,
    race_date DATE,
    race_type TEXT,
    distance_km NUMERIC,
    days_until INTEGER,
    goal_time_minutes INTEGER,
    goal_power_watts INTEGER,
    goal_placement TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        rg.id,
        rg.name,
        rg.race_date,
        rg.race_type,
        rg.distance_km,
        (rg.race_date - CURRENT_DATE)::INTEGER as days_until,
        rg.goal_time_minutes,
        rg.goal_power_watts,
        rg.goal_placement
    FROM race_goals rg
    WHERE rg.user_id = p_user_id
      AND rg.status = 'upcoming'
      AND rg.priority = 'A'
      AND rg.race_date >= CURRENT_DATE
    ORDER BY rg.race_date ASC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
