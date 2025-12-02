-- ============================================================================
-- AI Coach Conversations Table
-- Stores chat history between users and AI coach for context and review
-- ============================================================================

-- =====================================================
-- 1. CREATE TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS ai_coach_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- User reference
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Message content
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL CHECK (char_length(content) > 0 AND char_length(content) <= 10000),

  -- Structured data (for assistant messages)
  workout_recommendations JSONB DEFAULT NULL, -- Array of workout recommendations from tool use
  actions JSONB DEFAULT NULL, -- Array of action buttons shown
  training_context JSONB DEFAULT NULL, -- Snapshot of training context at time of message

  -- Topic classification for filtering
  topic TEXT CHECK (topic IN ('workouts', 'recovery', 'metrics', 'planning', 'general')),

  -- Status tracking
  is_archived BOOLEAN DEFAULT FALSE, -- Messages older than 14 days
  deleted_at TIMESTAMPTZ DEFAULT NULL, -- Soft delete

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CHECK (char_length(content) > 0)
);

-- =====================================================
-- 2. INDEXES
-- =====================================================

-- Primary query patterns
CREATE INDEX IF NOT EXISTS idx_coach_conv_user_created
  ON ai_coach_conversations(user_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_coach_conv_user_topic
  ON ai_coach_conversations(user_id, topic, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_coach_conv_archived
  ON ai_coach_conversations(user_id, is_archived, created_at DESC)
  WHERE deleted_at IS NULL;

-- Cleanup index
CREATE INDEX IF NOT EXISTS idx_coach_conv_cleanup
  ON ai_coach_conversations(created_at)
  WHERE deleted_at IS NULL;

-- =====================================================
-- 3. ROW LEVEL SECURITY
-- =====================================================

ALTER TABLE ai_coach_conversations ENABLE ROW LEVEL SECURITY;

-- Users can only see their own conversations
CREATE POLICY "Users can view own conversations"
  ON ai_coach_conversations
  FOR SELECT
  USING (auth.uid() = user_id AND deleted_at IS NULL);

-- Users can insert their own conversations
CREATE POLICY "Users can insert own conversations"
  ON ai_coach_conversations
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can soft-delete their own messages
CREATE POLICY "Users can delete own conversations"
  ON ai_coach_conversations
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Service role can do everything (for cleanup functions)
CREATE POLICY "Service role full access"
  ON ai_coach_conversations
  FOR ALL
  USING (auth.role() = 'service_role');

-- =====================================================
-- 4. HELPER FUNCTIONS
-- =====================================================

/**
 * Auto-archive messages older than 14 days
 * This marks them as archived but keeps them viewable in history
 */
CREATE OR REPLACE FUNCTION archive_old_coach_conversations()
RETURNS INTEGER AS $$
DECLARE
  archived_count INTEGER;
BEGIN
  UPDATE ai_coach_conversations
  SET is_archived = TRUE
  WHERE created_at < NOW() - INTERVAL '14 days'
    AND is_archived = FALSE
    AND deleted_at IS NULL;

  GET DIAGNOSTICS archived_count = ROW_COUNT;

  RETURN archived_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION archive_old_coach_conversations IS
'Marks conversations older than 14 days as archived. Run daily via cron.';

/**
 * Permanently delete soft-deleted messages older than 90 days
 * This is the final cleanup after messages have been soft-deleted
 */
CREATE OR REPLACE FUNCTION cleanup_deleted_coach_conversations()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM ai_coach_conversations
  WHERE deleted_at IS NOT NULL
    AND deleted_at < NOW() - INTERVAL '90 days';

  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION cleanup_deleted_coach_conversations IS
'Permanently deletes soft-deleted messages older than 90 days. Run weekly via cron.';

/**
 * Auto-classify message topic based on content
 * Uses keyword matching to assign topic for filtering
 */
CREATE OR REPLACE FUNCTION classify_conversation_topic(message_content TEXT, message_recommendations JSONB)
RETURNS TEXT AS $$
BEGIN
  -- If there are workout recommendations, it's about workouts
  IF message_recommendations IS NOT NULL AND jsonb_array_length(message_recommendations) > 0 THEN
    RETURN 'workouts';
  END IF;

  -- Keyword-based classification (case-insensitive)
  message_content := LOWER(message_content);

  IF message_content ~ 'workout|training plan|intervals|ride|exercise' THEN
    RETURN 'workouts';
  ELSIF message_content ~ 'recovery|rest|fatigue|tired|hrv|sleep' THEN
    RETURN 'recovery';
  ELSIF message_content ~ 'ctl|atl|tsb|ftp|metric|performance|power|heart rate' THEN
    RETURN 'metrics';
  ELSIF message_content ~ 'plan|schedule|week|goal|event|race' THEN
    RETURN 'planning';
  ELSE
    RETURN 'general';
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION classify_conversation_topic IS
'Auto-classifies conversation topic based on content and workout recommendations.';

-- =====================================================
-- 5. TRIGGERS
-- =====================================================

/**
 * Auto-set topic on insert if not provided
 */
CREATE OR REPLACE FUNCTION set_conversation_topic()
RETURNS TRIGGER AS $$
BEGIN
  -- Only auto-classify if topic not already set
  IF NEW.topic IS NULL THEN
    NEW.topic := classify_conversation_topic(NEW.content, NEW.workout_recommendations);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_set_conversation_topic
  BEFORE INSERT ON ai_coach_conversations
  FOR EACH ROW
  EXECUTE FUNCTION set_conversation_topic();

-- =====================================================
-- 6. TABLE COMMENTS
-- =====================================================

COMMENT ON TABLE ai_coach_conversations IS
'Stores AI coach chat history for context continuity and user review. Messages older than 14 days are archived but viewable. Soft-deleted messages are permanently removed after 90 days.';

COMMENT ON COLUMN ai_coach_conversations.role IS
'Message role: user (athlete), assistant (AI coach), or system';

COMMENT ON COLUMN ai_coach_conversations.workout_recommendations IS
'Array of workout recommendations if AI used recommend_workout tool';

COMMENT ON COLUMN ai_coach_conversations.actions IS
'Array of action buttons shown with this message (e.g., view_workouts, generate_route)';

COMMENT ON COLUMN ai_coach_conversations.training_context IS
'Snapshot of training metrics (CTL, ATL, TSB) at time of conversation for historical analysis';

COMMENT ON COLUMN ai_coach_conversations.topic IS
'Auto-classified topic for filtering: workouts, recovery, metrics, planning, general';

COMMENT ON COLUMN ai_coach_conversations.is_archived IS
'True for messages older than 14 days - still viewable but not loaded by default';

COMMENT ON COLUMN ai_coach_conversations.deleted_at IS
'Soft delete timestamp - message hidden from user but kept for 90 days';

-- =====================================================
-- 7. CRON JOB SETUP INSTRUCTIONS
-- =====================================================

-- To set up automatic cleanup via Supabase Dashboard > Database > Cron Jobs:
--
-- Job 1: Archive old conversations (daily at 2 AM)
-- Schedule: 0 2 * * *
-- SQL: SELECT archive_old_coach_conversations();
--
-- Job 2: Cleanup deleted conversations (weekly Sunday at 3 AM)
-- Schedule: 0 3 * * 0
-- SQL: SELECT cleanup_deleted_coach_conversations();

-- =====================================================
-- 8. VERIFICATION
-- =====================================================

-- Verify table creation
SELECT 'ai_coach_conversations table created successfully' as status;

-- Show table structure
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'ai_coach_conversations'
ORDER BY ordinal_position;

-- Verify indexes
SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'ai_coach_conversations';

-- Verify RLS is enabled
SELECT
  tablename,
  rowsecurity
FROM pg_tables
WHERE tablename = 'ai_coach_conversations';
