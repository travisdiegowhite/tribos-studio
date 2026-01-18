-- Migration: Cafe Discussion Threads
-- Purpose: Add forum-style discussions within cafes
-- Philosophy: Training-focused conversations with optional context sharing

-- ============================================================================
-- CAFE DISCUSSIONS TABLE
-- Forum-style threads within a cafe
-- ============================================================================
CREATE TABLE IF NOT EXISTS cafe_discussions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cafe_id UUID NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Content
    title TEXT NOT NULL CHECK (char_length(title) >= 3 AND char_length(title) <= 150),
    body TEXT NOT NULL CHECK (char_length(body) >= 10 AND char_length(body) <= 5000),

    -- Optional training context (share your stats for more relevant advice)
    include_training_context BOOLEAN DEFAULT false,
    training_context JSONB,  -- { ctl, atl, tsb, recent_volume, ftp, etc. }

    -- Categorization
    category TEXT DEFAULT 'general' CHECK (
        category IN ('general', 'training', 'nutrition', 'gear', 'motivation', 'race_prep', 'recovery', 'question')
    ),

    -- Status
    is_pinned BOOLEAN DEFAULT false,
    is_locked BOOLEAN DEFAULT false,  -- Prevent new replies

    -- Stats (updated via triggers)
    reply_count INTEGER DEFAULT 0,
    last_reply_at TIMESTAMPTZ,
    last_reply_by UUID REFERENCES auth.users(id),

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_cafe_discussions_cafe ON cafe_discussions(cafe_id);
CREATE INDEX idx_cafe_discussions_author ON cafe_discussions(author_id);
CREATE INDEX idx_cafe_discussions_category ON cafe_discussions(cafe_id, category);
CREATE INDEX idx_cafe_discussions_recent ON cafe_discussions(cafe_id, last_reply_at DESC NULLS LAST);
CREATE INDEX idx_cafe_discussions_pinned ON cafe_discussions(cafe_id, is_pinned DESC, last_reply_at DESC NULLS LAST);

-- ============================================================================
-- CAFE DISCUSSION REPLIES TABLE
-- Replies to discussion threads
-- ============================================================================
CREATE TABLE IF NOT EXISTS cafe_discussion_replies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    discussion_id UUID NOT NULL REFERENCES cafe_discussions(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Content
    body TEXT NOT NULL CHECK (char_length(body) >= 1 AND char_length(body) <= 3000),

    -- Optional training context
    include_training_context BOOLEAN DEFAULT false,
    training_context JSONB,

    -- For nested replies (optional, keep it simple for now)
    parent_reply_id UUID REFERENCES cafe_discussion_replies(id) ON DELETE CASCADE,

    -- Helpful marker (not likes - "this was helpful")
    helpful_count INTEGER DEFAULT 0,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_cafe_discussion_replies_discussion ON cafe_discussion_replies(discussion_id);
CREATE INDEX idx_cafe_discussion_replies_author ON cafe_discussion_replies(author_id);
CREATE INDEX idx_cafe_discussion_replies_created ON cafe_discussion_replies(discussion_id, created_at);

-- ============================================================================
-- HELPFUL MARKERS TABLE
-- Track who found what helpful (not generic likes)
-- ============================================================================
CREATE TABLE IF NOT EXISTS cafe_helpful_markers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    reply_id UUID NOT NULL REFERENCES cafe_discussion_replies(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(user_id, reply_id)
);

CREATE INDEX idx_cafe_helpful_markers_reply ON cafe_helpful_markers(reply_id);

-- ============================================================================
-- ENABLE ROW LEVEL SECURITY
-- ============================================================================
ALTER TABLE cafe_discussions ENABLE ROW LEVEL SECURITY;
ALTER TABLE cafe_discussion_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE cafe_helpful_markers ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- RLS POLICIES - Discussions
-- ============================================================================

-- Cafe members can view discussions in their cafes
CREATE POLICY "Cafe members can view discussions"
    ON cafe_discussions FOR SELECT
    TO authenticated
    USING (user_is_cafe_member(cafe_id, auth.uid()));

-- Cafe members can create discussions
CREATE POLICY "Cafe members can create discussions"
    ON cafe_discussions FOR INSERT
    TO authenticated
    WITH CHECK (
        auth.uid() = author_id
        AND user_is_cafe_member(cafe_id, auth.uid())
    );

-- Authors can update their own discussions
CREATE POLICY "Authors can update their discussions"
    ON cafe_discussions FOR UPDATE
    TO authenticated
    USING (author_id = auth.uid())
    WITH CHECK (author_id = auth.uid());

-- Authors can delete their own discussions
CREATE POLICY "Authors can delete their discussions"
    ON cafe_discussions FOR DELETE
    TO authenticated
    USING (author_id = auth.uid());

-- ============================================================================
-- RLS POLICIES - Replies
-- ============================================================================

-- Cafe members can view replies (via discussion membership check)
CREATE POLICY "Cafe members can view replies"
    ON cafe_discussion_replies FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM cafe_discussions d
            WHERE d.id = discussion_id
            AND user_is_cafe_member(d.cafe_id, auth.uid())
        )
    );

-- Cafe members can create replies (if discussion not locked)
CREATE POLICY "Cafe members can create replies"
    ON cafe_discussion_replies FOR INSERT
    TO authenticated
    WITH CHECK (
        auth.uid() = author_id
        AND EXISTS (
            SELECT 1 FROM cafe_discussions d
            WHERE d.id = discussion_id
            AND user_is_cafe_member(d.cafe_id, auth.uid())
            AND d.is_locked = false
        )
    );

-- Authors can update their own replies
CREATE POLICY "Authors can update their replies"
    ON cafe_discussion_replies FOR UPDATE
    TO authenticated
    USING (author_id = auth.uid())
    WITH CHECK (author_id = auth.uid());

-- Authors can delete their own replies
CREATE POLICY "Authors can delete their replies"
    ON cafe_discussion_replies FOR DELETE
    TO authenticated
    USING (author_id = auth.uid());

-- ============================================================================
-- RLS POLICIES - Helpful Markers
-- ============================================================================

-- Users can view helpful markers
CREATE POLICY "Users can view helpful markers"
    ON cafe_helpful_markers FOR SELECT
    TO authenticated
    USING (true);

-- Users can mark replies as helpful
CREATE POLICY "Users can mark helpful"
    ON cafe_helpful_markers FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

-- Users can remove their helpful marker
CREATE POLICY "Users can unmark helpful"
    ON cafe_helpful_markers FOR DELETE
    TO authenticated
    USING (user_id = auth.uid());

-- ============================================================================
-- GRANTS
-- ============================================================================
GRANT ALL ON cafe_discussions TO authenticated;
GRANT ALL ON cafe_discussion_replies TO authenticated;
GRANT ALL ON cafe_helpful_markers TO authenticated;

GRANT ALL ON cafe_discussions TO service_role;
GRANT ALL ON cafe_discussion_replies TO service_role;
GRANT ALL ON cafe_helpful_markers TO service_role;

-- ============================================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================================

-- Update discussion stats when reply is added/removed
CREATE OR REPLACE FUNCTION update_discussion_stats()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE cafe_discussions SET
            reply_count = reply_count + 1,
            last_reply_at = NEW.created_at,
            last_reply_by = NEW.author_id,
            updated_at = NOW()
        WHERE id = NEW.discussion_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE cafe_discussions SET
            reply_count = GREATEST(0, reply_count - 1),
            updated_at = NOW()
        WHERE id = OLD.discussion_id;

        -- Update last_reply info from remaining replies
        UPDATE cafe_discussions d SET
            last_reply_at = (
                SELECT MAX(created_at) FROM cafe_discussion_replies
                WHERE discussion_id = d.id
            ),
            last_reply_by = (
                SELECT author_id FROM cafe_discussion_replies
                WHERE discussion_id = d.id
                ORDER BY created_at DESC LIMIT 1
            )
        WHERE id = OLD.discussion_id;
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_update_discussion_stats
    AFTER INSERT OR DELETE ON cafe_discussion_replies
    FOR EACH ROW EXECUTE FUNCTION update_discussion_stats();

-- Update helpful count when marked/unmarked
CREATE OR REPLACE FUNCTION update_helpful_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE cafe_discussion_replies SET helpful_count = helpful_count + 1
        WHERE id = NEW.reply_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE cafe_discussion_replies SET helpful_count = GREATEST(0, helpful_count - 1)
        WHERE id = OLD.reply_id;
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_update_helpful_count
    AFTER INSERT OR DELETE ON cafe_helpful_markers
    FOR EACH ROW EXECUTE FUNCTION update_helpful_count();

-- ============================================================================
-- COMMENTS
-- ============================================================================
COMMENT ON TABLE cafe_discussions IS 'Forum-style discussion threads within cafes';
COMMENT ON TABLE cafe_discussion_replies IS 'Replies to cafe discussions';
COMMENT ON TABLE cafe_helpful_markers IS 'Track which replies users found helpful';
COMMENT ON COLUMN cafe_discussions.training_context IS 'Optional JSON with CTL, ATL, TSB, volume for context';
