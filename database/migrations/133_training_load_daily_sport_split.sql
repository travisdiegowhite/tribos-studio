-- Migration 133: per-sport split of the daily training load (multisport phase 1).
--
-- training_load_daily keeps ONE combined rss / tfi / afi / form_score per day —
-- fatigue is shared, so form stays combined. These columns add the same daily
-- RSS and EWMA state broken down by sport, so a hybrid athlete can see (and the
-- coach can reason about) run fitness and ride fitness separately.
--
-- Every sport's EWMA uses the athlete's own taus, and the EWMA is linear, so
--   rss_cycling + rss_running + rss_other = rss
--   tfi_cycling + tfi_running + tfi_other = tfi      (same for afi)
-- holds up to rounding. There is no per-sport form_score by design.
--
-- Single-written: these columns have no legacy twin (the METRICS_ROLLOUT_FREEZE
-- dual-write rule applies to the renamed load columns, not here). The only
-- writer is api/utils/trainingLoadRecompute.js, which falls back to writing the
-- combined columns alone if this migration has not been applied.
--
-- No backfill here: after applying, run scripts/rebuild-training-load-history.js
-- for all users so stored history carries the split.
--
-- Idempotent. APPLY BY HAND, then run the verification SELECT at the bottom
-- (`npm run audit:schema` checks tables, not columns).

ALTER TABLE public.training_load_daily
  ADD COLUMN IF NOT EXISTS rss_cycling numeric,
  ADD COLUMN IF NOT EXISTS rss_running numeric,
  ADD COLUMN IF NOT EXISTS rss_other   numeric,
  ADD COLUMN IF NOT EXISTS tfi_cycling numeric,
  ADD COLUMN IF NOT EXISTS tfi_running numeric,
  ADD COLUMN IF NOT EXISTS tfi_other   numeric,
  ADD COLUMN IF NOT EXISTS afi_cycling numeric,
  ADD COLUMN IF NOT EXISTS afi_running numeric,
  ADD COLUMN IF NOT EXISTS afi_other   numeric;

COMMENT ON COLUMN public.training_load_daily.rss_cycling IS 'Daily RSS from rides. Sum over sports = rss. No legacy twin (migration 133).';
COMMENT ON COLUMN public.training_load_daily.rss_running IS 'Daily RSS from runs. Sum over sports = rss. No legacy twin (migration 133).';
COMMENT ON COLUMN public.training_load_daily.rss_other   IS 'Daily RSS from other sports (swim, strength, walk...). Sum over sports = rss. No legacy twin (migration 133).';
COMMENT ON COLUMN public.training_load_daily.tfi_cycling IS 'Ride share of TFI (same tau). Sum over sports = tfi. No legacy twin (migration 133).';
COMMENT ON COLUMN public.training_load_daily.tfi_running IS 'Run share of TFI (same tau). Sum over sports = tfi. No legacy twin (migration 133).';
COMMENT ON COLUMN public.training_load_daily.tfi_other   IS 'Other-sport share of TFI (same tau). Sum over sports = tfi. No legacy twin (migration 133).';
COMMENT ON COLUMN public.training_load_daily.afi_cycling IS 'Ride share of AFI (same tau). Sum over sports = afi. No legacy twin (migration 133).';
COMMENT ON COLUMN public.training_load_daily.afi_running IS 'Run share of AFI (same tau). Sum over sports = afi. No legacy twin (migration 133).';
COMMENT ON COLUMN public.training_load_daily.afi_other   IS 'Other-sport share of AFI (same tau). Sum over sports = afi. No legacy twin (migration 133).';

-- ── Verification (run by hand after applying, and again after the rebuild) ──
--
-- SELECT count(*) FROM information_schema.columns
--  WHERE table_schema = 'public' AND table_name = 'training_load_daily'
--    AND column_name ~ '^(rss|tfi|afi)_(cycling|running|other)$';      -- expect 9
--
-- -- After the rebuild: rows whose split does not add up (expect 0).
-- SELECT count(*) FROM public.training_load_daily
--  WHERE tfi_cycling IS NOT NULL
--    AND abs(tfi - (tfi_cycling + tfi_running + tfi_other)) > 0.05;
