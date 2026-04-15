-- 070: training_load_daily — spec §2 column rename (additive, B2)
--
-- Adds the spec §2 canonical columns alongside the legacy ones. The
-- upsertTrainingLoadDaily helper dual-writes both during the B2→B4
-- rollout window. Reader cut-over is B3; drop of legacy columns is B4.
--
-- Rename mapping:
--   tss         → rss           (Ride Stress Score)
--   ctl         → tfi           (Training Fitness Index)
--   atl         → afi           (Acute Fatigue Index)
--   tsb         → form_score    (Form Score)
--   tss_source  → rss_source
--
-- New columns (no legacy twin):
--   tfi_composition  — jsonb {aerobic_fraction, threshold_fraction, high_intensity_fraction}
--   tfi_tau          — integer, snapshot of tau used for this row's TFI
--   afi_tau          — numeric(4,1), snapshot of tau used for this row's AFI
--
-- `confidence`, `fs_confidence`, and `terrain_class` are generic names and
-- are NOT renamed. rss_source's CHECK mirrors the widened tss_source check
-- from migration 067 (D1: 6-tier enum).

ALTER TABLE public.training_load_daily
  ADD COLUMN IF NOT EXISTS rss numeric(6,2),
  ADD COLUMN IF NOT EXISTS tfi numeric(6,2),
  ADD COLUMN IF NOT EXISTS afi numeric(6,2),
  ADD COLUMN IF NOT EXISTS form_score numeric(6,2),
  ADD COLUMN IF NOT EXISTS rss_source text,
  ADD COLUMN IF NOT EXISTS tfi_composition jsonb,
  ADD COLUMN IF NOT EXISTS tfi_tau integer,
  ADD COLUMN IF NOT EXISTS afi_tau numeric(4,1);

ALTER TABLE public.training_load_daily
  DROP CONSTRAINT IF EXISTS training_load_daily_rss_source_check;
ALTER TABLE public.training_load_daily
  ADD CONSTRAINT training_load_daily_rss_source_check
    CHECK (rss_source IS NULL OR rss_source IN
      ('device', 'power', 'kilojoules', 'hr', 'rpe', 'inferred'));

COMMENT ON COLUMN public.training_load_daily.rss IS
  'Ride Stress Score — terrain-adjusted daily training stress. Spec §3.1. Dual-written with tss during B2→B4 rollout; reader cut-over in B3.';
COMMENT ON COLUMN public.training_load_daily.tfi IS
  'Training Fitness Index — adaptive EWMA of RSS. Spec §3.4. Dual-written with ctl during B2→B4 rollout.';
COMMENT ON COLUMN public.training_load_daily.afi IS
  'Acute Fatigue Index — adaptive short EWA of RSS. Spec §3.5. Dual-written with atl during B2→B4 rollout.';
COMMENT ON COLUMN public.training_load_daily.form_score IS
  'Form Score — yesterday''s TFI minus yesterday''s AFI. Spec §3.6. Dual-written with tsb during B2→B4 rollout.';
COMMENT ON COLUMN public.training_load_daily.rss_source IS
  'RSS source tier: device | power | kilojoules | hr | rpe | inferred (D1 amendment, 6 tiers). Dual-written with tss_source.';
COMMENT ON COLUMN public.training_load_daily.tfi_composition IS
  'Zone breakdown of TFI: {aerobic_fraction, threshold_fraction, high_intensity_fraction}. Populated in B6.';
COMMENT ON COLUMN public.training_load_daily.tfi_tau IS
  'Snapshot of tfi_tau at compute time (useful for historical reconstruction when a user''s adaptive tau changes).';
COMMENT ON COLUMN public.training_load_daily.afi_tau IS
  'Snapshot of afi_tau at compute time.';
