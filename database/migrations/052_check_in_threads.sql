-- Migration: Add check-in conversation threading
-- Allows users to ask follow-up questions about coaching check-ins
-- by linking coach_conversations messages to a specific check_in_id.

-- Add check_in_id column to coach_conversations for linking threads to check-ins
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'coach_conversations' AND column_name = 'check_in_id'
    ) THEN
        ALTER TABLE coach_conversations
        ADD COLUMN check_in_id UUID REFERENCES coach_check_ins(id) ON DELETE SET NULL;
    END IF;
END $$;

-- Index for efficient lookup of messages by check-in
CREATE INDEX IF NOT EXISTS idx_coach_conv_check_in
    ON coach_conversations(check_in_id, timestamp ASC)
    WHERE check_in_id IS NOT NULL;
