-- Migration 054: Fitness Language Layer
-- Adds experience_level to user profiles and creates fitness_summaries cache table
--
-- HISTORY: only part 1 (experience_level) ever reached production. The table
-- below was missing until 2026-09-02, which made api/fitness-summary.js a
-- permanent cache miss — it swallows the read error, so every request paid for
-- a fresh Claude Haiku call instead of a 4-hour cached one.

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

-- NO service-role policy here, deliberately.
--
-- This migration originally carried:
--
--   CREATE POLICY "Service role full access on fitness_summaries"
--     ON fitness_summaries FOR ALL USING (true) WITH CHECK (true);
--
-- which was wrong twice over. A policy with no TO clause applies to PUBLIC,
-- and permissive policies are OR'd together — so it granted every
-- authenticated user read and write access to every other user's summaries,
-- silently cancelling the own-rows SELECT policy above it. And it was never
-- needed: the Supabase service role has BYPASSRLS, so api/fitness-summary.js
-- upserts fine without any policy at all.
--
-- Corrected before the table was first created in production (2026-09-02);
-- the bad policy never existed anywhere. Same server-only posture as
-- migration 106.

-- Index for fast cache lookups
CREATE INDEX IF NOT EXISTS idx_fitness_summaries_lookup
  ON fitness_summaries (user_id, surface, cache_key);
