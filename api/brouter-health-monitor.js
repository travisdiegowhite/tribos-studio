// Vercel API Route: self-hosted BRouter health monitor (cron, hourly at :15)
//
// The Route Builder's gravel routing, quiet-line alternates and road-tag
// analysis all lean on BRouter (docs/brouter-self-host-runbook.md). The
// client falls back to brouter.de by itself, so an outage of our server is
// invisible to riders until the public instance is slow too — which is
// exactly when we need our own. This cron routes a short Boulder pair on
// BROUTER_URL and pages when it fails twice running.
//
// Tags emitted (configure Sentry alert rules on these):
//   brouter.self_hosted_down  — two consecutive hourly checks failed
//   brouter.slow              — the check succeeded but took > SLOW_MS
//
// Deliberately lightweight: one routing request, one row read/write in
// system_health_checks for the consecutive-failure count. Mirrors
// api/strava-health-monitor.js.
import { getSupabaseAdmin } from './utils/supabaseAdmin.js';
import { captureServerError, flushServerSentry } from './utils/serverSentry.js';

const supabase = getSupabaseAdmin();

export const CHECK_NAME = 'brouter_self_hosted';
export const SLOW_MS = 8000;
export const FAILURES_BEFORE_ALERT = 2;
const REQUEST_TIMEOUT_MS = 20000;
// Pearl St → Boulder Creek path, ~2 km, always routable.
const CHECK_LONLATS = '-105.2705,40.0150|-105.2500,40.0300';

function serverBase() {
  const raw = process.env.BROUTER_URL || process.env.VITE_BROUTER_URL || '';
  return String(raw).trim().replace(/\/+$/, '').replace(/\/brouter$/, '');
}

/** One routing request; never throws. */
export async function probeBRouter(base, fetchImpl = fetch) {
  const started = Date.now();
  const url = `${base}/brouter?lonlats=${CHECK_LONLATS}&profile=trekking&alternativeidx=0&format=geojson`;
  try {
    const resp = await fetchImpl(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    const ms = Date.now() - started;
    if (!resp.ok) return { ok: false, ms, reason: `HTTP ${resp.status}` };
    const data = await resp.json();
    const feature = data?.features?.[0];
    if (!feature?.geometry?.coordinates?.length) return { ok: false, ms, reason: 'no route in response' };
    const messages = feature.properties?.messages;
    if (!Array.isArray(messages) || messages.length < 2) {
      return { ok: false, ms, reason: 'route has no tag rows (messages)' };
    }
    return { ok: true, ms, km: parseFloat(feature.properties['track-length'] || '0') / 1000 };
  } catch (err) {
    return { ok: false, ms: Date.now() - started, reason: err?.message ?? String(err) };
  }
}

/** Consecutive failures so far, stored per check name. Missing table → 0. */
async function readFailures() {
  const { data, error } = await supabase
    .from('system_health_checks')
    .select('consecutive_failures')
    .eq('check_name', CHECK_NAME)
    .maybeSingle();
  if (error) return { failures: 0, tableMissing: error.code === '42P01' };
  return { failures: data?.consecutive_failures ?? 0, tableMissing: false };
}

async function writeFailures(failures, probe) {
  const { error } = await supabase.from('system_health_checks').upsert(
    {
      check_name: CHECK_NAME,
      consecutive_failures: failures,
      last_ok_at: probe.ok ? new Date().toISOString() : undefined,
      last_checked_at: new Date().toISOString(),
      last_latency_ms: probe.ms,
      last_error: probe.ok ? null : probe.reason,
    },
    { onConflict: 'check_name' },
  );
  if (error && error.code !== '42P01') console.warn('brouter health: could not record state:', error.message);
}

export default async function handler(req, res) {
  const { verifyCronAuth } = await import('./utils/verifyCronAuth.js');
  if (!verifyCronAuth(req).authorized) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const base = serverBase();
  if (!base) {
    // Nothing self-hosted configured: nothing to watch.
    return res.status(200).json({ success: true, skipped: 'BROUTER_URL not set' });
  }

  console.log('=== BRouter Health Monitor Started ===');
  try {
    const probe = await probeBRouter(base);
    const { failures: previous } = await readFailures();
    const failures = probe.ok ? 0 : previous + 1;
    await writeFailures(failures, probe);

    const breaches = [];
    if (!probe.ok && failures >= FAILURES_BEFORE_ALERT) {
      breaches.push({ tag: 'brouter.self_hosted_down', value: failures, reason: probe.reason });
    }
    if (probe.ok && probe.ms > SLOW_MS) {
      breaches.push({ tag: 'brouter.slow', value: probe.ms, reason: `probe took ${probe.ms} ms` });
    }
    for (const b of breaches) {
      captureServerError(`BRouter health: ${b.tag} (${b.reason})`, {
        tag: b.tag,
        extra: { server: base, consecutive_failures: failures, latency_ms: probe.ms, reason: probe.reason ?? null },
      });
    }

    console.log(`=== BRouter Health Monitor Complete === ok=${probe.ok} ms=${probe.ms} failures=${failures} breaches=${breaches.length}`);
    await flushServerSentry();
    return res.status(200).json({ success: true, server: base, probe, consecutive_failures: failures, breaches });
  } catch (error) {
    console.error('BRouter health monitor error:', error);
    captureServerError(error, { tag: 'brouter.health_monitor_failed' });
    await flushServerSentry();
    return res.status(500).json({ error: 'BRouter health monitor failed', details: error.message });
  }
}
