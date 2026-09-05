-- Migration 121: Create the `garmin-fit` Storage bucket that migration 099 assumed
--
-- Why
-- ----
-- Migration 099 (2026-06-12) added activities.fit_storage_path and said the
-- `garmin-fit` bucket "must be created manually in the Supabase dashboard".
-- It never was. The upload in api/utils/fitParser.js downloadAndParseFitFile
-- is deliberately non-fatal (a console.warn, then parse continues), so for
-- almost three months every Garmin FIT upload failed quietly: as of 2026-09-04
-- none of the 325 Garmin activities imported in the previous 30 days had a
-- retained file. The retention that was meant to make activities reprocessable
-- after a parser fix (or a Garmin URL expiry, 24h) was never on.
--
-- Found while fixing the summary-less FIT ping import (PRs #967/#968).
--
-- What
-- ----
-- Creates the bucket idempotently with the settings 099 specified:
--   - private (service-role uploads only; the browser never reads it)
--   - 50 MB per object (multi-hour 1 s-sample FIT files are a few MB)
--   - no MIME restriction (uploads send application/octet-stream)
-- No storage.objects RLS policies are added: every writer and reader uses the
-- service-role client, which bypasses RLS. Do NOT add anon/authenticated
-- policies without a reason — the objects are keyed by user_id and contain GPS.
--
-- Applied to production 2026-09-04 (via SQL, same statement as below).
-- Confirm with: select id, public, file_size_limit from storage.buckets where id = 'garmin-fit';
-- Then check that new Garmin imports populate activities.fit_storage_path.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('garmin-fit', 'garmin-fit', false, 52428800, NULL)
ON CONFLICT (id) DO NOTHING;
