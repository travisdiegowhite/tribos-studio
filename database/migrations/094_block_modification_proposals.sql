-- 094_block_modification_proposals.sql
--
-- Phase 1 (proactive coach): turn `block_modifications` into a suggest-and-confirm
-- surface. Until now it was audit-only — a row explained a change the sequencer
-- had ALREADY made, and the athlete could only acknowledge/dispute it.
--
-- New columns let a row instead carry a *proposed* set of prescription changes
-- (e.g. "your last ride spiked fatigue — ease the next two quality days") that
-- the athlete can Apply (writes session_prescriptions + re-projects to the
-- calendar) or Dismiss. Nothing is written until they tap Apply.
--
-- Existing rows default to 'informational' so current Coach Intel behavior is
-- unchanged.

ALTER TABLE public.block_modifications
  ADD COLUMN IF NOT EXISTS proposal_state TEXT NOT NULL DEFAULT 'informational'
    CHECK (proposal_state IN ('informational', 'proposed', 'applied', 'dismissed')),
  ADD COLUMN IF NOT EXISTS proposed_changes JSONB;

COMMENT ON COLUMN public.block_modifications.proposal_state IS
  'informational = audit of a change already applied (legacy default); proposed = actionable suggestion awaiting Apply/Dismiss; applied/dismissed = resolved.';
COMMENT ON COLUMN public.block_modifications.proposed_changes IS
  'For proposal_state=proposed: array of { date, block_id, before, after, gating_reason } the Apply action upserts into session_prescriptions.';

-- Fast lookup of open proposals for the Coach Intel strip.
CREATE INDEX IF NOT EXISTS idx_block_mods_open_proposals
  ON public.block_modifications (user_id, modified_at DESC)
  WHERE proposal_state = 'proposed';
