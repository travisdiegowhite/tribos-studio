-- Beta Signups Schema
-- Stores beta launch signups for December 1, 2025

-- Create beta_signups table
CREATE TABLE IF NOT EXISTS beta_signups (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    cycling_experience TEXT,
    interests TEXT,
    wants_notifications BOOLEAN DEFAULT true,
    signed_up_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'invited', 'activated')),
    invited_at TIMESTAMP WITH TIME ZONE,
    activated_at TIMESTAMP WITH TIME ZONE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_beta_signups_email ON beta_signups(email);
CREATE INDEX IF NOT EXISTS idx_beta_signups_status ON beta_signups(status);
CREATE INDEX IF NOT EXISTS idx_beta_signups_signed_up_at ON beta_signups(signed_up_at DESC);

-- Enable Row Level Security
ALTER TABLE beta_signups ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Allow anyone to insert (signup)
CREATE POLICY "Anyone can sign up for beta"
    ON beta_signups
    FOR INSERT
    WITH CHECK (true);

-- RLS Policy: Only service role can read/update
CREATE POLICY "Service role can manage beta signups"
    ON beta_signups
    FOR ALL
    USING (auth.role() = 'service_role');

-- Create updated_at trigger function if it doesn't exist
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Add trigger for updated_at
CREATE TRIGGER update_beta_signups_updated_at
    BEFORE UPDATE ON beta_signups
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- Grant permissions
GRANT INSERT ON beta_signups TO anon;
GRANT ALL ON beta_signups TO service_role;

-- Add comments
COMMENT ON TABLE beta_signups IS 'Beta launch signups for December 1, 2025';
COMMENT ON COLUMN beta_signups.name IS 'User full name';
COMMENT ON COLUMN beta_signups.email IS 'User email address (unique)';
COMMENT ON COLUMN beta_signups.cycling_experience IS 'User cycling background and experience';
COMMENT ON COLUMN beta_signups.interests IS 'Features the user is most interested in';
COMMENT ON COLUMN beta_signups.wants_notifications IS 'Whether user wants beta launch notifications';
COMMENT ON COLUMN beta_signups.status IS 'Beta signup status: pending, invited, or activated';
COMMENT ON COLUMN beta_signups.signed_up_at IS 'When user signed up for beta';
COMMENT ON COLUMN beta_signups.invited_at IS 'When user was sent beta invite';
COMMENT ON COLUMN beta_signups.activated_at IS 'When user activated their beta account';

-- Verify table was created
SELECT
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'beta_signups'
ORDER BY ordinal_position;
