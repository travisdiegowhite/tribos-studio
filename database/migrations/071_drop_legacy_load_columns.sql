-- 071: Drop legacy training_load + user_profiles columns (B4)
--
-- Completes the safe additive + cut-over rollout of the Tribos Metrics
-- column rename. Readers were cut over in B3 (commit 3ca0095); this
-- migration drops the legacy columns. The application-level dual-write
-- is removed in the same PR — after this migration ships, any caller
-- still writing tss/ctl/atl/tsb would error on NOT NULL … well, the
-- columns were nullable, but the attributes no longer exist.
--
-- Mapping recap:
--   training_load_daily.tss         → rss
--   training_load_daily.ctl         → tfi
--   training_load_daily.atl         → afi
--   training_load_daily.tsb         → form_score
--   training_load_daily.tss_source  → rss_source
--   user_profiles.ewa_long_tau      → tfi_tau
--   user_profiles.ewa_short_tau     → afi_tau
--
-- Also drops the legacy tss_source CHECK constraint (superseded by
-- rss_source's CHECK in 070). `confidence`, `fs_confidence`,
-- `terrain_class`, and `metrics_age` are unchanged — their names never
-- carried a trademarked term.

ALTER TABLE public.training_load_daily
  DROP CONSTRAINT IF EXISTS training_load_daily_tss_source_check;

ALTER TABLE public.training_load_daily
  DROP COLUMN IF EXISTS tss,
  DROP COLUMN IF EXISTS ctl,
  DROP COLUMN IF EXISTS atl,
  DROP COLUMN IF EXISTS tsb,
  DROP COLUMN IF EXISTS tss_source;

ALTER TABLE public.user_profiles
  DROP COLUMN IF EXISTS ewa_long_tau,
  DROP COLUMN IF EXISTS ewa_short_tau;
