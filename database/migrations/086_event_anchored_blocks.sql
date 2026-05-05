-- ============================================================================
-- Migration 086: Event-Anchored Training Plan System (Phase 1 foundation)
--
-- Adds the schema needed to run the new block-based, event-anchored planner
-- alongside the existing template-based system. Phase 1 does NOT replace any
-- existing tables; both planners run in parallel behind a feature flag.
--
-- See docs spec §7 (Data Model) and §3 (Masters Mode) for shape rationale.
--
-- Adds:
--   1. user_profiles.recovery_mode      — 'standard' | 'conservative' | 'adaptive'
--   2. user_profiles.masters_factor     — JSONB coefficient snapshot
--   3. user_profiles.feature_flags      — JSONB flag bag (general-purpose)
--   4. block_instances                  — runtime block per user
--   5. sequences                        — collection of blocks (audit)
--   6. session_prescriptions            — denormalized per-day prescription
--   7. block_modifications              — modification audit trail
-- ============================================================================

-- ============================================================================
-- 1-3. user_profiles columns
-- ============================================================================

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS recovery_mode TEXT
    CHECK (recovery_mode IN ('standard', 'conservative', 'adaptive'));

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS masters_factor JSONB;

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS feature_flags JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN user_profiles.recovery_mode IS
  'Masters recovery mode: standard | conservative | adaptive. Defaults applied in app: Conservative >=45, Adaptive 35-44, Standard <35.';
COMMENT ON COLUMN user_profiles.masters_factor IS
  'Snapshot of MastersFactor coefficients (recovery_block_days_added, hit_spacing_hours, afi_growth_ceiling_4d, afi_tfi_gate, fs_recovery_target).';
COMMENT ON COLUMN user_profiles.feature_flags IS
  'General-purpose feature flag bag. Phase 1 uses event_anchored_planner (boolean).';


-- ============================================================================
-- 4. block_instances
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.block_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  block_type TEXT NOT NULL
    CHECK (block_type IN (
      'recovery', 'reactivation', 'aerobic_build', 'threshold',
      'vo2', 'race_specific', 'taper', 'maintenance'
    )),

  start_date DATE NOT NULL,
  end_date DATE NOT NULL,

  status TEXT NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned', 'active', 'completed', 'skipped')),

  source TEXT NOT NULL DEFAULT 'sequencer'
    CHECK (source IN ('sequencer', 'manual')),

  -- Anchor race (NULL for open-horizon / maintenance blocks)
  parent_event_id UUID REFERENCES public.race_goals(id) ON DELETE SET NULL,
  parent_event_tier TEXT
    CHECK (parent_event_tier IS NULL OR parent_event_tier IN ('A', 'B', 'C')),

  -- Targets computed at block generation time
  target_tfi_delta NUMERIC(6, 2),
  target_afi_ceiling NUMERIC(6, 2),
  target_fs_at_exit NUMERIC(6, 2),

  -- Snapshot of MastersFactor at block creation (so block executes deterministically
  -- even if user changes recovery_mode mid-block)
  coefficients_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Sequence membership (set when created by /api/sequencer-*)
  sequence_id UUID,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  modified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  modified_by TEXT NOT NULL DEFAULT 'system'
    CHECK (modified_by IN ('system', 'user'))
);

CREATE INDEX IF NOT EXISTS idx_block_instances_user_active
  ON public.block_instances (user_id, status, start_date)
  WHERE status IN ('planned', 'active');

CREATE INDEX IF NOT EXISTS idx_block_instances_user_dates
  ON public.block_instances (user_id, start_date, end_date);

CREATE INDEX IF NOT EXISTS idx_block_instances_parent_event
  ON public.block_instances (parent_event_id)
  WHERE parent_event_id IS NOT NULL;

ALTER TABLE public.block_instances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own block instances" ON public.block_instances;
CREATE POLICY "Users manage own block instances" ON public.block_instances
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role manages all block instances" ON public.block_instances;
CREATE POLICY "Service role manages all block instances" ON public.block_instances
  FOR ALL USING (auth.role() = 'service_role');

GRANT SELECT, INSERT, UPDATE, DELETE ON public.block_instances TO authenticated;
GRANT ALL ON public.block_instances TO service_role;


-- ============================================================================
-- 5. sequences
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Anchor event for the sequence horizon (NULL = open-horizon / maintenance)
  horizon_event_id UUID REFERENCES public.race_goals(id) ON DELETE SET NULL,

  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  validation_status TEXT NOT NULL DEFAULT 'valid'
    CHECK (validation_status IN ('valid', 'warning', 'conflict')),

  validation_messages JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- True only for the user's currently in-effect sequence; superseded
  -- sequences are kept for audit but is_active = false.
  is_active BOOLEAN NOT NULL DEFAULT true,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sequences_user_active
  ON public.sequences (user_id, is_active, generated_at DESC)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_sequences_user_history
  ON public.sequences (user_id, generated_at DESC);

ALTER TABLE public.sequences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own sequences" ON public.sequences;
CREATE POLICY "Users manage own sequences" ON public.sequences
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role manages all sequences" ON public.sequences;
CREATE POLICY "Service role manages all sequences" ON public.sequences
  FOR ALL USING (auth.role() = 'service_role');

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sequences TO authenticated;
GRANT ALL ON public.sequences TO service_role;

-- Backfill the FK from block_instances.sequence_id now that sequences exists
ALTER TABLE public.block_instances
  DROP CONSTRAINT IF EXISTS block_instances_sequence_id_fkey;
ALTER TABLE public.block_instances
  ADD CONSTRAINT block_instances_sequence_id_fkey
  FOREIGN KEY (sequence_id) REFERENCES public.sequences(id) ON DELETE SET NULL;


-- ============================================================================
-- 6. session_prescriptions
-- ============================================================================
--
-- One row per (user_id, date). Denormalized off block_instances + block library
-- generators for fast TODAY-screen reads. The /today endpoint reads here first;
-- if missing, generates on-the-fly and inserts.

CREATE TABLE IF NOT EXISTS public.session_prescriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  block_id UUID NOT NULL REFERENCES public.block_instances(id) ON DELETE CASCADE,

  date DATE NOT NULL,

  session_type TEXT NOT NULL
    CHECK (session_type IN (
      'rest', 'z1', 'z2', 'tempo', 'threshold', 'vo2',
      'race_sim', 'opener'
    )),

  target_rss NUMERIC(6, 2) NOT NULL DEFAULT 0,
  target_duration_min INTEGER NOT NULL DEFAULT 0,

  -- Array of IntervalPrescription objects:
  --   [{ duration_min, target_pct_ftp_min, target_pct_ftp_max, recovery_min, repeats }]
  prescribed_intervals JSONB,

  long_ride_flag BOOLEAN NOT NULL DEFAULT false,

  notes TEXT,

  -- If the /today endpoint substituted a session due to gating rules
  gating_reason TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT session_prescriptions_user_date_unique UNIQUE (user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_session_prescriptions_user_date
  ON public.session_prescriptions (user_id, date);

CREATE INDEX IF NOT EXISTS idx_session_prescriptions_block
  ON public.session_prescriptions (block_id);

ALTER TABLE public.session_prescriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own session prescriptions" ON public.session_prescriptions;
CREATE POLICY "Users manage own session prescriptions" ON public.session_prescriptions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role manages all session prescriptions" ON public.session_prescriptions;
CREATE POLICY "Service role manages all session prescriptions" ON public.session_prescriptions
  FOR ALL USING (auth.role() = 'service_role');

GRANT SELECT, INSERT, UPDATE, DELETE ON public.session_prescriptions TO authenticated;
GRANT ALL ON public.session_prescriptions TO service_role;


-- ============================================================================
-- 7. block_modifications
-- ============================================================================
--
-- Audit trail: every system or user modification of a block_instance writes
-- a row here. Phase 1 only writes "extension"/"compression" reasons used by
-- the Coach Intel Strip; Phase 4 adds manual override entries.

CREATE TABLE IF NOT EXISTS public.block_modifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  block_id UUID NOT NULL REFERENCES public.block_instances(id) ON DELETE CASCADE,

  modified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  modified_by TEXT NOT NULL
    CHECK (modified_by IN ('system', 'user')),

  -- Human-readable explanation surfaced via the Coach Intel Strip
  reason TEXT NOT NULL,

  before JSONB,
  after JSONB,

  -- Has the user seen + dismissed the strip message? (Phase 1 surface)
  acknowledged BOOLEAN NOT NULL DEFAULT false,
  acknowledged_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_block_modifications_user_unread
  ON public.block_modifications (user_id, acknowledged, modified_at DESC)
  WHERE acknowledged = false;

CREATE INDEX IF NOT EXISTS idx_block_modifications_block
  ON public.block_modifications (block_id, modified_at DESC);

ALTER TABLE public.block_modifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own block modifications" ON public.block_modifications;
CREATE POLICY "Users read own block modifications" ON public.block_modifications
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users update own block modifications" ON public.block_modifications;
CREATE POLICY "Users update own block modifications" ON public.block_modifications
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role manages all block modifications" ON public.block_modifications;
CREATE POLICY "Service role manages all block modifications" ON public.block_modifications
  FOR ALL USING (auth.role() = 'service_role');

GRANT SELECT, UPDATE ON public.block_modifications TO authenticated;
GRANT ALL ON public.block_modifications TO service_role;


-- ============================================================================
-- Verification queries (run after applying):
--   SELECT COUNT(*) FROM public.block_instances;
--   SELECT COUNT(*) FROM public.sequences;
--   SELECT COUNT(*) FROM public.session_prescriptions;
--   SELECT COUNT(*) FROM public.block_modifications;
--   SELECT column_name, data_type FROM information_schema.columns
--     WHERE table_name = 'user_profiles'
--     AND column_name IN ('recovery_mode', 'masters_factor', 'feature_flags');
-- ============================================================================
