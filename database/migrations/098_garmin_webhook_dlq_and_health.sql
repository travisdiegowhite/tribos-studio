-- ============================================================================
-- Migration 098: Garmin webhook dead-letter queue + pipeline health snapshots
--
-- Part of the Garmin reliability work (99.9% sync SLO). Three concerns:
--
-- 1. Dead-letter queue. Today api/garmin-webhook-process.js marks an event
--    processed=true with an error string after exhausting its retry budget,
--    which makes a permanently-failed activity event indistinguishable from a
--    successful one without parsing process_error — and if the activity row
--    was never created, the data is silently lost. The dead_lettered columns
--    let the processor park exhausted events (processed stays FALSE) where
--    they remain visible and redrivable via api/admin-garmin-dlq.js.
--
-- 2. Health snapshots. api/garmin-health-monitor.js (hourly cron) computes
--    the pipeline SLIs (delivery rate, queue lag, dead-letter counts, token
--    health, completeness backlog) and stores one row per run so the admin
--    dashboard can show trends and Sentry alerts fire on threshold breaches.
--
-- 3. Missing indexes + token-lock RPC re-apply. The Cloudflare worker does a
--    per-webhook dedup lookup on (activity_id, garmin_user_id) over
--    unprocessed rows with no supporting index. The acquire_token_refresh_lock
--    RPC from migration 040 is re-applied verbatim (CREATE OR REPLACE is
--    idempotent) because api/utils/garmin/tokenManager.js still carries a
--    fallback path suggesting the RPC may never have been applied in prod.
-- ============================================================================

-- Step 1: Dead-letter columns (idempotent).
ALTER TABLE public.garmin_webhook_events
  ADD COLUMN IF NOT EXISTS dead_lettered BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS dead_lettered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dead_letter_reason TEXT;

COMMENT ON COLUMN public.garmin_webhook_events.dead_lettered IS
'TRUE when the processor exhausted the retry budget for an activity event. '
'The row stays processed=FALSE so it remains visible; the processor''s pickup '
'query excludes it via retry_count. Redrive via api/admin-garmin-dlq.js '
'(resets retry_count/next_retry_at/dead_lettered).';

COMMENT ON COLUMN public.garmin_webhook_events.dead_letter_reason IS
'Last processing error at the moment the event was dead-lettered.';

-- Step 2: Health snapshot table written hourly by api/garmin-health-monitor.js.
CREATE TABLE IF NOT EXISTS public.garmin_health_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Core SLIs (NULL = could not be computed on this run)
  file_delivery_rate NUMERIC,        -- distinct activities with ACTIVITY_FILE_DATA / distinct activities seen (7d)
  slo_full_within_24h NUMERIC,       -- % of matured activity events at a terminal-good state (24h SLO)
  queue_lag_seconds INTEGER,         -- age of oldest unprocessed, ready, non-dead-lettered activity event
  dead_lettered_24h INTEGER,         -- events dead-lettered in the last 24h
  dead_lettered_open INTEGER,        -- dead-lettered events not yet redriven/resolved
  unmatched_webhooks_24h INTEGER,    -- events skipped with "No integration found" in the last 24h
  invalid_token_integrations INTEGER,-- integrations flagged refresh_token_invalid
  summary_only_backlog INTEGER,      -- Garmin activities stuck summary_only/needs_resync older than 48h

  -- Alert bookkeeping + full payload for the dashboard
  breaches JSONB,                    -- [{sli, value, threshold}] that fired Sentry on this run
  detail JSONB                       -- complete computeHealthSnapshot() output
);

CREATE INDEX IF NOT EXISTS garmin_health_snapshots_created_idx
  ON public.garmin_health_snapshots (created_at DESC);

ALTER TABLE public.garmin_health_snapshots ENABLE ROW LEVEL SECURITY;

-- Service-role-only table: written by crons, read by admin endpoints.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'garmin_health_snapshots'
      AND policyname = 'Service role has full access to garmin health snapshots'
  ) THEN
    CREATE POLICY "Service role has full access to garmin health snapshots"
      ON public.garmin_health_snapshots FOR ALL
      USING (auth.role() = 'service_role');
  END IF;
END $$;

GRANT ALL ON public.garmin_health_snapshots TO service_role;

-- Step 3: Indexes for hot lookups.
-- Cloudflare worker dedup: find an unprocessed event for this activity/user
-- before inserting a duplicate (cloudflare-workers/garmin-webhook/src/index.js).
CREATE INDEX IF NOT EXISTS idx_garmin_webhooks_dedup_unprocessed
  ON public.garmin_webhook_events (activity_id, garmin_user_id)
  WHERE processed = false;

-- Health-event audit lookups + per-user diagnostics by recency.
CREATE INDEX IF NOT EXISTS idx_garmin_webhooks_garmin_user_recent
  ON public.garmin_webhook_events (garmin_user_id, created_at DESC);

-- DLQ admin listing.
CREATE INDEX IF NOT EXISTS idx_garmin_webhooks_dead_lettered
  ON public.garmin_webhook_events (dead_lettered_at DESC)
  WHERE dead_lettered = true;

-- Step 4: Re-apply the token refresh lock RPC from migration 040 verbatim.
-- tokenManager.js falls back to a non-atomic UPDATE when this RPC is missing,
-- which leaves a race window on Garmin's rotating refresh tokens. CREATE OR
-- REPLACE is idempotent, so re-applying is safe whether or not 040 ran.
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

GRANT EXECUTE ON FUNCTION acquire_token_refresh_lock TO service_role;

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';

SELECT 'garmin webhook DLQ + health snapshots migration applied' AS status;
