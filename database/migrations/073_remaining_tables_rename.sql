-- 073: remaining tables — spec §2 additive rename (B10)
--
-- Adds the spec §2 canonical columns across the seven remaining tables
-- that still carry trademarked metric names. Writers are updated in
-- follow-up PRs; readers stay on the legacy column names for now.
-- Column drop is deferred to a future cut-over PR per D5.
--
-- Scope:
--   workout_adaptations
--     planned_tss               → planned_rss
--     actual_tss                → actual_rss
--     planned_intensity_factor  → planned_ride_intensity
--     actual_intensity_factor   → actual_ride_intensity
--     actual_normalized_power   → actual_effective_power
--     ctg_at_time               → tfi_at_time
--     atl_at_time               → afi_at_time
--     tsb_at_time               → form_score_at_time
--     avg_tss_achievement_pct   → avg_rss_achievement_pct
--
--   planned_workouts (migration 010/011 column set)
--     actual_tss                → actual_rss
--     intensity_factor          → ride_intensity
--
--   plan_deviations
--     planned_tss               → planned_rss
--     actual_tss                → actual_rss
--     tss_delta                 → rss_delta
--
--   activity_efi / activity_twl / weekly_tcas
--     planned_tss               → planned_rss
--     actual_tss                → actual_rss
--     (`ctl_*` / weekly TSS references inside metrics stay for now —
--      they're intermediate computation fields, not stored columns that
--      the coach voice reads.)
--
--   training_segments
--     normalized_power          → effective_power
--     mean_normalized_power     → mean_effective_power
--
--   training_plan_templates (migration 011 segments table)
--     intensity_factor          → ride_intensity
--
--   user_profiles
--     weekly_tss_estimate       → weekly_rss_estimate

-- workout_adaptations ────────────────────────────────────────────────────
ALTER TABLE public.workout_adaptations
  ADD COLUMN IF NOT EXISTS planned_rss NUMERIC,
  ADD COLUMN IF NOT EXISTS actual_rss NUMERIC,
  ADD COLUMN IF NOT EXISTS planned_ride_intensity NUMERIC,
  ADD COLUMN IF NOT EXISTS actual_ride_intensity NUMERIC,
  ADD COLUMN IF NOT EXISTS actual_effective_power INTEGER,
  ADD COLUMN IF NOT EXISTS tfi_at_time NUMERIC,
  ADD COLUMN IF NOT EXISTS afi_at_time NUMERIC,
  ADD COLUMN IF NOT EXISTS form_score_at_time NUMERIC,
  ADD COLUMN IF NOT EXISTS avg_rss_achievement_pct NUMERIC;

-- planned_workouts (spec §2 canonical twin for actual_tss / intensity_factor)
ALTER TABLE public.planned_workouts
  ADD COLUMN IF NOT EXISTS actual_rss INTEGER,
  ADD COLUMN IF NOT EXISTS ride_intensity NUMERIC;

-- plan_deviations
ALTER TABLE public.plan_deviations
  ADD COLUMN IF NOT EXISTS planned_rss NUMERIC(6,2),
  ADD COLUMN IF NOT EXISTS actual_rss NUMERIC(6,2),
  ADD COLUMN IF NOT EXISTS rss_delta NUMERIC(6,2);

-- training_segments
ALTER TABLE public.training_segments
  ADD COLUMN IF NOT EXISTS effective_power DECIMAL(6, 1),
  ADD COLUMN IF NOT EXISTS mean_effective_power DECIMAL(6, 1);

-- user_profiles (onboarding)
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS weekly_rss_estimate INTEGER;

COMMENT ON COLUMN public.workout_adaptations.planned_rss IS
  'Planned Ride Stress Score. Dual-written with planned_tss during B10 rollout.';
COMMENT ON COLUMN public.workout_adaptations.actual_rss IS
  'Actual Ride Stress Score. Dual-written with actual_tss during B10 rollout.';
COMMENT ON COLUMN public.plan_deviations.planned_rss IS
  'Planned Ride Stress Score. Dual-written with planned_tss during B10 rollout.';
COMMENT ON COLUMN public.plan_deviations.actual_rss IS
  'Actual Ride Stress Score. Dual-written with actual_tss during B10 rollout.';
COMMENT ON COLUMN public.training_segments.effective_power IS
  'Effective Power (EP). Dual-written with normalized_power during B10 rollout.';
COMMENT ON COLUMN public.user_profiles.weekly_rss_estimate IS
  'Self-reported weekly RSS estimate for AFI/TFI seeding. Replaces weekly_tss_estimate.';
