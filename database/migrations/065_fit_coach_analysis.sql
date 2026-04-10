-- Migration 065: FIT Coach Analysis
-- Adds columns for deep AI coach analysis of FIT file time-series data.
--
-- fit_coach_context stores a uniform-interval resampled time series
-- (power/HR/cadence at 5/10/30/60s depending on duration) plus derived
-- metrics the check-in pipeline does not compute today:
--   - power zone distribution (Z1-Z7 % of ride)
--   - aerobic decoupling (first-half vs second-half Pa:HR)
--   - power dropouts (power=0 while cadence>0, suggests sensor failure)
--   - cadence bands (<70 / 70-84 / 85-94 / 95+)
--
-- fit_coach_analysis caches the long-form narrative Claude produces from
-- that context. Generated lazily on first Deep Ride Analysis view so we
-- don't spend tokens on activities users never look at. Regenerated only
-- if the stored persona differs from the user's current persona.

ALTER TABLE activities
  ADD COLUMN IF NOT EXISTS fit_coach_context JSONB,
  ADD COLUMN IF NOT EXISTS fit_coach_analysis TEXT,
  ADD COLUMN IF NOT EXISTS fit_coach_analysis_persona TEXT,
  ADD COLUMN IF NOT EXISTS fit_coach_analysis_generated_at TIMESTAMPTZ;

-- Partial index for finding activities that have the coach context populated
-- (used by the /api/coach-ride-analysis endpoint lookup path)
CREATE INDEX IF NOT EXISTS idx_activities_fit_coach_context
  ON activities ((fit_coach_context IS NOT NULL))
  WHERE fit_coach_context IS NOT NULL;

COMMENT ON COLUMN activities.fit_coach_context IS
  'Uniform-interval resampled time series and derived metrics (aerobic decoupling, power dropouts, power zone distribution, cadence bands) used to feed the deep AI coach analysis prompt. Populated at FIT ingestion from Garmin/Wahoo webhooks.';
COMMENT ON COLUMN activities.fit_coach_analysis IS
  'Cached long-form coach narrative generated from fit_coach_context on first Deep Ride Analysis view. Regenerated only when persona changes.';
COMMENT ON COLUMN activities.fit_coach_analysis_persona IS
  'Persona ID (e.g. hammer, scientist, pragmatist) used to generate the cached fit_coach_analysis. Mismatch with current persona triggers regeneration.';
COMMENT ON COLUMN activities.fit_coach_analysis_generated_at IS
  'Timestamp when fit_coach_analysis was last generated.';
