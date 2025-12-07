-- Allow authenticated users to update their own beta_signups status
-- This enables marking signups as 'activated' when they create an account

-- Policy: Authenticated users can update their own row (by email match)
CREATE POLICY "Users can activate their own beta signup"
  ON beta_signups
  FOR UPDATE
  TO authenticated
  USING (email = auth.jwt() ->> 'email')
  WITH CHECK (email = auth.jwt() ->> 'email');

-- Also allow authenticated users to read their own signup status
CREATE POLICY "Users can view their own beta signup"
  ON beta_signups
  FOR SELECT
  TO authenticated
  USING (email = auth.jwt() ->> 'email');
