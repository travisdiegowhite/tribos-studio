-- 051: Coach Check-In System
-- AI-generated coaching check-ins triggered by activity syncs.

-- ── coach_check_ins ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.coach_check_ins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  activity_id UUID UNIQUE REFERENCES public.activities(id) ON DELETE SET NULL,
  persona_id TEXT NOT NULL DEFAULT 'pending',
  narrative TEXT,
  deviation_callout TEXT,
  recommendation JSONB,
  next_session_purpose TEXT,
  context_snapshot JSONB,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  error_message TEXT,
  seen BOOLEAN NOT NULL DEFAULT FALSE,
  seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_coach_check_ins_user_created
  ON public.coach_check_ins (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_coach_check_ins_user_status
  ON public.coach_check_ins (user_id, status);

ALTER TABLE public.coach_check_ins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own check-ins"
  ON public.coach_check_ins FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own check-ins (seen)"
  ON public.coach_check_ins FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role full access on check-ins"
  ON public.coach_check_ins FOR ALL
  USING (auth.role() = 'service_role');

-- ── coach_check_in_decisions ─────────────────────────────────

CREATE TABLE IF NOT EXISTS public.coach_check_in_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  check_in_id UUID NOT NULL REFERENCES public.coach_check_ins(id) ON DELETE CASCADE,
  decision TEXT NOT NULL CHECK (decision IN ('accept', 'dismiss')),
  recommendation_summary TEXT,
  outcome_notes TEXT,
  decided_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_coach_decisions_user_decided
  ON public.coach_check_in_decisions (user_id, decided_at DESC);

ALTER TABLE public.coach_check_in_decisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own decisions"
  ON public.coach_check_in_decisions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own decisions"
  ON public.coach_check_in_decisions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role full access on decisions"
  ON public.coach_check_in_decisions FOR ALL
  USING (auth.role() = 'service_role');

-- ── user_coach_settings additions ────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_coach_settings' AND column_name = 'coaching_persona'
  ) THEN
    ALTER TABLE public.user_coach_settings ADD COLUMN coaching_persona TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_coach_settings' AND column_name = 'persona_set_at'
  ) THEN
    ALTER TABLE public.user_coach_settings ADD COLUMN persona_set_at TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_coach_settings' AND column_name = 'persona_set_by'
  ) THEN
    ALTER TABLE public.user_coach_settings ADD COLUMN persona_set_by TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_coach_settings' AND column_name = 'intake_answers'
  ) THEN
    ALTER TABLE public.user_coach_settings ADD COLUMN intake_answers JSONB;
  END IF;
END $$;
