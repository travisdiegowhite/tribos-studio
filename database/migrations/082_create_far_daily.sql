-- Migration 082: Create far_daily table for FAR (Fitness Acquisition Rate) metric
-- FAR spec: docs/TRIBOS_STATS_BIBLE.md §5.4
-- Phase 1: universal ceiling (1.5 TFI/week). personal_ceiling_history added in Phase 3.

CREATE TABLE far_daily (
  user_id                       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date                          DATE        NOT NULL,
  score                         NUMERIC,
  score_7d                      NUMERIC,
  tfi_delta_28d                 NUMERIC,
  weekly_rate                   NUMERIC,
  zone                          TEXT,
  personal_ceiling_weekly_rate  NUMERIC     DEFAULT 1.5,
  personal_ceiling_basis        TEXT        DEFAULT 'universal',
  confidence                    NUMERIC     DEFAULT 1.0,
  gap_days_in_window            INT         DEFAULT 0,
  computed_at                   TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id, date)
);

ALTER TABLE far_daily ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own FAR data"
  ON far_daily FOR SELECT
  USING (user_id = auth.uid());

-- Service role writes (cron job uses service key, bypasses RLS).
-- No INSERT/UPDATE policy needed for user-facing access.

CREATE INDEX idx_far_daily_user_date ON far_daily (user_id, date DESC);
