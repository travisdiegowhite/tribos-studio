-- 106: fitness_evidence_weekly — Performance Evidence Engine verdicts.
--
-- One row per athlete per week (Monday-start, aligned with fitness_snapshots).
-- Written only by the weekly evidence job (api/evidence-weekly.js); read only
-- by server-side code (api/coach.js) via the service role. Stores the verdict
-- object exactly as api/utils/evidenceEngine.js emits it — signals JSONB
-- carries the receipts (numbers, dates, ride/segment ids, baselines).
--
-- Deliberately adds NO columns to existing metric tables (training_load_daily,
-- fitness_snapshots are untouched). The engine reads the load model; it never
-- writes to it.

CREATE TABLE IF NOT EXISTS public.fitness_evidence_weekly (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week             date NOT NULL,  -- Monday of the analyzed week
  verdict          text NOT NULL CHECK (verdict IN ('ahead', 'consistent', 'behind', 'insufficient_data')),
  verdict_raw      text CHECK (verdict_raw IN ('ahead', 'consistent', 'behind', 'insufficient_data')),
  score            numeric(4,2),
  confidence       numeric(3,2) CHECK (confidence >= 0 AND confidence <= 1),
  signals          jsonb,          -- { power_duration, efficiency_factor, segments } with receipts
  model_divergence jsonb,          -- { tfi, fs, modelNarrative, disagrees }
  narrative_facts  jsonb,          -- coach-ready receipt sentences (array of strings)
  engine_version   int NOT NULL DEFAULT 1,
  computed_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, week)
);

CREATE INDEX IF NOT EXISTS idx_few_user_week
  ON public.fitness_evidence_weekly(user_id, week DESC);

-- Server-only in v1: no client reader exists (coach reads via service role,
-- which bypasses RLS). Same pattern as metric_debug_tfi (083).
ALTER TABLE public.fitness_evidence_weekly ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "no_client_access" ON public.fitness_evidence_weekly;
CREATE POLICY "no_client_access" ON public.fitness_evidence_weekly USING (false);

COMMENT ON TABLE public.fitness_evidence_weekly IS
  'Weekly Performance Evidence Engine verdicts (docs/EVIDENCE_ENGINE_CALIBRATION.md). Written by api/evidence-weekly.js only.';
COMMENT ON COLUMN public.fitness_evidence_weekly.week IS
  'Monday of the analyzed week (aligned with fitness_snapshots week grid).';
