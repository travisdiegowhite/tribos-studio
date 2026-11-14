-- Migration 140: Wahoo webhook audit log (docs/wahoo-integration.md)
--
-- api/wahoo-webhook.js stores every authenticated delivery here BEFORE it
-- processes it, then marks the row processed (or records the error). It is an
-- audit trail and a replay source, not a queue: processing happens inline,
-- and on a transient failure the endpoint returns 5xx so Wahoo's own retries
-- (30 min, 4 h, 24 h, 72 h) redeliver. There is deliberately no processor cron.
--
-- Wahoo can deliver the same workout more than once, so rows are NOT unique
-- per workout; each delivery is its own row. Idempotency lives in the importer
-- (activities.provider_activity_id).
--
-- Service-role only: RLS is on with no policies, so the browser can read
-- nothing. The webhook writes through the service-role singleton.
--
-- APPLY BY HAND and confirm with `npm run audit:schema`. Until it is applied
-- the webhook logs a warning and still imports (the insert is fail-soft).

CREATE TABLE IF NOT EXISTS public.wahoo_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  wahoo_user_id TEXT,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  workout_id TEXT,
  summary_id TEXT,
  payload JSONB NOT NULL,
  -- 'received' → 'processed' | 'skipped' | 'error'
  status TEXT NOT NULL DEFAULT 'received',
  result TEXT,            -- inserted / updated / merged / takeover / skip reason
  process_error TEXT,
  activity_id UUID REFERENCES public.activities(id) ON DELETE SET NULL,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wahoo_webhook_events_created
  ON public.wahoo_webhook_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wahoo_webhook_events_user
  ON public.wahoo_webhook_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wahoo_webhook_events_workout
  ON public.wahoo_webhook_events (workout_id);
CREATE INDEX IF NOT EXISTS idx_wahoo_webhook_events_status
  ON public.wahoo_webhook_events (status)
  WHERE status IN ('received', 'error');

ALTER TABLE public.wahoo_webhook_events ENABLE ROW LEVEL SECURITY;

GRANT ALL ON public.wahoo_webhook_events TO service_role;

COMMENT ON TABLE public.wahoo_webhook_events IS
  'Audit log of authenticated Wahoo webhook deliveries (migration 140). Written by api/wahoo-webhook.js; service-role only.';
