-- Migration: Community Pods & Accountability Features
-- Purpose: Enable small accountability groups (pods) with weekly check-ins
-- Philosophy: Purposeful connection over passive consumption

-- ============================================================================
-- PODS TABLE
-- Small accountability groups (5-10 members) focused on training goals
-- ============================================================================
CREATE TABLE IF NOT EXISTS pods (
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
CREATE INDEX idx_pods_goal_type ON pods(goal_type);
CREATE INDEX idx_pods_experience_level ON pods(experience_level);
CREATE INDEX idx_pods_is_public ON pods(is_public) WHERE is_public = true;
CREATE INDEX idx_pods_created_by ON pods(created_by);

-- ============================================================================
-- POD MEMBERSHIPS TABLE
-- Track who belongs to which pods
-- ============================================================================
CREATE TABLE IF NOT EXISTS pod_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pod_id UUID NOT NULL REFERENCES pods(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Role in the pod
    role TEXT DEFAULT 'member' CHECK (role IN ('admin', 'member')),

    -- Status
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'left', 'removed')),

    -- Timestamps
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    left_at TIMESTAMPTZ,

    -- Unique constraint: one membership per user per pod
    UNIQUE(pod_id, user_id)
);

-- Indexes
CREATE INDEX idx_pod_memberships_pod ON pod_memberships(pod_id);
CREATE INDEX idx_pod_memberships_user ON pod_memberships(user_id);
CREATE INDEX idx_pod_memberships_active ON pod_memberships(user_id, status) WHERE status = 'active';

-- ============================================================================
-- POD CHECK-INS TABLE
-- Weekly training reflections shared with pod members
-- ============================================================================
CREATE TABLE IF NOT EXISTS pod_check_ins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pod_id UUID NOT NULL REFERENCES pods(id) ON DELETE CASCADE,
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

    -- One check-in per user per week per pod
    UNIQUE(pod_id, user_id, week_start)
);

-- Indexes
CREATE INDEX idx_pod_check_ins_pod ON pod_check_ins(pod_id);
CREATE INDEX idx_pod_check_ins_user ON pod_check_ins(user_id);
CREATE INDEX idx_pod_check_ins_week ON pod_check_ins(week_start DESC);
CREATE INDEX idx_pod_check_ins_pod_week ON pod_check_ins(pod_id, week_start DESC);

-- ============================================================================
-- POD CHECK-IN ENCOURAGEMENTS
-- Simple encouragement reactions (not kudos/likes - more meaningful)
-- ============================================================================
CREATE TABLE IF NOT EXISTS pod_encouragements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    check_in_id UUID NOT NULL REFERENCES pod_check_ins(id) ON DELETE CASCADE,
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

CREATE INDEX idx_pod_encouragements_check_in ON pod_encouragements(check_in_id);
CREATE INDEX idx_pod_encouragements_user ON pod_encouragements(user_id);

-- ============================================================================
-- POD INVITES TABLE
-- For inviting specific people to join a pod
-- ============================================================================
CREATE TABLE IF NOT EXISTS pod_invites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pod_id UUID NOT NULL REFERENCES pods(id) ON DELETE CASCADE,
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

CREATE INDEX idx_pod_invites_pod ON pod_invites(pod_id);
CREATE INDEX idx_pod_invites_code ON pod_invites(invite_code) WHERE status = 'pending';
CREATE INDEX idx_pod_invites_email ON pod_invites(invitee_email) WHERE status = 'pending';

-- ============================================================================
-- EXTEND USER_PROFILES FOR COMMUNITY
-- Add community-related fields to existing user_profiles
-- ============================================================================
ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS community_display_name TEXT CHECK (char_length(community_display_name) <= 30),
ADD COLUMN IF NOT EXISTS community_bio TEXT CHECK (char_length(community_bio) <= 200),
ADD COLUMN IF NOT EXISTS show_training_stats BOOLEAN DEFAULT true,  -- Show CTL/volume in pods
ADD COLUMN IF NOT EXISTS goal_type TEXT,  -- For pod matching
ADD COLUMN IF NOT EXISTS experience_level TEXT,  -- For pod matching
ADD COLUMN IF NOT EXISTS looking_for_pod BOOLEAN DEFAULT false,  -- Opt-in to pod discovery
ADD COLUMN IF NOT EXISTS last_check_in_prompt TIMESTAMPTZ;  -- Track when we last prompted

-- ============================================================================
-- ENABLE ROW LEVEL SECURITY
-- ============================================================================
ALTER TABLE pods ENABLE ROW LEVEL SECURITY;
ALTER TABLE pod_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE pod_check_ins ENABLE ROW LEVEL SECURITY;
ALTER TABLE pod_encouragements ENABLE ROW LEVEL SECURITY;
ALTER TABLE pod_invites ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- RLS POLICIES - Pods
-- ============================================================================

-- Anyone can view public pods for discovery
CREATE POLICY "Public pods are viewable by authenticated users"
    ON pods FOR SELECT
    TO authenticated
    USING (is_public = true);

-- Pod members can view their pods (including private ones)
CREATE POLICY "Pod members can view their pods"
    ON pods FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM pod_memberships pm
            WHERE pm.pod_id = pods.id
            AND pm.user_id = auth.uid()
            AND pm.status = 'active'
        )
    );

-- Authenticated users can create pods
CREATE POLICY "Authenticated users can create pods"
    ON pods FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = created_by);

-- Pod admins can update their pods
CREATE POLICY "Pod admins can update pods"
    ON pods FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM pod_memberships pm
            WHERE pm.pod_id = pods.id
            AND pm.user_id = auth.uid()
            AND pm.role = 'admin'
            AND pm.status = 'active'
        )
    );

-- ============================================================================
-- RLS POLICIES - Pod Memberships
-- ============================================================================

-- Users can view memberships for pods they're in
CREATE POLICY "Users can view memberships in their pods"
    ON pod_memberships FOR SELECT
    TO authenticated
    USING (
        pod_id IN (
            SELECT pm.pod_id FROM pod_memberships pm
            WHERE pm.user_id = auth.uid() AND pm.status = 'active'
        )
    );

-- Users can join open pods
CREATE POLICY "Users can join open pods"
    ON pod_memberships FOR INSERT
    TO authenticated
    WITH CHECK (
        auth.uid() = user_id
        AND EXISTS (
            SELECT 1 FROM pods p
            WHERE p.id = pod_id
            AND p.is_open = true
            AND p.member_count < p.max_members
        )
    );

-- Users can leave pods (update their own membership)
CREATE POLICY "Users can update their own membership"
    ON pod_memberships FOR UPDATE
    TO authenticated
    USING (user_id = auth.uid());

-- ============================================================================
-- RLS POLICIES - Pod Check-ins
-- ============================================================================

-- Pod members can view check-ins in their pods
CREATE POLICY "Pod members can view check-ins in their pods"
    ON pod_check_ins FOR SELECT
    TO authenticated
    USING (
        pod_id IN (
            SELECT pm.pod_id FROM pod_memberships pm
            WHERE pm.user_id = auth.uid() AND pm.status = 'active'
        )
    );

-- Users can create their own check-ins in their pods
CREATE POLICY "Users can create check-ins in their pods"
    ON pod_check_ins FOR INSERT
    TO authenticated
    WITH CHECK (
        auth.uid() = user_id
        AND pod_id IN (
            SELECT pm.pod_id FROM pod_memberships pm
            WHERE pm.user_id = auth.uid() AND pm.status = 'active'
        )
    );

-- Users can update their own check-ins
CREATE POLICY "Users can update their own check-ins"
    ON pod_check_ins FOR UPDATE
    TO authenticated
    USING (user_id = auth.uid());

-- ============================================================================
-- RLS POLICIES - Pod Encouragements
-- ============================================================================

-- Pod members can view encouragements in their pods
CREATE POLICY "Pod members can view encouragements"
    ON pod_encouragements FOR SELECT
    TO authenticated
    USING (
        check_in_id IN (
            SELECT pc.id FROM pod_check_ins pc
            JOIN pod_memberships pm ON pm.pod_id = pc.pod_id
            WHERE pm.user_id = auth.uid() AND pm.status = 'active'
        )
    );

-- Users can add encouragements to check-ins in their pods
CREATE POLICY "Users can add encouragements in their pods"
    ON pod_encouragements FOR INSERT
    TO authenticated
    WITH CHECK (
        auth.uid() = user_id
        AND check_in_id IN (
            SELECT pc.id FROM pod_check_ins pc
            JOIN pod_memberships pm ON pm.pod_id = pc.pod_id
            WHERE pm.user_id = auth.uid() AND pm.status = 'active'
        )
    );

-- Users can delete their own encouragements
CREATE POLICY "Users can delete their own encouragements"
    ON pod_encouragements FOR DELETE
    TO authenticated
    USING (user_id = auth.uid());

-- ============================================================================
-- RLS POLICIES - Pod Invites
-- ============================================================================

-- Pod members can view invites for their pods
CREATE POLICY "Pod members can view pod invites"
    ON pod_invites FOR SELECT
    TO authenticated
    USING (
        pod_id IN (
            SELECT pm.pod_id FROM pod_memberships pm
            WHERE pm.user_id = auth.uid() AND pm.status = 'active'
        )
        OR invitee_email = (SELECT email FROM auth.users WHERE id = auth.uid())
    );

-- Pod admins can create invites
CREATE POLICY "Pod admins can create invites"
    ON pod_invites FOR INSERT
    TO authenticated
    WITH CHECK (
        auth.uid() = inviter_id
        AND EXISTS (
            SELECT 1 FROM pod_memberships pm
            WHERE pm.pod_id = pod_id
            AND pm.user_id = auth.uid()
            AND pm.role = 'admin'
            AND pm.status = 'active'
        )
    );

-- Invitees can update invite status (accept/decline)
CREATE POLICY "Invitees can update invites"
    ON pod_invites FOR UPDATE
    TO authenticated
    USING (
        invitee_email = (SELECT email FROM auth.users WHERE id = auth.uid())
        OR invite_code IS NOT NULL  -- Anyone with the code can accept
    );

-- ============================================================================
-- GRANTS
-- ============================================================================
GRANT ALL ON pods TO authenticated;
GRANT ALL ON pod_memberships TO authenticated;
GRANT ALL ON pod_check_ins TO authenticated;
GRANT ALL ON pod_encouragements TO authenticated;
GRANT ALL ON pod_invites TO authenticated;

GRANT ALL ON pods TO service_role;
GRANT ALL ON pod_memberships TO service_role;
GRANT ALL ON pod_check_ins TO service_role;
GRANT ALL ON pod_encouragements TO service_role;
GRANT ALL ON pod_invites TO service_role;

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Function to update pod member count
CREATE OR REPLACE FUNCTION update_pod_member_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' AND NEW.status = 'active' THEN
        UPDATE pods SET member_count = member_count + 1 WHERE id = NEW.pod_id;
    ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.status = 'active' AND NEW.status != 'active' THEN
            UPDATE pods SET member_count = member_count - 1 WHERE id = NEW.pod_id;
        ELSIF OLD.status != 'active' AND NEW.status = 'active' THEN
            UPDATE pods SET member_count = member_count + 1 WHERE id = NEW.pod_id;
        END IF;
    ELSIF TG_OP = 'DELETE' AND OLD.status = 'active' THEN
        UPDATE pods SET member_count = member_count - 1 WHERE id = OLD.pod_id;
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_update_pod_member_count
    AFTER INSERT OR UPDATE OR DELETE ON pod_memberships
    FOR EACH ROW EXECUTE FUNCTION update_pod_member_count();

-- Function to update check-in counts on pod
CREATE OR REPLACE FUNCTION update_pod_checkin_counts()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE pods SET
            total_checkins = total_checkins + 1,
            current_week_checkins = CASE
                WHEN NEW.week_start = date_trunc('week', CURRENT_DATE)::date THEN current_week_checkins + 1
                ELSE current_week_checkins
            END
        WHERE id = NEW.pod_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_update_pod_checkin_counts
    AFTER INSERT ON pod_check_ins
    FOR EACH ROW EXECUTE FUNCTION update_pod_checkin_counts();

-- Function to update encouragement count
CREATE OR REPLACE FUNCTION update_encouragement_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE pod_check_ins SET encouragement_count = encouragement_count + 1 WHERE id = NEW.check_in_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE pod_check_ins SET encouragement_count = encouragement_count - 1 WHERE id = OLD.check_in_id;
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_update_encouragement_count
    AFTER INSERT OR DELETE ON pod_encouragements
    FOR EACH ROW EXECUTE FUNCTION update_encouragement_count();

-- Function to get current week start (Monday)
CREATE OR REPLACE FUNCTION get_current_week_start()
RETURNS DATE AS $$
BEGIN
    RETURN date_trunc('week', CURRENT_DATE)::date;
END;
$$ LANGUAGE plpgsql;

-- Function to find matching pods for a user
CREATE OR REPLACE FUNCTION find_matching_pods(
    p_user_id UUID,
    p_goal_type TEXT DEFAULT NULL,
    p_experience_level TEXT DEFAULT NULL,
    p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
    pod_id UUID,
    pod_name TEXT,
    pod_description TEXT,
    goal_type TEXT,
    experience_level TEXT,
    member_count INTEGER,
    max_members INTEGER,
    match_score INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        p.id as pod_id,
        p.name as pod_name,
        p.description as pod_description,
        p.goal_type,
        p.experience_level,
        p.member_count,
        p.max_members,
        (
            CASE WHEN p.goal_type = COALESCE(p_goal_type, p.goal_type) THEN 50 ELSE 0 END +
            CASE WHEN p.experience_level = COALESCE(p_experience_level, p.experience_level) THEN 30 ELSE 0 END +
            CASE WHEN p.member_count >= 3 THEN 20 ELSE 0 END  -- Prefer active pods
        )::INTEGER as match_score
    FROM pods p
    WHERE p.is_public = true
      AND p.is_open = true
      AND p.member_count < p.max_members
      AND NOT EXISTS (
          SELECT 1 FROM pod_memberships pm
          WHERE pm.pod_id = p.id
          AND pm.user_id = p_user_id
          AND pm.status = 'active'
      )
    ORDER BY match_score DESC, p.member_count DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- COMMENTS
-- ============================================================================
COMMENT ON TABLE pods IS 'Small accountability groups (5-10 members) for training support';
COMMENT ON TABLE pod_memberships IS 'Tracks which users belong to which pods';
COMMENT ON TABLE pod_check_ins IS 'Weekly training reflections shared with pod members';
COMMENT ON TABLE pod_encouragements IS 'Supportive reactions to check-ins (not likes/kudos)';
COMMENT ON TABLE pod_invites IS 'Invitations to join specific pods';
