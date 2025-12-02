-- ============================================================================
-- TRIBOS.STUDIO MVP SCHEMA v3.0
-- AI Training Dashboard + AI Route Builder
-- ============================================================================
--
-- This is a clean, consolidated schema designed for the MVP:
--   1. AI-driven Training Dashboard
--   2. AI Route Builder
--
-- Architecture decisions:
--   - All tables use auth.uid() for RLS (Supabase auth integration)
--   - Cascading deletes for referential integrity
--   - JSONB for flexible structured data (avoids migration churn)
--   - Helper functions encapsulate domain logic
--   - Extension points marked for future coach platform
--
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- ============================================================================
-- SECTION 1: USER PROFILES
-- ============================================================================

CREATE TABLE user_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Basic info
    display_name TEXT,
    avatar_url TEXT,
    bio TEXT,
    location TEXT,

    -- Account settings
    units_preference TEXT DEFAULT 'imperial' CHECK (units_preference IN ('metric', 'imperial')),
    timezone TEXT DEFAULT 'America/New_York',

    -- Onboarding state
    onboarding_completed BOOLEAN DEFAULT FALSE,
    onboarding_step INTEGER DEFAULT 0,

    -- Feature flags
    beta_features_enabled BOOLEAN DEFAULT FALSE,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()

    -- EXTENSION POINT: Add account_type ('athlete'|'coach') when implementing coach platform
);

CREATE INDEX idx_user_profiles_created ON user_profiles(created_at DESC);

-- RLS
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile" ON user_profiles
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON user_profiles
    FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON user_profiles
    FOR INSERT WITH CHECK (auth.uid() = id);

-- ============================================================================
-- SECTION 2: FTP & TRAINING ZONES
-- ============================================================================

CREATE TABLE user_ftp_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- FTP data
    ftp_watts INTEGER NOT NULL CHECK (ftp_watts > 0 AND ftp_watts < 600),
    lthr_bpm INTEGER CHECK (lthr_bpm > 0 AND lthr_bpm < 250), -- Lactate threshold HR

    -- How it was determined
    test_type TEXT NOT NULL CHECK (test_type IN ('ramp', '20min', '8min', 'auto_detected', 'manual')),
    test_notes TEXT,

    -- Validity
    is_current BOOLEAN DEFAULT TRUE,
    effective_date DATE DEFAULT CURRENT_DATE,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Only one current FTP per user (partial unique index)
CREATE UNIQUE INDEX unique_current_ftp ON user_ftp_history(user_id) WHERE is_current = TRUE;
CREATE INDEX idx_ftp_user_current ON user_ftp_history(user_id, is_current) WHERE is_current = TRUE;
CREATE INDEX idx_ftp_user_date ON user_ftp_history(user_id, effective_date DESC);

-- RLS
ALTER TABLE user_ftp_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own FTP" ON user_ftp_history
    FOR ALL USING (auth.uid() = user_id);

-- Training zones (7-zone model based on FTP)
CREATE TABLE training_zones (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    zone_number INTEGER NOT NULL CHECK (zone_number BETWEEN 1 AND 7),
    zone_name TEXT NOT NULL,

    -- Power ranges (watts)
    power_floor INTEGER,
    power_ceiling INTEGER,

    -- Heart rate ranges (bpm)
    hr_floor INTEGER,
    hr_ceiling INTEGER,

    -- FTP percentages for reference
    ftp_percent_floor DECIMAL(5,2),
    ftp_percent_ceiling DECIMAL(5,2),

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(user_id, zone_number)
);

CREATE INDEX idx_zones_user ON training_zones(user_id);

-- RLS
ALTER TABLE training_zones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own zones" ON training_zones
    FOR ALL USING (auth.uid() = user_id);

-- ============================================================================
-- SECTION 3: ROUTES & ACTIVITIES
-- ============================================================================

CREATE TABLE routes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Basic info
    name TEXT NOT NULL,
    description TEXT,
    route_type TEXT CHECK (route_type IN ('ride', 'planned_route', 'ai_generated')),

    -- Distance & elevation
    distance_km DECIMAL(10,2),
    elevation_gain_m INTEGER,
    elevation_loss_m INTEGER,

    -- Performance metrics (for completed rides)
    moving_time_seconds INTEGER,
    elapsed_time_seconds INTEGER,
    avg_speed_kph DECIMAL(5,2),
    max_speed_kph DECIMAL(5,2),

    -- Power data
    avg_power_watts INTEGER,
    max_power_watts INTEGER,
    normalized_power INTEGER,

    -- Heart rate data
    avg_hr_bpm INTEGER,
    max_hr_bpm INTEGER,

    -- Cadence
    avg_cadence INTEGER,

    -- Training metrics (calculated)
    training_stress_score DECIMAL(6,2),
    intensity_factor DECIMAL(4,3),
    variability_index DECIMAL(4,3),

    -- Geometry (PostGIS)
    start_point GEOGRAPHY(POINT, 4326),
    end_point GEOGRAPHY(POINT, 4326),
    route_line GEOGRAPHY(LINESTRING, 4326),

    -- Alternative: JSONB coordinates for simpler queries
    coordinates JSONB, -- [[lng, lat, elevation], ...]

    -- External IDs for deduplication
    strava_id BIGINT UNIQUE,
    garmin_id TEXT UNIQUE,
    wahoo_id TEXT UNIQUE,

    -- Source tracking
    source TEXT CHECK (source IN ('manual', 'strava', 'garmin', 'wahoo', 'gpx_upload', 'ai_generated')),

    -- AI generation metadata
    ai_metadata JSONB, -- {prompt, model, preferences_snapshot, alternatives}

    -- Activity timestamp
    activity_date TIMESTAMPTZ,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_routes_user_date ON routes(user_id, activity_date DESC);
CREATE INDEX idx_routes_user_created ON routes(user_id, created_at DESC);
CREATE INDEX idx_routes_strava ON routes(strava_id) WHERE strava_id IS NOT NULL;
CREATE INDEX idx_routes_garmin ON routes(garmin_id) WHERE garmin_id IS NOT NULL;
CREATE INDEX idx_routes_source ON routes(user_id, source);

-- RLS
ALTER TABLE routes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own routes" ON routes
    FOR ALL USING (auth.uid() = user_id);

-- Track points (GPS telemetry)
CREATE TABLE track_points (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    route_id UUID NOT NULL REFERENCES routes(id) ON DELETE CASCADE,

    -- Position
    latitude DECIMAL(10,7) NOT NULL,
    longitude DECIMAL(10,7) NOT NULL,
    elevation_m DECIMAL(7,2),

    -- Performance at this point
    power_watts INTEGER,
    heart_rate_bpm INTEGER,
    cadence_rpm INTEGER,
    speed_kph DECIMAL(5,2),

    -- Timing
    timestamp TIMESTAMPTZ,
    sequence_index INTEGER NOT NULL,

    -- Calculated
    gradient_percent DECIMAL(5,2),
    distance_from_start_m DECIMAL(10,2)
);

CREATE INDEX idx_trackpoints_route ON track_points(route_id, sequence_index);

-- RLS (inherits from route ownership)
ALTER TABLE track_points ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users access own track points" ON track_points
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM routes
            WHERE routes.id = track_points.route_id
            AND routes.user_id = auth.uid()
        )
    );

-- ============================================================================
-- SECTION 4: TRAINING PLANS & WORKOUTS
-- ============================================================================

-- Workout templates (system library + user custom)
CREATE TABLE workout_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Null user_id = system template
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Basic info
    name TEXT NOT NULL,
    description TEXT,

    -- Classification
    workout_type TEXT NOT NULL CHECK (workout_type IN (
        'recovery', 'endurance', 'tempo', 'sweet_spot',
        'threshold', 'vo2max', 'anaerobic', 'sprint',
        'hill_repeats', 'mixed'
    )),

    -- Duration
    duration_minutes INTEGER NOT NULL,

    -- Difficulty (1-10)
    difficulty_level INTEGER CHECK (difficulty_level BETWEEN 1 AND 10),

    -- Structure
    intervals JSONB NOT NULL, -- [{name, duration_seconds, target_power_percent, target_hr_zone, cadence_target}]

    -- Expected training load
    expected_tss DECIMAL(5,1),
    expected_if DECIMAL(4,3),

    -- Library reference for frontend
    library_id TEXT UNIQUE,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_templates_user ON workout_templates(user_id);
CREATE INDEX idx_templates_type ON workout_templates(workout_type);
CREATE INDEX idx_templates_library ON workout_templates(library_id) WHERE library_id IS NOT NULL;

-- RLS
ALTER TABLE workout_templates ENABLE ROW LEVEL SECURITY;

-- System templates are readable by all
CREATE POLICY "Anyone can read system templates" ON workout_templates
    FOR SELECT USING (user_id IS NULL);

CREATE POLICY "Users manage own templates" ON workout_templates
    FOR ALL USING (auth.uid() = user_id);

-- Training plans
CREATE TABLE training_plans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Basic info
    name TEXT NOT NULL,
    description TEXT,

    -- Goal
    goal TEXT CHECK (goal IN (
        'general_fitness', 'endurance', 'climbing',
        'racing', 'gran_fondo', 'weight_loss', 'custom'
    )),
    target_event_date DATE,
    target_event_name TEXT,

    -- Current phase
    current_phase TEXT CHECK (current_phase IN (
        'base', 'build', 'peak', 'taper', 'recovery', 'off_season'
    )),

    -- Duration
    start_date DATE NOT NULL,
    end_date DATE,

    -- Weekly volume targets
    target_weekly_hours DECIMAL(4,1),
    target_weekly_tss INTEGER,

    -- Status
    status TEXT DEFAULT 'active' CHECK (status IN ('draft', 'active', 'paused', 'completed', 'archived')),

    -- AI generation metadata
    ai_generated BOOLEAN DEFAULT FALSE,
    ai_metadata JSONB,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()

    -- EXTENSION POINT: Add coach_id for coach-assigned plans
);

CREATE INDEX idx_plans_user_status ON training_plans(user_id, status);
CREATE INDEX idx_plans_user_dates ON training_plans(user_id, start_date, end_date);

-- RLS
ALTER TABLE training_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own plans" ON training_plans
    FOR ALL USING (auth.uid() = user_id);

-- Planned/scheduled workouts
CREATE TABLE planned_workouts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Optional plan association
    plan_id UUID REFERENCES training_plans(id) ON DELETE SET NULL,

    -- Template reference (optional - can be custom)
    template_id UUID REFERENCES workout_templates(id) ON DELETE SET NULL,

    -- Scheduling
    scheduled_date DATE NOT NULL,
    scheduled_time TIME,

    -- Workout details (copied from template or custom)
    name TEXT NOT NULL,
    description TEXT,
    workout_type TEXT NOT NULL,
    duration_minutes INTEGER NOT NULL,
    intervals JSONB,

    -- Targets
    target_tss DECIMAL(5,1),
    target_if DECIMAL(4,3),

    -- Completion tracking
    status TEXT DEFAULT 'scheduled' CHECK (status IN (
        'scheduled', 'in_progress', 'completed', 'skipped', 'partial'
    )),
    completed_at TIMESTAMPTZ,

    -- Link to actual ride if completed
    completed_route_id UUID REFERENCES routes(id) ON DELETE SET NULL,

    -- AI recommendation metadata
    ai_recommended BOOLEAN DEFAULT FALSE,
    ai_metadata JSONB, -- {reason, confidence, alternatives}

    -- Adaptation tracking
    original_workout_id UUID, -- If this was adapted from another workout
    adaptation_reason TEXT,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()

    -- EXTENSION POINT: Add coach_id for coach-assigned workouts
);

CREATE INDEX idx_workouts_user_date ON planned_workouts(user_id, scheduled_date);
CREATE INDEX idx_workouts_user_status ON planned_workouts(user_id, status);
CREATE INDEX idx_workouts_plan ON planned_workouts(plan_id) WHERE plan_id IS NOT NULL;

-- RLS
ALTER TABLE planned_workouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own workouts" ON planned_workouts
    FOR ALL USING (auth.uid() = user_id);

-- Workout feedback (post-ride surveys)
CREATE TABLE workout_feedback (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workout_id UUID NOT NULL REFERENCES planned_workouts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- RPE (Rate of Perceived Exertion) 1-10
    rpe INTEGER CHECK (rpe BETWEEN 1 AND 10),

    -- How it felt
    difficulty_vs_expected TEXT CHECK (difficulty_vs_expected IN (
        'much_easier', 'easier', 'as_expected', 'harder', 'much_harder'
    )),

    -- Completion quality
    intervals_completed INTEGER,
    intervals_total INTEGER,

    -- Freeform feedback
    notes TEXT,

    -- What struggled with
    struggles JSONB, -- ['power_targets', 'duration', 'recovery', 'motivation', 'weather']

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_feedback_workout ON workout_feedback(workout_id);
CREATE INDEX idx_feedback_user ON workout_feedback(user_id, created_at DESC);

-- RLS
ALTER TABLE workout_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own feedback" ON workout_feedback
    FOR ALL USING (auth.uid() = user_id);

-- ============================================================================
-- SECTION 5: RIDE ANALYSIS & PERFORMANCE
-- ============================================================================

CREATE TABLE ride_analysis (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    route_id UUID NOT NULL UNIQUE REFERENCES routes(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Zone time distribution (seconds in each zone)
    zone_distribution JSONB NOT NULL, -- {zone1: 600, zone2: 1200, ...}

    -- Peak power efforts (watts)
    peak_powers JSONB NOT NULL, -- {5s: 850, 1min: 450, 5min: 320, 20min: 280, 60min: 250}

    -- Efficiency metrics
    variability_index DECIMAL(4,3),
    intensity_factor DECIMAL(4,3),
    efficiency_factor DECIMAL(6,3), -- NP / avg HR

    -- Heart rate analysis
    hr_power_decoupling DECIMAL(5,2), -- % drift
    avg_hr_to_power_ratio DECIMAL(6,3),

    -- Pacing quality (1-10)
    pacing_score INTEGER CHECK (pacing_score BETWEEN 1 AND 10),
    pacing_notes TEXT,

    -- Training stress breakdown by zone
    tss_by_zone JSONB, -- {zone1: 5, zone2: 15, ...}

    -- Match burning (hard efforts)
    matches_burned INTEGER,
    match_details JSONB, -- [{start_time, duration, avg_power, max_power}]

    -- AI insights
    ai_analysis JSONB, -- {summary, strengths, improvements, recommendations}

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_analysis_route ON ride_analysis(route_id);
CREATE INDEX idx_analysis_user ON ride_analysis(user_id, created_at DESC);

-- RLS
ALTER TABLE ride_analysis ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own analysis" ON ride_analysis
    FOR ALL USING (auth.uid() = user_id);

-- Training metrics (daily aggregates for CTL/ATL/TSB)
CREATE TABLE training_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    metric_date DATE NOT NULL,

    -- Daily totals
    daily_tss DECIMAL(6,1) DEFAULT 0,
    daily_duration_minutes INTEGER DEFAULT 0,
    daily_distance_km DECIMAL(8,2) DEFAULT 0,
    daily_elevation_m INTEGER DEFAULT 0,

    -- Rolling fitness metrics
    ctl DECIMAL(6,2), -- Chronic Training Load (42-day)
    atl DECIMAL(6,2), -- Acute Training Load (7-day)
    tsb DECIMAL(6,2), -- Training Stress Balance (CTL - ATL)

    -- Weekly aggregates (for the week ending on this date)
    weekly_tss DECIMAL(7,1),
    weekly_duration_minutes INTEGER,
    weekly_distance_km DECIMAL(9,2),
    weekly_elevation_m INTEGER,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(user_id, metric_date)
);

CREATE INDEX idx_metrics_user_date ON training_metrics(user_id, metric_date DESC);

-- RLS
ALTER TABLE training_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own metrics" ON training_metrics
    FOR ALL USING (auth.uid() = user_id);

-- Health metrics (daily biometrics)
CREATE TABLE health_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    metric_date DATE NOT NULL,

    -- Heart rate
    resting_hr INTEGER CHECK (resting_hr BETWEEN 30 AND 120),
    hrv_ms INTEGER CHECK (hrv_ms BETWEEN 0 AND 200), -- Heart Rate Variability

    -- Sleep
    sleep_hours DECIMAL(3,1) CHECK (sleep_hours BETWEEN 0 AND 24),
    sleep_quality INTEGER CHECK (sleep_quality BETWEEN 1 AND 10),

    -- Body
    weight_kg DECIMAL(5,2) CHECK (weight_kg BETWEEN 30 AND 200),
    body_fat_percent DECIMAL(4,1) CHECK (body_fat_percent BETWEEN 3 AND 60),

    -- Subjective
    energy_level INTEGER CHECK (energy_level BETWEEN 1 AND 10),
    stress_level INTEGER CHECK (stress_level BETWEEN 1 AND 10),
    muscle_soreness INTEGER CHECK (muscle_soreness BETWEEN 1 AND 10),

    -- Device metrics
    body_battery INTEGER CHECK (body_battery BETWEEN 0 AND 100),
    readiness_score INTEGER CHECK (readiness_score BETWEEN 0 AND 100),

    -- Source
    source TEXT CHECK (source IN ('manual', 'garmin', 'whoop', 'oura', 'apple_health')),

    -- Notes
    notes TEXT,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(user_id, metric_date)
);

CREATE INDEX idx_health_user_date ON health_metrics(user_id, metric_date DESC);

-- RLS
ALTER TABLE health_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own health metrics" ON health_metrics
    FOR ALL USING (auth.uid() = user_id);

-- ============================================================================
-- SECTION 6: AI COACH CONVERSATIONS
-- ============================================================================

CREATE TABLE ai_coach_conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Conversation metadata
    title TEXT,
    topic TEXT CHECK (topic IN (
        'workouts', 'recovery', 'metrics', 'planning',
        'nutrition', 'equipment', 'general'
    )),

    -- Messages array
    messages JSONB NOT NULL DEFAULT '[]', -- [{role, content, timestamp, workout_recommendation?}]

    -- Context snapshot at conversation start
    context_snapshot JSONB, -- {ftp, recent_tss, current_phase, tsb, recent_workouts}

    -- AI actions taken
    actions_taken JSONB DEFAULT '[]', -- [{type: 'scheduled_workout', workout_id, timestamp}]

    -- Status
    is_archived BOOLEAN DEFAULT FALSE,
    archived_at TIMESTAMPTZ,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_conversations_user ON ai_coach_conversations(user_id, created_at DESC);
CREATE INDEX idx_conversations_user_active ON ai_coach_conversations(user_id, is_archived)
    WHERE is_archived = FALSE;

-- RLS
ALTER TABLE ai_coach_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own conversations" ON ai_coach_conversations
    FOR ALL USING (auth.uid() = user_id);

-- ============================================================================
-- SECTION 7: BIKE COMPUTER INTEGRATIONS
-- ============================================================================

CREATE TABLE bike_computer_integrations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Provider
    provider TEXT NOT NULL CHECK (provider IN ('strava', 'garmin', 'wahoo')),

    -- Provider's user ID
    provider_user_id TEXT,
    provider_username TEXT,

    -- OAuth tokens (encrypted at rest by Supabase)
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    token_expires_at TIMESTAMPTZ,

    -- OAuth 1.0a specific (Garmin)
    oauth_token_secret TEXT,

    -- Permissions granted
    scopes TEXT[],

    -- Webhook registration
    webhook_id TEXT,
    webhook_verified BOOLEAN DEFAULT FALSE,

    -- Sync state
    last_sync_at TIMESTAMPTZ,
    sync_enabled BOOLEAN DEFAULT TRUE,

    -- Status
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'expired', 'revoked', 'error')),
    error_message TEXT,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(user_id, provider)
);

CREATE INDEX idx_integrations_user ON bike_computer_integrations(user_id);
CREATE INDEX idx_integrations_provider ON bike_computer_integrations(provider, provider_user_id);
CREATE INDEX idx_integrations_webhook ON bike_computer_integrations(webhook_id) WHERE webhook_id IS NOT NULL;

-- RLS
ALTER TABLE bike_computer_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own integrations" ON bike_computer_integrations
    FOR ALL USING (auth.uid() = user_id);

-- Sync history for debugging and tracking
CREATE TABLE sync_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    integration_id UUID NOT NULL REFERENCES bike_computer_integrations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- What was synced
    sync_type TEXT NOT NULL CHECK (sync_type IN ('activity', 'route', 'webhook', 'bulk_import')),

    -- External activity ID
    external_activity_id TEXT,

    -- Result
    status TEXT NOT NULL CHECK (status IN ('success', 'skipped', 'error')),
    error_message TEXT,

    -- Created route if successful
    route_id UUID REFERENCES routes(id) ON DELETE SET NULL,

    -- Raw data for debugging
    raw_data JSONB,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sync_integration ON sync_history(integration_id, created_at DESC);
CREATE INDEX idx_sync_user ON sync_history(user_id, created_at DESC);
CREATE INDEX idx_sync_external ON sync_history(integration_id, external_activity_id);

-- RLS
ALTER TABLE sync_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own sync history" ON sync_history
    FOR ALL USING (auth.uid() = user_id);

-- ============================================================================
-- SECTION 8: USER PREFERENCES (AI ROUTING)
-- ============================================================================

CREATE TABLE routing_preferences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Traffic & roads
    traffic_tolerance TEXT DEFAULT 'moderate' CHECK (traffic_tolerance IN ('none', 'low', 'moderate', 'high')),
    road_type_preference TEXT DEFAULT 'mixed' CHECK (road_type_preference IN ('roads_only', 'prefer_roads', 'mixed', 'prefer_paths', 'paths_only')),

    -- Hills
    hill_preference TEXT DEFAULT 'moderate' CHECK (hill_preference IN ('avoid', 'minimize', 'moderate', 'seek', 'maximize')),
    max_gradient_percent INTEGER DEFAULT 15 CHECK (max_gradient_percent BETWEEN 5 AND 25),

    -- Route style
    prefer_loops BOOLEAN DEFAULT TRUE,
    avoid_repeating_segments BOOLEAN DEFAULT TRUE,

    -- Surface
    surface_preference TEXT DEFAULT 'paved' CHECK (surface_preference IN ('paved_only', 'prefer_paved', 'mixed', 'prefer_gravel', 'gravel_only')),

    -- Safety
    prefer_bike_infrastructure BOOLEAN DEFAULT TRUE,
    avoid_high_speed_roads BOOLEAN DEFAULT TRUE,

    -- Scenery
    scenic_preference TEXT DEFAULT 'moderate' CHECK (scenic_preference IN ('fastest', 'balanced', 'moderate', 'scenic', 'most_scenic')),

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE routing_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own routing preferences" ON routing_preferences
    FOR ALL USING (auth.uid() = user_id);

-- Training context for AI recommendations
CREATE TABLE training_context (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Current training state
    current_phase TEXT CHECK (current_phase IN ('base', 'build', 'peak', 'taper', 'recovery', 'off_season')),
    weekly_volume_target_hours DECIMAL(4,1),

    -- Fatigue state
    current_fatigue TEXT DEFAULT 'moderate' CHECK (current_fatigue IN ('fresh', 'light', 'moderate', 'tired', 'exhausted')),

    -- Goals
    primary_goal TEXT CHECK (primary_goal IN (
        'general_fitness', 'endurance', 'climbing', 'speed',
        'racing', 'gran_fondo', 'weight_loss'
    )),

    -- Constraints
    time_constraints JSONB, -- {weekday_max_hours: 1.5, weekend_max_hours: 4}
    equipment_status JSONB, -- {indoor_trainer: true, power_meter: true, hr_monitor: true}

    -- Injuries/limitations
    current_limitations TEXT[],

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE training_context ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own training context" ON training_context
    FOR ALL USING (auth.uid() = user_id);

-- ============================================================================
-- SECTION 9: ADAPTATION & PROGRESSION
-- ============================================================================

-- Adaptation settings (user preferences for auto-adjustments)
CREATE TABLE adaptation_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Master toggle
    adaptive_enabled BOOLEAN DEFAULT TRUE,

    -- Auto-apply or require approval
    auto_apply BOOLEAN DEFAULT FALSE,

    -- Sensitivity
    sensitivity TEXT DEFAULT 'moderate' CHECK (sensitivity IN ('conservative', 'moderate', 'aggressive')),

    -- What to adapt
    adapt_intensity BOOLEAN DEFAULT TRUE,
    adapt_duration BOOLEAN DEFAULT TRUE,
    adapt_workout_type BOOLEAN DEFAULT FALSE,

    -- Thresholds
    fatigue_threshold DECIMAL(4,1) DEFAULT -20, -- TSB threshold for reducing load
    freshness_threshold DECIMAL(4,1) DEFAULT 20, -- TSB threshold for increasing load

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE adaptation_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own adaptation settings" ON adaptation_settings
    FOR ALL USING (auth.uid() = user_id);

-- Adaptation history (audit trail)
CREATE TABLE adaptation_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- What was adapted
    workout_id UUID REFERENCES planned_workouts(id) ON DELETE SET NULL,

    -- The change
    adaptation_type TEXT NOT NULL CHECK (adaptation_type IN (
        'intensity_reduced', 'intensity_increased',
        'duration_reduced', 'duration_increased',
        'workout_swapped', 'rest_day_inserted', 'workout_removed'
    )),

    -- Before/after
    original_values JSONB, -- {duration: 60, target_tss: 80}
    adapted_values JSONB, -- {duration: 45, target_tss: 55}

    -- Why
    reason TEXT NOT NULL,
    trigger_metrics JSONB, -- {tsb: -25, rpe_trend: 8.5, sleep_avg: 5.5}

    -- Status
    was_applied BOOLEAN DEFAULT FALSE,
    applied_at TIMESTAMPTZ,
    was_rejected BOOLEAN DEFAULT FALSE,
    rejection_reason TEXT,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_adaptation_user ON adaptation_history(user_id, created_at DESC);
CREATE INDEX idx_adaptation_workout ON adaptation_history(workout_id);

-- RLS
ALTER TABLE adaptation_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own adaptation history" ON adaptation_history
    FOR ALL USING (auth.uid() = user_id);

-- Progression levels (track improvement by workout type)
CREATE TABLE progression_levels (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    workout_type TEXT NOT NULL CHECK (workout_type IN (
        'endurance', 'tempo', 'sweet_spot', 'threshold',
        'vo2max', 'anaerobic', 'sprint'
    )),

    -- Current level (1.0 - 10.0)
    level DECIMAL(3,1) NOT NULL DEFAULT 1.0 CHECK (level BETWEEN 1.0 AND 10.0),

    -- Trend
    level_trend TEXT DEFAULT 'stable' CHECK (level_trend IN ('declining', 'stable', 'improving', 'breakthrough')),

    -- Last assessment
    last_assessed_at TIMESTAMPTZ,
    assessment_workout_id UUID REFERENCES planned_workouts(id) ON DELETE SET NULL,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(user_id, workout_type)
);

CREATE INDEX idx_progression_user ON progression_levels(user_id);

-- RLS
ALTER TABLE progression_levels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own progression" ON progression_levels
    FOR ALL USING (auth.uid() = user_id);

-- ============================================================================
-- SECTION 10: HELPER FUNCTIONS
-- ============================================================================

-- Get user's current FTP
CREATE OR REPLACE FUNCTION get_current_ftp(p_user_id UUID)
RETURNS INTEGER AS $$
    SELECT ftp_watts FROM user_ftp_history
    WHERE user_id = p_user_id AND is_current = TRUE
    LIMIT 1;
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- Set new FTP and initialize zones
CREATE OR REPLACE FUNCTION set_ftp_and_zones(
    p_user_id UUID,
    p_ftp INTEGER,
    p_test_type TEXT DEFAULT 'manual'
)
RETURNS void AS $$
BEGIN
    -- Mark old FTP as not current
    UPDATE user_ftp_history
    SET is_current = FALSE, updated_at = NOW()
    WHERE user_id = p_user_id AND is_current = TRUE;

    -- Insert new FTP
    INSERT INTO user_ftp_history (user_id, ftp_watts, test_type, is_current)
    VALUES (p_user_id, p_ftp, p_test_type, TRUE);

    -- Update training zones based on standard percentages
    DELETE FROM training_zones WHERE user_id = p_user_id;

    INSERT INTO training_zones (user_id, zone_number, zone_name, power_floor, power_ceiling, ftp_percent_floor, ftp_percent_ceiling)
    VALUES
        (p_user_id, 1, 'Recovery', 0, ROUND(p_ftp * 0.55), 0, 55),
        (p_user_id, 2, 'Endurance', ROUND(p_ftp * 0.56), ROUND(p_ftp * 0.75), 56, 75),
        (p_user_id, 3, 'Tempo', ROUND(p_ftp * 0.76), ROUND(p_ftp * 0.87), 76, 87),
        (p_user_id, 4, 'Sweet Spot', ROUND(p_ftp * 0.88), ROUND(p_ftp * 0.94), 88, 94),
        (p_user_id, 5, 'Threshold', ROUND(p_ftp * 0.95), ROUND(p_ftp * 1.05), 95, 105),
        (p_user_id, 6, 'VO2max', ROUND(p_ftp * 1.06), ROUND(p_ftp * 1.20), 106, 120),
        (p_user_id, 7, 'Anaerobic', ROUND(p_ftp * 1.21), NULL, 121, NULL);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Calculate TSS from power data
CREATE OR REPLACE FUNCTION calculate_tss(
    p_normalized_power INTEGER,
    p_ftp INTEGER,
    p_duration_seconds INTEGER
)
RETURNS DECIMAL AS $$
DECLARE
    intensity_factor DECIMAL;
BEGIN
    IF p_ftp IS NULL OR p_ftp = 0 THEN
        RETURN NULL;
    END IF;

    intensity_factor := p_normalized_power::DECIMAL / p_ftp;

    RETURN (p_duration_seconds * p_normalized_power * intensity_factor) / (p_ftp * 3600) * 100;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Update training metrics after ride sync
CREATE OR REPLACE FUNCTION update_training_metrics(p_user_id UUID, p_date DATE)
RETURNS void AS $$
DECLARE
    daily_stats RECORD;
    ctl_value DECIMAL;
    atl_value DECIMAL;
BEGIN
    -- Calculate daily totals
    SELECT
        COALESCE(SUM(training_stress_score), 0) as tss,
        COALESCE(SUM(moving_time_seconds / 60), 0) as duration,
        COALESCE(SUM(distance_km), 0) as distance,
        COALESCE(SUM(elevation_gain_m), 0) as elevation
    INTO daily_stats
    FROM routes
    WHERE user_id = p_user_id
    AND DATE(activity_date) = p_date;

    -- Calculate CTL (42-day exponential weighted average)
    SELECT COALESCE(AVG(daily_tss), 0) INTO ctl_value
    FROM training_metrics
    WHERE user_id = p_user_id
    AND metric_date BETWEEN p_date - INTERVAL '42 days' AND p_date - INTERVAL '1 day';

    -- Calculate ATL (7-day exponential weighted average)
    SELECT COALESCE(AVG(daily_tss), 0) INTO atl_value
    FROM training_metrics
    WHERE user_id = p_user_id
    AND metric_date BETWEEN p_date - INTERVAL '7 days' AND p_date - INTERVAL '1 day';

    -- Upsert metrics
    INSERT INTO training_metrics (
        user_id, metric_date,
        daily_tss, daily_duration_minutes, daily_distance_km, daily_elevation_m,
        ctl, atl, tsb
    )
    VALUES (
        p_user_id, p_date,
        daily_stats.tss, daily_stats.duration, daily_stats.distance, daily_stats.elevation,
        ctl_value, atl_value, ctl_value - atl_value
    )
    ON CONFLICT (user_id, metric_date)
    DO UPDATE SET
        daily_tss = EXCLUDED.daily_tss,
        daily_duration_minutes = EXCLUDED.daily_duration_minutes,
        daily_distance_km = EXCLUDED.daily_distance_km,
        daily_elevation_m = EXCLUDED.daily_elevation_m,
        ctl = EXCLUDED.ctl,
        atl = EXCLUDED.atl,
        tsb = EXCLUDED.tsb,
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Initialize user preferences on signup
CREATE OR REPLACE FUNCTION initialize_user_preferences(p_user_id UUID)
RETURNS void AS $$
BEGIN
    -- Create profile
    INSERT INTO user_profiles (id)
    VALUES (p_user_id)
    ON CONFLICT (id) DO NOTHING;

    -- Create routing preferences with defaults
    INSERT INTO routing_preferences (user_id)
    VALUES (p_user_id)
    ON CONFLICT (user_id) DO NOTHING;

    -- Create training context
    INSERT INTO training_context (user_id)
    VALUES (p_user_id)
    ON CONFLICT (user_id) DO NOTHING;

    -- Create adaptation settings
    INSERT INTO adaptation_settings (user_id)
    VALUES (p_user_id)
    ON CONFLICT (user_id) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- SECTION 11: TRIGGERS
-- ============================================================================

-- Auto-update updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables with updated_at
CREATE TRIGGER update_user_profiles_updated_at BEFORE UPDATE ON user_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_training_zones_updated_at BEFORE UPDATE ON training_zones
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_routes_updated_at BEFORE UPDATE ON routes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_workout_templates_updated_at BEFORE UPDATE ON workout_templates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_training_plans_updated_at BEFORE UPDATE ON training_plans
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_planned_workouts_updated_at BEFORE UPDATE ON planned_workouts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_ride_analysis_updated_at BEFORE UPDATE ON ride_analysis
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_training_metrics_updated_at BEFORE UPDATE ON training_metrics
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_health_metrics_updated_at BEFORE UPDATE ON health_metrics
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_ai_conversations_updated_at BEFORE UPDATE ON ai_coach_conversations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_integrations_updated_at BEFORE UPDATE ON bike_computer_integrations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_routing_prefs_updated_at BEFORE UPDATE ON routing_preferences
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_training_context_updated_at BEFORE UPDATE ON training_context
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_adaptation_settings_updated_at BEFORE UPDATE ON adaptation_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_progression_levels_updated_at BEFORE UPDATE ON progression_levels
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- SECTION 12: SEED DATA (System Workout Templates)
-- ============================================================================

INSERT INTO workout_templates (user_id, name, description, workout_type, duration_minutes, difficulty_level, intervals, expected_tss, expected_if, library_id) VALUES

-- Recovery
(NULL, 'Easy Spin', 'Light recovery ride to promote blood flow', 'recovery', 30, 1,
 '[{"name": "Easy spin", "duration_seconds": 1800, "target_power_percent": 50, "cadence_target": 90}]',
 15, 0.50, 'recovery_easy_30'),

(NULL, 'Active Recovery', 'Gentle pedaling for recovery', 'recovery', 45, 2,
 '[{"name": "Warm up", "duration_seconds": 300, "target_power_percent": 45}, {"name": "Easy spin", "duration_seconds": 2100, "target_power_percent": 52}, {"name": "Cool down", "duration_seconds": 300, "target_power_percent": 45}]',
 25, 0.52, 'recovery_active_45'),

-- Endurance
(NULL, 'Endurance Base', 'Steady zone 2 ride for aerobic development', 'endurance', 60, 3,
 '[{"name": "Warm up", "duration_seconds": 600, "target_power_percent": 55}, {"name": "Endurance", "duration_seconds": 2700, "target_power_percent": 68}, {"name": "Cool down", "duration_seconds": 300, "target_power_percent": 50}]',
 45, 0.68, 'endurance_base_60'),

(NULL, 'Long Endurance', 'Extended zone 2 for building aerobic capacity', 'endurance', 120, 4,
 '[{"name": "Warm up", "duration_seconds": 600, "target_power_percent": 55}, {"name": "Endurance", "duration_seconds": 6300, "target_power_percent": 70}, {"name": "Cool down", "duration_seconds": 300, "target_power_percent": 50}]',
 85, 0.70, 'endurance_long_120'),

-- Tempo
(NULL, 'Tempo Intervals', 'Zone 3 blocks to build muscular endurance', 'tempo', 60, 5,
 '[{"name": "Warm up", "duration_seconds": 600, "target_power_percent": 60}, {"name": "Tempo 1", "duration_seconds": 900, "target_power_percent": 82}, {"name": "Recovery", "duration_seconds": 300, "target_power_percent": 55}, {"name": "Tempo 2", "duration_seconds": 900, "target_power_percent": 82}, {"name": "Recovery", "duration_seconds": 300, "target_power_percent": 55}, {"name": "Tempo 3", "duration_seconds": 900, "target_power_percent": 82}, {"name": "Cool down", "duration_seconds": 300, "target_power_percent": 50}]',
 65, 0.78, 'tempo_intervals_60'),

-- Sweet Spot
(NULL, 'Sweet Spot 2x20', 'Classic sweet spot intervals', 'sweet_spot', 60, 6,
 '[{"name": "Warm up", "duration_seconds": 600, "target_power_percent": 60}, {"name": "Sweet Spot 1", "duration_seconds": 1200, "target_power_percent": 90}, {"name": "Recovery", "duration_seconds": 300, "target_power_percent": 55}, {"name": "Sweet Spot 2", "duration_seconds": 1200, "target_power_percent": 90}, {"name": "Cool down", "duration_seconds": 300, "target_power_percent": 50}]',
 75, 0.85, 'sweetspot_2x20'),

(NULL, 'Sweet Spot 3x15', 'Three sweet spot blocks', 'sweet_spot', 75, 6,
 '[{"name": "Warm up", "duration_seconds": 600, "target_power_percent": 60}, {"name": "SS 1", "duration_seconds": 900, "target_power_percent": 90}, {"name": "Rest", "duration_seconds": 300, "target_power_percent": 55}, {"name": "SS 2", "duration_seconds": 900, "target_power_percent": 90}, {"name": "Rest", "duration_seconds": 300, "target_power_percent": 55}, {"name": "SS 3", "duration_seconds": 900, "target_power_percent": 90}, {"name": "Cool down", "duration_seconds": 600, "target_power_percent": 50}]',
 80, 0.86, 'sweetspot_3x15'),

-- Threshold
(NULL, 'Threshold 2x15', 'FTP intervals for threshold power', 'threshold', 60, 7,
 '[{"name": "Warm up", "duration_seconds": 900, "target_power_percent": 65}, {"name": "Threshold 1", "duration_seconds": 900, "target_power_percent": 100}, {"name": "Recovery", "duration_seconds": 300, "target_power_percent": 55}, {"name": "Threshold 2", "duration_seconds": 900, "target_power_percent": 100}, {"name": "Cool down", "duration_seconds": 600, "target_power_percent": 50}]',
 85, 0.92, 'threshold_2x15'),

-- VO2max
(NULL, 'VO2max 5x3', 'High intensity intervals for VO2max development', 'vo2max', 45, 8,
 '[{"name": "Warm up", "duration_seconds": 900, "target_power_percent": 65}, {"name": "VO2 1", "duration_seconds": 180, "target_power_percent": 115}, {"name": "Rest", "duration_seconds": 180, "target_power_percent": 50}, {"name": "VO2 2", "duration_seconds": 180, "target_power_percent": 115}, {"name": "Rest", "duration_seconds": 180, "target_power_percent": 50}, {"name": "VO2 3", "duration_seconds": 180, "target_power_percent": 115}, {"name": "Rest", "duration_seconds": 180, "target_power_percent": 50}, {"name": "VO2 4", "duration_seconds": 180, "target_power_percent": 115}, {"name": "Rest", "duration_seconds": 180, "target_power_percent": 50}, {"name": "VO2 5", "duration_seconds": 180, "target_power_percent": 115}, {"name": "Cool down", "duration_seconds": 600, "target_power_percent": 50}]',
 70, 0.95, 'vo2max_5x3'),

-- Anaerobic
(NULL, 'Anaerobic Capacity', 'Short hard efforts for anaerobic power', 'anaerobic', 45, 9,
 '[{"name": "Warm up", "duration_seconds": 900, "target_power_percent": 65}, {"name": "Sprint 1", "duration_seconds": 30, "target_power_percent": 150}, {"name": "Rest", "duration_seconds": 270, "target_power_percent": 45}, {"name": "Sprint 2", "duration_seconds": 30, "target_power_percent": 150}, {"name": "Rest", "duration_seconds": 270, "target_power_percent": 45}, {"name": "Sprint 3", "duration_seconds": 30, "target_power_percent": 150}, {"name": "Rest", "duration_seconds": 270, "target_power_percent": 45}, {"name": "Sprint 4", "duration_seconds": 30, "target_power_percent": 150}, {"name": "Rest", "duration_seconds": 270, "target_power_percent": 45}, {"name": "Sprint 5", "duration_seconds": 30, "target_power_percent": 150}, {"name": "Rest", "duration_seconds": 270, "target_power_percent": 45}, {"name": "Sprint 6", "duration_seconds": 30, "target_power_percent": 150}, {"name": "Cool down", "duration_seconds": 600, "target_power_percent": 50}]',
 55, 0.88, 'anaerobic_sprints'),

-- Hill Repeats
(NULL, 'Hill Repeats 6x2', 'Climbing intervals for strength', 'hill_repeats', 60, 7,
 '[{"name": "Warm up", "duration_seconds": 900, "target_power_percent": 65}, {"name": "Climb 1", "duration_seconds": 120, "target_power_percent": 105, "cadence_target": 70}, {"name": "Descend", "duration_seconds": 180, "target_power_percent": 45}, {"name": "Climb 2", "duration_seconds": 120, "target_power_percent": 105, "cadence_target": 70}, {"name": "Descend", "duration_seconds": 180, "target_power_percent": 45}, {"name": "Climb 3", "duration_seconds": 120, "target_power_percent": 105, "cadence_target": 70}, {"name": "Descend", "duration_seconds": 180, "target_power_percent": 45}, {"name": "Climb 4", "duration_seconds": 120, "target_power_percent": 105, "cadence_target": 70}, {"name": "Descend", "duration_seconds": 180, "target_power_percent": 45}, {"name": "Climb 5", "duration_seconds": 120, "target_power_percent": 105, "cadence_target": 70}, {"name": "Descend", "duration_seconds": 180, "target_power_percent": 45}, {"name": "Climb 6", "duration_seconds": 120, "target_power_percent": 105, "cadence_target": 70}, {"name": "Cool down", "duration_seconds": 600, "target_power_percent": 50}]',
 75, 0.88, 'hill_repeats_6x2');

-- ============================================================================
-- COMPLETE
-- ============================================================================
