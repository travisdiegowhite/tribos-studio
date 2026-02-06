-- Migration 039: Add retry support columns to garmin_webhook_events
-- Supports the async processing model where events are stored first, processed by cron

ALTER TABLE garmin_webhook_events
  ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS batch_index INTEGER DEFAULT 0;

-- Index for the processor query: find unprocessed events ready for processing
CREATE INDEX IF NOT EXISTS idx_garmin_webhook_events_unprocessed
  ON garmin_webhook_events (processed, next_retry_at)
  WHERE processed = false;

COMMENT ON COLUMN garmin_webhook_events.retry_count IS 'Number of processing attempts';
COMMENT ON COLUMN garmin_webhook_events.next_retry_at IS 'When to retry next (null = immediate, exponential backoff)';
COMMENT ON COLUMN garmin_webhook_events.batch_index IS 'Position within original webhook batch payload';
