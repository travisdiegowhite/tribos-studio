-- Migration: Admin Audit Log
-- Created: 2024-12-26
-- Purpose: Track all admin actions for security and accountability
-- SECURITY: Only travis@tribos.studio has admin access

-- Create admin audit log table
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID NOT NULL REFERENCES auth.users(id),
  action TEXT NOT NULL,
  target_user_id UUID REFERENCES auth.users(id),
  details JSONB,
  ip_address INET,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for querying by admin user
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_admin_user
  ON admin_audit_log(admin_user_id);

-- Create index for querying by target user
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_target_user
  ON admin_audit_log(target_user_id);

-- Create index for querying by action type
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_action
  ON admin_audit_log(action);

-- Create index for time-based queries
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created_at
  ON admin_audit_log(created_at DESC);

-- Enable RLS
ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;

-- SECURITY: No read access via client - only accessible via service key
-- This ensures audit logs cannot be tampered with or viewed by anyone
-- Admins can only view via the admin API which uses the service key

-- Add comment explaining the security model
COMMENT ON TABLE admin_audit_log IS
  'Audit log for admin actions. Only accessible via service key. No client RLS policies.';
