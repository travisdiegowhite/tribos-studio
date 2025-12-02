-- Row Level Security (RLS) Policies for Cycling AI App
-- Implements comprehensive security policies for all tables

-- =============================================
-- ROUTES TABLE POLICIES
-- =============================================

-- Enable RLS on routes table
ALTER TABLE IF EXISTS routes ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view their own routes" ON routes;
DROP POLICY IF EXISTS "Users can create their own routes" ON routes;
DROP POLICY IF EXISTS "Users can update their own routes" ON routes;
DROP POLICY IF EXISTS "Users can delete their own routes" ON routes;

-- Users can only view their own routes
CREATE POLICY "Users can view their own routes" ON routes
    FOR SELECT USING (auth.uid() = user_id);

-- Users can create routes for themselves
CREATE POLICY "Users can create their own routes" ON routes
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can update their own routes
CREATE POLICY "Users can update their own routes" ON routes
    FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Users can delete their own routes
CREATE POLICY "Users can delete their own routes" ON routes
    FOR DELETE USING (auth.uid() = user_id);

-- =============================================
-- TRACK POINTS TABLE POLICIES
-- =============================================

-- Enable RLS on track_points table
ALTER TABLE IF EXISTS track_points ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view track points for their routes" ON track_points;
DROP POLICY IF EXISTS "Users can create track points for their routes" ON track_points;
DROP POLICY IF EXISTS "Users can update track points for their routes" ON track_points;
DROP POLICY IF EXISTS "Users can delete track points for their routes" ON track_points;

-- Users can view track points for their routes only
CREATE POLICY "Users can view track points for their routes" ON track_points
    FOR SELECT USING (
        route_id IN (
            SELECT id FROM routes WHERE user_id = auth.uid()
        )
    );

-- Users can create track points for their routes only
CREATE POLICY "Users can create track points for their routes" ON track_points
    FOR INSERT WITH CHECK (
        route_id IN (
            SELECT id FROM routes WHERE user_id = auth.uid()
        )
    );

-- Users can update track points for their routes only
CREATE POLICY "Users can update track points for their routes" ON track_points
    FOR UPDATE USING (
        route_id IN (
            SELECT id FROM routes WHERE user_id = auth.uid()
        )
    ) WITH CHECK (
        route_id IN (
            SELECT id FROM routes WHERE user_id = auth.uid()
        )
    );

-- Users can delete track points for their routes only
CREATE POLICY "Users can delete track points for their routes" ON track_points
    FOR DELETE USING (
        route_id IN (
            SELECT id FROM routes WHERE user_id = auth.uid()
        )
    );

-- =============================================
-- STRAVA TOKENS TABLE POLICIES
-- =============================================

-- Enable RLS on strava_tokens table
ALTER TABLE IF EXISTS strava_tokens ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view their own strava tokens" ON strava_tokens;
DROP POLICY IF EXISTS "Users can create their own strava tokens" ON strava_tokens;
DROP POLICY IF EXISTS "Users can update their own strava tokens" ON strava_tokens;
DROP POLICY IF EXISTS "Users can delete their own strava tokens" ON strava_tokens;
DROP POLICY IF EXISTS "Service role can manage strava tokens" ON strava_tokens;

-- Users can only view their own Strava tokens
CREATE POLICY "Users can view their own strava tokens" ON strava_tokens
    FOR SELECT USING (auth.uid() = user_id);

-- Users can create their own Strava tokens (via service)
CREATE POLICY "Users can create their own strava tokens" ON strava_tokens
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can update their own Strava tokens (via service)
CREATE POLICY "Users can update their own strava tokens" ON strava_tokens
    FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Users can delete their own Strava tokens
CREATE POLICY "Users can delete their own strava tokens" ON strava_tokens
    FOR DELETE USING (auth.uid() = user_id);

-- Service role can manage all tokens (for server-side operations)
CREATE POLICY "Service role can manage strava tokens" ON strava_tokens
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- =============================================
-- USER PREFERENCES TABLE POLICIES
-- =============================================

-- Create user_preferences table if it doesn't exist
CREATE TABLE IF NOT EXISTS user_preferences (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    preferences jsonb DEFAULT '{}',
    created_at timestamp WITH TIME ZONE DEFAULT now(),
    updated_at timestamp WITH TIME ZONE DEFAULT now(),

    UNIQUE(user_id)
);

-- Enable RLS on user_preferences table
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view their own preferences" ON user_preferences;
DROP POLICY IF EXISTS "Users can create their own preferences" ON user_preferences;
DROP POLICY IF EXISTS "Users can update their own preferences" ON user_preferences;
DROP POLICY IF EXISTS "Users can delete their own preferences" ON user_preferences;

-- Users can view their own preferences
CREATE POLICY "Users can view their own preferences" ON user_preferences
    FOR SELECT USING (auth.uid() = user_id);

-- Users can create their own preferences
CREATE POLICY "Users can create their own preferences" ON user_preferences
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can update their own preferences
CREATE POLICY "Users can update their own preferences" ON user_preferences
    FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Users can delete their own preferences
CREATE POLICY "Users can delete their own preferences" ON user_preferences
    FOR DELETE USING (auth.uid() = user_id);

-- =============================================
-- ACTIVITY LOG TABLE (for audit trail)
-- =============================================

-- Create activity_log table for security audit trail
CREATE TABLE IF NOT EXISTS activity_log (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    action text NOT NULL,
    resource_type text,
    resource_id uuid,
    ip_address inet,
    user_agent text,
    details jsonb,
    created_at timestamp WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on activity_log table
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

-- Users can only view their own activity logs
CREATE POLICY "Users can view their own activity logs" ON activity_log
    FOR SELECT USING (auth.uid() = user_id);

-- Only service role can insert activity logs
CREATE POLICY "Service role can insert activity logs" ON activity_log
    FOR INSERT TO service_role WITH CHECK (true);

-- No updates or deletes allowed (audit trail integrity)
-- Activity logs are append-only for security

-- =============================================
-- API RATE LIMITING TABLE
-- =============================================

-- Create rate_limits table for API rate limiting
CREATE TABLE IF NOT EXISTS rate_limits (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    identifier text NOT NULL, -- user_id, IP address, or other identifier
    endpoint text NOT NULL,
    request_count integer DEFAULT 0,
    window_start timestamp WITH TIME ZONE DEFAULT now(),
    created_at timestamp WITH TIME ZONE DEFAULT now(),
    updated_at timestamp WITH TIME ZONE DEFAULT now(),

    UNIQUE(identifier, endpoint)
);

-- Enable RLS on rate_limits table
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

-- Only service role can manage rate limits
CREATE POLICY "Service role can manage rate limits" ON rate_limits
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- No user access to rate limits table
-- This is managed entirely server-side

-- =============================================
-- INDEXES FOR PERFORMANCE
-- =============================================

-- Create indexes for better query performance

-- Routes table indexes
CREATE INDEX IF NOT EXISTS idx_routes_user_id ON routes(user_id);
CREATE INDEX IF NOT EXISTS idx_routes_created_at ON routes(created_at DESC);

-- Track points table indexes
CREATE INDEX IF NOT EXISTS idx_track_points_route_id ON track_points(route_id);
CREATE INDEX IF NOT EXISTS idx_track_points_timestamp ON track_points(timestamp);

-- Strava tokens table indexes
CREATE INDEX IF NOT EXISTS idx_strava_tokens_user_id ON strava_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_strava_tokens_expires_at ON strava_tokens(expires_at);

-- User preferences table indexes
CREATE INDEX IF NOT EXISTS idx_user_preferences_user_id ON user_preferences(user_id);

-- Activity log table indexes
CREATE INDEX IF NOT EXISTS idx_activity_log_user_id ON activity_log(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_created_at ON activity_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_log_action ON activity_log(action);

-- Rate limits table indexes
CREATE INDEX IF NOT EXISTS idx_rate_limits_identifier ON rate_limits(identifier);
CREATE INDEX IF NOT EXISTS idx_rate_limits_endpoint ON rate_limits(endpoint);
CREATE INDEX IF NOT EXISTS idx_rate_limits_window_start ON rate_limits(window_start);

-- =============================================
-- TRIGGERS FOR AUDIT LOGGING
-- =============================================

-- Create function to log user activities
CREATE OR REPLACE FUNCTION log_user_activity()
RETURNS TRIGGER AS $$
BEGIN
    -- Only log if there's an authenticated user
    IF auth.uid() IS NOT NULL THEN
        INSERT INTO activity_log (
            user_id,
            action,
            resource_type,
            resource_id,
            details
        ) VALUES (
            auth.uid(),
            TG_OP,
            TG_TABLE_NAME,
            COALESCE(NEW.id, OLD.id),
            jsonb_build_object(
                'old', CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE NULL END,
                'new', CASE WHEN TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN to_jsonb(NEW) ELSE NULL END
            )
        );
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create triggers for audit logging on sensitive tables
DROP TRIGGER IF EXISTS routes_audit_trigger ON routes;
CREATE TRIGGER routes_audit_trigger
    AFTER INSERT OR UPDATE OR DELETE ON routes
    FOR EACH ROW EXECUTE FUNCTION log_user_activity();

DROP TRIGGER IF EXISTS strava_tokens_audit_trigger ON strava_tokens;
CREATE TRIGGER strava_tokens_audit_trigger
    AFTER INSERT OR UPDATE OR DELETE ON strava_tokens
    FOR EACH ROW EXECUTE FUNCTION log_user_activity();

-- =============================================
-- CLEANUP FUNCTIONS
-- =============================================

-- Function to clean up old activity logs (run periodically)
CREATE OR REPLACE FUNCTION cleanup_old_activity_logs()
RETURNS void AS $$
BEGIN
    DELETE FROM activity_log
    WHERE created_at < now() - interval '90 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to clean up expired rate limit records
CREATE OR REPLACE FUNCTION cleanup_expired_rate_limits()
RETURNS void AS $$
BEGIN
    DELETE FROM rate_limits
    WHERE window_start < now() - interval '1 hour';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- GRANTS AND PERMISSIONS
-- =============================================

-- Grant appropriate permissions to roles

-- Authenticated users
GRANT SELECT, INSERT, UPDATE, DELETE ON routes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON track_points TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON user_preferences TO authenticated;
GRANT SELECT ON activity_log TO authenticated;

-- Service role (for server-side operations)
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- Anonymous role (very restricted)
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;

-- =============================================
-- SECURITY FUNCTIONS
-- =============================================

-- Function to check if user owns a route
CREATE OR REPLACE FUNCTION user_owns_route(route_uuid uuid)
RETURNS boolean AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM routes
        WHERE id = route_uuid AND user_id = auth.uid()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to validate user permissions
CREATE OR REPLACE FUNCTION validate_user_permission(
    resource_type text,
    resource_id uuid,
    required_permission text
)
RETURNS boolean AS $$
BEGIN
    -- Add custom permission logic here
    -- For now, just check ownership
    CASE resource_type
        WHEN 'route' THEN
            RETURN user_owns_route(resource_id);
        ELSE
            RETURN false;
    END CASE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- COMMENTS FOR DOCUMENTATION
-- =============================================

COMMENT ON TABLE routes IS 'User cycling routes with RLS policies';
COMMENT ON TABLE track_points IS 'GPS track points for routes with user-based access control';
COMMENT ON TABLE strava_tokens IS 'Secure Strava OAuth tokens with user isolation';
COMMENT ON TABLE user_preferences IS 'User application preferences with privacy protection';
COMMENT ON TABLE activity_log IS 'Security audit trail for user actions';
COMMENT ON TABLE rate_limits IS 'API rate limiting data for abuse prevention';

COMMENT ON FUNCTION log_user_activity() IS 'Audit trigger function for security logging';
COMMENT ON FUNCTION cleanup_old_activity_logs() IS 'Maintenance function to remove old audit logs';
COMMENT ON FUNCTION cleanup_expired_rate_limits() IS 'Maintenance function to clean rate limit data';
COMMENT ON FUNCTION user_owns_route(uuid) IS 'Security helper to verify route ownership';
COMMENT ON FUNCTION validate_user_permission(text, uuid, text) IS 'Generic permission validation function';