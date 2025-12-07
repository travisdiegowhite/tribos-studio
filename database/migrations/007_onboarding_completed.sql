-- Add onboarding_completed field to user_profiles table

ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT false;

-- Create index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_user_profiles_onboarding
ON user_profiles(onboarding_completed)
WHERE onboarding_completed = false;
