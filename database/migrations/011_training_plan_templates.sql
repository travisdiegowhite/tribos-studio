-- Migration: Training Plan Templates
-- Allows storing training plan templates in the database for admin management
-- Run this in your Supabase SQL editor

-- ============================================================================
-- TRAINING PLAN TEMPLATES TABLE
-- Store reusable training plan templates (admin-managed)
-- ============================================================================
CREATE TABLE IF NOT EXISTS training_plan_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Template identification
    template_id TEXT UNIQUE NOT NULL, -- Unique slug like 'polarized_8_week'
    name TEXT NOT NULL,
    description TEXT,

    -- Plan configuration
    duration_weeks INTEGER NOT NULL,
    methodology TEXT NOT NULL, -- 'polarized', 'sweet_spot', 'pyramidal', 'threshold', 'endurance'
    goal TEXT NOT NULL, -- 'general_fitness', 'century', 'climbing', 'racing', etc.
    fitness_level TEXT NOT NULL, -- 'beginner', 'intermediate', 'advanced'

    -- Weekly targets
    hours_per_week_min NUMERIC DEFAULT 3,
    hours_per_week_max NUMERIC DEFAULT 10,
    weekly_tss_min INTEGER DEFAULT 150,
    weekly_tss_max INTEGER DEFAULT 500,

    -- Phases (JSON array)
    phases JSONB NOT NULL DEFAULT '[]',
    -- Example: [{"weeks": [1,2,3], "phase": "base", "focus": "Build aerobic base"}]

    -- Week templates (JSON object keyed by week number)
    week_templates JSONB NOT NULL DEFAULT '{}',
    -- Example: {"1": {"sunday": {"workout": null, "notes": "Rest"}, ...}}

    -- Expected outcomes
    expected_gains JSONB DEFAULT '{}',
    -- Example: {"ftp": "8-12%", "endurance": "Significant improvement"}

    -- Target audience description
    target_audience TEXT,

    -- Admin metadata
    is_active BOOLEAN DEFAULT true, -- Can be disabled without deleting
    is_featured BOOLEAN DEFAULT false, -- Show prominently in UI
    display_order INTEGER DEFAULT 0, -- For sorting in lists

    -- Audit fields
    created_by UUID REFERENCES auth.users(id),
    updated_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_plan_templates_template_id ON training_plan_templates(template_id);
CREATE INDEX IF NOT EXISTS idx_plan_templates_methodology ON training_plan_templates(methodology);
CREATE INDEX IF NOT EXISTS idx_plan_templates_goal ON training_plan_templates(goal);
CREATE INDEX IF NOT EXISTS idx_plan_templates_fitness_level ON training_plan_templates(fitness_level);
CREATE INDEX IF NOT EXISTS idx_plan_templates_is_active ON training_plan_templates(is_active);
CREATE INDEX IF NOT EXISTS idx_plan_templates_is_featured ON training_plan_templates(is_featured);

-- ============================================================================
-- WORKOUT TEMPLATES TABLE
-- Store reusable workout definitions (admin-managed)
-- ============================================================================
CREATE TABLE IF NOT EXISTS workout_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Workout identification
    workout_id TEXT UNIQUE NOT NULL, -- Unique slug like 'recovery_spin'
    name TEXT NOT NULL,
    description TEXT,

    -- Classification
    category TEXT NOT NULL, -- 'recovery', 'endurance', 'tempo', 'sweet_spot', 'threshold', 'vo2max', 'climbing', 'anaerobic', 'racing'
    difficulty TEXT NOT NULL DEFAULT 'intermediate', -- 'beginner', 'intermediate', 'advanced'

    -- Targets
    duration_minutes INTEGER NOT NULL,
    target_tss INTEGER,
    intensity_factor NUMERIC,

    -- Details
    focus_area TEXT,
    tags TEXT[] DEFAULT '{}',
    terrain_type TEXT DEFAULT 'flat', -- 'flat', 'rolling', 'hilly'

    -- Structure (JSON - warmup, main, cooldown)
    structure JSONB NOT NULL DEFAULT '{}',

    -- Coach notes
    coach_notes TEXT,

    -- Admin metadata
    is_active BOOLEAN DEFAULT true,
    display_order INTEGER DEFAULT 0,

    -- Audit fields
    created_by UUID REFERENCES auth.users(id),
    updated_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_workout_templates_workout_id ON workout_templates(workout_id);
CREATE INDEX IF NOT EXISTS idx_workout_templates_category ON workout_templates(category);
CREATE INDEX IF NOT EXISTS idx_workout_templates_difficulty ON workout_templates(difficulty);
CREATE INDEX IF NOT EXISTS idx_workout_templates_is_active ON workout_templates(is_active);

-- ============================================================================
-- USER CUSTOM PLANS TABLE
-- Allow users to create their own training plans
-- ============================================================================
CREATE TABLE IF NOT EXISTS user_custom_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Plan details (same structure as templates)
    name TEXT NOT NULL,
    description TEXT,
    duration_weeks INTEGER NOT NULL,
    methodology TEXT,
    goal TEXT,
    fitness_level TEXT,

    hours_per_week_min NUMERIC,
    hours_per_week_max NUMERIC,
    weekly_tss_min INTEGER,
    weekly_tss_max INTEGER,

    phases JSONB DEFAULT '[]',
    week_templates JSONB DEFAULT '{}',
    expected_gains JSONB DEFAULT '{}',

    -- Sharing
    is_public BOOLEAN DEFAULT false, -- Allow others to clone
    clone_count INTEGER DEFAULT 0,

    -- Source tracking
    cloned_from_template_id UUID REFERENCES training_plan_templates(id),
    cloned_from_user_plan_id UUID REFERENCES user_custom_plans(id),

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_custom_plans_user_id ON user_custom_plans(user_id);
CREATE INDEX IF NOT EXISTS idx_user_custom_plans_is_public ON user_custom_plans(is_public);

-- ============================================================================
-- ENABLE ROW LEVEL SECURITY
-- ============================================================================
ALTER TABLE training_plan_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_custom_plans ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- RLS POLICIES FOR TRAINING PLAN TEMPLATES (Public read, admin write)
-- ============================================================================
-- Everyone can view active templates
CREATE POLICY "Anyone can view active plan templates"
    ON training_plan_templates
    FOR SELECT
    USING (is_active = true);

-- Only admins can modify templates (requires admin role check in app)
-- For now, no direct write access via RLS - use service role for admin operations

-- ============================================================================
-- RLS POLICIES FOR WORKOUT TEMPLATES (Public read, admin write)
-- ============================================================================
CREATE POLICY "Anyone can view active workout templates"
    ON workout_templates
    FOR SELECT
    USING (is_active = true);

-- ============================================================================
-- RLS POLICIES FOR USER CUSTOM PLANS
-- ============================================================================
-- Users can view their own plans
CREATE POLICY "Users can view their own custom plans"
    ON user_custom_plans
    FOR SELECT
    USING (auth.uid() = user_id);

-- Users can view public plans
CREATE POLICY "Anyone can view public custom plans"
    ON user_custom_plans
    FOR SELECT
    USING (is_public = true);

-- Users can create their own plans
CREATE POLICY "Users can create their own custom plans"
    ON user_custom_plans
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Users can update their own plans
CREATE POLICY "Users can update their own custom plans"
    ON user_custom_plans
    FOR UPDATE
    USING (auth.uid() = user_id);

-- Users can delete their own plans
CREATE POLICY "Users can delete their own custom plans"
    ON user_custom_plans
    FOR DELETE
    USING (auth.uid() = user_id);

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to increment clone count when a plan is cloned
CREATE OR REPLACE FUNCTION increment_clone_count()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.cloned_from_template_id IS NOT NULL THEN
        -- Increment template clone count (would need a clone_count column)
        NULL;
    END IF;
    IF NEW.cloned_from_user_plan_id IS NOT NULL THEN
        UPDATE user_custom_plans
        SET clone_count = clone_count + 1
        WHERE id = NEW.cloned_from_user_plan_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_user_plan_created
    AFTER INSERT ON user_custom_plans
    FOR EACH ROW
    EXECUTE FUNCTION increment_clone_count();

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_template_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_plan_template_timestamp
    BEFORE UPDATE ON training_plan_templates
    FOR EACH ROW
    EXECUTE FUNCTION update_template_timestamp();

CREATE TRIGGER update_workout_template_timestamp
    BEFORE UPDATE ON workout_templates
    FOR EACH ROW
    EXECUTE FUNCTION update_template_timestamp();

CREATE TRIGGER update_user_custom_plan_timestamp
    BEFORE UPDATE ON user_custom_plans
    FOR EACH ROW
    EXECUTE FUNCTION update_template_timestamp();

-- ============================================================================
-- SEED DATA FUNCTION
-- Call this to populate templates from the JS constants
-- ============================================================================
-- Note: Seed data should be inserted via a script that reads from
-- trainingPlanTemplates.ts and workoutLibrary.ts files
-- This can be done via a Node.js script using the Supabase client

COMMENT ON TABLE training_plan_templates IS 'Stores training plan templates that can be activated by users';
COMMENT ON TABLE workout_templates IS 'Stores workout definitions referenced by training plans';
COMMENT ON TABLE user_custom_plans IS 'Stores user-created custom training plans';
