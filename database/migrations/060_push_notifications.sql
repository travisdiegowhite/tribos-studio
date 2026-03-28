-- ============================================================================
-- PUSH NOTIFICATIONS INFRASTRUCTURE
-- Adds push subscription storage, notification preferences, and extends
-- the existing notification_log for push notification deduplication.
-- ============================================================================

-- ============================================================================
-- PUSH_SUBSCRIPTIONS TABLE
-- Stores Web Push API subscription data per user per device
-- ============================================================================
CREATE TABLE IF NOT EXISTS push_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Web Push subscription data
    endpoint TEXT NOT NULL,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,

    -- Metadata
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    last_used_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT true,

    -- One subscription per endpoint (device)
    CONSTRAINT push_subscriptions_endpoint_unique UNIQUE (endpoint)
);

CREATE INDEX IF NOT EXISTS push_subscriptions_user_id_idx ON push_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS push_subscriptions_active_idx ON push_subscriptions(is_active) WHERE is_active = true;

-- RLS
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own push subscriptions" ON push_subscriptions;
CREATE POLICY "Users manage own push subscriptions" ON push_subscriptions
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role manages all push subscriptions" ON push_subscriptions;
CREATE POLICY "Service role manages all push subscriptions" ON push_subscriptions
    FOR ALL USING (auth.role() = 'service_role');

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON push_subscriptions TO authenticated;
GRANT ALL ON push_subscriptions TO service_role;

-- ============================================================================
-- NOTIFICATION_PREFERENCES TABLE
-- Per-user toggles for each notification type
-- ============================================================================
CREATE TABLE IF NOT EXISTS notification_preferences (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Phase 1
    post_ride_insight BOOLEAN DEFAULT true,
    workout_preview BOOLEAN DEFAULT true,

    -- Phase 2 (schema ready, features built later)
    recovery_flag BOOLEAN DEFAULT true,
    weekly_summary BOOLEAN DEFAULT true,
    feature_updates BOOLEAN DEFAULT true,

    updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own notification preferences" ON notification_preferences;
CREATE POLICY "Users manage own notification preferences" ON notification_preferences
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role manages all notification preferences" ON notification_preferences;
CREATE POLICY "Service role manages all notification preferences" ON notification_preferences
    FOR ALL USING (auth.role() = 'service_role');

-- Grants
GRANT SELECT, INSERT, UPDATE ON notification_preferences TO authenticated;
GRANT ALL ON notification_preferences TO service_role;

-- ============================================================================
-- EXTEND NOTIFICATION_LOG
-- Add new notification types for push and a reference_id column for dedup
-- ============================================================================

-- The original CHECK constraint on notification_type is unnamed (inline).
-- PostgreSQL names it automatically: notification_log_notification_type_check
ALTER TABLE notification_log DROP CONSTRAINT IF EXISTS notification_log_notification_type_check;
ALTER TABLE notification_log ADD CONSTRAINT notification_log_notification_type_check
    CHECK (notification_type IN (
        -- Original types (from 013_accountability_coach.sql)
        'morning_reminder',
        'midday_reminder',
        'afternoon_reminder',
        'weekly_planning',
        'workout_completed',
        'streak_milestone',
        'encouragement',
        -- Push notification types (new)
        'post_ride_insight',
        'workout_preview',
        'recovery_flag',
        'weekly_summary',
        'feature_broadcast'
    ));

-- reference_id for deduplication (e.g. activity_id, date string)
ALTER TABLE notification_log ADD COLUMN IF NOT EXISTS reference_id TEXT;
CREATE INDEX IF NOT EXISTS idx_notification_log_reference ON notification_log(reference_id);
CREATE INDEX IF NOT EXISTS idx_notification_log_user_type_ref ON notification_log(user_id, notification_type, reference_id);
