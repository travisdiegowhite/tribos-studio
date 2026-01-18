-- Migration: The Cafe - Community & Accountability Features
-- Purpose: Enable small accountability groups (cafes) with weekly check-ins
-- Philosophy: Purposeful connection over passive consumption
-- Named after the cycling tradition of cafe stops - where riders gather, share stories, and support each other

-- ============================================================================
-- CAFES TABLE
-- Small accountability groups (5-10 members) focused on training goals
-- ============================================================================
CREATE TABLE IF NOT EXISTS cafes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Basic info
    name TEXT NOT NULL CHECK (char_length(name) <= 50),
    description TEXT CHECK (char_length(description) <= 300),

    -- Matching criteria
    goal_type TEXT NOT NULL CHECK (
        goal_type IN (
            'general_fitness',
            'century',
            'gran_fondo',
            'racing',
            'gravel',
            'climbing',
            'time_crunched',
            'comeback',
            'weight_loss',
            'social'
        )
    ),
    experience_level TEXT NOT NULL CHECK (
        experience_level IN ('beginner', 'intermediate', 'advanced', 'mixed')
    ),

    -- Capacity
    max_members INTEGER DEFAULT 8 CHECK (max_members >= 3 AND max_members <= 12),

    -- Discovery
    is_public BOOLEAN DEFAULT true,  -- Can be found via matching
    is_open BOOLEAN DEFAULT true,    -- Can join without invite

    -- Weekly check-in day (0=Sunday, 6=Saturday)
    checkin_day INTEGER DEFAULT 0 CHECK (checkin_day >= 0 AND checkin_day <= 6),

    -- Stats (updated via triggers)
    member_count INTEGER DEFAULT 0,
    total_checkins INTEGER DEFAULT 0,
    current_week_checkins INTEGER DEFAULT 0,

    -- Metadata
    created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_cafes_goal_type ON cafes(goal_type);
CREATE INDEX idx_cafes_experience_level ON cafes(experience_level);
CREATE INDEX idx_cafes_is_public ON cafes(is_public) WHERE is_public = true;
CREATE INDEX idx_cafes_created_by ON cafes(created_by);

-- ============================================================================
-- CAFE MEMBERSHIPS TABLE
-- Track who belongs to which cafes
-- ============================================================================
CREATE TABLE IF NOT EXISTS cafe_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cafe_id UUID NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Role in the cafe
    role TEXT DEFAULT 'member' CHECK (role IN ('admin', 'member')),

    -- Status
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'left', 'removed')),

    -- Timestamps
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    left_at TIMESTAMPTZ,

    -- Unique constraint: one membership per user per cafe
    UNIQUE(cafe_id, user_id)
);

-- Indexes
CREATE INDEX idx_cafe_memberships_cafe ON cafe_memberships(cafe_id);
CREATE INDEX idx_cafe_memberships_user ON cafe_memberships(user_id);
CREATE INDEX idx_cafe_memberships_active ON cafe_memberships(user_id, status) WHERE status = 'active';

-- ============================================================================
-- CAFE CHECK-INS TABLE
-- Weekly training reflections shared with cafe members
-- ============================================================================
CREATE TABLE IF NOT EXISTS cafe_check_ins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cafe_id UUID NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Which week this check-in is for (Monday of that week)
    week_start DATE NOT NULL,

    -- Training summary (auto-populated from activities)
    rides_completed INTEGER DEFAULT 0,
    rides_planned INTEGER,  -- From training plan if exists
    total_hours NUMERIC(5,2),
    total_tss INTEGER,

    -- Reflection content
    reflection TEXT CHECK (char_length(reflection) <= 1000),

    -- Quick mood/energy indicators
    training_mood TEXT CHECK (training_mood IN ('struggling', 'okay', 'good', 'great', 'crushing_it')),

    -- Highlights and challenges (optional structured feedback)
    highlights TEXT[] DEFAULT ARRAY[]::TEXT[],
    challenges TEXT[] DEFAULT ARRAY[]::TEXT[],

    -- Goals for next week
    next_week_focus TEXT CHECK (char_length(next_week_focus) <= 500),

    -- Engagement
    encouragement_count INTEGER DEFAULT 0,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- One check-in per user per week per cafe
    UNIQUE(cafe_id, user_id, week_start)
);

-- Indexes
CREATE INDEX idx_cafe_check_ins_cafe ON cafe_check_ins(cafe_id);
CREATE INDEX idx_cafe_check_ins_user ON cafe_check_ins(user_id);
CREATE INDEX idx_cafe_check_ins_week ON cafe_check_ins(week_start DESC);
CREATE INDEX idx_cafe_check_ins_cafe_week ON cafe_check_ins(cafe_id, week_start DESC);

-- ============================================================================
-- CAFE ENCOURAGEMENTS
-- Simple encouragement reactions (not kudos/likes - more meaningful)
-- ============================================================================
CREATE TABLE IF NOT EXISTS cafe_encouragements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    check_in_id UUID NOT NULL REFERENCES cafe_check_ins(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Type of encouragement
    type TEXT DEFAULT 'encourage' CHECK (
        type IN ('encourage', 'celebrate', 'relate', 'support')
    ),

    -- Optional message (short, supportive)
    message TEXT CHECK (char_length(message) <= 200),

    created_at TIMESTAMPTZ DEFAULT NOW(),

    -- One encouragement per user per check-in
    UNIQUE(check_in_id, user_id)
);

CREATE INDEX idx_cafe_encouragements_check_in ON cafe_encouragements(check_in_id);
CREATE INDEX idx_cafe_encouragements_user ON cafe_encouragements(user_id);

-- ============================================================================
-- CAFE INVITES TABLE
-- For inviting specific people to join a cafe
-- ============================================================================
CREATE TABLE IF NOT EXISTS cafe_invites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cafe_id UUID NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
    inviter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Invite details
    invite_code TEXT UNIQUE DEFAULT encode(gen_random_bytes(8), 'hex'),
    invitee_email TEXT,  -- Optional: email to send invite to

    -- Status
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'expired')),

    -- Expiration (7 days by default)
    expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days'),

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    accepted_at TIMESTAMPTZ,
    accepted_by UUID REFERENCES auth.users(id)
);

CREATE INDEX idx_cafe_invites_cafe ON cafe_invites(cafe_id);
CREATE INDEX idx_cafe_invites_code ON cafe_invites(invite_code) WHERE status = 'pending';
CREATE INDEX idx_cafe_invites_email ON cafe_invites(invitee_email) WHERE status = 'pending';

-- ============================================================================
-- EXTEND USER_PROFILES FOR COMMUNITY
-- Add community-related fields to existing user_profiles
-- ============================================================================
ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS community_display_name TEXT CHECK (char_length(community_display_name) <= 30),
ADD COLUMN IF NOT EXISTS community_bio TEXT CHECK (char_length(community_bio) <= 200),
ADD COLUMN IF NOT EXISTS show_training_stats BOOLEAN DEFAULT true,  -- Show CTL/volume in cafes
ADD COLUMN IF NOT EXISTS goal_type TEXT,  -- For cafe matching
ADD COLUMN IF NOT EXISTS experience_level TEXT,  -- For cafe matching
ADD COLUMN IF NOT EXISTS looking_for_cafe BOOLEAN DEFAULT false,  -- Opt-in to cafe discovery
ADD COLUMN IF NOT EXISTS last_check_in_prompt TIMESTAMPTZ;  -- Track when we last prompted

-- ============================================================================
-- ENABLE ROW LEVEL SECURITY
-- ============================================================================
ALTER TABLE cafes ENABLE ROW LEVEL SECURITY;
ALTER TABLE cafe_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE cafe_check_ins ENABLE ROW LEVEL SECURITY;
ALTER TABLE cafe_encouragements ENABLE ROW LEVEL SECURITY;
ALTER TABLE cafe_invites ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- RLS POLICIES - Cafes
-- ============================================================================

-- Anyone can view public cafes for discovery
CREATE POLICY "Public cafes are viewable by authenticated users"
    ON cafes FOR SELECT
    TO authenticated
    USING (is_public = true);

-- Cafe members can view their cafes (including private ones)
CREATE POLICY "Cafe members can view their cafes"
    ON cafes FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM cafe_memberships cm
            WHERE cm.cafe_id = cafes.id
            AND cm.user_id = auth.uid()
            AND cm.status = 'active'
        )
    );

-- Authenticated users can create cafes
CREATE POLICY "Authenticated users can create cafes"
    ON cafes FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = created_by);

-- Cafe admins can update their cafes
CREATE POLICY "Cafe admins can update cafes"
    ON cafes FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM cafe_memberships cm
            WHERE cm.cafe_id = cafes.id
            AND cm.user_id = auth.uid()
            AND cm.role = 'admin'
            AND cm.status = 'active'
        )
    );

-- ============================================================================
-- RLS POLICIES - Cafe Memberships
-- ============================================================================

-- Users can view memberships for cafes they're in
CREATE POLICY "Users can view memberships in their cafes"
    ON cafe_memberships FOR SELECT
    TO authenticated
    USING (
        cafe_id IN (
            SELECT cm.cafe_id FROM cafe_memberships cm
            WHERE cm.user_id = auth.uid() AND cm.status = 'active'
        )
    );

-- Users can join open cafes
CREATE POLICY "Users can join open cafes"
    ON cafe_memberships FOR INSERT
    TO authenticated
    WITH CHECK (
        auth.uid() = user_id
        AND EXISTS (
            SELECT 1 FROM cafes c
            WHERE c.id = cafe_id
            AND c.is_open = true
            AND c.member_count < c.max_members
        )
    );

-- Users can leave cafes (update their own membership)
CREATE POLICY "Users can update their own membership"
    ON cafe_memberships FOR UPDATE
    TO authenticated
    USING (user_id = auth.uid());

-- ============================================================================
-- RLS POLICIES - Cafe Check-ins
-- ============================================================================

-- Cafe members can view check-ins in their cafes
CREATE POLICY "Cafe members can view check-ins in their cafes"
    ON cafe_check_ins FOR SELECT
    TO authenticated
    USING (
        cafe_id IN (
            SELECT cm.cafe_id FROM cafe_memberships cm
            WHERE cm.user_id = auth.uid() AND cm.status = 'active'
        )
    );

-- Users can create their own check-ins in their cafes
CREATE POLICY "Users can create check-ins in their cafes"
    ON cafe_check_ins FOR INSERT
    TO authenticated
    WITH CHECK (
        auth.uid() = user_id
        AND cafe_id IN (
            SELECT cm.cafe_id FROM cafe_memberships cm
            WHERE cm.user_id = auth.uid() AND cm.status = 'active'
        )
    );

-- Users can update their own check-ins
CREATE POLICY "Users can update their own check-ins"
    ON cafe_check_ins FOR UPDATE
    TO authenticated
    USING (user_id = auth.uid());

-- ============================================================================
-- RLS POLICIES - Cafe Encouragements
-- ============================================================================

-- Cafe members can view encouragements in their cafes
CREATE POLICY "Cafe members can view encouragements"
    ON cafe_encouragements FOR SELECT
    TO authenticated
    USING (
        check_in_id IN (
            SELECT cc.id FROM cafe_check_ins cc
            JOIN cafe_memberships cm ON cm.cafe_id = cc.cafe_id
            WHERE cm.user_id = auth.uid() AND cm.status = 'active'
        )
    );

-- Users can add encouragements to check-ins in their cafes
CREATE POLICY "Users can add encouragements in their cafes"
    ON cafe_encouragements FOR INSERT
    TO authenticated
    WITH CHECK (
        auth.uid() = user_id
        AND check_in_id IN (
            SELECT cc.id FROM cafe_check_ins cc
            JOIN cafe_memberships cm ON cm.cafe_id = cc.cafe_id
            WHERE cm.user_id = auth.uid() AND cm.status = 'active'
        )
    );

-- Users can delete their own encouragements
CREATE POLICY "Users can delete their own encouragements"
    ON cafe_encouragements FOR DELETE
    TO authenticated
    USING (user_id = auth.uid());

-- ============================================================================
-- RLS POLICIES - Cafe Invites
-- ============================================================================

-- Cafe members can view invites for their cafes
CREATE POLICY "Cafe members can view cafe invites"
    ON cafe_invites FOR SELECT
    TO authenticated
    USING (
        cafe_id IN (
            SELECT cm.cafe_id FROM cafe_memberships cm
            WHERE cm.user_id = auth.uid() AND cm.status = 'active'
        )
        OR invitee_email = (SELECT email FROM auth.users WHERE id = auth.uid())
    );

-- Cafe admins can create invites
CREATE POLICY "Cafe admins can create invites"
    ON cafe_invites FOR INSERT
    TO authenticated
    WITH CHECK (
        auth.uid() = inviter_id
        AND EXISTS (
            SELECT 1 FROM cafe_memberships cm
            WHERE cm.cafe_id = cafe_id
            AND cm.user_id = auth.uid()
            AND cm.role = 'admin'
            AND cm.status = 'active'
        )
    );

-- Invitees can update invite status (accept/decline)
CREATE POLICY "Invitees can update invites"
    ON cafe_invites FOR UPDATE
    TO authenticated
    USING (
        invitee_email = (SELECT email FROM auth.users WHERE id = auth.uid())
        OR invite_code IS NOT NULL  -- Anyone with the code can accept
    );

-- ============================================================================
-- GRANTS
-- ============================================================================
GRANT ALL ON cafes TO authenticated;
GRANT ALL ON cafe_memberships TO authenticated;
GRANT ALL ON cafe_check_ins TO authenticated;
GRANT ALL ON cafe_encouragements TO authenticated;
GRANT ALL ON cafe_invites TO authenticated;

GRANT ALL ON cafes TO service_role;
GRANT ALL ON cafe_memberships TO service_role;
GRANT ALL ON cafe_check_ins TO service_role;
GRANT ALL ON cafe_encouragements TO service_role;
GRANT ALL ON cafe_invites TO service_role;

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Function to update cafe member count
CREATE OR REPLACE FUNCTION update_cafe_member_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' AND NEW.status = 'active' THEN
        UPDATE cafes SET member_count = member_count + 1 WHERE id = NEW.cafe_id;
    ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.status = 'active' AND NEW.status != 'active' THEN
            UPDATE cafes SET member_count = member_count - 1 WHERE id = NEW.cafe_id;
        ELSIF OLD.status != 'active' AND NEW.status = 'active' THEN
            UPDATE cafes SET member_count = member_count + 1 WHERE id = NEW.cafe_id;
        END IF;
    ELSIF TG_OP = 'DELETE' AND OLD.status = 'active' THEN
        UPDATE cafes SET member_count = member_count - 1 WHERE id = OLD.cafe_id;
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_update_cafe_member_count
    AFTER INSERT OR UPDATE OR DELETE ON cafe_memberships
    FOR EACH ROW EXECUTE FUNCTION update_cafe_member_count();

-- Function to update check-in counts on cafe
CREATE OR REPLACE FUNCTION update_cafe_checkin_counts()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE cafes SET
            total_checkins = total_checkins + 1,
            current_week_checkins = CASE
                WHEN NEW.week_start = date_trunc('week', CURRENT_DATE)::date THEN current_week_checkins + 1
                ELSE current_week_checkins
            END
        WHERE id = NEW.cafe_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_update_cafe_checkin_counts
    AFTER INSERT ON cafe_check_ins
    FOR EACH ROW EXECUTE FUNCTION update_cafe_checkin_counts();

-- Function to update encouragement count
CREATE OR REPLACE FUNCTION update_cafe_encouragement_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE cafe_check_ins SET encouragement_count = encouragement_count + 1 WHERE id = NEW.check_in_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE cafe_check_ins SET encouragement_count = encouragement_count - 1 WHERE id = OLD.check_in_id;
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_update_cafe_encouragement_count
    AFTER INSERT OR DELETE ON cafe_encouragements
    FOR EACH ROW EXECUTE FUNCTION update_cafe_encouragement_count();

-- Function to get current week start (Monday)
CREATE OR REPLACE FUNCTION get_current_week_start()
RETURNS DATE AS $$
BEGIN
    RETURN date_trunc('week', CURRENT_DATE)::date;
END;
$$ LANGUAGE plpgsql;

-- Function to find matching cafes for a user
CREATE OR REPLACE FUNCTION find_matching_cafes(
    p_user_id UUID,
    p_goal_type TEXT DEFAULT NULL,
    p_experience_level TEXT DEFAULT NULL,
    p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
    cafe_id UUID,
    cafe_name TEXT,
    cafe_description TEXT,
    goal_type TEXT,
    experience_level TEXT,
    member_count INTEGER,
    max_members INTEGER,
    match_score INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        c.id as cafe_id,
        c.name as cafe_name,
        c.description as cafe_description,
        c.goal_type,
        c.experience_level,
        c.member_count,
        c.max_members,
        (
            CASE WHEN c.goal_type = COALESCE(p_goal_type, c.goal_type) THEN 50 ELSE 0 END +
            CASE WHEN c.experience_level = COALESCE(p_experience_level, c.experience_level) THEN 30 ELSE 0 END +
            CASE WHEN c.member_count >= 3 THEN 20 ELSE 0 END  -- Prefer active cafes
        )::INTEGER as match_score
    FROM cafes c
    WHERE c.is_public = true
      AND c.is_open = true
      AND c.member_count < c.max_members
      AND NOT EXISTS (
          SELECT 1 FROM cafe_memberships cm
          WHERE cm.cafe_id = c.id
          AND cm.user_id = p_user_id
          AND cm.status = 'active'
      )
    ORDER BY match_score DESC, c.member_count DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- COMMENTS
-- ============================================================================
COMMENT ON TABLE cafes IS 'The Cafe - small accountability groups (5-10 members) for training support, named after cycling cafe culture';
COMMENT ON TABLE cafe_memberships IS 'Tracks which users belong to which cafes';
COMMENT ON TABLE cafe_check_ins IS 'Weekly training reflections shared with cafe members';
COMMENT ON TABLE cafe_encouragements IS 'Supportive reactions to check-ins (not likes/kudos)';
COMMENT ON TABLE cafe_invites IS 'Invitations to join specific cafes';
