-- Migration 084: Coach correction proposals table
--
-- Stores AI-generated proposals to correct an athlete's training when
-- projected TFI at a goal event drifts outside the target band.
-- Each proposal contains a list of specific workout modifications
-- (propose_modification tool outputs) plus resolved voice prose.

CREATE TABLE IF NOT EXISTS public.coach_correction_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Which race goal triggered this proposal
  race_goal_id UUID REFERENCES public.race_goals(id) ON DELETE SET NULL,

  -- Coaching persona used (matches user_coach_settings.coaching_persona)
  persona_id TEXT,

  -- Resolved voice prose (tokens like {today} already expanded server-side)
  opener_text TEXT,
  closer_text TEXT,

  -- Array of modification objects:
  --   [{ session_id, op, delta_minutes, new_type, new_rss, reason, planned_workout_id }]
  -- planned_workout_id is the validated UUID resolved from the sess_ prefix
  modifications JSONB NOT NULL DEFAULT '[]',

  -- TFI context at generation time
  current_tfi INT,
  projected_tfi_without INT,   -- projection if no changes made
  projected_tfi_with INT,      -- projection if all mods are accepted
  target_tfi_min INT,
  target_tfi_max INT,

  -- Outcome lifecycle
  outcome TEXT NOT NULL DEFAULT 'pending'
    CHECK (outcome IN ('pending', 'accepted', 'declined', 'partial')),
  outcome_at TIMESTAMPTZ,

  -- For partial accepts: array of session_id strings that were accepted
  accepted_session_ids JSONB DEFAULT '[]',

  -- Token usage for cost monitoring
  input_tokens INT,
  output_tokens INT,

  -- Raw Claude output preserved for debugging / regeneration
  raw_response JSONB,

  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_correction_proposals_user_pending
  ON public.coach_correction_proposals (user_id, outcome, generated_at DESC);

CREATE INDEX IF NOT EXISTS idx_correction_proposals_race_goal
  ON public.coach_correction_proposals (race_goal_id);

-- Verification query:
-- SELECT COUNT(*) FROM public.coach_correction_proposals;
