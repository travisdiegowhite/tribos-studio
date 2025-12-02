-- Secure Strava Token Storage Schema
-- This table stores Strava OAuth tokens server-side with proper security

-- Create the strava_tokens table
CREATE TABLE IF NOT EXISTS strava_tokens (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    access_token text NOT NULL,
    refresh_token text NOT NULL,
    expires_at timestamp WITH TIME ZONE NOT NULL,
    athlete_id bigint NOT NULL,
    athlete_data jsonb,
    created_at timestamp WITH TIME ZONE DEFAULT now(),
    updated_at timestamp WITH TIME ZONE DEFAULT now(),

    -- Ensure one token record per user
    UNIQUE(user_id)
);

-- Enable Row Level Security
ALTER TABLE strava_tokens ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only access their own tokens
CREATE POLICY "Users can only access their own Strava tokens" ON strava_tokens
    FOR ALL USING (auth.uid() = user_id);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_strava_tokens_user_id ON strava_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_strava_tokens_athlete_id ON strava_tokens(athlete_id);
CREATE INDEX IF NOT EXISTS idx_strava_tokens_expires_at ON strava_tokens(expires_at);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_strava_tokens_updated_at
    BEFORE UPDATE ON strava_tokens
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- Grant appropriate permissions
-- Service role can manage all tokens (for server-side operations)
GRANT ALL ON strava_tokens TO service_role;

-- Authenticated users can only read their own tokens
GRANT SELECT ON strava_tokens TO authenticated;

-- Add comments for documentation
COMMENT ON TABLE strava_tokens IS 'Secure storage for Strava OAuth tokens';
COMMENT ON COLUMN strava_tokens.access_token IS 'Strava API access token - sensitive data';
COMMENT ON COLUMN strava_tokens.refresh_token IS 'Strava API refresh token - sensitive data';
COMMENT ON COLUMN strava_tokens.expires_at IS 'When the access token expires';
COMMENT ON COLUMN strava_tokens.athlete_data IS 'Cached athlete information from Strava';