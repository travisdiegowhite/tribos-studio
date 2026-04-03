-- Migration: Add race_goal_id to coach_conversations
-- Enables race-scoped chat threads in the Race tab

ALTER TABLE coach_conversations
  ADD COLUMN IF NOT EXISTS race_goal_id UUID REFERENCES race_goals(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_coach_conv_race_goal_id ON coach_conversations(race_goal_id);
