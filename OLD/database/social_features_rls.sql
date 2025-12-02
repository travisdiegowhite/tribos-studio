-- Row Level Security Policies for Social Features
-- Privacy-first: Default deny, explicit allow

-- ============================================
-- SHARED ROUTES RLS
-- ============================================

ALTER TABLE shared_routes ENABLE ROW LEVEL SECURITY;

-- Owner can do everything with their shared routes
CREATE POLICY "Users can manage their own shared routes"
  ON shared_routes
  FOR ALL
  USING (auth.uid() = owner_id);

-- Public routes are viewable by anyone
CREATE POLICY "Public routes are viewable by anyone"
  ON shared_routes
  FOR SELECT
  USING (sharing_level = 'public' AND (expires_at IS NULL OR expires_at > NOW()));

-- Link-only routes viewable by anyone with the token (handled in application)
CREATE POLICY "Link-only routes viewable with token"
  ON shared_routes
  FOR SELECT
  USING (sharing_level = 'link_only' AND (expires_at IS NULL OR expires_at > NOW()));

-- Friends can see routes shared at 'friends' level
CREATE POLICY "Friends can see friend-shared routes"
  ON shared_routes
  FOR SELECT
  USING (
    sharing_level = 'friends'
    AND (expires_at IS NULL OR expires_at > NOW())
    AND EXISTS (
      SELECT 1 FROM connections
      WHERE connections.user_id = shared_routes.owner_id
        AND connections.connected_user_id = auth.uid()
        AND connections.status = 'accepted'
        AND connections.can_see_routes = true
    )
  );

-- Local users can see routes shared at 'local' level (within reasonable distance)
CREATE POLICY "Local users can see locally-shared routes"
  ON shared_routes
  FOR SELECT
  USING (
    sharing_level = 'local'
    AND (expires_at IS NULL OR expires_at > NOW())
  );

-- ============================================
-- ROUTE COMMENTS RLS
-- ============================================

ALTER TABLE route_comments ENABLE ROW LEVEL SECURITY;

-- Anyone can read comments on routes they can access
CREATE POLICY "Users can read comments on accessible routes"
  ON route_comments
  FOR SELECT
  USING (
    is_current = true
    AND NOT is_flagged
    AND (expires_at IS NULL OR expires_at > NOW())
  );

-- Users can create comments on routes they can access
CREATE POLICY "Authenticated users can create comments"
  ON route_comments
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own comments
CREATE POLICY "Users can update their own comments"
  ON route_comments
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own comments
CREATE POLICY "Users can delete their own comments"
  ON route_comments
  FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- ROUTE COLLECTIONS RLS
-- ============================================

ALTER TABLE route_collections ENABLE ROW LEVEL SECURITY;

-- Public collections viewable by anyone
CREATE POLICY "Public collections are viewable"
  ON route_collections
  FOR SELECT
  USING (is_public = true);

-- Users can view their own collections
CREATE POLICY "Users can view their own collections"
  ON route_collections
  FOR SELECT
  USING (auth.uid() = curator_id);

-- Users can manage their own collections
CREATE POLICY "Users can manage their own collections"
  ON route_collections
  FOR ALL
  USING (auth.uid() = curator_id);

-- Friends can see collections if shared (future enhancement)
-- CREATE POLICY "Friends can see shared collections"
--   ON route_collections
--   FOR SELECT
--   USING (
--     EXISTS (
--       SELECT 1 FROM connections
--       WHERE connections.user_id = route_collections.curator_id
--         AND connections.connected_user_id = auth.uid()
--         AND connections.status = 'accepted'
--         AND connections.can_see_collections = true
--     )
--   );

-- ============================================
-- COLLECTION ROUTES RLS
-- ============================================

ALTER TABLE collection_routes ENABLE ROW LEVEL SECURITY;

-- Can view routes in accessible collections
CREATE POLICY "Users can view routes in accessible collections"
  ON collection_routes
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM route_collections
      WHERE route_collections.id = collection_routes.collection_id
        AND (route_collections.is_public = true OR route_collections.curator_id = auth.uid())
    )
  );

-- Can manage routes in own collections
CREATE POLICY "Users can manage routes in their collections"
  ON collection_routes
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM route_collections
      WHERE route_collections.id = collection_routes.collection_id
        AND route_collections.curator_id = auth.uid()
    )
  );

-- ============================================
-- CONNECTIONS RLS
-- ============================================

ALTER TABLE connections ENABLE ROW LEVEL SECURITY;

-- Users can view their own connections
CREATE POLICY "Users can view their own connections"
  ON connections
  FOR SELECT
  USING (
    auth.uid() = user_id OR auth.uid() = connected_user_id
  );

-- Users can create connection requests
CREATE POLICY "Users can create connection requests"
  ON connections
  FOR INSERT
  WITH CHECK (auth.uid() = user_id AND auth.uid() = requested_by);

-- Users can update connections where they're involved
CREATE POLICY "Users can update their connections"
  ON connections
  FOR UPDATE
  USING (auth.uid() = user_id OR auth.uid() = connected_user_id)
  WITH CHECK (auth.uid() = user_id OR auth.uid() = connected_user_id);

-- Users can delete their own connections
CREATE POLICY "Users can delete their connections"
  ON connections
  FOR DELETE
  USING (auth.uid() = user_id OR auth.uid() = connected_user_id);

-- ============================================
-- SAFETY CHECK-INS RLS
-- ============================================

ALTER TABLE safety_checkins ENABLE ROW LEVEL SECURITY;

-- Users can manage their own check-ins
CREATE POLICY "Users can manage their own check-ins"
  ON safety_checkins
  FOR ALL
  USING (auth.uid() = user_id);

-- Emergency contacts can view active/overdue check-ins
CREATE POLICY "Emergency contacts can view check-ins"
  ON safety_checkins
  FOR SELECT
  USING (
    auth.uid() = ANY(emergency_contacts)
    AND status IN ('active', 'overdue', 'emergency')
  );

-- ============================================
-- COMMUNITY INTEL RLS
-- ============================================

ALTER TABLE community_intel ENABLE ROW LEVEL SECURITY;

-- Anyone can read community intel (it's anonymous)
CREATE POLICY "Anyone can read community intel"
  ON community_intel
  FOR SELECT
  USING (true);

-- Only system/admin can write (via functions)
-- Users don't directly write to this table

-- ============================================
-- SAVED ROUTES RLS
-- ============================================

ALTER TABLE saved_routes ENABLE ROW LEVEL SECURITY;

-- Users can manage their own saved routes
CREATE POLICY "Users can manage their own saved routes"
  ON saved_routes
  FOR ALL
  USING (auth.uid() = user_id);

-- ============================================
-- USER PROFILES RLS
-- ============================================

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Users can view their own profile
CREATE POLICY "Users can view their own profile"
  ON user_profiles
  FOR SELECT
  USING (auth.uid() = id);

-- Users can manage their own profile
CREATE POLICY "Users can update their own profile"
  ON user_profiles
  FOR ALL
  USING (auth.uid() = id);

-- Public profiles are viewable
CREATE POLICY "Public profiles are viewable"
  ON user_profiles
  FOR SELECT
  USING (profile_visibility = 'public');

-- Friends can see friend profiles
CREATE POLICY "Friends can see friend profiles"
  ON user_profiles
  FOR SELECT
  USING (
    profile_visibility = 'friends'
    AND EXISTS (
      SELECT 1 FROM connections
      WHERE (
        (connections.user_id = user_profiles.id AND connections.connected_user_id = auth.uid())
        OR
        (connections.connected_user_id = user_profiles.id AND connections.user_id = auth.uid())
      )
      AND connections.status = 'accepted'
    )
  );

-- ============================================
-- HELPER FUNCTIONS FOR RLS
-- ============================================

-- Check if user has access to a shared route
CREATE OR REPLACE FUNCTION user_can_access_shared_route(shared_route_id UUID, user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  route_owner UUID;
  route_level TEXT;
  route_expires TIMESTAMP WITH TIME ZONE;
BEGIN
  SELECT owner_id, sharing_level, expires_at
  INTO route_owner, route_level, route_expires
  FROM shared_routes
  WHERE id = shared_route_id;

  -- Check expiration
  IF route_expires IS NOT NULL AND route_expires <= NOW() THEN
    RETURN false;
  END IF;

  -- Owner always has access
  IF route_owner = user_id THEN
    RETURN true;
  END IF;

  -- Check sharing level
  IF route_level = 'public' THEN
    RETURN true;
  END IF;

  IF route_level = 'link_only' THEN
    RETURN true; -- Token validation happens in app
  END IF;

  IF route_level = 'friends' THEN
    RETURN EXISTS (
      SELECT 1 FROM connections
      WHERE connections.user_id = route_owner
        AND connections.connected_user_id = user_id
        AND connections.status = 'accepted'
        AND connections.can_see_routes = true
    );
  END IF;

  IF route_level = 'local' THEN
    RETURN true; -- Locality check happens in app
  END IF;

  IF route_level = 'private' THEN
    RETURN false;
  END IF;

  RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check if two users are connected
CREATE OR REPLACE FUNCTION users_are_connected(user1_id UUID, user2_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM connections
    WHERE (
      (user_id = user1_id AND connected_user_id = user2_id)
      OR
      (user_id = user2_id AND connected_user_id = user1_id)
    )
    AND status = 'accepted'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- GRANT PERMISSIONS
-- ============================================

-- Grant usage on schema
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO anon;

-- Grant permissions on tables
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;

-- Grant execute on functions
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon;
