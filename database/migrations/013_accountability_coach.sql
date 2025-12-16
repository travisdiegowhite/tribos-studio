-- Migration: Accountability Coach Tables
-- Phase 1: Foundation for AI cycling accountability coach
-- Run this in your Supabase SQL editor

-- ============================================================================
-- SCHEDULED_WORKOUTS TABLE
-- Individual workouts from imported training plans or manual entry
-- Separate from planned_workouts to support coach-specific workflow
-- ============================================================================
CREATE TABLE IF NOT EXISTS scheduled_workouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    training_plan_id UUID REFERENCES training_plans(id) ON DELETE SET NULL,

    -- Scheduling
    scheduled_date DATE NOT NULL,

    -- Workout details
    workout_type TEXT NOT NULL CHECK (workout_type IN (
        'endurance', 'tempo', 'threshold', 'intervals', 'recovery',
        'sweet_spot', 'vo2max', 'anaerobic', 'sprint', 'rest'
    )),
    target_duration_mins INTEGER,
    description TEXT,

    -- Status tracking
    status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN (
        'planned', 'completed', 'skipped', 'rescheduled', 'partial'
    )),

    -- Completion tracking
    completed_at TIMESTAMPTZ,
    actual_duration_mins INTEGER,
    activity_id UUID REFERENCES activities(id) ON DELETE SET NULL,

    -- Commitment tracking (for accountability)
    committed_time TIME, -- When user committed to doing the workout
    reminder_sent_morning BOOLEAN DEFAULT false,
    reminder_sent_midday BOOLEAN DEFAULT false,
    reminder_sent_afternoon BOOLEAN DEFAULT false,

    -- Notes
    skip_reason TEXT,
    notes TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_scheduled_workouts_user_id ON scheduled_workouts(user_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_workouts_date ON scheduled_workouts(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_scheduled_workouts_status ON scheduled_workouts(status);
CREATE INDEX IF NOT EXISTS idx_scheduled_workouts_user_date ON scheduled_workouts(user_id, scheduled_date);

-- ============================================================================
-- ROUTE_CONTEXT_HISTORY TABLE
-- Track context around route selections for preference learning
-- ============================================================================
CREATE TABLE IF NOT EXISTS route_context_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    route_id UUID NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
    activity_id UUID REFERENCES activities(id) ON DELETE SET NULL,

    -- Temporal context
    ride_date TIMESTAMPTZ NOT NULL,
    day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6), -- 0=Sunday
    time_of_day TEXT CHECK (time_of_day IN ('morning', 'midday', 'afternoon', 'evening')),

    -- Training context
    workout_type TEXT,
    scheduled_workout_id UUID REFERENCES scheduled_workouts(id) ON DELETE SET NULL,

    -- Weather context
    weather_temp_c FLOAT,
    weather_wind_speed_kmh FLOAT,
    weather_wind_direction TEXT,
    weather_conditions TEXT, -- 'clear', 'cloudy', 'rain', 'snow', etc.
    weather_feels_like_c FLOAT,

    -- AI tracking
    was_suggested BOOLEAN DEFAULT false, -- Was this route suggested by AI?
    was_completed BOOLEAN DEFAULT true,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_route_context_user_id ON route_context_history(user_id);
CREATE INDEX IF NOT EXISTS idx_route_context_route_id ON route_context_history(route_id);
CREATE INDEX IF NOT EXISTS idx_route_context_ride_date ON route_context_history(ride_date DESC);
CREATE INDEX IF NOT EXISTS idx_route_context_user_route ON route_context_history(user_id, route_id);

-- ============================================================================
-- USER_ROUTE_PREFERENCES TABLE
-- Learned route preferences based on historical patterns
-- ============================================================================
CREATE TABLE IF NOT EXISTS user_route_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Preference details
    preference_type TEXT NOT NULL CHECK (preference_type IN (
        'time_pattern',      -- e.g., "prefers Route X on Tuesday mornings"
        'weather_pattern',   -- e.g., "avoids Route Y when wind > 15mph"
        'workout_match',     -- e.g., "prefers Route Z for intervals"
        'seasonal',          -- e.g., "prefers Route A in summer"
        'avoidance'          -- e.g., "never suggests Route B on weekends"
    )),

    -- Rule definition (flexible JSON structure)
    rule JSONB NOT NULL,
    -- Example rules:
    -- time_pattern: { "route_id": "uuid", "day_of_week": 2, "time_of_day": "morning" }
    -- weather_pattern: { "route_id": "uuid", "condition": "wind_speed_lt", "value": 15 }
    -- workout_match: { "route_id": "uuid", "workout_types": ["intervals", "threshold"] }

    -- Confidence tracking
    confidence FLOAT NOT NULL DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
    occurrences INTEGER DEFAULT 1, -- How many times this pattern was observed

    last_updated TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_route_prefs_user_id ON user_route_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_user_route_prefs_type ON user_route_preferences(preference_type);

-- ============================================================================
-- COACH_MEMORY TABLE
-- Persistent memory for AI coach across conversations
-- ============================================================================
CREATE TABLE IF NOT EXISTS coach_memory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Memory classification
    memory_type TEXT NOT NULL CHECK (memory_type IN ('short', 'medium', 'long')),
    -- short: This week only, expires automatically
    -- medium: This month, moderate importance
    -- long: Permanent, important facts about the user

    category TEXT NOT NULL CHECK (category IN (
        'goal',       -- Training goals, target events
        'context',    -- Life circumstances (kids, job, travel)
        'obstacle',   -- Recurring challenges mentioned
        'pattern',    -- Behavioral patterns observed
        'win',        -- Achievements, breakthroughs
        'excuse',     -- Common excuses/barriers
        'preference', -- Preferences (workout timing, route types)
        'injury',     -- Past/current injuries
        'schedule'    -- Regular schedule constraints
    )),

    -- Memory content
    content TEXT NOT NULL,

    -- Source tracking
    source_conversation_id UUID, -- Which conversation this came from
    source_type TEXT DEFAULT 'conversation' CHECK (source_type IN (
        'conversation', 'user_input', 'system_detected', 'onboarding'
    )),

    -- Lifecycle
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ, -- NULL for long-term memories
    is_active BOOLEAN DEFAULT true,

    -- For user editing
    user_modified BOOLEAN DEFAULT false,
    user_modified_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_coach_memory_user_id ON coach_memory(user_id);
CREATE INDEX IF NOT EXISTS idx_coach_memory_type ON coach_memory(memory_type);
CREATE INDEX IF NOT EXISTS idx_coach_memory_category ON coach_memory(category);
CREATE INDEX IF NOT EXISTS idx_coach_memory_active ON coach_memory(user_id, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_coach_memory_expires ON coach_memory(expires_at) WHERE expires_at IS NOT NULL;

-- ============================================================================
-- COACH_CONVERSATIONS TABLE
-- Persistent conversation history with AI coach
-- ============================================================================
CREATE TABLE IF NOT EXISTS coach_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Message details
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    role TEXT NOT NULL CHECK (role IN ('user', 'coach', 'system')),
    message TEXT NOT NULL,

    -- Context snapshot at time of message
    context_snapshot JSONB,
    -- Example: {
    --   "scheduled_workout": {...},
    --   "completion_rate_week": 0.75,
    --   "time_windows": [...]
    -- }

    -- Message metadata
    message_type TEXT DEFAULT 'chat' CHECK (message_type IN (
        'chat',           -- Regular conversation
        'check_in',       -- Proactive check-in
        'weekly_plan',    -- Weekly planning session
        'commitment',     -- User making a commitment
        'reflection',     -- Post-workout or end-of-week reflection
        'notification'    -- SMS notification record
    )),

    -- For threading related messages
    thread_id UUID,

    -- Tracking
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_coach_conv_user_id ON coach_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_coach_conv_timestamp ON coach_conversations(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_coach_conv_user_time ON coach_conversations(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_coach_conv_thread ON coach_conversations(thread_id) WHERE thread_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_coach_conv_type ON coach_conversations(message_type);

-- ============================================================================
-- USER_COACH_SETTINGS TABLE
-- User preferences specific to accountability coach
-- ============================================================================
CREATE TABLE IF NOT EXISTS user_coach_settings (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Work schedule
    work_hours_start TIME DEFAULT '09:00',
    work_hours_end TIME DEFAULT '17:00',
    work_days INTEGER[] DEFAULT ARRAY[1,2,3,4,5], -- 0=Sun, 1=Mon, etc.

    -- Riding preferences
    preferred_ride_times TEXT[] DEFAULT ARRAY['morning', 'afternoon'],
    evening_cutoff_time TIME DEFAULT '20:00', -- Don't suggest rides after this

    -- Notification settings
    notification_style TEXT DEFAULT 'firm' CHECK (notification_style IN (
        'gentle',     -- Light reminders, no pressure
        'firm',       -- Clear reminders with expectations
        'aggressive'  -- Persistent, challenging reminders
    )),
    accountability_level TEXT DEFAULT 'medium' CHECK (accountability_level IN (
        'low',    -- Coach is supportive, rarely challenging
        'medium', -- Coach balances support with accountability
        'high'    -- Coach is direct, challenges excuses
    )),

    -- SMS settings
    phone_number TEXT,
    phone_verified BOOLEAN DEFAULT false,
    sms_enabled BOOLEAN DEFAULT false,
    sms_morning_time TIME DEFAULT '07:00',
    sms_reminder_enabled BOOLEAN DEFAULT true,

    -- Calendar integration
    google_calendar_connected BOOLEAN DEFAULT false,
    google_calendar_id TEXT, -- Primary calendar to check
    google_refresh_token TEXT, -- Encrypted
    calendar_sync_enabled BOOLEAN DEFAULT true,

    -- Coach behavior
    weekly_planning_enabled BOOLEAN DEFAULT true,
    weekly_planning_day INTEGER DEFAULT 0, -- 0=Sunday
    weekly_planning_time TIME DEFAULT '18:00',

    -- Personalization
    coach_name TEXT DEFAULT 'Coach', -- What to call the AI coach
    user_preferred_name TEXT, -- How coach should address user

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- NOTIFICATION_LOG TABLE
-- Track sent notifications to prevent duplicate sends
-- ============================================================================
CREATE TABLE IF NOT EXISTS notification_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Notification details
    notification_type TEXT NOT NULL CHECK (notification_type IN (
        'morning_reminder',
        'midday_reminder',
        'afternoon_reminder',
        'weekly_planning',
        'workout_completed',
        'streak_milestone',
        'encouragement'
    )),

    -- Related records
    scheduled_workout_id UUID REFERENCES scheduled_workouts(id) ON DELETE SET NULL,

    -- Delivery details
    channel TEXT NOT NULL CHECK (channel IN ('sms', 'push', 'in_app')),
    message_content TEXT,

    -- Status
    sent_at TIMESTAMPTZ DEFAULT NOW(),
    delivered BOOLEAN,
    delivery_error TEXT,

    -- For rate limiting
    notification_date DATE DEFAULT CURRENT_DATE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_notification_log_user_id ON notification_log(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_log_date ON notification_log(notification_date);
CREATE INDEX IF NOT EXISTS idx_notification_log_user_date_type ON notification_log(user_id, notification_date, notification_type);

-- ============================================================================
-- WEATHER_CACHE TABLE
-- Cache weather data to reduce API calls
-- ============================================================================
CREATE TABLE IF NOT EXISTS weather_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Location (rounded to reduce cache entries)
    latitude FLOAT NOT NULL,
    longitude FLOAT NOT NULL,

    -- Weather data
    weather_data JSONB NOT NULL,
    -- Example: {
    --   "temp_c": 18.5,
    --   "feels_like_c": 17.0,
    --   "wind_speed_kmh": 12,
    --   "wind_direction": "NW",
    --   "conditions": "partly_cloudy",
    --   "humidity": 65,
    --   "uv_index": 4
    -- }

    -- Caching
    fetched_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,

    -- Unique constraint for location lookup
    UNIQUE(latitude, longitude)
);

-- Index for lookup and cleanup
CREATE INDEX IF NOT EXISTS idx_weather_cache_location ON weather_cache(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_weather_cache_expires ON weather_cache(expires_at);

-- ============================================================================
-- ENABLE ROW LEVEL SECURITY
-- ============================================================================
ALTER TABLE scheduled_workouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE route_context_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_route_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE coach_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE coach_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_coach_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE weather_cache ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- RLS POLICIES - Scheduled Workouts
-- ============================================================================
DROP POLICY IF EXISTS "Users can view their own scheduled workouts" ON scheduled_workouts;
CREATE POLICY "Users can view their own scheduled workouts"
    ON scheduled_workouts FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own scheduled workouts" ON scheduled_workouts;
CREATE POLICY "Users can insert their own scheduled workouts"
    ON scheduled_workouts FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own scheduled workouts" ON scheduled_workouts;
CREATE POLICY "Users can update their own scheduled workouts"
    ON scheduled_workouts FOR UPDATE
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own scheduled workouts" ON scheduled_workouts;
CREATE POLICY "Users can delete their own scheduled workouts"
    ON scheduled_workouts FOR DELETE
    USING (auth.uid() = user_id);

-- ============================================================================
-- RLS POLICIES - Route Context History
-- ============================================================================
DROP POLICY IF EXISTS "Users can view their own route context" ON route_context_history;
CREATE POLICY "Users can view their own route context"
    ON route_context_history FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own route context" ON route_context_history;
CREATE POLICY "Users can insert their own route context"
    ON route_context_history FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- RLS POLICIES - User Route Preferences
-- ============================================================================
DROP POLICY IF EXISTS "Users can view their own route preferences" ON user_route_preferences;
CREATE POLICY "Users can view their own route preferences"
    ON user_route_preferences FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage their own route preferences" ON user_route_preferences;
CREATE POLICY "Users can manage their own route preferences"
    ON user_route_preferences FOR ALL
    USING (auth.uid() = user_id);

-- ============================================================================
-- RLS POLICIES - Coach Memory
-- ============================================================================
DROP POLICY IF EXISTS "Users can view their own coach memories" ON coach_memory;
CREATE POLICY "Users can view their own coach memories"
    ON coach_memory FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own coach memories" ON coach_memory;
CREATE POLICY "Users can insert their own coach memories"
    ON coach_memory FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own coach memories" ON coach_memory;
CREATE POLICY "Users can update their own coach memories"
    ON coach_memory FOR UPDATE
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own coach memories" ON coach_memory;
CREATE POLICY "Users can delete their own coach memories"
    ON coach_memory FOR DELETE
    USING (auth.uid() = user_id);

-- ============================================================================
-- RLS POLICIES - Coach Conversations
-- ============================================================================
DROP POLICY IF EXISTS "Users can view their own conversations" ON coach_conversations;
CREATE POLICY "Users can view their own conversations"
    ON coach_conversations FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own conversations" ON coach_conversations;
CREATE POLICY "Users can insert their own conversations"
    ON coach_conversations FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- RLS POLICIES - User Coach Settings
-- ============================================================================
DROP POLICY IF EXISTS "Users can view their own coach settings" ON user_coach_settings;
CREATE POLICY "Users can view their own coach settings"
    ON user_coach_settings FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage their own coach settings" ON user_coach_settings;
CREATE POLICY "Users can manage their own coach settings"
    ON user_coach_settings FOR ALL
    USING (auth.uid() = user_id);

-- ============================================================================
-- RLS POLICIES - Notification Log
-- ============================================================================
DROP POLICY IF EXISTS "Users can view their own notifications" ON notification_log;
CREATE POLICY "Users can view their own notifications"
    ON notification_log FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role can manage notifications" ON notification_log;
CREATE POLICY "Service role can manage notifications"
    ON notification_log FOR ALL
    USING (auth.role() = 'service_role');

-- ============================================================================
-- RLS POLICIES - Weather Cache (public read, service write)
-- ============================================================================
DROP POLICY IF EXISTS "Anyone can read weather cache" ON weather_cache;
CREATE POLICY "Anyone can read weather cache"
    ON weather_cache FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "Service role can manage weather cache" ON weather_cache;
CREATE POLICY "Service role can manage weather cache"
    ON weather_cache FOR ALL
    USING (auth.role() = 'service_role');

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================
GRANT ALL ON scheduled_workouts TO authenticated;
GRANT ALL ON route_context_history TO authenticated;
GRANT ALL ON user_route_preferences TO authenticated;
GRANT ALL ON coach_memory TO authenticated;
GRANT ALL ON coach_conversations TO authenticated;
GRANT ALL ON user_coach_settings TO authenticated;
GRANT SELECT ON notification_log TO authenticated;
GRANT SELECT ON weather_cache TO authenticated;

GRANT ALL ON scheduled_workouts TO service_role;
GRANT ALL ON route_context_history TO service_role;
GRANT ALL ON user_route_preferences TO service_role;
GRANT ALL ON coach_memory TO service_role;
GRANT ALL ON coach_conversations TO service_role;
GRANT ALL ON user_coach_settings TO service_role;
GRANT ALL ON notification_log TO service_role;
GRANT ALL ON weather_cache TO service_role;

-- ============================================================================
-- TRIGGER: Update timestamps
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_scheduled_workouts_updated_at ON scheduled_workouts;
CREATE TRIGGER trigger_scheduled_workouts_updated_at
    BEFORE UPDATE ON scheduled_workouts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trigger_user_coach_settings_updated_at ON user_coach_settings;
CREATE TRIGGER trigger_user_coach_settings_updated_at
    BEFORE UPDATE ON user_coach_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- FUNCTION: Clean up expired memories
-- Run this periodically via cron or scheduled function
-- ============================================================================
CREATE OR REPLACE FUNCTION cleanup_expired_memories()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM coach_memory
    WHERE expires_at IS NOT NULL
    AND expires_at < NOW()
    AND is_active = true;

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FUNCTION: Get user's compliance rate for a period
-- ============================================================================
CREATE OR REPLACE FUNCTION get_compliance_rate(
    p_user_id UUID,
    p_start_date DATE,
    p_end_date DATE
) RETURNS TABLE (
    total_workouts INTEGER,
    completed_workouts INTEGER,
    skipped_workouts INTEGER,
    compliance_rate NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*)::INTEGER as total_workouts,
        COUNT(*) FILTER (WHERE status = 'completed')::INTEGER as completed_workouts,
        COUNT(*) FILTER (WHERE status = 'skipped')::INTEGER as skipped_workouts,
        CASE
            WHEN COUNT(*) > 0
            THEN ROUND((COUNT(*) FILTER (WHERE status = 'completed')::NUMERIC / COUNT(*)) * 100, 1)
            ELSE 0
        END as compliance_rate
    FROM scheduled_workouts
    WHERE user_id = p_user_id
    AND scheduled_date BETWEEN p_start_date AND p_end_date
    AND workout_type != 'rest';
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FUNCTION: Get today's scheduled workout for a user
-- ============================================================================
CREATE OR REPLACE FUNCTION get_todays_workout(p_user_id UUID)
RETURNS TABLE (
    workout_id UUID,
    workout_type TEXT,
    target_duration_mins INTEGER,
    description TEXT,
    status TEXT,
    committed_time TIME
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        sw.id,
        sw.workout_type,
        sw.target_duration_mins,
        sw.description,
        sw.status,
        sw.committed_time
    FROM scheduled_workouts sw
    WHERE sw.user_id = p_user_id
    AND sw.scheduled_date = CURRENT_DATE
    ORDER BY sw.created_at
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;
