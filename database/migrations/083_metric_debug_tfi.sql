-- 083: metric_debug_tfi — per-day TFI computation trace (audit only)
--
-- Stores intermediate values from each daily TFI computation so any
-- single data point can be traced back to its inputs.
--
-- Scope: populated only for travisdiegowhite@gmail.com during the
-- metric audit window (until post-BWR decision, ~May 4 2026).
--
-- Retention: can be truncated or dropped after the audit resolves.
-- No foreign-key dependents — safe to drop independently.
-- Clean-up command (when audit is over):
--   DROP TABLE IF EXISTS metric_debug_tfi;

CREATE TABLE IF NOT EXISTS public.metric_debug_tfi (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date        DATE NOT NULL,

  -- Raw inputs: one entry per activity contributing to this day's RSS,
  -- plus the user's FTP and adaptive tau values used.
  inputs_json JSONB NOT NULL DEFAULT '{}',
  -- {
  --   ftp: number | null,
  --   tfi_tau: number,
  --   afi_tau: number,
  --   activities: [{
  --     id: uuid, name: string, type: string,
  --     rss_stored: number | null,       -- activity.rss
  --     tss_stored: number | null,       -- activity.tss (legacy)
  --     effective_power: number | null,
  --     normalized_power: number | null,
  --     kilojoules: number | null,
  --     moving_time: number | null,
  --     tier_used: 1|2|3|4|5,
  --     rss_estimated: number            -- value fed into EWA
  --   }],
  --   daily_rss_total: number
  -- }

  -- Running EWA state after processing this day
  intermediates_json JSONB NOT NULL DEFAULT '{}',
  -- {
  --   tfi_before: number,   -- EWA value at start of day
  --   afi_before: number,
  --   rss_input: number,    -- daily_rss_total for this day
  --   tfi_after: number,    -- EWA after incorporating rss_input
  --   afi_after: number
  -- }

  -- Final output written for this day
  output JSONB NOT NULL DEFAULT '{}',
  -- {
  --   tfi: number,
  --   afi: number,
  --   form_score: number,   -- tfi_yesterday - afi_yesterday
  --   tau_tfi: number,
  --   tau_afi: number
  -- }

  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (user_id, date)
);

-- RLS: server-side only; no client reads.
ALTER TABLE public.metric_debug_tfi ENABLE ROW LEVEL SECURITY;

-- Deny all client access — this table is written and read exclusively
-- via the service role (api/internal/fitness-audit.js).
CREATE POLICY "no_client_access" ON public.metric_debug_tfi
  USING (false);

-- Index for the most common query pattern (user + date range)
CREATE INDEX IF NOT EXISTS metric_debug_tfi_user_date
  ON public.metric_debug_tfi (user_id, date DESC);
