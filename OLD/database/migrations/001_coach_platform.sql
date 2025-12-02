-- =====================================================
-- PHASE 1: COACH PLATFORM DATABASE SCHEMA
-- =====================================================
-- This migration extends existing tables and creates new coach-specific tables
-- following the tribos.studio pattern of reusing existing infrastructure

-- =====================================================
-- 1. EXTEND USER PROFILES FOR COACH ACCOUNTS
-- =====================================================

-- Add coach-specific columns to existing user_profiles table
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS account_type TEXT
    CHECK (account_type IN ('athlete', 'coach'))
    DEFAULT 'athlete';

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS coach_bio TEXT
    CHECK (char_length(coach_bio) <= 500);

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS coach_certifications TEXT[];

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS coach_specialties TEXT[];

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS coach_pricing JSONB;

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS coach_availability JSONB;

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS max_athletes INTEGER
    CHECK (max_athletes > 0 AND max_athletes <= 500)
    DEFAULT 50;

-- Add index for finding coaches
CREATE INDEX IF NOT EXISTS idx_user_profiles_account_type
  ON user_profiles(account_type)
  WHERE account_type = 'coach';

-- =====================================================
-- 2. COACH-ATHLETE RELATIONSHIPS
-- =====================================================

CREATE TABLE IF NOT EXISTS coach_athlete_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  athlete_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL
    CHECK (status IN ('pending', 'active', 'paused', 'ended'))
    DEFAULT 'pending',

  -- Permission settings
  can_view_rides BOOLEAN DEFAULT true,
  can_view_health_metrics BOOLEAN DEFAULT false,
  can_assign_workouts BOOLEAN DEFAULT true,
  can_view_performance_data BOOLEAN DEFAULT true,

  -- Metadata
  invitation_sent_at TIMESTAMPTZ DEFAULT NOW(),
  activated_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Ensure unique active relationship
  UNIQUE(coach_id, athlete_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_coach_relationships_coach
  ON coach_athlete_relationships(coach_id, status);

CREATE INDEX IF NOT EXISTS idx_coach_relationships_athlete
  ON coach_athlete_relationships(athlete_id, status);

-- =====================================================
-- 3. EXTEND PLANNED WORKOUTS FOR COACH ASSIGNMENTS
-- =====================================================

-- Add coach-related columns to existing planned_workouts table
ALTER TABLE planned_workouts
  ADD COLUMN IF NOT EXISTS assigned_by_coach_id UUID
    REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE planned_workouts
  ADD COLUMN IF NOT EXISTS coach_notes TEXT;

ALTER TABLE planned_workouts
  ADD COLUMN IF NOT EXISTS athlete_id UUID
    REFERENCES auth.users(id) ON DELETE CASCADE;

-- Add index for coach queries
CREATE INDEX IF NOT EXISTS idx_planned_workouts_coach
  ON planned_workouts(assigned_by_coach_id)
  WHERE assigned_by_coach_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_planned_workouts_athlete
  ON planned_workouts(athlete_id, week_number, day_of_week)
  WHERE athlete_id IS NOT NULL;

-- =====================================================
-- 4. COACH-ATHLETE MESSAGING
-- =====================================================

CREATE TABLE IF NOT EXISTS coach_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  relationship_id UUID NOT NULL
    REFERENCES coach_athlete_relationships(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message_text TEXT NOT NULL CHECK (char_length(message_text) <= 2000),

  -- Optional workout context
  workout_id UUID REFERENCES planned_workouts(id) ON DELETE SET NULL,

  -- Metadata
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  CHECK (char_length(message_text) > 0)
);

-- Indexes for message queries
CREATE INDEX IF NOT EXISTS idx_coach_messages_relationship
  ON coach_messages(relationship_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_coach_messages_unread
  ON coach_messages(relationship_id)
  WHERE read_at IS NULL;

-- =====================================================
-- 5. ROW LEVEL SECURITY POLICIES
-- =====================================================

-- Enable RLS on new tables
ALTER TABLE coach_athlete_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE coach_messages ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- RLS: coach_athlete_relationships
-- =====================================================

-- Coaches can view their relationships
CREATE POLICY "Coaches can view their athlete relationships"
  ON coach_athlete_relationships FOR SELECT
  USING (auth.uid() = coach_id);

-- Athletes can view relationships where they are the athlete
CREATE POLICY "Athletes can view their coach relationships"
  ON coach_athlete_relationships FOR SELECT
  USING (auth.uid() = athlete_id);

-- Coaches can create relationships (send invitations)
CREATE POLICY "Coaches can create athlete relationships"
  ON coach_athlete_relationships FOR INSERT
  WITH CHECK (
    auth.uid() = coach_id
    AND EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND account_type = 'coach'
    )
  );

-- Coaches can update their relationships (change status, permissions)
CREATE POLICY "Coaches can update their athlete relationships"
  ON coach_athlete_relationships FOR UPDATE
  USING (auth.uid() = coach_id)
  WITH CHECK (auth.uid() = coach_id);

-- Athletes can update relationships (accept/decline invitations)
CREATE POLICY "Athletes can update their coach relationships"
  ON coach_athlete_relationships FOR UPDATE
  USING (auth.uid() = athlete_id)
  WITH CHECK (auth.uid() = athlete_id);

-- Both parties can delete relationships
CREATE POLICY "Coaches can delete relationships"
  ON coach_athlete_relationships FOR DELETE
  USING (auth.uid() = coach_id);

CREATE POLICY "Athletes can delete relationships"
  ON coach_athlete_relationships FOR DELETE
  USING (auth.uid() = athlete_id);

-- =====================================================
-- RLS: coach_messages
-- =====================================================

-- Users can view messages in their relationships
CREATE POLICY "Users can view messages in their relationships"
  ON coach_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM coach_athlete_relationships
      WHERE id = coach_messages.relationship_id
        AND (coach_id = auth.uid() OR athlete_id = auth.uid())
        AND status = 'active'
    )
  );

-- Users can send messages in their active relationships
CREATE POLICY "Users can send messages in active relationships"
  ON coach_messages FOR INSERT
  WITH CHECK (
    auth.uid() = sender_id
    AND EXISTS (
      SELECT 1 FROM coach_athlete_relationships
      WHERE id = relationship_id
        AND (coach_id = auth.uid() OR athlete_id = auth.uid())
        AND status = 'active'
    )
  );

-- Users can update their own messages (mark as read)
CREATE POLICY "Users can update messages in their relationships"
  ON coach_messages FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM coach_athlete_relationships
      WHERE id = coach_messages.relationship_id
        AND (coach_id = auth.uid() OR athlete_id = auth.uid())
    )
  );

-- =====================================================
-- RLS: Update planned_workouts for coach access
-- =====================================================

-- Drop existing policies if they conflict (check first)
-- These are new policies that allow coaches to view/manage athlete workouts

-- Coaches can view workouts they assigned
DROP POLICY IF EXISTS "Coaches can view assigned workouts" ON planned_workouts;
CREATE POLICY "Coaches can view assigned workouts"
  ON planned_workouts FOR SELECT
  USING (
    auth.uid() = assigned_by_coach_id
    OR auth.uid() IN (
      SELECT user_id FROM training_plans
      WHERE id = planned_workouts.plan_id
    )
    OR auth.uid() = athlete_id
  );

-- Coaches can insert workouts for their athletes
DROP POLICY IF EXISTS "Coaches can assign workouts" ON planned_workouts;
CREATE POLICY "Coaches can assign workouts"
  ON planned_workouts FOR INSERT
  WITH CHECK (
    auth.uid() = assigned_by_coach_id
    AND EXISTS (
      SELECT 1 FROM coach_athlete_relationships
      WHERE coach_id = auth.uid()
        AND athlete_id = planned_workouts.athlete_id
        AND status = 'active'
        AND can_assign_workouts = true
    )
  );

-- Coaches can update workouts they assigned
DROP POLICY IF EXISTS "Coaches can update assigned workouts" ON planned_workouts;
CREATE POLICY "Coaches can update assigned workouts"
  ON planned_workouts FOR UPDATE
  USING (auth.uid() = assigned_by_coach_id)
  WITH CHECK (auth.uid() = assigned_by_coach_id);

-- =====================================================
-- 6. HELPER FUNCTIONS
-- =====================================================

-- Function to get athlete summary for coaches
CREATE OR REPLACE FUNCTION get_athlete_summary(
  p_coach_id UUID,
  p_athlete_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_summary JSONB;
  v_relationship_active BOOLEAN;
BEGIN
  -- Check if coach has active relationship with athlete
  SELECT status = 'active' INTO v_relationship_active
  FROM coach_athlete_relationships
  WHERE coach_id = p_coach_id AND athlete_id = p_athlete_id;

  IF NOT v_relationship_active THEN
    RAISE EXCEPTION 'No active coaching relationship';
  END IF;

  -- Build summary
  SELECT jsonb_build_object(
    'profile', (
      SELECT jsonb_build_object(
        'display_name', display_name,
        'avatar_url', avatar_url,
        'location_name', location_name
      )
      FROM user_profiles WHERE id = p_athlete_id
    ),
    'recent_rides', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', id,
          'name', name,
          'ride_date', ride_date,
          'distance_km', distance_km,
          'elevation_gain', elevation_gain,
          'moving_time', moving_time
        )
        ORDER BY ride_date DESC
      )
      FROM routes
      WHERE user_id = p_athlete_id AND is_activity = true
      LIMIT 10
    ),
    'training_metrics', (
      SELECT jsonb_build_object(
        'ctl', ctl,
        'atl', atl,
        'tsb', tsb,
        'updated_at', updated_at
      )
      FROM training_metrics
      WHERE user_id = p_athlete_id
      ORDER BY updated_at DESC
      LIMIT 1
    ),
    'recent_feedback', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'date', created_at,
          'perceived_exertion', perceived_exertion,
          'difficulty_rating', difficulty_rating,
          'notes', notes
        )
        ORDER BY created_at DESC
      )
      FROM workout_feedback
      WHERE user_id = p_athlete_id
      LIMIT 5
    ),
    'health_metrics', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'date', date,
          'hrv', hrv,
          'resting_hr', resting_hr,
          'sleep_hours', sleep_hours,
          'sleep_quality', sleep_quality
        )
        ORDER BY date DESC
      )
      FROM health_metrics
      WHERE user_id = p_athlete_id
      LIMIT 7
    )
  ) INTO v_summary;

  RETURN v_summary;
END;
$$;

-- Function to update relationship status with timestamp
CREATE OR REPLACE FUNCTION update_relationship_status()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'active' AND OLD.status = 'pending' THEN
    NEW.activated_at = NOW();
  ELSIF NEW.status = 'ended' AND OLD.status != 'ended' THEN
    NEW.ended_at = NOW();
  END IF;

  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update timestamps
DROP TRIGGER IF EXISTS trg_relationship_status_change ON coach_athlete_relationships;
CREATE TRIGGER trg_relationship_status_change
  BEFORE UPDATE ON coach_athlete_relationships
  FOR EACH ROW
  EXECUTE FUNCTION update_relationship_status();

-- Function to find user ID by email (for coach invitations)
CREATE OR REPLACE FUNCTION find_user_by_email(p_email TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  -- Look up user ID from auth.users by email
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = p_email
  LIMIT 1;

  RETURN v_user_id;
END;
$$;

-- =====================================================
-- 7. INITIAL DATA / MIGRATION CLEANUP
-- =====================================================

-- Set existing users to 'athlete' if account_type is null
UPDATE user_profiles
SET account_type = 'athlete'
WHERE account_type IS NULL;

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================

-- Verify migration
DO $$
BEGIN
  RAISE NOTICE 'Coach platform migration completed successfully!';
  RAISE NOTICE 'New columns added to user_profiles: account_type, coach_bio, coach_certifications, etc.';
  RAISE NOTICE 'New tables created: coach_athlete_relationships, coach_messages';
  RAISE NOTICE 'New columns added to planned_workouts: assigned_by_coach_id, coach_notes, athlete_id';
  RAISE NOTICE 'RLS policies enabled for coach data access';
  RAISE NOTICE 'Helper functions created: get_athlete_summary()';
END $$;
