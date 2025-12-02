-- Rate Limiting Table for API Protection
-- Tracks API requests per IP address and endpoint for rate limiting

CREATE TABLE IF NOT EXISTS api_rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_rate_limit_lookup
  ON api_rate_limits (ip_address, endpoint, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_rate_limit_cleanup
  ON api_rate_limits (created_at);

-- Enable RLS
ALTER TABLE api_rate_limits ENABLE ROW LEVEL SECURITY;

-- Only service role can access (API endpoints use service key)
CREATE POLICY "Service role only" ON api_rate_limits
  FOR ALL USING (auth.role() = 'service_role');

-- Add comment
COMMENT ON TABLE api_rate_limits IS
'Tracks API requests for rate limiting. Auto-cleaned by cleanup function.';

-- ============================================================================
-- Cleanup Function: Remove old rate limit entries
-- ============================================================================

CREATE OR REPLACE FUNCTION cleanup_old_rate_limits()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  -- Delete entries older than 1 hour
  DELETE FROM api_rate_limits
  WHERE created_at < NOW() - INTERVAL '1 hour';

  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add comment
COMMENT ON FUNCTION cleanup_old_rate_limits IS
'Removes rate limit entries older than 1 hour. Run via cron job every 15 minutes.';

-- ============================================================================
-- Manual Cleanup (run this occasionally or set up as cron job)
-- ============================================================================

-- To manually clean up old entries, run:
-- SELECT cleanup_old_rate_limits();

-- To set up automatic cleanup via Supabase cron (Dashboard > Database > Cron):
-- Schedule: */15 * * * * (every 15 minutes)
-- SQL: SELECT cleanup_old_rate_limits();

-- ============================================================================
-- Verification
-- ============================================================================

SELECT 'Rate limiting table created successfully' as status;
SELECT COUNT(*) as initial_entries FROM api_rate_limits;
