-- Migration 091: Route Builder coach conversations (Unit 4, PR-4A)
--
-- Scopes coach_conversations to a route so the Route Builder's
-- conversational refinement surface can persist a per-route thread,
-- and adds the 'route_edit' message_type for those turns.
--
-- Follows the precedent of migration 052 (check_in_id): a scope column
-- + a partial index, no new table. Existing queries are unaffected.

-- Scope key for route refinement conversations.
ALTER TABLE coach_conversations
  ADD COLUMN IF NOT EXISTS route_id UUID REFERENCES routes(id) ON DELETE SET NULL;

-- Partial index for fast per-route, time-ordered lookup.
CREATE INDEX IF NOT EXISTS idx_coach_conv_route_id
  ON coach_conversations (route_id, timestamp ASC)
  WHERE route_id IS NOT NULL;

-- Expand the message_type CHECK to include 'route_edit'. The original
-- inline constraint from migration 013 is named
-- coach_conversations_message_type_check.
ALTER TABLE coach_conversations
  DROP CONSTRAINT IF EXISTS coach_conversations_message_type_check;

ALTER TABLE coach_conversations
  ADD CONSTRAINT coach_conversations_message_type_check
  CHECK (message_type IN (
    'chat',
    'check_in',
    'weekly_plan',
    'commitment',
    'reflection',
    'notification',
    'route_edit'
  ));
