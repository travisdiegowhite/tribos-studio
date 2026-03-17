-- Migration 053: Database cleanup functions and missing indexes
-- Addresses unbounded webhook event table growth, missing indexes,
-- and expensive RLS policy support.

-- ============================================================================
-- CLEANUP FUNCTIONS (called via Vercel cron endpoint api/database-cleanup.js)
-- ============================================================================

-- 1. Delete processed webhook events older than 30 days
-- Only deletes events that were successfully processed (processed = true).
-- Unprocessed and failed events are preserved for debugging.
CREATE OR REPLACE FUNCTION cleanup_old_webhook_events(retention_days INTEGER DEFAULT 30)
RETURNS TABLE(garmin_deleted BIGINT, strava_deleted BIGINT, coros_deleted BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cutoff TIMESTAMPTZ := NOW() - (retention_days || ' days')::INTERVAL;
  g_count BIGINT := 0;
  s_count BIGINT := 0;
  c_count BIGINT := 0;
BEGIN
  -- Garmin: delete in batches to avoid long locks
  WITH deleted AS (
    DELETE FROM public.garmin_webhook_events
    WHERE processed = true
      AND processed_at < cutoff
      AND id IN (
        SELECT id FROM public.garmin_webhook_events
        WHERE processed = true AND processed_at < cutoff
        LIMIT 10000
      )
    RETURNING 1
  )
  SELECT COUNT(*) INTO g_count FROM deleted;

  -- Strava
  WITH deleted AS (
    DELETE FROM public.strava_webhook_events
    WHERE processed = true
      AND processed_at < cutoff
      AND id IN (
        SELECT id FROM public.strava_webhook_events
        WHERE processed = true AND processed_at < cutoff
        LIMIT 10000
      )
    RETURNING 1
  )
  SELECT COUNT(*) INTO s_count FROM deleted;

  -- COROS
  WITH deleted AS (
    DELETE FROM public.coros_webhook_events
    WHERE processed = true
      AND processed_at < cutoff
      AND id IN (
        SELECT id FROM public.coros_webhook_events
        WHERE processed = true AND processed_at < cutoff
        LIMIT 10000
      )
    RETURNING 1
  )
  SELECT COUNT(*) INTO c_count FROM deleted;

  RETURN QUERY SELECT g_count, s_count, c_count;
END;
$$;

-- 2. Delete old proactive insights
-- Completed+seen insights older than 90 days, failed insights older than 7 days
CREATE OR REPLACE FUNCTION cleanup_old_insights()
RETURNS TABLE(completed_deleted BIGINT, failed_deleted BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  comp_count BIGINT := 0;
  fail_count BIGINT := 0;
BEGIN
  WITH deleted AS (
    DELETE FROM public.proactive_insights
    WHERE status = 'completed'
      AND seen = true
      AND created_at < NOW() - INTERVAL '90 days'
    RETURNING 1
  )
  SELECT COUNT(*) INTO comp_count FROM deleted;

  WITH deleted AS (
    DELETE FROM public.proactive_insights
    WHERE status = 'failed'
      AND created_at < NOW() - INTERVAL '7 days'
    RETURNING 1
  )
  SELECT COUNT(*) INTO fail_count FROM deleted;

  RETURN QUERY SELECT comp_count, fail_count;
END;
$$;

-- 3. Delete expired weather cache entries
CREATE OR REPLACE FUNCTION cleanup_expired_weather_cache()
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  del_count BIGINT;
BEGIN
  WITH deleted AS (
    DELETE FROM public.weather_cache
    WHERE expires_at < NOW()
    RETURNING 1
  )
  SELECT COUNT(*) INTO del_count FROM deleted;

  RETURN del_count;
END;
$$;

-- ============================================================================
-- INDEXES FOR EFFICIENT CLEANUP
-- ============================================================================

-- Support efficient deletion of processed webhook events by processed_at
CREATE INDEX IF NOT EXISTS idx_garmin_webhook_events_cleanup
  ON garmin_webhook_events (processed, processed_at)
  WHERE processed = true;

CREATE INDEX IF NOT EXISTS idx_strava_webhook_events_cleanup
  ON strava_webhook_events (processed, processed_at)
  WHERE processed = true;

CREATE INDEX IF NOT EXISTS idx_coros_webhook_events_cleanup
  ON coros_webhook_events (processed, processed_at)
  WHERE processed = true;

-- ============================================================================
-- MISSING INDEXES FOR QUERY PERFORMANCE
-- ============================================================================

-- COROS: partial index for unprocessed events (Garmin has this via migration 039)
CREATE INDEX IF NOT EXISTS idx_coros_webhook_events_unprocessed
  ON coros_webhook_events (processed, next_retry_at)
  WHERE processed = false;

-- Training plans: composite index for common user+status lookups
CREATE INDEX IF NOT EXISTS idx_training_plans_user_status
  ON training_plans (user_id, status);

-- ============================================================================
-- RLS POLICY SUPPORT INDEXES
-- ============================================================================

-- Support the expensive JOIN subquery in cafe_encouragements RLS policies
-- (SELECT/INSERT policies join cafe_check_ins → cafe_memberships)
CREATE INDEX IF NOT EXISTS idx_cafe_check_ins_cafe_id_covering
  ON cafe_check_ins (cafe_id, id);

-- Covering index for the membership check in RLS (user_id + status + cafe_id)
CREATE INDEX IF NOT EXISTS idx_cafe_memberships_user_status_cafe
  ON cafe_memberships (user_id, status, cafe_id);

-- ============================================================================
-- GRANT EXECUTE TO SERVICE ROLE
-- ============================================================================

GRANT EXECUTE ON FUNCTION cleanup_old_webhook_events(INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION cleanup_old_insights() TO service_role;
GRANT EXECUTE ON FUNCTION cleanup_expired_weather_cache() TO service_role;

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
