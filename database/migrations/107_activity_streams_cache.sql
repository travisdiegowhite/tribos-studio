-- Migration 107: Storage bucket for normalized activity-stream cache
--
-- Why
-- ----
-- The flagship activity analysis chart (api/activity-streams.js) serves a
-- normalized time-series payload per activity. The expensive sources — a raw
-- FIT re-parse from the garmin-fit bucket, or an on-demand Strava streams API
-- fetch — should be paid at most once per activity. The normalized result is
-- cached as a Storage object; no activities column is added (the activities
-- row already carries several large JSONB blobs that dashboard queries fetch
-- eagerly, and a new one would make that payload problem worse).
--
-- Storage location
-- ----------------
-- Bucket: activity-streams (private; service-role only, like garmin-fit).
-- Path format: {user_id}/{activity_id}.v{shape_version}.json
-- The shape version is baked into the object key, so bumping
-- STREAM_SHAPE_VERSION in api/utils/activityStreams.js invalidates every
-- cached object at once without a cleanup pass.
--
-- Storage cost
-- ------------
-- ~50–200 KB per cached activity (JSON, only expensive tiers are cached).
-- Two orders of magnitude below the garmin-fit bucket's FIT retention cost.
--
-- The insert below creates the bucket idempotently. If the Supabase project
-- restricts SQL access to the storage schema, create it manually instead
-- (Dashboard → Storage): Name: activity-streams, Public: NO.

INSERT INTO storage.buckets (id, name, public)
VALUES ('activity-streams', 'activity-streams', false)
ON CONFLICT (id) DO NOTHING;
