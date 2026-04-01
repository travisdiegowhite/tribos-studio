-- 062: Extend user_profiles for expanded onboarding
-- experience_level already exists (migration 054)
-- weekly_hours_available already exists

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS primary_goal TEXT
    CHECK (primary_goal IN ('fitness', 'event', 'performance', 'comeback'));

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS target_event_date DATE;

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS target_event_name TEXT;

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS preferred_terrain TEXT[];

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS weekly_tss_estimate INTEGER;

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS onboarding_persona_set BOOLEAN DEFAULT FALSE;

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS welcome_email_sent BOOLEAN DEFAULT FALSE;

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS activation_nudge_sent BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN user_profiles.primary_goal IS 'Main training goal: fitness, event, performance, or comeback';
COMMENT ON COLUMN user_profiles.target_event_date IS 'Target event date for event-focused training';
COMMENT ON COLUMN user_profiles.target_event_name IS 'Name of the target event';
COMMENT ON COLUMN user_profiles.preferred_terrain IS 'Array of preferred terrain types: road, gravel, mountain, mixed';
COMMENT ON COLUMN user_profiles.weekly_tss_estimate IS 'Self-reported weekly TSS estimate for ATL/CTL seeding';
COMMENT ON COLUMN user_profiles.onboarding_persona_set IS 'Whether persona was set during onboarding';
COMMENT ON COLUMN user_profiles.welcome_email_sent IS 'Whether the welcome email has been sent';
COMMENT ON COLUMN user_profiles.activation_nudge_sent IS 'Whether the day-2 activation nudge email has been sent';
