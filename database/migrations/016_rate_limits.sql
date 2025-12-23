-- ============================================================================
-- Rate Limiting Table
-- ============================================================================
-- Distributed rate limiting for Vercel serverless functions
-- Replaces in-memory Map-based rate limiting that doesn't persist across instances
-- ============================================================================

-- Create rate_limits table
CREATE TABLE IF NOT EXISTS rate_limits (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,           -- e.g., "AI_COACH:192.168.1.1" or "strava-auth:user_123"
  count INTEGER DEFAULT 1,            -- Request count in current window
  window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),  -- When this window started
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookups by key
CREATE INDEX IF NOT EXISTS idx_rate_limits_key ON rate_limits(key);

-- Index for cleanup of expired entries
CREATE INDEX IF NOT EXISTS idx_rate_limits_window_start ON rate_limits(window_start);

-- Function to check and increment rate limit
-- Returns: { allowed: boolean, remaining: integer, reset_at: timestamptz }
CREATE OR REPLACE FUNCTION check_rate_limit(
  p_key TEXT,
  p_limit INTEGER,
  p_window_minutes INTEGER
)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
  v_record rate_limits%ROWTYPE;
  v_now TIMESTAMPTZ := NOW();
  v_window_start TIMESTAMPTZ;
  v_remaining INTEGER;
  v_allowed BOOLEAN;
  v_reset_at TIMESTAMPTZ;
BEGIN
  -- Try to get existing record
  SELECT * INTO v_record FROM rate_limits WHERE key = p_key FOR UPDATE;

  IF v_record.id IS NULL THEN
    -- No existing record, create new window
    v_window_start := v_now;
    v_reset_at := v_now + (p_window_minutes || ' minutes')::INTERVAL;

    INSERT INTO rate_limits (key, count, window_start, updated_at)
    VALUES (p_key, 1, v_window_start, v_now);

    v_remaining := p_limit - 1;
    v_allowed := TRUE;
  ELSIF v_now > v_record.window_start + (p_window_minutes || ' minutes')::INTERVAL THEN
    -- Window expired, reset
    v_window_start := v_now;
    v_reset_at := v_now + (p_window_minutes || ' minutes')::INTERVAL;

    UPDATE rate_limits
    SET count = 1, window_start = v_window_start, updated_at = v_now
    WHERE id = v_record.id;

    v_remaining := p_limit - 1;
    v_allowed := TRUE;
  ELSIF v_record.count >= p_limit THEN
    -- Limit exceeded
    v_reset_at := v_record.window_start + (p_window_minutes || ' minutes')::INTERVAL;
    v_remaining := 0;
    v_allowed := FALSE;
  ELSE
    -- Increment count
    v_reset_at := v_record.window_start + (p_window_minutes || ' minutes')::INTERVAL;

    UPDATE rate_limits
    SET count = count + 1, updated_at = v_now
    WHERE id = v_record.id;

    v_remaining := p_limit - v_record.count - 1;
    v_allowed := TRUE;
  END IF;

  RETURN json_build_object(
    'allowed', v_allowed,
    'remaining', v_remaining,
    'reset_at', v_reset_at,
    'count', CASE WHEN v_record.id IS NULL THEN 1 ELSE v_record.count + 1 END
  );
END;
$$;

-- Function to clean up expired rate limit entries (run periodically)
CREATE OR REPLACE FUNCTION cleanup_rate_limits(p_max_age_hours INTEGER DEFAULT 24)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM rate_limits
  WHERE window_start < NOW() - (p_max_age_hours || ' hours')::INTERVAL;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION check_rate_limit TO authenticated;
GRANT EXECUTE ON FUNCTION check_rate_limit TO anon;
GRANT EXECUTE ON FUNCTION cleanup_rate_limits TO service_role;

-- RLS policies - rate_limits is managed by the database function, not direct access
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

-- Only service_role can directly access the table (cleanup operations)
CREATE POLICY "Service role full access" ON rate_limits
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- Optional: Set up pg_cron for automatic cleanup (requires pg_cron extension)
-- Run this manually if you have pg_cron enabled:
--
-- SELECT cron.schedule(
--   'cleanup-rate-limits',
--   '0 * * * *',  -- Every hour
--   $$ SELECT cleanup_rate_limits(24) $$
-- );
-- ============================================================================
