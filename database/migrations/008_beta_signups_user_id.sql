-- Add user_id column to beta_signups table for linking to user accounts

ALTER TABLE beta_signups
ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);

-- Create index for user_id lookups
CREATE INDEX IF NOT EXISTS idx_beta_signups_user_id ON beta_signups(user_id);
