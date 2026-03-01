-- Migration 047: Add daily email preferences to user_profiles
-- Supports the daily morning email feature with opt-out and tracking

-- Add daily email opt-out flag (default false = opted in)
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS daily_email_opt_out BOOLEAN DEFAULT false;

-- Track when the last daily email was sent (prevents double-sends)
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS last_daily_email_sent TIMESTAMPTZ;

-- JSONB for per-module email preferences (future use)
-- Example: { "todaysWorkout": true, "weather": true, "aiCoach": false }
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS email_preferences JSONB DEFAULT '{}'::jsonb;

-- Index for efficient querying of eligible users
CREATE INDEX IF NOT EXISTS idx_user_profiles_daily_email_opt_out
  ON public.user_profiles (daily_email_opt_out)
  WHERE daily_email_opt_out IS NOT TRUE;

COMMENT ON COLUMN public.user_profiles.daily_email_opt_out IS 'If true, user will not receive daily morning emails';
COMMENT ON COLUMN public.user_profiles.last_daily_email_sent IS 'Timestamp of last daily email sent, used to prevent double-sends';
COMMENT ON COLUMN public.user_profiles.email_preferences IS 'Per-module email preferences as JSONB';
