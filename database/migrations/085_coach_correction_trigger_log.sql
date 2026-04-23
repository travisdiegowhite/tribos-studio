-- Migration 085: Correction trigger evaluation log
--
-- Every cron run logs each user evaluation so we can answer
-- "why didn't the trigger fire for user X today" in one query.

CREATE TABLE IF NOT EXISTS public.coach_correction_trigger_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,

  evaluated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  timezone TEXT,

  -- Did the trigger fire?
  fired BOOLEAN NOT NULL DEFAULT FALSE,

  -- Condition breakdown (for observability)
  -- e.g. { has_goal: true, in_time_window: true, tfi_off_target: true,
  --        no_recent_proposal: true, not_in_taper: true }
  conditions JSONB NOT NULL DEFAULT '{}',

  -- If fired, which proposal was created
  proposal_id UUID REFERENCES public.coach_correction_proposals(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_trigger_log_user_evaluated
  ON public.coach_correction_trigger_log (user_id, evaluated_at DESC);

-- Purge old logs after 90 days (run manually or via a future cleanup cron)
-- DELETE FROM public.coach_correction_trigger_log WHERE evaluated_at < NOW() - INTERVAL '90 days';
