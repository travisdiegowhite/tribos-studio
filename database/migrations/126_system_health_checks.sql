-- Migration 126: system_health_checks
--
-- One row per server-side health probe, holding the state a stateless cron
-- cannot: how many hourly checks in a row have failed. The first reader is
-- api/brouter-health-monitor.js (the self-hosted BRouter probe), which pages
-- Sentry only after two consecutive failures so a single slow answer from
-- Fly's proxy does not wake anyone. Other monitors may add rows under their
-- own check_name; no code reads a row it did not write.
--
-- Service-role only: no RLS policies are granted to authenticated/anon, the
-- table is not exposed to the browser.
--
-- APPLY BY HAND and confirm with `npm run audit:schema`. Until applied the
-- monitor still runs and still alerts, but treats every failure as the
-- first (the 42P01 "relation does not exist" read is fail-soft), so it
-- pages on every failed hour rather than after two.

CREATE TABLE IF NOT EXISTS public.system_health_checks (
  check_name            TEXT PRIMARY KEY,
  consecutive_failures  INTEGER NOT NULL DEFAULT 0,
  last_checked_at       TIMESTAMPTZ,
  last_ok_at            TIMESTAMPTZ,
  last_latency_ms       INTEGER,
  last_error            TEXT,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.system_health_checks IS
  'Per-probe state for the health-monitor crons (consecutive failures, last latency). Service role only.';
COMMENT ON COLUMN public.system_health_checks.check_name IS
  'Probe id, e.g. brouter_self_hosted (api/brouter-health-monitor.js).';
COMMENT ON COLUMN public.system_health_checks.consecutive_failures IS
  'Failed checks in a row; reset to 0 on the first success.';

ALTER TABLE public.system_health_checks ENABLE ROW LEVEL SECURITY;
-- No policies on purpose: only the service-role client (which bypasses RLS)
-- reads or writes this table.

GRANT ALL ON public.system_health_checks TO service_role;
