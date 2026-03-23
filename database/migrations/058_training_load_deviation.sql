-- Migration 058: Training Load & Deviation Adjustment System
-- Adds tables for daily training load tracking, fatigue calibration,
-- plan deviation detection, and morning readiness check-ins.

-- ============================================================================
-- 1. training_load_daily — Daily CTL/ATL/TSB per athlete
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.training_load_daily (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date         date NOT NULL,
  tss          numeric(6,2),
  ctl          numeric(6,2),
  atl          numeric(6,2),
  tsb          numeric(6,2),
  tss_source   text CHECK (tss_source IN ('power', 'hr', 'rpe', 'inferred')),
  confidence   numeric(4,2) CHECK (confidence >= 0 AND confidence <= 1),
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_tld_user_date
  ON public.training_load_daily(user_id, date DESC);

-- ============================================================================
-- 2. fatigue_calibration — Per-user TSS estimation calibration factors
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.fatigue_calibration (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trimp_to_tss     numeric(5,3) NOT NULL DEFAULT 0.85,
  srpe_to_tss      numeric(5,3) NOT NULL DEFAULT 0.55,
  sample_count     integer NOT NULL DEFAULT 0,
  last_updated     timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- ============================================================================
-- 3. plan_deviations — Detected deviations with adjustment options
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.plan_deviations (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  activity_id      text,
  deviation_date   date NOT NULL,
  planned_tss      numeric(6,2),
  actual_tss       numeric(6,2),
  tss_delta        numeric(6,2),
  deviation_type   text CHECK (deviation_type IN ('intensity_upgrade', 'volume_upgrade', 'type_substitution')),
  severity_score   numeric(4,2) CHECK (severity_score >= 0 AND severity_score <= 10),
  options_json     jsonb,
  selected_option  text CHECK (selected_option IN ('no_adjust', 'modify', 'swap', 'insert_rest', 'drop')),
  resolved_at      timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deviations_user
  ON public.plan_deviations(user_id, deviation_date DESC);

-- ============================================================================
-- 4. fatigue_checkins — Morning readiness surveys
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.fatigue_checkins (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date         date NOT NULL,
  leg_feel     integer CHECK (leg_feel BETWEEN 1 AND 5),
  energy       integer CHECK (energy BETWEEN 1 AND 5),
  motivation   integer CHECK (motivation BETWEEN 1 AND 5),
  hrv_status   text,
  notes        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_checkins_user
  ON public.fatigue_checkins(user_id, date DESC);

-- ============================================================================
-- 5. Add is_quality and session_type to planned_workouts (if not present)
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'planned_workouts'
      AND column_name = 'is_quality'
  ) THEN
    ALTER TABLE public.planned_workouts ADD COLUMN is_quality boolean NOT NULL DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'planned_workouts'
      AND column_name = 'session_type'
  ) THEN
    ALTER TABLE public.planned_workouts ADD COLUMN session_type text;
  END IF;
END $$;

-- ============================================================================
-- 6. Row Level Security
-- ============================================================================
ALTER TABLE public.training_load_daily  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fatigue_calibration  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_deviations      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fatigue_checkins     ENABLE ROW LEVEL SECURITY;

-- training_load_daily
CREATE POLICY "users_own_training_load" ON public.training_load_daily
  FOR ALL USING (auth.uid() = user_id);

-- fatigue_calibration
CREATE POLICY "users_own_calibration" ON public.fatigue_calibration
  FOR ALL USING (auth.uid() = user_id);

-- plan_deviations
CREATE POLICY "users_own_deviations" ON public.plan_deviations
  FOR ALL USING (auth.uid() = user_id);

-- fatigue_checkins
CREATE POLICY "users_own_checkins" ON public.fatigue_checkins
  FOR ALL USING (auth.uid() = user_id);
