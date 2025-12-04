-- Migration: Create temp table for Garmin OAuth 1.0a flow
-- Run this in your Supabase SQL editor

-- Garmin OAuth 1.0a requires storing request tokens temporarily during the authorization flow
CREATE TABLE IF NOT EXISTS garmin_oauth_temp (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_token TEXT NOT NULL,
  request_token_secret TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Only one pending auth flow per user
  UNIQUE(user_id)
);

-- Create index for lookup
CREATE INDEX IF NOT EXISTS idx_garmin_oauth_temp_user_id
  ON garmin_oauth_temp(user_id);

-- Auto-cleanup old temp tokens (older than 1 hour)
CREATE OR REPLACE FUNCTION cleanup_garmin_oauth_temp()
RETURNS trigger AS $$
BEGIN
  DELETE FROM garmin_oauth_temp
  WHERE created_at < NOW() - INTERVAL '1 hour';
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to cleanup on each insert
DROP TRIGGER IF EXISTS trigger_cleanup_garmin_oauth_temp ON garmin_oauth_temp;
CREATE TRIGGER trigger_cleanup_garmin_oauth_temp
  AFTER INSERT ON garmin_oauth_temp
  FOR EACH STATEMENT
  EXECUTE FUNCTION cleanup_garmin_oauth_temp();

-- Grant permissions
GRANT ALL ON garmin_oauth_temp TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON garmin_oauth_temp TO authenticated;

-- Enable RLS
ALTER TABLE garmin_oauth_temp ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only access their own temp tokens
CREATE POLICY "Users can manage their own Garmin OAuth temp tokens"
  ON garmin_oauth_temp
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
