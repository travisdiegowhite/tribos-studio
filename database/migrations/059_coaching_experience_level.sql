-- Add coaching experience level to user_coach_settings
-- Controls communication style: jargon explanation, milestone celebration, etc.

ALTER TABLE user_coach_settings
ADD COLUMN IF NOT EXISTS coaching_experience_level text DEFAULT 'experienced'
CHECK (coaching_experience_level IN ('just_starting', 'developing', 'experienced', 'competitive'));

COMMENT ON COLUMN user_coach_settings.coaching_experience_level IS
  'Controls coaching communication style — less jargon for newer cyclists';
