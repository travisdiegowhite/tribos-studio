-- Add user_preferences table for storing user settings
-- This supports email reminder preferences and other user customizations

CREATE TABLE IF NOT EXISTS user_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  daily_workout_reminder BOOLEAN DEFAULT true,
  weekly_summary BOOLEAN DEFAULT true,
  workout_time TEXT DEFAULT '08:00',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only access their own preferences
CREATE POLICY user_preferences_policy ON user_preferences
  FOR ALL
  USING (auth.uid() = user_id);

-- Index for faster lookups
CREATE INDEX idx_user_preferences_user_id ON user_preferences(user_id);

-- Comment
COMMENT ON TABLE user_preferences IS 'User preferences and settings for notifications and customizations';
