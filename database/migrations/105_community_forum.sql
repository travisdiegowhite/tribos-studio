-- Migration: Community-wide Forum ("The Cafe" redesign)
-- Purpose: Replace the per-cafe-only discussion area with a single
--          community-wide forum, organized by category boards.
-- Notes:
--   - The existing cafe_* tables (small-group check-ins + per-cafe
--     discussions) are untouched; the small-group feature remains as a
--     secondary tab in the UI.
--   - All SECURITY DEFINER functions set search_path and use
--     fully-qualified table names (see CLAUDE.md auth trigger rules).
--   - Author FKs to user_profiles are named *_profile_fkey so PostgREST
--     embedded selects work (same pattern as migration 029).

-- ============================================================================
-- FORUM CATEGORIES (boards)
-- ============================================================================
CREATE TABLE IF NOT EXISTS forum_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9-]{2,40}$'),
    name TEXT NOT NULL CHECK (char_length(name) BETWEEN 2 AND 50),
    description TEXT CHECK (char_length(description) <= 200),
    color TEXT NOT NULL DEFAULT 'gray',
    sort_order INTEGER NOT NULL DEFAULT 0,

    -- Stats (maintained by triggers)
    thread_count INTEGER NOT NULL DEFAULT 0,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO forum_categories (slug, name, description, color, sort_order) VALUES
    ('general',       'General',        'Anything cycling that does not fit elsewhere',        'gray',       0),
    ('training',      'Training',       'Plans, workouts, fitness, and performance questions', 'teal',       1),
    ('nutrition',     'Nutrition',      'Fueling, hydration, and recovery nutrition',          'sage',       2),
    ('gear',          'Gear',           'Bikes, components, wearables, and setup',             'gold',       3),
    ('routes-rides',  'Routes & Rides', 'Route ideas, ride reports, and local knowledge',      'sky',        4),
    ('race-prep',     'Race Prep',      'Events, racing tactics, and taper talk',              'mauve',      5),
    ('recovery',      'Recovery',       'Rest, injury management, and coming back',            'dusty-rose', 6),
    ('introductions', 'Introductions',  'New here? Say hello and share your goals',            'terracotta', 7)
ON CONFLICT (slug) DO NOTHING;

-- ============================================================================
-- FORUM THREADS
-- ============================================================================
CREATE TABLE IF NOT EXISTS forum_threads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id UUID NOT NULL REFERENCES forum_categories(id) ON DELETE RESTRICT,
    author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    title TEXT NOT NULL CHECK (char_length(title) BETWEEN 3 AND 200),
    body TEXT NOT NULL CHECK (char_length(body) BETWEEN 10 AND 20000),

    -- Optional training context (same shape as cafe_discussions)
    include_training_context BOOLEAN NOT NULL DEFAULT false,
    training_context JSONB,

    -- Moderation
    is_pinned BOOLEAN NOT NULL DEFAULT false,
    is_locked BOOLEAN NOT NULL DEFAULT false,

    -- Stats (maintained by triggers)
    reply_count INTEGER NOT NULL DEFAULT 0,
    reaction_count INTEGER NOT NULL DEFAULT 0,
    last_post_at TIMESTAMPTZ,
    last_post_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    -- created_at, or the newest post time; drives "Latest" sort and unread state
    last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    edited_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Full-text search over title (weight A) + body (weight B)
    search_tsv TSVECTOR GENERATED ALWAYS AS (
        setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(body, '')), 'B')
    ) STORED
);

CREATE INDEX idx_forum_threads_category ON forum_threads(category_id);
CREATE INDEX idx_forum_threads_author ON forum_threads(author_id);
CREATE INDEX idx_forum_threads_activity ON forum_threads(is_pinned DESC, last_activity_at DESC);
CREATE INDEX idx_forum_threads_cat_activity ON forum_threads(category_id, is_pinned DESC, last_activity_at DESC);
CREATE INDEX idx_forum_threads_top ON forum_threads(reaction_count DESC, last_activity_at DESC);
CREATE INDEX idx_forum_threads_search ON forum_threads USING GIN (search_tsv);

-- ============================================================================
-- FORUM POSTS (replies within a thread)
-- ============================================================================
CREATE TABLE IF NOT EXISTS forum_posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id UUID NOT NULL REFERENCES forum_threads(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 20000),

    -- Quoted/replied-to post (rendered as a quote block, not deep nesting)
    parent_post_id UUID REFERENCES forum_posts(id) ON DELETE SET NULL,

    -- Stats (maintained by triggers)
    reaction_count INTEGER NOT NULL DEFAULT 0,

    edited_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    search_tsv TSVECTOR GENERATED ALWAYS AS (
        to_tsvector('english', coalesce(body, ''))
    ) STORED
);

CREATE INDEX idx_forum_posts_thread ON forum_posts(thread_id, created_at);
CREATE INDEX idx_forum_posts_author ON forum_posts(author_id);
CREATE INDEX idx_forum_posts_parent ON forum_posts(parent_post_id);
CREATE INDEX idx_forum_posts_search ON forum_posts USING GIN (search_tsv);

-- ============================================================================
-- FORUM REACTIONS (emoji reactions on threads OR posts)
-- ============================================================================
CREATE TABLE IF NOT EXISTS forum_reactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    thread_id UUID REFERENCES forum_threads(id) ON DELETE CASCADE,
    post_id UUID REFERENCES forum_posts(id) ON DELETE CASCADE,
    reaction TEXT NOT NULL CHECK (
        reaction IN ('thumbs_up', 'heart', 'fire', 'flex', 'laugh')
    ),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Exactly one target
    CHECK ((thread_id IS NULL) <> (post_id IS NULL))
);

CREATE UNIQUE INDEX idx_forum_reactions_thread_unique
    ON forum_reactions(user_id, thread_id, reaction) WHERE thread_id IS NOT NULL;
CREATE UNIQUE INDEX idx_forum_reactions_post_unique
    ON forum_reactions(user_id, post_id, reaction) WHERE post_id IS NOT NULL;
CREATE INDEX idx_forum_reactions_thread ON forum_reactions(thread_id) WHERE thread_id IS NOT NULL;
CREATE INDEX idx_forum_reactions_post ON forum_reactions(post_id) WHERE post_id IS NOT NULL;

-- ============================================================================
-- FORUM THREAD READS (unread tracking)
-- ============================================================================
CREATE TABLE IF NOT EXISTS forum_thread_reads (
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    thread_id UUID NOT NULL REFERENCES forum_threads(id) ON DELETE CASCADE,
    last_read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (user_id, thread_id)
);

CREATE INDEX idx_forum_thread_reads_thread ON forum_thread_reads(thread_id);

-- ============================================================================
-- FORUM NOTIFICATIONS (in-app; rows are created by triggers only)
-- ============================================================================
CREATE TABLE IF NOT EXISTS forum_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,   -- recipient
    actor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,  -- who triggered it
    thread_id UUID NOT NULL REFERENCES forum_threads(id) ON DELETE CASCADE,
    post_id UUID REFERENCES forum_posts(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('reply', 'quote', 'mention')),
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_forum_notifications_user
    ON forum_notifications(user_id, created_at DESC);
CREATE INDEX idx_forum_notifications_unread
    ON forum_notifications(user_id) WHERE read_at IS NULL;

-- ============================================================================
-- FORUM MODERATORS
-- Members of this table can pin/lock any thread and delete any thread/post.
-- Rows are managed out-of-band (service role / SQL console), e.g.:
--   INSERT INTO forum_moderators (user_id)
--   SELECT id FROM auth.users WHERE email = 'admin@example.com';
-- ============================================================================
CREATE TABLE IF NOT EXISTS forum_moderators (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- Explicit FKs to user_profiles for PostgREST embedding (029 pattern)
-- ============================================================================
INSERT INTO user_profiles (id)
SELECT u.id FROM auth.users u
LEFT JOIN user_profiles up ON u.id = up.id
WHERE up.id IS NULL
ON CONFLICT (id) DO NOTHING;

ALTER TABLE forum_threads
    ADD CONSTRAINT forum_threads_author_id_profile_fkey
    FOREIGN KEY (author_id) REFERENCES user_profiles(id) ON DELETE CASCADE;

ALTER TABLE forum_posts
    ADD CONSTRAINT forum_posts_author_id_profile_fkey
    FOREIGN KEY (author_id) REFERENCES user_profiles(id) ON DELETE CASCADE;

ALTER TABLE forum_notifications
    ADD CONSTRAINT forum_notifications_actor_id_profile_fkey
    FOREIGN KEY (actor_id) REFERENCES user_profiles(id) ON DELETE CASCADE;

-- ============================================================================
-- HELPER: moderator check (used by RLS policies)
-- ============================================================================
CREATE OR REPLACE FUNCTION user_is_forum_moderator(check_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.forum_moderators WHERE user_id = check_user_id
    );
$$;

-- ============================================================================
-- ENABLE ROW LEVEL SECURITY
-- ============================================================================
ALTER TABLE forum_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum_thread_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum_moderators ENABLE ROW LEVEL SECURITY;

-- Categories: read-only for all authenticated users (writes via service role)
CREATE POLICY "Authenticated users can view categories"
    ON forum_categories FOR SELECT
    TO authenticated
    USING (true);

-- Threads
CREATE POLICY "Authenticated users can view threads"
    ON forum_threads FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Users can create threads"
    ON forum_threads FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = author_id);

CREATE POLICY "Authors can update their threads"
    ON forum_threads FOR UPDATE
    TO authenticated
    USING (author_id = auth.uid())
    WITH CHECK (author_id = auth.uid());

CREATE POLICY "Moderators can update any thread"
    ON forum_threads FOR UPDATE
    TO authenticated
    USING (user_is_forum_moderator(auth.uid()))
    WITH CHECK (true);

CREATE POLICY "Authors can delete their threads"
    ON forum_threads FOR DELETE
    TO authenticated
    USING (author_id = auth.uid());

CREATE POLICY "Moderators can delete any thread"
    ON forum_threads FOR DELETE
    TO authenticated
    USING (user_is_forum_moderator(auth.uid()));

-- Posts
CREATE POLICY "Authenticated users can view posts"
    ON forum_posts FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Users can reply to unlocked threads"
    ON forum_posts FOR INSERT
    TO authenticated
    WITH CHECK (
        auth.uid() = author_id
        AND EXISTS (
            SELECT 1 FROM forum_threads t
            WHERE t.id = thread_id
            AND (t.is_locked = false OR user_is_forum_moderator(auth.uid()))
        )
    );

CREATE POLICY "Authors can update their posts"
    ON forum_posts FOR UPDATE
    TO authenticated
    USING (author_id = auth.uid())
    WITH CHECK (author_id = auth.uid());

CREATE POLICY "Authors can delete their posts"
    ON forum_posts FOR DELETE
    TO authenticated
    USING (author_id = auth.uid());

CREATE POLICY "Moderators can delete any post"
    ON forum_posts FOR DELETE
    TO authenticated
    USING (user_is_forum_moderator(auth.uid()));

-- Reactions
CREATE POLICY "Authenticated users can view reactions"
    ON forum_reactions FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Users can add their reactions"
    ON forum_reactions FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can remove their reactions"
    ON forum_reactions FOR DELETE
    TO authenticated
    USING (user_id = auth.uid());

-- Thread reads
CREATE POLICY "Users can view their read markers"
    ON forum_thread_reads FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

CREATE POLICY "Users can create their read markers"
    ON forum_thread_reads FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their read markers"
    ON forum_thread_reads FOR UPDATE
    TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- Notifications (inserted only by SECURITY DEFINER triggers — no INSERT policy)
CREATE POLICY "Users can view their notifications"
    ON forum_notifications FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

CREATE POLICY "Users can mark their notifications read"
    ON forum_notifications FOR UPDATE
    TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete their notifications"
    ON forum_notifications FOR DELETE
    TO authenticated
    USING (user_id = auth.uid());

-- Moderators table: users may check who moderates (read-only)
CREATE POLICY "Authenticated users can view moderators"
    ON forum_moderators FOR SELECT
    TO authenticated
    USING (true);

-- ============================================================================
-- GRANTS
-- ============================================================================
GRANT SELECT ON forum_categories TO authenticated;
GRANT SELECT ON forum_moderators TO authenticated;
GRANT ALL ON forum_threads TO authenticated;
GRANT ALL ON forum_posts TO authenticated;
GRANT ALL ON forum_reactions TO authenticated;
GRANT ALL ON forum_thread_reads TO authenticated;
GRANT SELECT, UPDATE, DELETE ON forum_notifications TO authenticated;

GRANT ALL ON forum_categories TO service_role;
GRANT ALL ON forum_threads TO service_role;
GRANT ALL ON forum_posts TO service_role;
GRANT ALL ON forum_reactions TO service_role;
GRANT ALL ON forum_thread_reads TO service_role;
GRANT ALL ON forum_notifications TO service_role;
GRANT ALL ON forum_moderators TO service_role;

-- ============================================================================
-- TRIGGERS: thread + category stats
-- ============================================================================
CREATE OR REPLACE FUNCTION update_forum_thread_stats()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE public.forum_threads SET
            reply_count = reply_count + 1,
            last_post_at = NEW.created_at,
            last_post_by = NEW.author_id,
            last_activity_at = NEW.created_at,
            updated_at = NOW()
        WHERE id = NEW.thread_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE public.forum_threads t SET
            reply_count = GREATEST(0, reply_count - 1),
            last_post_at = (
                SELECT MAX(created_at) FROM public.forum_posts
                WHERE thread_id = t.id AND id <> OLD.id
            ),
            last_post_by = (
                SELECT author_id FROM public.forum_posts
                WHERE thread_id = t.id AND id <> OLD.id
                ORDER BY created_at DESC LIMIT 1
            ),
            last_activity_at = COALESCE(
                (SELECT MAX(created_at) FROM public.forum_posts
                 WHERE thread_id = t.id AND id <> OLD.id),
                t.created_at
            ),
            updated_at = NOW()
        WHERE id = OLD.thread_id;
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trigger_update_forum_thread_stats
    AFTER INSERT OR DELETE ON forum_posts
    FOR EACH ROW EXECUTE FUNCTION update_forum_thread_stats();

CREATE OR REPLACE FUNCTION update_forum_category_stats()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE public.forum_categories SET thread_count = thread_count + 1
        WHERE id = NEW.category_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE public.forum_categories SET thread_count = GREATEST(0, thread_count - 1)
        WHERE id = OLD.category_id;
    ELSIF TG_OP = 'UPDATE' AND NEW.category_id <> OLD.category_id THEN
        UPDATE public.forum_categories SET thread_count = GREATEST(0, thread_count - 1)
        WHERE id = OLD.category_id;
        UPDATE public.forum_categories SET thread_count = thread_count + 1
        WHERE id = NEW.category_id;
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trigger_update_forum_category_stats
    AFTER INSERT OR DELETE OR UPDATE OF category_id ON forum_threads
    FOR EACH ROW EXECUTE FUNCTION update_forum_category_stats();

-- ============================================================================
-- TRIGGERS: reaction counts
-- ============================================================================
CREATE OR REPLACE FUNCTION update_forum_reaction_counts()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.thread_id IS NOT NULL THEN
            UPDATE public.forum_threads
            SET reaction_count = reaction_count + 1
            WHERE id = NEW.thread_id;
        ELSIF NEW.post_id IS NOT NULL THEN
            UPDATE public.forum_posts
            SET reaction_count = reaction_count + 1
            WHERE id = NEW.post_id;
        END IF;
        RETURN NEW;
    ELSE
        IF OLD.thread_id IS NOT NULL THEN
            UPDATE public.forum_threads
            SET reaction_count = GREATEST(0, reaction_count - 1)
            WHERE id = OLD.thread_id;
        ELSIF OLD.post_id IS NOT NULL THEN
            UPDATE public.forum_posts
            SET reaction_count = GREATEST(0, reaction_count - 1)
            WHERE id = OLD.post_id;
        END IF;
        RETURN OLD;
    END IF;
END;
$$;

CREATE TRIGGER trigger_update_forum_reaction_counts
    AFTER INSERT OR DELETE ON forum_reactions
    FOR EACH ROW EXECUTE FUNCTION update_forum_reaction_counts();

-- ============================================================================
-- MENTIONS: extract @tokens from a body
-- Mentions use the display name with spaces removed, e.g. a rider shown as
-- "Sam Miller" is mentioned as @SamMiller. Matching is case-insensitive
-- against both community_display_name and display_name.
-- ============================================================================
CREATE OR REPLACE FUNCTION resolve_forum_mentions(body_text TEXT)
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT DISTINCT up.id
    FROM (
        SELECT DISTINCT lower(m[1]) AS token
        FROM regexp_matches(body_text, '@([A-Za-z0-9_.-]{2,60})', 'g') AS m
    ) tokens
    JOIN public.user_profiles up
        ON lower(replace(coalesce(up.community_display_name, ''), ' ', '')) = tokens.token
        OR lower(replace(coalesce(up.display_name, ''), ' ', '')) = tokens.token;
$$;

-- ============================================================================
-- TRIGGERS: notifications (reply / quote / mention)
-- ============================================================================
CREATE OR REPLACE FUNCTION notify_forum_post()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    thread_author UUID;
    parent_author UUID;
    mentioned UUID;
BEGIN
    SELECT author_id INTO thread_author
    FROM public.forum_threads WHERE id = NEW.thread_id;

    -- Reply notification for the thread author
    IF thread_author IS NOT NULL AND thread_author <> NEW.author_id THEN
        INSERT INTO public.forum_notifications (user_id, actor_id, thread_id, post_id, type)
        VALUES (thread_author, NEW.author_id, NEW.thread_id, NEW.id, 'reply');
    END IF;

    -- Quote notification for the quoted post's author
    IF NEW.parent_post_id IS NOT NULL THEN
        SELECT author_id INTO parent_author
        FROM public.forum_posts WHERE id = NEW.parent_post_id;

        IF parent_author IS NOT NULL
           AND parent_author <> NEW.author_id
           AND parent_author IS DISTINCT FROM thread_author THEN
            INSERT INTO public.forum_notifications (user_id, actor_id, thread_id, post_id, type)
            VALUES (parent_author, NEW.author_id, NEW.thread_id, NEW.id, 'quote');
        END IF;
    END IF;

    -- Mention notifications (skip self and anyone already notified above)
    FOR mentioned IN SELECT * FROM public.resolve_forum_mentions(NEW.body) LOOP
        IF mentioned <> NEW.author_id
           AND mentioned IS DISTINCT FROM thread_author
           AND mentioned IS DISTINCT FROM parent_author THEN
            INSERT INTO public.forum_notifications (user_id, actor_id, thread_id, post_id, type)
            VALUES (mentioned, NEW.author_id, NEW.thread_id, NEW.id, 'mention');
        END IF;
    END LOOP;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_notify_forum_post
    AFTER INSERT ON forum_posts
    FOR EACH ROW EXECUTE FUNCTION notify_forum_post();

CREATE OR REPLACE FUNCTION notify_forum_thread()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    mentioned UUID;
BEGIN
    FOR mentioned IN SELECT * FROM public.resolve_forum_mentions(NEW.body) LOOP
        IF mentioned <> NEW.author_id THEN
            INSERT INTO public.forum_notifications (user_id, actor_id, thread_id, post_id, type)
            VALUES (mentioned, NEW.author_id, NEW.id, NULL, 'mention');
        END IF;
    END LOOP;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_notify_forum_thread
    AFTER INSERT ON forum_threads
    FOR EACH ROW EXECUTE FUNCTION notify_forum_thread();

-- ============================================================================
-- SEARCH RPC
-- Runs as invoker so table RLS applies. Returns matching threads, ranked,
-- with a highlighted snippet; matches in replies surface their thread.
-- ============================================================================
CREATE OR REPLACE FUNCTION search_forum(search_query TEXT, max_results INTEGER DEFAULT 20)
RETURNS TABLE (
    thread_id UUID,
    title TEXT,
    category_id UUID,
    snippet TEXT,
    rank REAL,
    matched_in TEXT,
    reply_count INTEGER,
    last_activity_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
    WITH q AS (
        SELECT websearch_to_tsquery('english', search_query) AS tsq
    ),
    thread_matches AS (
        SELECT
            t.id AS thread_id,
            t.title,
            t.category_id,
            ts_headline('english', t.body, q.tsq,
                'MaxWords=25, MinWords=10, MaxFragments=1') AS snippet,
            ts_rank(t.search_tsv, q.tsq) AS rank,
            'thread'::TEXT AS matched_in,
            t.reply_count,
            t.last_activity_at
        FROM public.forum_threads t, q
        WHERE t.search_tsv @@ q.tsq
    ),
    post_matches AS (
        SELECT DISTINCT ON (p.thread_id)
            p.thread_id,
            t.title,
            t.category_id,
            ts_headline('english', p.body, q.tsq,
                'MaxWords=25, MinWords=10, MaxFragments=1') AS snippet,
            ts_rank(p.search_tsv, q.tsq) AS rank,
            'reply'::TEXT AS matched_in,
            t.reply_count,
            t.last_activity_at
        FROM public.forum_posts p
        JOIN public.forum_threads t ON t.id = p.thread_id, q
        WHERE p.search_tsv @@ q.tsq
        ORDER BY p.thread_id, ts_rank(p.search_tsv, q.tsq) DESC
    ),
    combined AS (
        SELECT * FROM thread_matches
        UNION ALL
        SELECT * FROM post_matches pm
        WHERE NOT EXISTS (
            SELECT 1 FROM thread_matches tm WHERE tm.thread_id = pm.thread_id
        )
    )
    SELECT * FROM combined
    ORDER BY rank DESC, last_activity_at DESC
    LIMIT LEAST(GREATEST(max_results, 1), 50);
$$;

GRANT EXECUTE ON FUNCTION search_forum(TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION user_is_forum_moderator(UUID) TO authenticated;

-- ============================================================================
-- COMMENTS
-- ============================================================================
COMMENT ON TABLE forum_categories IS 'Community forum boards (seeded; managed via service role)';
COMMENT ON TABLE forum_threads IS 'Community-wide forum threads (Cafe redesign, 2026-07)';
COMMENT ON TABLE forum_posts IS 'Replies within forum threads; parent_post_id = quoted post';
COMMENT ON TABLE forum_reactions IS 'Emoji reactions on threads or posts (exactly one target)';
COMMENT ON TABLE forum_thread_reads IS 'Per-user last-read markers for unread indicators';
COMMENT ON TABLE forum_notifications IS 'In-app forum notifications; rows created only by triggers';
COMMENT ON TABLE forum_moderators IS 'Users allowed to pin/lock/delete any forum content';
COMMENT ON FUNCTION resolve_forum_mentions(TEXT) IS 'Resolves @DisplayName (spaces removed) tokens to user ids';
