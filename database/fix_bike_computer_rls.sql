-- Fix RLS policies for bike_computer_integrations
-- The service_role should be able to insert/update without RLS restrictions

-- First, let's see what policies exist
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE tablename = 'bike_computer_integrations';

-- Drop all existing RLS policies
DROP POLICY IF EXISTS "Users can view their own bike computer integrations" ON bike_computer_integrations;
DROP POLICY IF EXISTS "Users can insert their own bike computer integrations" ON bike_computer_integrations;
DROP POLICY IF EXISTS "Users can update their own bike computer integrations" ON bike_computer_integrations;
DROP POLICY IF EXISTS "Users can delete their own bike computer integrations" ON bike_computer_integrations;
DROP POLICY IF EXISTS "Users can only access their own bike computer integrations" ON bike_computer_integrations;

-- Recreate RLS policies with proper permissions
CREATE POLICY "Users can view their own bike computer integrations"
  ON bike_computer_integrations
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own bike computer integrations"
  ON bike_computer_integrations
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own bike computer integrations"
  ON bike_computer_integrations
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own bike computer integrations"
  ON bike_computer_integrations
  FOR DELETE
  USING (auth.uid() = user_id);

-- CRITICAL: Ensure service_role has full access (bypasses RLS by default)
-- This is already granted but let's confirm
GRANT ALL ON bike_computer_integrations TO service_role;

-- Verify the policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd
FROM pg_policies
WHERE tablename = 'bike_computer_integrations';
