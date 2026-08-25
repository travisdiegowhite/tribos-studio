-- ============================================================================
-- Migration 117: calendar_change_proposals
--
-- The approval substrate for the coach's `calendar_change` tool. The SERVER
-- decides whether an operation applies immediately or lands here as a
-- proposal — never the model. See api/utils/calendarChangeTool.js
-- (adjudicateOps) for the rule.
--
-- This deliberately reuses the DESIGN of `coach_correction_proposals` and
-- none of its constraints. That table is a well-shaped propose/approve
-- substrate that has never run a single time in production: RLS is enabled
-- on it with ZERO policies, which is deny-all, so the browser client that
-- reads proposals gets nothing back. It holds zero rows, and its trigger log
-- holds zero rows. Three things are fixed here:
--
--   1. REAL RLS POLICIES (the reason the old table was inert).
--   2. Targets are pinned at PROPOSE time. `check-in-apply.js:297` resolves
--      selectors like 'next_quality' at APPLY time, so with any approval
--      delay the athlete accepts one session and a different one changes.
--      `ops` here stores concrete calendar_entries ids, resolved once, when
--      the proposal is written.
--   3. `entry_ids` is a generated column so the FK-less references in `ops`
--      are still queryable — calendar_entries rows can be deleted by the
--      athlete while a proposal is pending, and the apply path must notice
--      that rather than fail opaquely.
--
-- Ops shape (jsonb array), each element:
--   { "op": "create|update|move|delete|set_status",
--     "entry_id": "<uuid|null for create>",
--     "handle":   "<sess_xxxxxxxx as shown to the model>",
--     "before":   { ...fields as they are now, for the diff card and undo },
--     "after":    { ...fields to write },
--     "reason":   "one sentence, coach voice" }
-- ============================================================================

CREATE TABLE IF NOT EXISTS calendar_change_proposals (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Why the server withheld this instead of applying it. Mirrors the
  -- adjudicator's own reason strings so the card can explain itself.
  reason_code   text NOT NULL
                  CHECK (reason_code IN ('multi_entry', 'pinned', 'completed', 'mixed')),
  summary       text,
  ops           jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- Flattened targets, so "does this proposal still refer to live rows?" is a
  -- plain indexed query rather than a jsonb walk at apply time. Generated
  -- columns must be IMMUTABLE, which rules out ARRAY(SELECT
  -- jsonb_array_elements(...)) — a set-returning subquery. jsonb_path_query_array
  -- is immutable (provolatile 'i') and the `? (@ != null)` filter drops the
  -- create ops, which have no target yet.
  entry_ids     jsonb GENERATED ALWAYS AS (
                  jsonb_path_query_array(ops, '$[*].entry_id ? (@ != null)')
                ) STORED,

  outcome       text NOT NULL DEFAULT 'pending'
                  CHECK (outcome IN ('pending', 'accepted', 'rejected', 'partial', 'expired')),
  outcome_at    timestamptz,
  -- Which ops the athlete actually ticked. Empty on a full accept (meaning
  -- "all of them"); populated on a partial.
  accepted_handles jsonb NOT NULL DEFAULT '[]'::jsonb,

  conversation_id uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_calendar_change_proposals_pending
  ON calendar_change_proposals (user_id, created_at DESC)
  WHERE outcome = 'pending';

CREATE INDEX IF NOT EXISTS idx_calendar_change_proposals_entries
  ON calendar_change_proposals USING GIN (entry_ids);

ALTER TABLE calendar_change_proposals ENABLE ROW LEVEL SECURITY;

-- THE fix relative to coach_correction_proposals. One policy, keyed on the
-- athlete, matching calendar_entries. Without this the table is deny-all and
-- the feature is inert in exactly the way its predecessor was.
DROP POLICY IF EXISTS "Athletes manage their own calendar proposals"
  ON calendar_change_proposals;
CREATE POLICY "Athletes manage their own calendar proposals"
  ON calendar_change_proposals
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_calendar_change_proposals_updated_at
  ON calendar_change_proposals;
CREATE TRIGGER update_calendar_change_proposals_updated_at
  BEFORE UPDATE ON calendar_change_proposals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE calendar_change_proposals IS
  'Coach calendar changes withheld for the athlete to accept or reject. The server decides what lands here; the model never does. Targets are concrete calendar_entries ids pinned at propose time, never selectors resolved at apply time.';
COMMENT ON COLUMN calendar_change_proposals.reason_code IS
  'Why the server proposed rather than applied: multi_entry (more than one existing entry modified), pinned (target was athlete-touched), completed (target already done), mixed (more than one of the above).';
COMMENT ON COLUMN calendar_change_proposals.entry_ids IS
  'Generated from ops[].entry_id so the apply path can cheaply check whether every target still exists. There is no FK — a target deleted while pending must surface as a skipped op, not a constraint error.';

-- Sanity: the entry_ids expression must stay immutable. If a future edit
-- reaches for a set-returning function here, Postgres rejects the ALTER
-- rather than silently degrading, which is the behaviour we want.
