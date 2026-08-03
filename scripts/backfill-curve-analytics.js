#!/usr/bin/env node
/**
 * Backfill missing `power_curve_summary` and `ride_analytics` on activities
 * that have power data but never went through the FIT parsing pipeline
 * (Evidence Engine Phase 2, Step 1 — see docs/EVIDENCE_ENGINE_CALIBRATION.md §7).
 *
 * Strictly additive: each column is filled ONLY where it is NULL, with the
 * NULL re-guard repeated in the UPDATE itself, so re-running produces zero
 * new writes and a computed value can never replace a stored one. If a
 * recomputed value disagrees with a stored one (validation mode), the
 * disagreement is logged and the stored value left untouched.
 *
 * Computation reuses the production functions — calculatePowerCurveSummary
 * (api/utils/fitParser.js) and computePerRideAnalytics
 * (api/utils/advancedRideAnalytics.js) — fed by the best available source:
 *   1. fit_storage_path        → parseFitBuffer (full production parse path)
 *   2. stored activity_streams → only when per-second-faithful
 *                                (power samples >= 80% of moving_time)
 *   3. Strava streams API      → rides with a Strava activity id
 *                                (watts/heartrate, indefinite retention)
 *   4. otherwise               → logged unreachable, skipped
 *
 * ftp is deliberately passed as null to computePerRideAnalytics: the engine
 * consumes only variability_index and efficiency_factor, and retroactively
 * applying today's FTP to historical rides would mis-scale the FTP-relative
 * analytics keys.
 *
 * Usage:
 *   node --env-file=.env scripts/backfill-curve-analytics.js                 # dry run (no API calls, no writes)
 *   node --env-file=.env scripts/backfill-curve-analytics.js --commit        # fetch, compute, write
 *   node --env-file=.env scripts/backfill-curve-analytics.js --validate 20   # cross-source check on rides that
 *                                                                            # already have curves; log-only
 * Options:
 *   --user-id <uuid>   default: founder
 *   --limit <n>        cap candidate rides (default 500)
 *
 * Environment: SUPABASE_URL (or VITE_SUPABASE_URL), SUPABASE_SERVICE_KEY,
 *              STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET (for token refresh).
 */

import { createClient } from '@supabase/supabase-js';
import {
  calculatePowerCurveSummary,
  MAX_VALID_POWER_WATTS,
  parseFitBuffer,
} from '../api/utils/fitParser.js';
import { computePerRideAnalytics } from '../api/utils/advancedRideAnalytics.js';

try { (await import('dotenv')).config(); } catch { /* dotenv not installed */ }

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_KEY');
  process.exit(1);
}

const args = process.argv.slice(2);
const COMMIT = args.includes('--commit');
const readArg = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : null;
};
const VALIDATE_N = args.includes('--validate') ? parseInt(readArg('--validate') || '20', 10) : 0;
const USER_ID = readArg('--user-id') || 'e17a000f-0662-464c-bddf-d44ced141fa1';
const LIMIT = parseInt(readArg('--limit') || '500', 10);
const STRAVA_GAP_MS = 10_000; // ~6 req/min keeps us inside Strava's 100/15min window

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Strava access (mirrors getValidAccessToken in api/strava-webhook.js:728;
//    module-local there, so the refresh logic is copied — keep in sync) ─────

let stravaToken = null;
async function getStravaToken() {
  if (stravaToken) return stravaToken;
  const { data: integration, error } = await supabase
    .from('bike_computer_integrations')
    .select('id, access_token, refresh_token, token_expires_at')
    .eq('provider', 'strava')
    .eq('user_id', USER_ID)
    .maybeSingle();
  if (error || !integration) throw new Error(`No Strava integration for user: ${error?.message || 'not found'}`);

  if (new Date(integration.token_expires_at) > new Date(Date.now() + 5 * 60 * 1000)) {
    stravaToken = integration.access_token;
    return stravaToken;
  }
  const resp = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: integration.refresh_token,
    }),
  });
  if (!resp.ok) throw new Error(`Strava token refresh failed: ${await resp.text()}`);
  const tokenData = await resp.json();
  await supabase
    .from('bike_computer_integrations')
    .update({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      token_expires_at: new Date(tokenData.expires_at * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', integration.id);
  stravaToken = tokenData.access_token;
  return stravaToken;
}

async function fetchStravaStreams(stravaActivityId) {
  const token = await getStravaToken();
  const url = `https://www.strava.com/api/v3/activities/${stravaActivityId}/streams?keys=watts,heartrate&key_by_type=true`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (resp.status === 429) {
    console.warn('   ⏳ Strava rate limit hit — sleeping 15 minutes');
    await sleep(15 * 60 * 1000);
    return fetchStravaStreams(stravaActivityId);
  }
  if (resp.status === 404) return { notFound: true };
  if (!resp.ok) throw new Error(`Strava streams ${resp.status}: ${await resp.text()}`);
  return await resp.json();
}

// ── Compute from raw sample arrays via the production functions ────────────

// Same filter semantics as extractPowerStream in api/utils/fitParser.js
// (module-local there): drop nulls, zeros, and sentinel/invalid values.
const filterPower = (arr) =>
  (arr || []).filter((p) => p != null && p > 0 && p < MAX_VALID_POWER_WATTS);
const filterHr = (arr) => (arr || []).filter((h) => h != null && h > 0);

function computeFromSamples(powerRaw, hrRaw) {
  const powerStream = filterPower(powerRaw);
  const hr = filterHr(hrRaw);
  const powerCurve = calculatePowerCurveSummary(powerStream);
  // Production gates: hrStream only when > 60 samples (parseFitFile),
  // maxHR from session max ≡ max of samples.
  const hrStream = hr.length > 60 ? hr : null;
  const rideAnalytics = computePerRideAnalytics({
    powerStream,
    hrStream,
    cadenceStream: null,
    ftp: null,
    maxHR: hrStream ? Math.max(...hrStream) : null,
  });
  return { powerCurve, rideAnalytics, samples: powerStream.length };
}

// ── Source resolution ──────────────────────────────────────────────────────

function resolveSource(row) {
  if (row.fit_storage_path) return { kind: 'fit_storage' };
  const power = row.streamPower;
  if (Array.isArray(power) && row.moving_time && power.length >= 0.8 * row.moving_time) {
    return { kind: 'stored_streams' };
  }
  const stravaId = row.stravaIdA || row.stravaIdB;
  if (stravaId) return { kind: 'strava_api', stravaId };
  return { kind: 'unreachable', reason: row.fit_storage_path === null && !power ? 'no FIT bytes, no streams, no Strava id' : 'streams not per-second-faithful, no Strava id' };
}

async function computeForRow(row, source) {
  if (source.kind === 'fit_storage') {
    const { data, error } = await supabase.storage.from('garmin-fit').download(row.fit_storage_path);
    if (error) throw new Error(`FIT download failed: ${error.message}`);
    const buffer = Buffer.from(await data.arrayBuffer());
    const parsed = await parseFitBuffer(buffer, null);
    return {
      powerCurve: parsed?.powerMetrics?.powerCurveSummary ?? null,
      rideAnalytics: parsed?.rideAnalytics ?? null,
      samples: null,
    };
  }
  if (source.kind === 'stored_streams') {
    return computeFromSamples(row.streamPower, row.streamHr);
  }
  // strava_api
  await sleep(STRAVA_GAP_MS);
  const streams = await fetchStravaStreams(source.stravaId);
  if (streams.notFound) throw new Error('Strava activity not found (404)');
  return computeFromSamples(streams.watts?.data, streams.heartrate?.data);
}

// ── Candidate query (cleaned-inputs contract: non-hidden, non-duplicate) ───

const RIDE_SELECT =
  'id, start_date, moving_time, average_watts, fit_storage_path, ' +
  'stravaIdA:raw_data->>id, stravaIdB:raw_data->strava_data->>id, ' +
  'streamPower:activity_streams->power, streamHr:activity_streams->heartRate, ' +
  'power_curve_summary, ride_analytics, provider';

function baseQuery() {
  return supabase
    .from('activities')
    .select(RIDE_SELECT)
    .eq('user_id', USER_ID)
    .is('duplicate_of', null)
    .or('is_hidden.is.null,is_hidden.eq.false')
    .not('average_watts', 'is', null)
    .not('type', 'in', '("Run","TrailRun","Walk","Hike","VirtualRun")')
    .order('start_date', { ascending: true });
}

// ── Validation mode: recompute rides that ALREADY have curves, diff, log ───

async function runValidation(n) {
  const { data: rides, error } = await baseQuery()
    .not('power_curve_summary', 'is', null)
    .limit(400);
  if (error) throw new Error(error.message);
  const candidates = rides.filter((r) => (r.stravaIdA || r.stravaIdB) && !r.fit_storage_path);
  // Deterministic spread across the date range rather than Math.random —
  // reproducible validation set.
  const step = Math.max(1, Math.floor(candidates.length / n));
  const sample = candidates.filter((_, i) => i % step === 0).slice(0, n);
  console.log(`Validation: ${sample.length} rides with stored curves + Strava id (cross-source, tolerance expected)`);

  const durations = ['60s', '300s', '1200s'];
  const discrepancies = [];
  for (const row of sample) {
    try {
      const computed = await computeForRow(row, { kind: 'strava_api', stravaId: row.stravaIdA || row.stravaIdB });
      const stored = row.power_curve_summary;
      const deltas = {};
      for (const d of durations) {
        if (stored?.[d] && computed.powerCurve?.[d]) {
          deltas[d] = Math.round(((computed.powerCurve[d] - stored[d]) / stored[d]) * 1000) / 10;
        }
      }
      const worst = Math.max(...Object.values(deltas).map(Math.abs), 0);
      const flag = worst > 3 ? ' ⚠ >3%' : '';
      console.log(`  ${row.start_date.slice(0, 10)} ${row.id}  Δ% ${JSON.stringify(deltas)}${flag}`);
      if (worst > 3) discrepancies.push({ id: row.id, deltas });
    } catch (err) {
      console.log(`  ${row.start_date.slice(0, 10)} ${row.id}  validation fetch failed: ${err.message}`);
    }
  }
  console.log(`\nValidation done: ${discrepancies.length}/${sample.length} rides exceed ±3% on any duration (logged only; stored values untouched)`);
  if (discrepancies.length) console.log(JSON.stringify(discrepancies, null, 1));
}

// ── Main backfill ──────────────────────────────────────────────────────────

async function main() {
  if (VALIDATE_N > 0) return runValidation(VALIDATE_N);

  const { data: rides, error } = await baseQuery()
    .or('power_curve_summary.is.null,ride_analytics.is.null')
    .limit(LIMIT);
  if (error) throw new Error(error.message);

  // Planned counts, recorded BEFORE any write (approved backfill contract).
  const planned = { curves: 0, analytics: 0 };
  const bySource = {};
  const work = [];
  for (const row of rides) {
    const source = resolveSource(row);
    bySource[source.kind] = (bySource[source.kind] || 0) + 1;
    if (source.kind === 'unreachable') {
      console.log(`  unreachable ${row.start_date.slice(0, 10)} ${row.id} (${row.provider}): ${source.reason}`);
      continue;
    }
    if (row.power_curve_summary === null) planned.curves++;
    if (row.ride_analytics === null) planned.analytics++;
    work.push({ row, source });
  }
  console.log(`\nCandidates: ${rides.length} | sources: ${JSON.stringify(bySource)}`);
  console.log(`Planned fills: ${planned.curves} power_curve_summary, ${planned.analytics} ride_analytics`);

  if (!COMMIT) {
    console.log('\nDRY RUN — no API fetches, no writes. Re-run with --commit to execute.');
    return;
  }

  const created = { curves: 0, analytics: 0 };
  const failed = [];
  for (const { row, source } of work) {
    try {
      const computed = await computeForRow(row, source);
      if (row.power_curve_summary === null && computed.powerCurve) {
        const { data: upd, error: e1 } = await supabase
          .from('activities')
          .update({ power_curve_summary: computed.powerCurve })
          .eq('id', row.id)
          .is('power_curve_summary', null) // re-guard: never overwrite
          .select('id');
        if (e1) throw new Error(`curve update: ${e1.message}`);
        created.curves += upd?.length ?? 0;
      }
      if (row.ride_analytics === null && computed.rideAnalytics) {
        const { data: upd, error: e2 } = await supabase
          .from('activities')
          .update({ ride_analytics: computed.rideAnalytics })
          .eq('id', row.id)
          .is('ride_analytics', null) // re-guard: never overwrite
          .select('id');
        if (e2) throw new Error(`analytics update: ${e2.message}`);
        created.analytics += upd?.length ?? 0;
      }
      console.log(`  ✓ ${row.start_date.slice(0, 10)} ${row.id} [${source.kind}] curve=${!!computed.powerCurve} analytics=${!!computed.rideAnalytics}`);
    } catch (err) {
      failed.push({ id: row.id, date: row.start_date.slice(0, 10), error: err.message });
      console.log(`  ✗ ${row.start_date.slice(0, 10)} ${row.id} [${source.kind}]: ${err.message}`);
    }
  }

  console.log(`\nCreated: ${created.curves} curves (planned ${planned.curves}), ${created.analytics} analytics (planned ${planned.analytics})`);
  console.log(`Failed: ${failed.length}`);
  if (failed.length) console.log(JSON.stringify(failed, null, 1));
  // A ride can legitimately produce no value (e.g. curve returns null on <5
  // samples) — those show as planned-but-not-created and are listed above.
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
