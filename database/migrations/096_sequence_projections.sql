-- 096_sequence_projections.sql
--
-- Phase 3: store the INTENDED fitness trajectory at anchor time so we can later
-- tell whether the athlete is ahead of (or behind) the plan. When a sequence is
-- anchored, we forward-simulate TFI/AFI/Form Score across the whole plan's daily
-- prescriptions (same stepDay dynamics the actual load uses) and persist one row
-- per day. The daily rollover compares actual TFI to projected_tfi to feed the
-- "ahead of plan → push harder" progression signal.

CREATE TABLE IF NOT EXISTS public.sequence_projections (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id   uuid NOT NULL REFERENCES public.sequences(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date          date NOT NULL,
  projected_tfi numeric(6, 2) NOT NULL,
  projected_afi numeric(6, 2) NOT NULL,
  projected_fs  numeric(6, 2) NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sequence_projections_seq_date_unique UNIQUE (sequence_id, date)
);

CREATE INDEX IF NOT EXISTS idx_sequence_projections_user_date
  ON public.sequence_projections (user_id, date);

ALTER TABLE public.sequence_projections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sequence_projections_owner_select"
  ON public.sequence_projections FOR SELECT
  USING (auth.uid() = user_id);
