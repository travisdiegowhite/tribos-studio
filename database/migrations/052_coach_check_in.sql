-- Migration 052: Coach Check-In Feature
-- Adds coaching persona to user profiles, check-in storage, and decision tracking

-- 1. Add coaching persona fields to user_profiles
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS coaching_persona text,
  ADD COLUMN IF NOT EXISTS coaching_persona_set_at timestamptz,
  ADD COLUMN IF NOT EXISTS coaching_persona_set_by text;

-- Validate persona values
ALTER TABLE public.user_profiles
  DROP CONSTRAINT IF EXISTS valid_coaching_persona;
ALTER TABLE public.user_profiles
  ADD CONSTRAINT valid_coaching_persona
  CHECK (coaching_persona IS NULL OR coaching_persona IN ('hammer', 'scientist', 'encourager', 'pragmatist', 'competitor'));

ALTER TABLE public.user_profiles
  DROP CONSTRAINT IF EXISTS valid_coaching_persona_set_by;
ALTER TABLE public.user_profiles
  ADD CONSTRAINT valid_coaching_persona_set_by
  CHECK (coaching_persona_set_by IS NULL OR coaching_persona_set_by IN ('intake', 'manual'));

-- 2. Coach check-ins table
-- Drop if exists from a previous partial migration (PR #544 was reverted but table may remain)
DROP TABLE IF EXISTS public.coach_check_in_decisions CASCADE;
DROP TABLE IF EXISTS public.coach_check_ins CASCADE;

CREATE TABLE public.coach_check_ins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  activity_id uuid REFERENCES public.activities(id) ON DELETE SET NULL,
  persona_id text NOT NULL CHECK (persona_id IN ('hammer', 'scientist', 'encourager', 'pragmatist', 'competitor')),
  narrative text NOT NULL,
  deviation_callout text,
  recommendation jsonb,
  next_session_purpose text,
  is_current boolean NOT NULL DEFAULT true,
  generated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_coach_check_ins_user_generated
  ON public.coach_check_ins (user_id, generated_at DESC);

CREATE UNIQUE INDEX idx_coach_check_ins_user_activity
  ON public.coach_check_ins (user_id, activity_id)
  WHERE activity_id IS NOT NULL;

-- RLS
ALTER TABLE public.coach_check_ins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own check-ins" ON public.coach_check_ins;
CREATE POLICY "Users can view own check-ins"
  ON public.coach_check_ins FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own check-ins" ON public.coach_check_ins;
CREATE POLICY "Users can insert own check-ins"
  ON public.coach_check_ins FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own check-ins" ON public.coach_check_ins;
CREATE POLICY "Users can update own check-ins"
  ON public.coach_check_ins FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role full access to check-ins" ON public.coach_check_ins;
CREATE POLICY "Service role full access to check-ins"
  ON public.coach_check_ins FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- 3. Check-in decisions table
CREATE TABLE public.coach_check_in_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  check_in_id uuid NOT NULL REFERENCES public.coach_check_ins(id) ON DELETE CASCADE,
  decision text NOT NULL CHECK (decision IN ('accept', 'dismiss')),
  recommendation_summary text NOT NULL,
  decided_at timestamptz NOT NULL DEFAULT now(),
  outcome_notes text
);

-- Indexes
CREATE INDEX idx_coach_check_in_decisions_user
  ON public.coach_check_in_decisions (user_id, decided_at DESC);

-- RLS
ALTER TABLE public.coach_check_in_decisions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own decisions" ON public.coach_check_in_decisions;
CREATE POLICY "Users can view own decisions"
  ON public.coach_check_in_decisions FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own decisions" ON public.coach_check_in_decisions;
CREATE POLICY "Users can insert own decisions"
  ON public.coach_check_in_decisions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own decisions" ON public.coach_check_in_decisions;
CREATE POLICY "Users can update own decisions"
  ON public.coach_check_in_decisions FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role full access to decisions" ON public.coach_check_in_decisions;
CREATE POLICY "Service role full access to decisions"
  ON public.coach_check_in_decisions FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');
