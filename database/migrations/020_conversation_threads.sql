-- Migration: Conversation Threads
-- Adds collapsible, topic-based conversation threads for AI coaches
-- Supports cross-thread linking between Training Strategist and Pulse

-- ============================================================================
-- CONVERSATION_THREADS TABLE
-- Groups related messages into collapsible threads with AI-generated titles
-- ============================================================================
CREATE TABLE IF NOT EXISTS conversation_threads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Coach identification
    coach_type TEXT NOT NULL CHECK (coach_type IN ('strategist', 'pulse')),

    -- Thread metadata
    title TEXT NOT NULL DEFAULT 'New Conversation',
    summary TEXT, -- One-line summary for collapsed view

    -- Status
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),

    -- Timestamps
    started_at TIMESTAMPTZ DEFAULT NOW(),
    last_message_at TIMESTAMPTZ DEFAULT NOW(),

    -- Stats
    message_count INTEGER DEFAULT 0,

    -- Cross-thread linking (references to related threads)
    linked_thread_ids UUID[] DEFAULT ARRAY[]::UUID[],

    -- Tracking
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for conversation_threads
CREATE INDEX IF NOT EXISTS idx_conv_threads_user_id ON conversation_threads(user_id);
CREATE INDEX IF NOT EXISTS idx_conv_threads_coach_type ON conversation_threads(coach_type);
CREATE INDEX IF NOT EXISTS idx_conv_threads_status ON conversation_threads(status);
CREATE INDEX IF NOT EXISTS idx_conv_threads_user_coach ON conversation_threads(user_id, coach_type);
CREATE INDEX IF NOT EXISTS idx_conv_threads_last_message ON conversation_threads(user_id, last_message_at DESC);

-- ============================================================================
-- UPDATE COACH_CONVERSATIONS TABLE
-- Add coach_type column for direct identification
-- ============================================================================
DO $$
BEGIN
    -- Add coach_type column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'coach_conversations' AND column_name = 'coach_type'
    ) THEN
        ALTER TABLE coach_conversations
        ADD COLUMN coach_type TEXT CHECK (coach_type IN ('strategist', 'pulse'));
    END IF;
END $$;

-- Create index on coach_type
CREATE INDEX IF NOT EXISTS idx_coach_conv_coach_type ON coach_conversations(coach_type);

-- Create composite index for efficient thread queries
CREATE INDEX IF NOT EXISTS idx_coach_conv_thread_time ON coach_conversations(thread_id, timestamp DESC)
WHERE thread_id IS NOT NULL;

-- ============================================================================
-- ENABLE ROW LEVEL SECURITY
-- ============================================================================
ALTER TABLE conversation_threads ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- RLS POLICIES - Conversation Threads
-- ============================================================================
DROP POLICY IF EXISTS "Users can view their own threads" ON conversation_threads;
CREATE POLICY "Users can view their own threads"
    ON conversation_threads FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own threads" ON conversation_threads;
CREATE POLICY "Users can insert their own threads"
    ON conversation_threads FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own threads" ON conversation_threads;
CREATE POLICY "Users can update their own threads"
    ON conversation_threads FOR UPDATE
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own threads" ON conversation_threads;
CREATE POLICY "Users can delete their own threads"
    ON conversation_threads FOR DELETE
    USING (auth.uid() = user_id);

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================
GRANT ALL ON conversation_threads TO authenticated;
GRANT ALL ON conversation_threads TO service_role;

-- ============================================================================
-- TRIGGER: Update timestamps
-- ============================================================================
DROP TRIGGER IF EXISTS trigger_conversation_threads_updated_at ON conversation_threads;
CREATE TRIGGER trigger_conversation_threads_updated_at
    BEFORE UPDATE ON conversation_threads
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- FUNCTION: Update thread stats when message is added
-- ============================================================================
CREATE OR REPLACE FUNCTION update_thread_stats()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.thread_id IS NOT NULL THEN
        UPDATE conversation_threads
        SET
            message_count = message_count + 1,
            last_message_at = NEW.timestamp,
            updated_at = NOW()
        WHERE id = NEW.thread_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_thread_stats ON coach_conversations;
CREATE TRIGGER trigger_update_thread_stats
    AFTER INSERT ON coach_conversations
    FOR EACH ROW
    EXECUTE FUNCTION update_thread_stats();

-- ============================================================================
-- FUNCTION: Get or create active thread for a user/coach combination
-- Used when starting a new conversation or continuing after time gap
-- ============================================================================
CREATE OR REPLACE FUNCTION get_or_create_thread(
    p_user_id UUID,
    p_coach_type TEXT,
    p_time_gap_hours INTEGER DEFAULT 4
) RETURNS UUID AS $$
DECLARE
    v_thread_id UUID;
    v_last_message TIMESTAMPTZ;
BEGIN
    -- Find the most recent active thread for this user/coach
    SELECT id, last_message_at INTO v_thread_id, v_last_message
    FROM conversation_threads
    WHERE user_id = p_user_id
      AND coach_type = p_coach_type
      AND status = 'active'
    ORDER BY last_message_at DESC
    LIMIT 1;

    -- If no thread exists or last message was more than p_time_gap_hours ago, create new thread
    IF v_thread_id IS NULL OR
       v_last_message < (NOW() - (p_time_gap_hours || ' hours')::INTERVAL) THEN
        INSERT INTO conversation_threads (user_id, coach_type, title, status)
        VALUES (p_user_id, p_coach_type, 'New Conversation', 'active')
        RETURNING id INTO v_thread_id;
    END IF;

    RETURN v_thread_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FUNCTION: Link two threads together (bidirectional)
-- ============================================================================
CREATE OR REPLACE FUNCTION link_threads(
    p_thread_id_1 UUID,
    p_thread_id_2 UUID
) RETURNS VOID AS $$
BEGIN
    -- Add thread 2 to thread 1's links if not already present
    UPDATE conversation_threads
    SET linked_thread_ids = array_append(
        COALESCE(linked_thread_ids, ARRAY[]::UUID[]),
        p_thread_id_2
    )
    WHERE id = p_thread_id_1
      AND NOT (p_thread_id_2 = ANY(COALESCE(linked_thread_ids, ARRAY[]::UUID[])));

    -- Add thread 1 to thread 2's links if not already present
    UPDATE conversation_threads
    SET linked_thread_ids = array_append(
        COALESCE(linked_thread_ids, ARRAY[]::UUID[]),
        p_thread_id_1
    )
    WHERE id = p_thread_id_2
      AND NOT (p_thread_id_1 = ANY(COALESCE(linked_thread_ids, ARRAY[]::UUID[])));
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- MIGRATION: Backfill existing conversations into threads
-- Groups existing messages by date and creates threads for them
-- ============================================================================
DO $$
DECLARE
    r RECORD;
    v_thread_id UUID;
    v_current_user UUID;
    v_current_coach TEXT;
    v_current_date DATE;
    v_last_timestamp TIMESTAMPTZ;
BEGIN
    -- Process existing conversations and group into threads by user, coach_type, and date
    FOR r IN (
        SELECT DISTINCT
            user_id,
            COALESCE(
                CASE
                    WHEN context_snapshot->>'coach_type' = 'training' THEN 'strategist'
                    ELSE 'pulse'
                END,
                'pulse'
            ) as coach_type,
            DATE(timestamp) as msg_date,
            MIN(timestamp) as first_msg,
            MAX(timestamp) as last_msg,
            COUNT(*) as msg_count
        FROM coach_conversations
        WHERE thread_id IS NULL
        GROUP BY user_id,
                 COALESCE(
                     CASE
                         WHEN context_snapshot->>'coach_type' = 'training' THEN 'strategist'
                         ELSE 'pulse'
                     END,
                     'pulse'
                 ),
                 DATE(timestamp)
        ORDER BY user_id, msg_date
    ) LOOP
        -- Create a thread for this group
        INSERT INTO conversation_threads (
            user_id,
            coach_type,
            title,
            status,
            started_at,
            last_message_at,
            message_count
        )
        VALUES (
            r.user_id,
            r.coach_type,
            'Conversation on ' || TO_CHAR(r.msg_date, 'Mon DD'),
            CASE WHEN r.msg_date < CURRENT_DATE THEN 'archived' ELSE 'active' END,
            r.first_msg,
            r.last_msg,
            r.msg_count
        )
        RETURNING id INTO v_thread_id;

        -- Update all messages in this group with the thread_id and coach_type
        UPDATE coach_conversations
        SET thread_id = v_thread_id,
            coach_type = r.coach_type
        WHERE user_id = r.user_id
          AND DATE(timestamp) = r.msg_date
          AND thread_id IS NULL
          AND COALESCE(
              CASE
                  WHEN context_snapshot->>'coach_type' = 'training' THEN 'strategist'
                  ELSE 'pulse'
              END,
              'pulse'
          ) = r.coach_type;
    END LOOP;
END $$;
