-- User Preferences Schema for Enhanced AI Route Generation
-- This schema stores detailed user preferences for route generation

-- Main user preferences table
CREATE TABLE IF NOT EXISTS user_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
    
    -- Preference completion tracking
    onboarding_completed BOOLEAN DEFAULT FALSE,
    preferences_version INTEGER DEFAULT 1,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Routing preferences table
CREATE TABLE IF NOT EXISTS routing_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
    
    -- Traffic preferences
    traffic_tolerance TEXT DEFAULT 'low' CHECK (traffic_tolerance IN ('low', 'medium', 'high')),
    distance_from_traffic INTEGER DEFAULT 500, -- meters preferred distance from major roads
    
    -- Hill preferences
    hill_preference TEXT DEFAULT 'moderate' CHECK (hill_preference IN ('avoid', 'moderate', 'seek')),
    max_gradient_comfort INTEGER DEFAULT 10, -- maximum comfortable gradient percentage
    
    -- Road type preferences
    preferred_road_types TEXT[] DEFAULT ARRAY['residential', 'bike_path', 'quiet_road'],
    avoided_road_types TEXT[] DEFAULT ARRAY['highway', 'busy_arterial'],
    
    -- Routing style
    intersection_complexity TEXT DEFAULT 'simple' CHECK (intersection_complexity IN ('simple', 'moderate', 'complex')),
    turning_preference TEXT DEFAULT 'minimal_turns' CHECK (turning_preference IN ('minimal_turns', 'varied', 'technical')),
    route_type_preference TEXT DEFAULT 'flexible' CHECK (route_type_preference IN ('loop_preferred', 'out_back_preferred', 'flexible')),
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Surface preferences table
CREATE TABLE IF NOT EXISTS surface_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
    
    -- Surface types
    primary_surfaces TEXT[] DEFAULT ARRAY['paved_road', 'bike_path'],
    surface_quality TEXT DEFAULT 'good' CHECK (surface_quality IN ('excellent', 'good', 'fair', 'poor_ok')),
    
    -- Off-road tolerance
    gravel_tolerance DECIMAL(3,2) DEFAULT 0.1 CHECK (gravel_tolerance >= 0 AND gravel_tolerance <= 1),
    single_track_experience TEXT DEFAULT 'none' CHECK (single_track_experience IN ('none', 'beginner', 'intermediate', 'advanced')),
    
    -- Weather adjustments
    weather_surface_adjustment BOOLEAN DEFAULT TRUE,
    wet_weather_paved_only BOOLEAN DEFAULT TRUE,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Safety preferences table
CREATE TABLE IF NOT EXISTS safety_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
    
    -- Infrastructure preferences
    lighting_requirement TEXT DEFAULT 'not_required' CHECK (lighting_requirement IN ('required', 'preferred', 'not_required')),
    shoulder_width TEXT DEFAULT 'preferred' CHECK (shoulder_width IN ('required', 'preferred', 'not_important')),
    bike_infrastructure TEXT DEFAULT 'strongly_preferred' CHECK (bike_infrastructure IN ('required', 'strongly_preferred', 'preferred', 'flexible')),
    
    -- Safety features
    emergency_access TEXT DEFAULT 'good' CHECK (emergency_access IN ('excellent', 'good', 'basic')),
    cell_coverage TEXT DEFAULT 'important' CHECK (cell_coverage IN ('critical', 'important', 'nice_to_have', 'not_important')),
    
    -- Rest stops and support
    rest_stop_frequency INTEGER DEFAULT 15, -- km between potential rest stops
    mechanical_support TEXT DEFAULT 'basic' CHECK (mechanical_support IN ('full_service', 'basic', 'self_sufficient')),
    
    -- Group riding
    group_riding BOOLEAN DEFAULT FALSE,
    group_size INTEGER DEFAULT 1,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Scenic preferences table
CREATE TABLE IF NOT EXISTS scenic_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
    
    -- Scenic importance
    scenic_importance TEXT DEFAULT 'important' CHECK (scenic_importance IN ('critical', 'important', 'nice_to_have', 'not_important')),
    
    -- View preferences (stored as JSON array)
    preferred_views TEXT[] DEFAULT ARRAY['nature', 'water', 'rolling_hills'],
    avoided_views TEXT[] DEFAULT ARRAY['industrial'],
    
    -- Cultural interests
    cultural_interests TEXT[] DEFAULT ARRAY['historic_sites', 'cafes'],
    
    -- Photography and stops
    photography_stops BOOLEAN DEFAULT TRUE,
    scenic_detours BOOLEAN DEFAULT TRUE,
    
    -- Environment preferences
    quietness_level TEXT DEFAULT 'high' CHECK (quietness_level IN ('high', 'medium', 'low')),
    variety_importance TEXT DEFAULT 'medium' CHECK (variety_importance IN ('high', 'medium', 'low')),
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Training context table (dynamic, updates frequently)
CREATE TABLE IF NOT EXISTS training_context (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
    
    -- Current training phase
    current_phase TEXT DEFAULT 'base_building' CHECK (current_phase IN ('base_building', 'build', 'peak', 'recovery', 'maintenance')),
    
    -- Training volume
    weekly_volume_km DECIMAL(6,2) DEFAULT 100,
    weekly_rides INTEGER DEFAULT 3,
    longest_recent_ride DECIMAL(6,2),
    
    -- Intensity and fatigue
    recent_intensity TEXT DEFAULT 'moderate' CHECK (recent_intensity IN ('low', 'moderate', 'high')),
    fatigue_level TEXT DEFAULT 'fresh' CHECK (fatigue_level IN ('fresh', 'moderate', 'tired', 'exhausted')),
    
    -- Goals and events
    primary_goal TEXT DEFAULT 'fitness',
    upcoming_event_date DATE,
    upcoming_event_type TEXT,
    
    -- Physical considerations
    injury_areas TEXT[],
    recovery_focus TEXT[],
    
    -- Time constraints
    typical_ride_time INTEGER DEFAULT 60, -- minutes
    time_flexibility TEXT DEFAULT 'moderate' CHECK (time_flexibility IN ('high', 'moderate', 'low')),
    
    -- Equipment
    equipment_status TEXT DEFAULT 'good' CHECK (equipment_status IN ('excellent', 'good', 'fair', 'needs_attention')),
    
    last_updated TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Preference history table (track changes over time)
CREATE TABLE IF NOT EXISTS preference_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    preference_type TEXT NOT NULL,
    preference_key TEXT NOT NULL,
    old_value JSONB,
    new_value JSONB,
    change_reason TEXT,
    changed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_user_preferences_user_id ON user_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_routing_preferences_user_id ON routing_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_surface_preferences_user_id ON surface_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_safety_preferences_user_id ON safety_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_scenic_preferences_user_id ON scenic_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_training_context_user_id ON training_context(user_id);
CREATE INDEX IF NOT EXISTS idx_preference_history_user_id ON preference_history(user_id);
CREATE INDEX IF NOT EXISTS idx_preference_history_changed_at ON preference_history(changed_at DESC);

-- Enable Row Level Security
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE routing_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE surface_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE safety_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE scenic_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_context ENABLE ROW LEVEL SECURITY;
ALTER TABLE preference_history ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view and edit own preferences" ON user_preferences
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can view and edit own routing preferences" ON routing_preferences
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can view and edit own surface preferences" ON surface_preferences
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can view and edit own safety preferences" ON safety_preferences
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can view and edit own scenic preferences" ON scenic_preferences
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can view and edit own training context" ON training_context
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can view own preference history" ON preference_history
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "System can insert preference history" ON preference_history
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Grant permissions
GRANT ALL ON user_preferences TO authenticated;
GRANT ALL ON routing_preferences TO authenticated;
GRANT ALL ON surface_preferences TO authenticated;
GRANT ALL ON safety_preferences TO authenticated;
GRANT ALL ON scenic_preferences TO authenticated;
GRANT ALL ON training_context TO authenticated;
GRANT ALL ON preference_history TO authenticated;

-- Create function to automatically update timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers to update timestamps
CREATE TRIGGER update_user_preferences_updated_at BEFORE UPDATE ON user_preferences
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_routing_preferences_updated_at BEFORE UPDATE ON routing_preferences
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_surface_preferences_updated_at BEFORE UPDATE ON surface_preferences
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_safety_preferences_updated_at BEFORE UPDATE ON safety_preferences
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_scenic_preferences_updated_at BEFORE UPDATE ON scenic_preferences
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_training_context_updated_at BEFORE UPDATE ON training_context
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create function to initialize user preferences
CREATE OR REPLACE FUNCTION initialize_user_preferences(p_user_id UUID)
RETURNS VOID AS $$
BEGIN
    -- Insert with defaults if not exists
    INSERT INTO user_preferences (user_id) 
    VALUES (p_user_id) 
    ON CONFLICT (user_id) DO NOTHING;
    
    INSERT INTO routing_preferences (user_id) 
    VALUES (p_user_id) 
    ON CONFLICT (user_id) DO NOTHING;
    
    INSERT INTO surface_preferences (user_id) 
    VALUES (p_user_id) 
    ON CONFLICT (user_id) DO NOTHING;
    
    INSERT INTO safety_preferences (user_id) 
    VALUES (p_user_id) 
    ON CONFLICT (user_id) DO NOTHING;
    
    INSERT INTO scenic_preferences (user_id) 
    VALUES (p_user_id) 
    ON CONFLICT (user_id) DO NOTHING;
    
    INSERT INTO training_context (user_id) 
    VALUES (p_user_id) 
    ON CONFLICT (user_id) DO NOTHING;
END;
$$ LANGUAGE plpgsql;

-- Create view for complete user preferences
CREATE OR REPLACE VIEW user_preferences_complete AS
SELECT 
    u.id as user_id,
    u.email,
    up.onboarding_completed,
    up.preferences_version,
    
    -- Routing preferences
    rp.traffic_tolerance,
    rp.distance_from_traffic,
    rp.hill_preference,
    rp.max_gradient_comfort,
    rp.preferred_road_types,
    rp.avoided_road_types,
    rp.intersection_complexity,
    rp.turning_preference,
    rp.route_type_preference,
    
    -- Surface preferences
    sp.primary_surfaces,
    sp.surface_quality,
    sp.gravel_tolerance,
    sp.single_track_experience,
    sp.weather_surface_adjustment,
    sp.wet_weather_paved_only,
    
    -- Safety preferences
    saf.lighting_requirement,
    saf.shoulder_width,
    saf.bike_infrastructure,
    saf.emergency_access,
    saf.cell_coverage,
    saf.rest_stop_frequency,
    saf.mechanical_support,
    saf.group_riding,
    saf.group_size,
    
    -- Scenic preferences
    sc.scenic_importance,
    sc.preferred_views,
    sc.avoided_views,
    sc.cultural_interests,
    sc.photography_stops,
    sc.scenic_detours,
    sc.quietness_level,
    sc.variety_importance,
    
    -- Training context
    tc.current_phase,
    tc.weekly_volume_km,
    tc.weekly_rides,
    tc.longest_recent_ride,
    tc.recent_intensity,
    tc.fatigue_level,
    tc.primary_goal,
    tc.upcoming_event_date,
    tc.upcoming_event_type,
    tc.injury_areas,
    tc.recovery_focus,
    tc.typical_ride_time,
    tc.time_flexibility,
    tc.equipment_status,
    
    -- Timestamps
    up.created_at,
    up.updated_at
FROM auth.users u
LEFT JOIN user_preferences up ON u.id = up.user_id
LEFT JOIN routing_preferences rp ON u.id = rp.user_id
LEFT JOIN surface_preferences sp ON u.id = sp.user_id
LEFT JOIN safety_preferences saf ON u.id = saf.user_id
LEFT JOIN scenic_preferences sc ON u.id = sc.user_id
LEFT JOIN training_context tc ON u.id = tc.user_id;

-- Grant permissions on view
GRANT SELECT ON user_preferences_complete TO authenticated;