-- 072: activities + fitness_snapshots — spec §2 additive rename (B9)
--
-- Adds the spec §2 canonical columns alongside the legacy ones on two
-- tables that store per-activity and weekly aggregates. Ingestion
-- writers are updated in the same PR to dual-write; readers stay on the
-- legacy names for now. Column drop and full reader cut-over are
-- deferred to a follow-up PR (large reader surface in api/ and src/).
--
-- activities:
--   normalized_power  → effective_power   (EP, spec §3.2)
--   intensity_factor  → ride_intensity    (RI, spec §3.3)
--   tss               → rss               (RSS, spec §3.1)
--
-- fitness_snapshots:
--   ctl                   → tfi
--   atl                   → afi
--   tsb                   → form_score
--   weekly_tss            → weekly_rss
--   avg_normalized_power  → avg_effective_power

ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS effective_power INTEGER,
  ADD COLUMN IF NOT EXISTS ride_intensity NUMERIC(4,3),
  ADD COLUMN IF NOT EXISTS rss NUMERIC;

COMMENT ON COLUMN public.activities.effective_power IS
  'Effective Power (EP) — spec §3.2 4th-power rolling average. Dual-written with normalized_power during B9 rollout.';
COMMENT ON COLUMN public.activities.ride_intensity IS
  'Ride Intensity (RI) — spec §3.3 effective_power / ftp. Dual-written with intensity_factor during B9 rollout.';
COMMENT ON COLUMN public.activities.rss IS
  'Ride Stress Score (RSS) — spec §3.1 terrain-adjusted training stress. Dual-written with tss during B9 rollout.';

ALTER TABLE public.fitness_snapshots
  ADD COLUMN IF NOT EXISTS tfi INTEGER,
  ADD COLUMN IF NOT EXISTS afi INTEGER,
  ADD COLUMN IF NOT EXISTS form_score INTEGER,
  ADD COLUMN IF NOT EXISTS weekly_rss INTEGER,
  ADD COLUMN IF NOT EXISTS avg_effective_power INTEGER;

COMMENT ON COLUMN public.fitness_snapshots.tfi IS
  'Training Fitness Index (TFI) — spec §3.4. Dual-written with ctl during B9 rollout.';
COMMENT ON COLUMN public.fitness_snapshots.afi IS
  'Acute Fatigue Index (AFI) — spec §3.5. Dual-written with atl during B9 rollout.';
COMMENT ON COLUMN public.fitness_snapshots.form_score IS
  'Form Score (FS) — spec §3.6. Dual-written with tsb during B9 rollout.';
COMMENT ON COLUMN public.fitness_snapshots.weekly_rss IS
  'Total Ride Stress Score for the snapshot week. Dual-written with weekly_tss.';
COMMENT ON COLUMN public.fitness_snapshots.avg_effective_power IS
  'Weekly average Effective Power (EP). Dual-written with avg_normalized_power.';
