-- Migration 054: Fitness Language Layer
-- Adds experience_level to user profiles and creates fitness_summaries cache table

-- 1. Add experience level to user profiles for AI tone adaptation
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS experience_level text
  DEFAULT 'intermediate'
  CHECK (experience_level IN ('beginner', 'intermediate', 'advanced', 'racer'));

-- 2. Fitness summary cache table — stores AI-generated plain-language summaries
CREATE TABLE IF NOT EXISTS fitness_summaries (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      uuid REFERENCES auth.users NOT NULL,
  surface      text NOT NULL,            -- 'today' | 'post_ride' | 'coach'
  cache_key    text NOT NULL,
  summary      text NOT NULL,
  context_snapshot jsonb,                -- for debugging, not served to client
  generated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, surface)
);

-- RLS: users can only read their own summaries
ALTER TABLE fitness_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own summaries"
  ON fitness_summaries FOR SELECT
  USING (auth.uid() = user_id);

-- Service role needs full access for upserts from API
CREATE POLICY "Service role full access on fitness_summaries"
  ON fitness_summaries FOR ALL
  USING (true)
  WITH CHECK (true);

-- Index for fast cache lookups
CREATE INDEX IF NOT EXISTS idx_fitness_summaries_lookup
  ON fitness_summaries (user_id, surface, cache_key);
