-- Migration 099: Add fit_storage_path column to activities for FIT file retention
--
-- Why
-- ----
-- Garmin FIT URLs expire 24 hours after issue and return HTTP 410 on re-fetch.
-- Once we miss that window OR our parser fails on the file, the raw data is
-- unrecoverable: Garmin returns 409 ("duplicate backfill processed") if we ask
-- them to re-send. This permanently strands activities as `summary_only`.
--
-- Today (2026-06-12) Travis reported a 537 KB FIT file from his Edge 540 that
-- downloaded successfully but parsed to 0 records under easy-fit 0.0.8 — a
-- format-version mismatch. With the bytes already discarded by the time we
-- noticed, recovery is impossible. PR #823 added diagnostic logging to surface
-- the issue, but the bytes are still lost.
--
-- Retaining the bytes lets us reprocess any past activity with a newer parser
-- (e.g. @garmin/fitsdk) or after any parser fix, without depending on Garmin.
--
-- Storage location
-- ----------------
-- The actual bytes live in a Supabase Storage bucket `garmin-fit`. The bucket
-- must be created manually in the Supabase dashboard before this column is
-- used in production:
--   - Name: garmin-fit
--   - Public: NO (private; service-role only)
--   - No CDN, no transformations
--
-- Path format: garmin/{user_id}/{activity_id}.fit
-- (Using activities.id rather than provider_activity_id so the key is stable
--  even if we recreate the activity row from a fresh webhook.)
--
-- Storage cost
-- ------------
-- ~500 KB/ride × ~200 rides/user/year × N users. For 100 active users:
-- ~10 GB/year at Supabase Storage pricing ($0.021/GB/month) ≈ $2.50/year.

ALTER TABLE activities ADD COLUMN IF NOT EXISTS fit_storage_path TEXT;

COMMENT ON COLUMN activities.fit_storage_path IS
  'Supabase Storage object key in the garmin-fit bucket (private). NULL if no FIT was retained (pre-migration activity, non-Garmin provider, manual upload, or storage upload failed). Enables reprocessing without re-fetching from Garmin (whose URLs expire in 24h).';

-- Index for finding activities that have retained FIT files. Used by future
-- reprocess scripts and admin diagnostics.
CREATE INDEX IF NOT EXISTS idx_activities_fit_storage_path
  ON activities(fit_storage_path)
  WHERE fit_storage_path IS NOT NULL;
