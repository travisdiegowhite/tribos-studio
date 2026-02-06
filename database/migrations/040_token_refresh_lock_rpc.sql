-- Migration: Atomic token refresh lock using FOR UPDATE
-- Replaces the client-side lock approach with a proper Postgres row-level lock.
-- Prevents race conditions where two serverless instances both try to refresh
-- the same Garmin token simultaneously (which invalidates the first one).

-- Function to atomically acquire token refresh lock
-- Uses FOR UPDATE to block concurrent access to the same row.
-- Only one caller can hold the lock at a time.
CREATE OR REPLACE FUNCTION acquire_token_refresh_lock(
  p_integration_id UUID,
  p_lock_duration_seconds INTEGER DEFAULT 30
)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
  v_row bike_computer_integrations%ROWTYPE;
  v_now TIMESTAMPTZ := NOW();
  v_lock_until TIMESTAMPTZ := v_now + (p_lock_duration_seconds || ' seconds')::INTERVAL;
BEGIN
  -- FOR UPDATE: row-level exclusive lock — blocks concurrent transactions
  SELECT * INTO v_row
  FROM bike_computer_integrations
  WHERE id = p_integration_id
  FOR UPDATE;

  IF v_row.id IS NULL THEN
    RETURN json_build_object('acquired', false, 'reason', 'not_found');
  END IF;

  -- Check if lock is currently held (not null and not expired)
  IF v_row.refresh_lock_until IS NOT NULL AND v_row.refresh_lock_until > v_now THEN
    -- Lock is held — return current token info so caller can use it
    RETURN json_build_object(
      'acquired', false,
      'reason', 'locked',
      'lock_expires', v_row.refresh_lock_until,
      'access_token', v_row.access_token,
      'token_expires_at', v_row.token_expires_at
    );
  END IF;

  -- Lock is available (null or expired) — acquire it
  UPDATE bike_computer_integrations
  SET refresh_lock_until = v_lock_until, updated_at = v_now
  WHERE id = p_integration_id;

  RETURN json_build_object('acquired', true, 'lock_until', v_lock_until);
END;
$$;

-- Grant execute to service_role only (this is a server-side operation)
GRANT EXECUTE ON FUNCTION acquire_token_refresh_lock TO service_role;
