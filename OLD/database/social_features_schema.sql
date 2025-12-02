-- BaseMiles Social Features Schema
-- Philosophy: Routes First, Social Second
-- Privacy-first, utility-focused social features

-- ============================================
-- ENABLE REQUIRED EXTENSIONS
-- ============================================
CREATE EXTENSION IF NOT EXISTS postgis;

-- ============================================
-- SHARED ROUTES
-- Privacy-first route sharing with explicit levels
-- ============================================
CREATE TABLE IF NOT EXISTS shared_routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id UUID NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Sharing configuration
  sharing_level TEXT NOT NULL DEFAULT 'private' CHECK (
    sharing_level IN ('private', 'link_only', 'friends', 'local', 'public')
  ),
  share_token TEXT UNIQUE DEFAULT encode(gen_random_bytes(16), 'base64'),

  -- Privacy protection
  privacy_zones JSONB DEFAULT '[]'::jsonb, -- Areas to blur/obscure
  sanitized_geometry JSONB, -- Route geometry with privacy zones applied
  obscure_start_end BOOLEAN DEFAULT true, -- Blur first/last 500m

  -- Metadata
  title TEXT,
  description TEXT,
  tags TEXT[] DEFAULT ARRAY[]::TEXT[],

  -- Expiration for temporary shares
  expires_at TIMESTAMP WITH TIME ZONE,

  -- Stats (anonymous aggregation)
  view_count INTEGER DEFAULT 0,
  save_count INTEGER DEFAULT 0,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(route_id, owner_id)
);

CREATE INDEX idx_shared_routes_owner ON shared_routes(owner_id);
CREATE INDEX idx_shared_routes_level ON shared_routes(sharing_level);
CREATE INDEX idx_shared_routes_token ON shared_routes(share_token);
CREATE INDEX idx_shared_routes_tags ON shared_routes USING gin(tags);
CREATE INDEX idx_shared_routes_expires ON shared_routes(expires_at) WHERE expires_at IS NOT NULL;

-- ============================================
-- ROUTE COMMENTS
-- Practical, utility-focused comments
-- ============================================
CREATE TABLE IF NOT EXISTS route_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id UUID NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Comment categorization
  comment_type TEXT NOT NULL CHECK (
    comment_type IN ('condition', 'tip', 'variant', 'hazard', 'amenity')
  ),

  -- Content
  content TEXT NOT NULL CHECK (char_length(content) <= 1000),

  -- Location context (optional - for segment-specific comments)
  location_point GEOGRAPHY(POINT, 4326),
  segment_index INTEGER, -- Which segment of route this refers to

  -- Verification system
  is_verified BOOLEAN DEFAULT FALSE,
  verification_count INTEGER DEFAULT 0,
  verified_by_users UUID[] DEFAULT ARRAY[]::UUID[],

  -- Temporal relevance
  expires_at TIMESTAMP WITH TIME ZONE, -- For temporary conditions
  is_current BOOLEAN DEFAULT true,

  -- Moderation
  is_flagged BOOLEAN DEFAULT FALSE,
  flag_count INTEGER DEFAULT 0,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_route_comments_route ON route_comments(route_id);
CREATE INDEX idx_route_comments_user ON route_comments(user_id);
CREATE INDEX idx_route_comments_type ON route_comments(comment_type);
CREATE INDEX idx_route_comments_verified ON route_comments(is_verified);
CREATE INDEX idx_route_comments_current ON route_comments(is_current);
CREATE INDEX idx_route_comments_location ON route_comments USING gist(location_point);

-- ============================================
-- ROUTE COLLECTIONS
-- Curated lists of routes
-- ============================================
CREATE TABLE IF NOT EXISTS route_collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  curator_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Collection metadata
  name TEXT NOT NULL CHECK (char_length(name) <= 100),
  description TEXT CHECK (char_length(description) <= 500),
  tags TEXT[] DEFAULT ARRAY[]::TEXT[],

  -- Visibility
  is_public BOOLEAN DEFAULT FALSE,
  share_token TEXT UNIQUE DEFAULT encode(gen_random_bytes(16), 'base64'),

  -- Stats (anonymous)
  subscriber_count INTEGER DEFAULT 0,
  view_count INTEGER DEFAULT 0,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_route_collections_curator ON route_collections(curator_id);
CREATE INDEX idx_route_collections_public ON route_collections(is_public);
CREATE INDEX idx_route_collections_tags ON route_collections USING gin(tags);

-- ============================================
-- COLLECTION ROUTES
-- Many-to-many relationship
-- ============================================
CREATE TABLE IF NOT EXISTS collection_routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id UUID NOT NULL REFERENCES route_collections(id) ON DELETE CASCADE,
  route_id UUID NOT NULL REFERENCES routes(id) ON DELETE CASCADE,

  -- Ordering and notes
  position INTEGER NOT NULL DEFAULT 0,
  curator_notes TEXT CHECK (char_length(curator_notes) <= 500),

  added_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(collection_id, route_id)
);

CREATE INDEX idx_collection_routes_collection ON collection_routes(collection_id);
CREATE INDEX idx_collection_routes_route ON collection_routes(route_id);
CREATE INDEX idx_collection_routes_position ON collection_routes(collection_id, position);

-- ============================================
-- CONNECTIONS
-- Simple friend connections without activity feed
-- ============================================
CREATE TABLE IF NOT EXISTS connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  connected_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Connection type
  connection_type TEXT DEFAULT 'friend' CHECK (
    connection_type IN ('friend', 'club', 'group')
  ),

  -- Explicit permissions
  can_see_routes BOOLEAN DEFAULT FALSE,
  can_see_collections BOOLEAN DEFAULT FALSE,
  can_see_location BOOLEAN DEFAULT FALSE, -- For safety features

  -- Connection status
  status TEXT DEFAULT 'pending' CHECK (
    status IN ('pending', 'accepted', 'blocked')
  ),

  -- Request metadata
  requested_by UUID NOT NULL REFERENCES auth.users(id),

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  accepted_at TIMESTAMP WITH TIME ZONE,

  UNIQUE(user_id, connected_user_id),
  CHECK (user_id != connected_user_id)
);

CREATE INDEX idx_connections_user ON connections(user_id);
CREATE INDEX idx_connections_connected_user ON connections(connected_user_id);
CREATE INDEX idx_connections_status ON connections(status);

-- ============================================
-- SAFETY CHECK-INS
-- Optional location sharing for safety
-- ============================================
CREATE TABLE IF NOT EXISTS safety_checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  route_id UUID REFERENCES routes(id) ON DELETE SET NULL,

  -- Check-in details
  expected_return_time TIMESTAMP WITH TIME ZONE NOT NULL,
  current_location GEOGRAPHY(POINT, 4326),
  last_update TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Emergency contacts
  emergency_contacts UUID[] NOT NULL, -- References auth.users(id)

  -- Status
  status TEXT DEFAULT 'active' CHECK (
    status IN ('active', 'completed', 'overdue', 'emergency')
  ),

  -- Auto-cleanup
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_safety_checkins_user ON safety_checkins(user_id);
CREATE INDEX idx_safety_checkins_status ON safety_checkins(status);
CREATE INDEX idx_safety_checkins_expires ON safety_checkins(expires_at);

-- ============================================
-- COMMUNITY INTEL (Aggregated)
-- Anonymous aggregation for useful insights
-- ============================================
CREATE TABLE IF NOT EXISTS community_intel (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id UUID NOT NULL REFERENCES routes(id) ON DELETE CASCADE,

  -- Time-based patterns (anonymous)
  popular_times JSONB DEFAULT '{}'::jsonb, -- { "weekday_morning": { "popularity": 0.8, "avg_speed": 22 } }

  -- Local knowledge (aggregated from comments)
  local_tips TEXT[] DEFAULT ARRAY[]::TEXT[],

  -- Conditions and hazards (current)
  active_hazards JSONB DEFAULT '[]'::jsonb,

  -- Weather patterns
  best_conditions JSONB,

  -- Stats
  total_rides INTEGER DEFAULT 0,
  unique_riders INTEGER DEFAULT 0,

  last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_community_intel_route ON community_intel(route_id);

-- ============================================
-- ROUTE SAVES
-- Track who saved which routes (for personalization)
-- ============================================
CREATE TABLE IF NOT EXISTS saved_routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  route_id UUID NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  shared_route_id UUID REFERENCES shared_routes(id) ON DELETE SET NULL,

  -- Organization
  folder TEXT,
  notes TEXT,

  saved_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(user_id, route_id)
);

CREATE INDEX idx_saved_routes_user ON saved_routes(user_id);
CREATE INDEX idx_saved_routes_route ON saved_routes(route_id);
CREATE INDEX idx_saved_routes_folder ON saved_routes(user_id, folder);

-- ============================================
-- USER PROFILES (Minimal)
-- Basic profile info for social features
-- ============================================
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Display info
  display_name TEXT CHECK (char_length(display_name) <= 50),
  bio TEXT CHECK (char_length(bio) <= 200),
  avatar_url TEXT,

  -- Location (for local route discovery)
  location_name TEXT, -- City/region name (user-entered)
  location_point GEOGRAPHY(POINT, 4326), -- Approximate location (obscured)

  -- Privacy settings
  profile_visibility TEXT DEFAULT 'friends' CHECK (
    profile_visibility IN ('private', 'friends', 'public')
  ),
  show_in_local_discovery BOOLEAN DEFAULT false,

  -- Stats (optional, can hide)
  show_stats BOOLEAN DEFAULT false,
  total_routes_created INTEGER DEFAULT 0,
  total_collections INTEGER DEFAULT 0,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_user_profiles_location ON user_profiles USING gist(location_point);
CREATE INDEX idx_user_profiles_visibility ON user_profiles(profile_visibility);

-- ============================================
-- FUNCTIONS
-- ============================================

-- Update timestamp function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
CREATE TRIGGER update_shared_routes_updated_at BEFORE UPDATE ON shared_routes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_route_comments_updated_at BEFORE UPDATE ON route_comments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_route_collections_updated_at BEFORE UPDATE ON route_collections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_profiles_updated_at BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to verify route comment
CREATE OR REPLACE FUNCTION verify_route_comment(comment_id UUID, verifying_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE route_comments
  SET
    verification_count = verification_count + 1,
    verified_by_users = array_append(verified_by_users, verifying_user_id),
    is_verified = CASE WHEN verification_count + 1 >= 3 THEN true ELSE is_verified END
  WHERE id = comment_id
    AND NOT (verifying_user_id = ANY(verified_by_users));

  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Function to increment view count (rate limited)
CREATE OR REPLACE FUNCTION increment_route_view(shared_route_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE shared_routes
  SET view_count = view_count + 1
  WHERE id = shared_route_id;
END;
$$ LANGUAGE plpgsql;

-- Function to accept connection and make it bidirectional
CREATE OR REPLACE FUNCTION accept_connection(connection_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  conn_user_id UUID;
  conn_connected_user_id UUID;
BEGIN
  -- Get connection details
  SELECT user_id, connected_user_id INTO conn_user_id, conn_connected_user_id
  FROM connections
  WHERE id = connection_id AND status = 'pending';

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Update original connection
  UPDATE connections
  SET status = 'accepted', accepted_at = NOW()
  WHERE id = connection_id;

  -- Create reverse connection
  INSERT INTO connections (user_id, connected_user_id, connection_type, status, requested_by, accepted_at)
  VALUES (conn_connected_user_id, conn_user_id, 'friend', 'accepted', conn_user_id, NOW())
  ON CONFLICT (user_id, connected_user_id) DO NOTHING;

  RETURN true;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE shared_routes IS 'Privacy-first route sharing with explicit permission levels';
COMMENT ON TABLE route_comments IS 'Practical comments about route conditions, tips, and variants - not social feed';
COMMENT ON TABLE route_collections IS 'Curated lists of routes by theme or purpose';
COMMENT ON TABLE connections IS 'Simple friend connections without activity feed';
COMMENT ON TABLE safety_checkins IS 'Optional location sharing for emergency contacts';
COMMENT ON TABLE community_intel IS 'Anonymous aggregated data about route usage patterns';
COMMENT ON TABLE saved_routes IS 'User-saved routes for quick access';
COMMENT ON TABLE user_profiles IS 'Minimal user profiles for social features';
