-- Migration: Garmin Backfill Chunks Tracking
-- Purpose: Track historical activity backfill requests to Garmin API
-- The Activity API backfill endpoint queues requests asynchronously,
-- data is PUSHED to webhooks rather than returned immediately.
-- We break 2-year backfills into 2-month chunks to avoid stressing Garmin's systems.

-- Table to track backfill chunk status
CREATE TABLE IF NOT EXISTS garmin_backfill_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,

  -- Chunk time window
  chunk_start TIMESTAMPTZ NOT NULL,
  chunk_end TIMESTAMPTZ NOT NULL,

  -- Timestamps in seconds (what Garmin API uses)
  start_timestamp BIGINT NOT NULL,
  end_timestamp BIGINT NOT NULL,

  -- Status tracking
  -- pending: chunk created but not yet requested
  -- requested: backfill request sent to Garmin
  -- received: data arrived via webhook
  -- failed: request failed
  -- already_processed: 409 error - Garmin already processed this range
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'requested', 'received', 'failed', 'already_processed')),

  -- Timestamps
  requested_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ,

  -- Activity tracking
  activity_count INTEGER DEFAULT 0,

  -- Error handling
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

  -- Prevent duplicate chunks for the same user and time range
  UNIQUE(user_id, chunk_start, chunk_end)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_backfill_user_status ON garmin_backfill_chunks(user_id, status);
CREATE INDEX IF NOT EXISTS idx_backfill_requested_at ON garmin_backfill_chunks(requested_at) WHERE status = 'requested';
CREATE INDEX IF NOT EXISTS idx_backfill_user_timestamps ON garmin_backfill_chunks(user_id, start_timestamp, end_timestamp);

-- Enable RLS
ALTER TABLE garmin_backfill_chunks ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only see their own backfill chunks
CREATE POLICY "Users can view own backfill chunks"
  ON garmin_backfill_chunks FOR SELECT
  USING (auth.uid() = user_id);

-- Service role can manage all chunks (for API routes)
CREATE POLICY "Service role can manage all backfill chunks"
  ON garmin_backfill_chunks FOR ALL
  USING (auth.role() = 'service_role');

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_garmin_backfill_chunks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_garmin_backfill_chunks_updated_at
  BEFORE UPDATE ON garmin_backfill_chunks
  FOR EACH ROW
  EXECUTE FUNCTION update_garmin_backfill_chunks_updated_at();

-- Comment on table
COMMENT ON TABLE garmin_backfill_chunks IS 'Tracks Garmin historical activity backfill requests. Chunks are 2-month windows to avoid rate limiting.';
COMMENT ON COLUMN garmin_backfill_chunks.status IS 'pending=not requested, requested=sent to Garmin, received=data arrived, failed=error, already_processed=409 duplicate';
