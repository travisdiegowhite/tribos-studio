-- Migration: Fix cafe foreign key relationships for PostgREST embedding
-- This adds explicit foreign keys to user_profiles so PostgREST can do embedded selects

-- ============================================================================
-- Add explicit FK from cafe_check_ins to user_profiles
-- ============================================================================

-- First ensure all user_ids in cafe_check_ins have corresponding user_profiles
-- This is a safety check - in production, you'd want to handle orphans differently
INSERT INTO user_profiles (id)
SELECT DISTINCT ci.user_id
FROM cafe_check_ins ci
LEFT JOIN user_profiles up ON ci.user_id = up.id
WHERE up.id IS NULL
ON CONFLICT (id) DO NOTHING;

-- Add the foreign key (if it doesn't exist)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'cafe_check_ins_user_id_profile_fkey'
        AND table_name = 'cafe_check_ins'
    ) THEN
        ALTER TABLE cafe_check_ins
        ADD CONSTRAINT cafe_check_ins_user_id_profile_fkey
        FOREIGN KEY (user_id) REFERENCES user_profiles(id) ON DELETE CASCADE;
    END IF;
END $$;

-- ============================================================================
-- Add explicit FK from cafe_memberships to user_profiles
-- ============================================================================

INSERT INTO user_profiles (id)
SELECT DISTINCT cm.user_id
FROM cafe_memberships cm
LEFT JOIN user_profiles up ON cm.user_id = up.id
WHERE up.id IS NULL
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'cafe_memberships_user_id_profile_fkey'
        AND table_name = 'cafe_memberships'
    ) THEN
        ALTER TABLE cafe_memberships
        ADD CONSTRAINT cafe_memberships_user_id_profile_fkey
        FOREIGN KEY (user_id) REFERENCES user_profiles(id) ON DELETE CASCADE;
    END IF;
END $$;

-- ============================================================================
-- Add explicit FK from cafe_encouragements to user_profiles
-- ============================================================================

INSERT INTO user_profiles (id)
SELECT DISTINCT ce.user_id
FROM cafe_encouragements ce
LEFT JOIN user_profiles up ON ce.user_id = up.id
WHERE up.id IS NULL
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'cafe_encouragements_user_id_profile_fkey'
        AND table_name = 'cafe_encouragements'
    ) THEN
        ALTER TABLE cafe_encouragements
        ADD CONSTRAINT cafe_encouragements_user_id_profile_fkey
        FOREIGN KEY (user_id) REFERENCES user_profiles(id) ON DELETE CASCADE;
    END IF;
END $$;

-- ============================================================================
-- Add explicit FK from cafe_discussions to user_profiles
-- ============================================================================

-- This will only apply if the cafe_discussions table exists (migration 028 ran)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'cafe_discussions') THEN
        -- Ensure all authors have profiles
        INSERT INTO user_profiles (id)
        SELECT DISTINCT cd.author_id
        FROM cafe_discussions cd
        LEFT JOIN user_profiles up ON cd.author_id = up.id
        WHERE up.id IS NULL
        ON CONFLICT (id) DO NOTHING;

        -- Add FK if not exists
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints
            WHERE constraint_name = 'cafe_discussions_author_id_profile_fkey'
            AND table_name = 'cafe_discussions'
        ) THEN
            ALTER TABLE cafe_discussions
            ADD CONSTRAINT cafe_discussions_author_id_profile_fkey
            FOREIGN KEY (author_id) REFERENCES user_profiles(id) ON DELETE CASCADE;
        END IF;
    END IF;
END $$;

-- ============================================================================
-- Add explicit FK from cafe_discussion_replies to user_profiles
-- ============================================================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'cafe_discussion_replies') THEN
        INSERT INTO user_profiles (id)
        SELECT DISTINCT cdr.author_id
        FROM cafe_discussion_replies cdr
        LEFT JOIN user_profiles up ON cdr.author_id = up.id
        WHERE up.id IS NULL
        ON CONFLICT (id) DO NOTHING;

        IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints
            WHERE constraint_name = 'cafe_discussion_replies_author_id_profile_fkey'
            AND table_name = 'cafe_discussion_replies'
        ) THEN
            ALTER TABLE cafe_discussion_replies
            ADD CONSTRAINT cafe_discussion_replies_author_id_profile_fkey
            FOREIGN KEY (author_id) REFERENCES user_profiles(id) ON DELETE CASCADE;
        END IF;
    END IF;
END $$;

-- ============================================================================
-- Add explicit FK from cafe_helpful_markers to user_profiles
-- ============================================================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'cafe_helpful_markers') THEN
        INSERT INTO user_profiles (id)
        SELECT DISTINCT chm.user_id
        FROM cafe_helpful_markers chm
        LEFT JOIN user_profiles up ON chm.user_id = up.id
        WHERE up.id IS NULL
        ON CONFLICT (id) DO NOTHING;

        IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints
            WHERE constraint_name = 'cafe_helpful_markers_user_id_profile_fkey'
            AND table_name = 'cafe_helpful_markers'
        ) THEN
            ALTER TABLE cafe_helpful_markers
            ADD CONSTRAINT cafe_helpful_markers_user_id_profile_fkey
            FOREIGN KEY (user_id) REFERENCES user_profiles(id) ON DELETE CASCADE;
        END IF;
    END IF;
END $$;

-- Add comment for documentation
COMMENT ON CONSTRAINT cafe_check_ins_user_id_profile_fkey ON cafe_check_ins IS
'Explicit FK to user_profiles for PostgREST embedded selects';
