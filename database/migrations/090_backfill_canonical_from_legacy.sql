-- 090: one-time backfill of canonical metric columns from their legacy twins
--
-- Resolves M2 ("canonical/legacy dual-write gaps") from BETA_AUDIT_FINDINGS.md,
-- confirmed by the 2026-06-23 production data sweep (project xbziuusxagasizxnlwwn).
--
-- Why this is safe and in-policy:
--   * It is a DATA backfill (UPDATE only) — NOT a schema rename and NOT one of
--     the frozen 074–080 legacy-column DROPs. The CLAUDE.md freeze policy keeps
--     legacy + canonical columns coexisting and mandates that canonical mirror
--     legacy; this simply repairs rows where the canonical twin was left NULL.
--   * The divergence is bounded and already stopped: every affected row predates
--     2026-05-08 (the documented Garmin ingest window in fitnessSnapshots.js:312),
--     and there is NO reverse divergence (no rows with canonical present + legacy
--     NULL), so no live writer is producing new bad rows. This is a cleanup of a
--     closed historical hole, not a patch for an active bug.
--   * Each statement is idempotent: it only touches rows where the canonical
--     column IS NULL AND the legacy column IS NOT NULL. Re-running is a no-op.
--
-- Rename mapping being mirrored (legacy → canonical), per migration 070 / the
-- Tribos metrics spec:
--   tss              → rss              (Ride Stress Score)
--   normalized_power → effective_power  (Effective Power)
--   intensity_factor → ride_intensity   (Relative Intensity)
--
-- Expected row counts at time of writing (2026-06-23 sweep):
--   activities.rss              ~64
--   activities.effective_power  ~920
--   activities.ride_intensity   ~64
--   fitness_snapshots.weekly_rss ~361
--   planned_workouts.actual_rss  ~92
-- target_rss/target_tss were already clean (0 divergence) and are intentionally
-- not touched.
--
-- NOTE: For the ~64 activities backfilled here, rss is set to the raw legacy tss
-- (no terrain/MTB multiplier) because tss is the only stress value those rows
-- carry. That matches the canonical-?? -legacy read fallback the app already uses;
-- it is strictly better than leaving rss NULL (which drops the ride to a lower
-- RSS tier). A full terrain-aware recompute is out of scope (frozen metrics code).

BEGIN;

-- activities: rss ← tss
UPDATE public.activities
SET rss = tss
WHERE rss IS NULL AND tss IS NOT NULL;

-- activities: effective_power ← normalized_power
UPDATE public.activities
SET effective_power = normalized_power
WHERE effective_power IS NULL AND normalized_power IS NOT NULL;

-- activities: ride_intensity ← intensity_factor
UPDATE public.activities
SET ride_intensity = intensity_factor
WHERE ride_intensity IS NULL AND intensity_factor IS NOT NULL;

-- fitness_snapshots: weekly_rss ← weekly_tss
UPDATE public.fitness_snapshots
SET weekly_rss = weekly_tss
WHERE weekly_rss IS NULL AND weekly_tss IS NOT NULL;

-- planned_workouts: actual_rss ← actual_tss
UPDATE public.planned_workouts
SET actual_rss = actual_tss
WHERE actual_rss IS NULL AND actual_tss IS NOT NULL;

COMMIT;

-- Verification (run after applying; all five should return 0):
--   SELECT count(*) FROM public.activities       WHERE rss IS NULL AND tss IS NOT NULL;
--   SELECT count(*) FROM public.activities       WHERE effective_power IS NULL AND normalized_power IS NOT NULL;
--   SELECT count(*) FROM public.activities       WHERE ride_intensity IS NULL AND intensity_factor IS NOT NULL;
--   SELECT count(*) FROM public.fitness_snapshots WHERE weekly_rss IS NULL AND weekly_tss IS NOT NULL;
--   SELECT count(*) FROM public.planned_workouts WHERE actual_rss IS NULL AND actual_tss IS NOT NULL;
