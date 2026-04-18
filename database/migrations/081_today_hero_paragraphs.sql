-- Migration 081: Today Hero Paragraphs
-- Server-side cache for the dashboard hero paragraph.
-- One row per rider per local-calendar-day, upserted on regeneration.

CREATE TABLE IF NOT EXISTS today_hero_paragraphs (
  id                uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id           uuid REFERENCES auth.users NOT NULL,
  date              date NOT NULL,
  last_ride_id      uuid,
  archetype         text,                   -- NULL while status='pending'; set on completion
  cache_key         text,                   -- NULL until the worker resolves a cache key
  paragraph         jsonb,
  context_snapshot  jsonb,
  voice_response    jsonb,
  status            text NOT NULL DEFAULT 'completed'
                      CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  error_message     text,
  generated_at      timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now(),
  UNIQUE (user_id, date)
);

-- RLS: riders read their own paragraph; service role does all writes.
ALTER TABLE today_hero_paragraphs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own hero paragraph"
  ON today_hero_paragraphs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role full access on today_hero_paragraphs"
  ON today_hero_paragraphs FOR ALL
  USING (true)
  WITH CHECK (true);

-- Lookup by (user_id, date) is covered by the UNIQUE constraint.
-- Separate index drives the precompute worker's "give me pending rows" query.
CREATE INDEX IF NOT EXISTS idx_today_hero_paragraphs_status_generated
  ON today_hero_paragraphs (status, generated_at);
