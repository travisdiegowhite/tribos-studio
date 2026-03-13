-- Migration 051: Coach Check-In Feature
-- Adds tables for AI-generated coaching check-ins, decision tracking,
-- and persona fields on user_coach_settings.

-- ============================================================
-- 1. Coach Check-Ins Table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.coach_check_ins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  activity_id UUID NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
  persona_id TEXT NOT NULL DEFAULT 'pending',
  narrative TEXT NOT NULL DEFAULT '',
  deviation_callout TEXT,
  recommendation JSONB,
  next_session_purpose TEXT,
  context_snapshot JSONB,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  error_message TEXT,
  seen BOOLEAN NOT NULL DEFAULT false,
  seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(activity_id)
);

-- Indexes
CREATE INDEX idx_coach_check_ins_user_created
  ON public.coach_check_ins(user_id, created_at DESC);
CREATE INDEX idx_coach_check_ins_user_status
  ON public.coach_check_ins(user_id, status);

-- RLS
ALTER TABLE public.coach_check_ins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own check-ins"
  ON public.coach_check_ins FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own check-ins (seen status)"
  ON public.coach_check_ins FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role full access to check-ins"
  ON public.coach_check_ins FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================
-- 2. Coach Check-In Decisions Table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.coach_check_in_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  check_in_id UUID NOT NULL REFERENCES public.coach_check_ins(id) ON DELETE CASCADE,
  decision TEXT NOT NULL CHECK (decision IN ('accept', 'dismiss')),
  recommendation_summary TEXT NOT NULL,
  outcome_notes TEXT,
  decided_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for pulling last 5 decisions in context assembly
CREATE INDEX idx_check_in_decisions_user_decided
  ON public.coach_check_in_decisions(user_id, decided_at DESC);

-- RLS
ALTER TABLE public.coach_check_in_decisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own decisions"
  ON public.coach_check_in_decisions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own decisions"
  ON public.coach_check_in_decisions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role full access to decisions"
  ON public.coach_check_in_decisions FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================
-- 3. Add Persona Fields to user_coach_settings
-- ============================================================
ALTER TABLE public.user_coach_settings
  ADD COLUMN IF NOT EXISTS coaching_persona TEXT DEFAULT 'pragmatist',
  ADD COLUMN IF NOT EXISTS persona_set_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS persona_set_by TEXT DEFAULT 'default'
    CHECK (persona_set_by IN ('intake', 'manual', 'default')),
  ADD COLUMN IF NOT EXISTS intake_answers JSONB;
