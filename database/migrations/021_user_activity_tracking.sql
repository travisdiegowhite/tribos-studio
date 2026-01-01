-- Migration: User Activity Tracking
-- Description: Track user activity events for admin analytics
-- Date: 2025-01-01

-- Create user_activity_events table
CREATE TABLE IF NOT EXISTS user_activity_events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    event_category TEXT NOT NULL,
    event_data JSONB DEFAULT '{}',
    page_path TEXT,
    session_id TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for efficient querying
CREATE INDEX idx_user_activity_events_user_id ON user_activity_events(user_id);
CREATE INDEX idx_user_activity_events_event_type ON user_activity_events(event_type);
CREATE INDEX idx_user_activity_events_event_category ON user_activity_events(event_category);
CREATE INDEX idx_user_activity_events_created_at ON user_activity_events(created_at DESC);
CREATE INDEX idx_user_activity_events_user_created ON user_activity_events(user_id, created_at DESC);

-- Composite index for admin queries
CREATE INDEX idx_user_activity_events_category_type_created
    ON user_activity_events(event_category, event_type, created_at DESC);

-- RLS policies
ALTER TABLE user_activity_events ENABLE ROW LEVEL SECURITY;

-- Users can insert their own activity events
CREATE POLICY "Users can insert own activity events"
    ON user_activity_events
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

-- Users can view their own activity events
CREATE POLICY "Users can view own activity events"
    ON user_activity_events
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

-- Service role has full access (for admin queries)
-- Note: Service role bypasses RLS automatically

-- Create a view for aggregated user activity stats (admin use)
CREATE OR REPLACE VIEW user_activity_summary AS
SELECT
    user_id,
    COUNT(*) as total_events,
    COUNT(DISTINCT DATE(created_at)) as active_days,
    COUNT(DISTINCT session_id) as total_sessions,
    MIN(created_at) as first_activity,
    MAX(created_at) as last_activity,
    COUNT(*) FILTER (WHERE event_category = 'page_view') as page_views,
    COUNT(*) FILTER (WHERE event_category = 'sync') as sync_events,
    COUNT(*) FILTER (WHERE event_category = 'upload') as upload_events,
    COUNT(*) FILTER (WHERE event_category = 'feature') as feature_uses
FROM user_activity_events
GROUP BY user_id;

-- Grant access to the view
GRANT SELECT ON user_activity_summary TO authenticated;

-- Comment for documentation
COMMENT ON TABLE user_activity_events IS 'Tracks user activity events for analytics - page views, syncs, uploads, feature usage';
COMMENT ON COLUMN user_activity_events.event_type IS 'Specific event name (e.g., page_view, activity_sync, ride_upload)';
COMMENT ON COLUMN user_activity_events.event_category IS 'Category (page_view, sync, upload, feature, interaction)';
COMMENT ON COLUMN user_activity_events.event_data IS 'Additional event-specific data as JSON';
COMMENT ON COLUMN user_activity_events.session_id IS 'Browser session ID to group related events';
