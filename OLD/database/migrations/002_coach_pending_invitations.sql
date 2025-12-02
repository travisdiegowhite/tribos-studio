-- =====================================================
-- COACH PENDING INVITATIONS
-- =====================================================
-- This migration adds support for inviting athletes who
-- don't have accounts yet. Coaches can send email invitations
-- that create accounts upon signup.
-- =====================================================

-- =====================================================
-- 1. PENDING INVITATIONS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS coach_invitations_pending (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Coach and athlete info
  coach_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  athlete_email TEXT NOT NULL,

  -- Security
  invitation_token TEXT UNIQUE NOT NULL,

  -- Invitation details
  permissions JSONB DEFAULT '{
    "can_view_rides": true,
    "can_view_health_metrics": false,
    "can_assign_workouts": true,
    "can_view_performance_data": true
  }'::jsonb,

  -- Personal message from coach (optional)
  coach_message TEXT,

  -- Status tracking
  status TEXT NOT NULL
    CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled'))
    DEFAULT 'pending',

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days'),
  accepted_at TIMESTAMPTZ,

  -- Prevent duplicate invitations from same coach to same email
  UNIQUE(coach_id, athlete_email, status)
);

-- Index for looking up invitations by token
CREATE INDEX IF NOT EXISTS idx_pending_invitations_token
  ON coach_invitations_pending(invitation_token)
  WHERE status = 'pending';

-- Index for looking up invitations by email
CREATE INDEX IF NOT EXISTS idx_pending_invitations_email
  ON coach_invitations_pending(athlete_email, status);

-- Index for finding coach's pending invitations
CREATE INDEX IF NOT EXISTS idx_pending_invitations_coach
  ON coach_invitations_pending(coach_id, status);

-- Index for cleanup of expired invitations
CREATE INDEX IF NOT EXISTS idx_pending_invitations_expired
  ON coach_invitations_pending(expires_at)
  WHERE status = 'pending';

-- =====================================================
-- 2. RLS POLICIES
-- =====================================================

-- Enable RLS
ALTER TABLE coach_invitations_pending ENABLE ROW LEVEL SECURITY;

-- Coaches can view their own pending invitations
DROP POLICY IF EXISTS "Coaches can view their pending invitations" ON coach_invitations_pending;
CREATE POLICY "Coaches can view their pending invitations"
  ON coach_invitations_pending FOR SELECT
  USING (auth.uid() = coach_id);

-- Coaches can create pending invitations
DROP POLICY IF EXISTS "Coaches can create pending invitations" ON coach_invitations_pending;
CREATE POLICY "Coaches can create pending invitations"
  ON coach_invitations_pending FOR INSERT
  WITH CHECK (auth.uid() = coach_id);

-- Coaches can update their own pending invitations (cancel, etc)
DROP POLICY IF EXISTS "Coaches can update their pending invitations" ON coach_invitations_pending;
CREATE POLICY "Coaches can update their pending invitations"
  ON coach_invitations_pending FOR UPDATE
  USING (auth.uid() = coach_id)
  WITH CHECK (auth.uid() = coach_id);

-- Coaches can delete their own pending invitations
DROP POLICY IF EXISTS "Coaches can delete their pending invitations" ON coach_invitations_pending;
CREATE POLICY "Coaches can delete their pending invitations"
  ON coach_invitations_pending FOR DELETE
  USING (auth.uid() = coach_id);

-- =====================================================
-- 3. HELPER FUNCTIONS
-- =====================================================

-- Function to generate secure invitation token
CREATE OR REPLACE FUNCTION generate_invitation_token()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_token TEXT;
  v_exists BOOLEAN;
BEGIN
  LOOP
    -- Generate random token (32 characters)
    v_token := encode(gen_random_bytes(24), 'base64');
    v_token := replace(v_token, '/', '_');
    v_token := replace(v_token, '+', '-');
    v_token := replace(v_token, '=', '');

    -- Check if token already exists
    SELECT EXISTS(
      SELECT 1 FROM coach_invitations_pending
      WHERE invitation_token = v_token
    ) INTO v_exists;

    -- Exit loop if token is unique
    EXIT WHEN NOT v_exists;
  END LOOP;

  RETURN v_token;
END;
$$;

-- Function to get invitation details by token (public access for signup flow)
CREATE OR REPLACE FUNCTION get_invitation_by_token(p_token TEXT)
RETURNS TABLE (
  invitation_id UUID,
  coach_id UUID,
  coach_name TEXT,
  coach_email TEXT,
  coach_avatar TEXT,
  coach_bio TEXT,
  athlete_email TEXT,
  permissions JSONB,
  coach_message TEXT,
  expires_at TIMESTAMPTZ,
  status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    i.id,
    i.coach_id,
    p.display_name,
    u.email,
    p.avatar_url,
    p.coach_bio,
    i.athlete_email,
    i.permissions,
    i.coach_message,
    i.expires_at,
    i.status
  FROM coach_invitations_pending i
  JOIN auth.users u ON u.id = i.coach_id
  LEFT JOIN user_profiles p ON p.id = i.coach_id
  WHERE i.invitation_token = p_token
    AND i.status = 'pending'
    AND i.expires_at > NOW();
END;
$$;

-- Function to accept pending invitation (called after signup)
CREATE OR REPLACE FUNCTION accept_pending_invitation(
  p_token TEXT,
  p_athlete_id UUID
)
RETURNS UUID -- Returns relationship ID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_invitation RECORD;
  v_relationship_id UUID;
BEGIN
  -- Get invitation details
  SELECT * INTO v_invitation
  FROM coach_invitations_pending
  WHERE invitation_token = p_token
    AND status = 'pending'
    AND expires_at > NOW();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid or expired invitation token';
  END IF;

  -- Verify athlete email matches
  SELECT email INTO STRICT v_invitation.email_check
  FROM auth.users
  WHERE id = p_athlete_id;

  IF v_invitation.email_check != v_invitation.athlete_email THEN
    RAISE EXCEPTION 'Email mismatch: invitation was sent to a different email';
  END IF;

  -- Create active coach-athlete relationship
  INSERT INTO coach_athlete_relationships (
    coach_id,
    athlete_id,
    status,
    can_view_rides,
    can_view_health_metrics,
    can_assign_workouts,
    can_view_performance_data,
    activated_at
  )
  VALUES (
    v_invitation.coach_id,
    p_athlete_id,
    'active',
    (v_invitation.permissions->>'can_view_rides')::boolean,
    (v_invitation.permissions->>'can_view_health_metrics')::boolean,
    (v_invitation.permissions->>'can_assign_workouts')::boolean,
    (v_invitation.permissions->>'can_view_performance_data')::boolean,
    NOW()
  )
  RETURNING id INTO v_relationship_id;

  -- Mark invitation as accepted
  UPDATE coach_invitations_pending
  SET
    status = 'accepted',
    accepted_at = NOW()
  WHERE id = v_invitation.id;

  RETURN v_relationship_id;
END;
$$;

-- Function to expire old invitations (run periodically)
CREATE OR REPLACE FUNCTION expire_old_invitations()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE coach_invitations_pending
  SET status = 'expired'
  WHERE status = 'pending'
    AND expires_at < NOW();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Function to check if email has pending invitation
CREATE OR REPLACE FUNCTION check_pending_invitation_by_email(p_email TEXT)
RETURNS TABLE (
  has_invitation BOOLEAN,
  coach_name TEXT,
  expires_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    EXISTS(
      SELECT 1 FROM coach_invitations_pending i
      WHERE i.athlete_email = p_email
        AND i.status = 'pending'
        AND i.expires_at > NOW()
    ),
    (SELECT p.display_name
     FROM coach_invitations_pending i
     LEFT JOIN user_profiles p ON p.id = i.coach_id
     WHERE i.athlete_email = p_email
       AND i.status = 'pending'
       AND i.expires_at > NOW()
     LIMIT 1
    ),
    (SELECT i.expires_at
     FROM coach_invitations_pending i
     WHERE i.athlete_email = p_email
       AND i.status = 'pending'
       AND i.expires_at > NOW()
     LIMIT 1
    );
END;
$$;

-- =====================================================
-- 4. AUTO-UPDATE TRIGGER
-- =====================================================

-- Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_pending_invitation_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger (only if we add updated_at column)
-- Note: We didn't add updated_at to keep table simple,
-- but including function in case needed later

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================

DO $$
BEGIN
  RAISE NOTICE 'Coach pending invitations migration completed successfully!';
  RAISE NOTICE 'New features enabled:';
  RAISE NOTICE '  - Invite athletes without accounts';
  RAISE NOTICE '  - Secure invitation tokens';
  RAISE NOTICE '  - 7-day expiration';
  RAISE NOTICE '  - Auto-accept on signup';
END $$;
