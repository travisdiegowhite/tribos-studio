/**
 * Training Load Recompute — populates training_load_daily for a user.
 *
 * This is the population half of docs/tfi-duality-decision.md option (a):
 * the readers (Today, Glance, Spine, Dashboard, /train) all prefer
 * per-day training_load_daily rows and client-fill missing days, so this
 * writer is the single switch that moves the displayed fitness numbers
 * from the client EWA (fixed tau, no terrain/MTB, 90-day cold start) to
 * the spec-faithful server math.
 *
 * Semantics:
 *  - Recomputes the full trailing window (default 180 days) on every run
 *    and bulk-upserts. Self-healing: backdated uploads, edits, deletions,
 *    and duplicate-marking are all absorbed by the next run.
 *  - Writes THROUGH YESTERDAY (user's timezone) by default. Readers
 *    prefer a server row when one exists for a date; a today row written
 *    by the nightly cron (i.e. before today's ride) would be a frozen
 *    0-RSS row that masks the ride until the next run, so the cron never
 *    includes today. Ingest-triggered refreshes pass includeToday: true
 *    — they run precisely because an activity just landed, so the today
 *    row they write already contains it, and re-triggering on each new
 *    activity keeps it current.
 *  - Dates are the user's LOCAL calendar dates (user_profiles.timezone,
 *    same convention as api/process-deviation.js).
 *  - Per-activity RSS via estimateTSSWithSource (6-tier, terrain + MTB
 *    multipliers per spec §3.1 amendments D1/D2/D4), capped at 500 per
 *    activity to match every reader-side series.
 *  - TFI/AFI EWA with the athlete's adaptive tau (user_profiles.tfi_tau /
 *    afi_tau, default 42/7). The walk is SEEDED from the stored
 *    training_load_daily row immediately before the window (decayed across
 *    any gap), so the trailing window is continuous with history and the
 *    nightly upsert can no longer overwrite a row that is aging out of the
 *    window with a "day 1 of cold start" value — the bug that froze
 *    near-zero tfi/afi into every date older than 180 days. Only a user
 *    with no stored row at all (true first run) cold-starts from 0.
 *  - form_score = yesterday's TFI − AFI (spec §3.6); first day falls back
 *    to same-day, matching upsertTrainingLoadDaily.
 *  - Rest days get confidence 1.0: a day with no recorded activity is a
 *    known zero, not low-quality data — otherwise fs_confidence would
 *    penalize every athlete who doesn't ride daily.
 *  - tfi_composition is left NULL here (spec §3.4 composition tracking is
 *    a separate enhancement — see METRICS_ROLLOUT_FREEZE.md §2a).
 *
 *  - Per-sport split (migration 133): the same RSS and EWMA state broken down
 *    into cycling / running / other, with the athlete's taus, so the sports
 *    add up to the combined row (the EWMA is linear). Runs are scored against
 *    the athlete's own thresholds (api/utils/runLoad.js — entered values
 *    first, else estimated from their run history). If migration 133 is not
 *    applied, the split columns are dropped and the combined row still writes.
 *
 * This module is the ONLY writer of training_load_daily —
 * process-deviation.js also routes its writes through
 * recomputeTrainingLoadForUser (includeToday: true) rather than
 * hand-stepping single-day rows, so redelivered webhooks and same-day
 * second activities are naturally idempotent.
 */

import {
  estimateTSSWithSource,
  calculateFormScoreConfidence,
} from './fitnessSnapshots.js';
import { resolveRunProfile } from './runLoad.js';
import { isRunningActivityRow, sportTypeOfActivity } from './sportTypes.js';

const DEFAULT_WINDOW_DAYS = 180;
const PER_ACTIVITY_RSS_CAP = 500;
const UPSERT_CHUNK = 500;
const DEFAULT_TZ = 'America/New_York';

/** The per-sport buckets of migration 133. */
export const SPLIT_SPORTS = ['cycling', 'running', 'other'];
export const SPLIT_COLUMNS = SPLIT_SPORTS.flatMap((s) => [`rss_${s}`, `tfi_${s}`, `afi_${s}`]);

const RUN_ANCHOR_COLUMNS = 'threshold_pace_sec, vdot, lthr, max_hr, resting_hr';
/** History that run thresholds are estimated from, whatever window is being written. */
const RUN_HISTORY_DAYS = DEFAULT_WINDOW_DAYS;
const RUN_FIELDS =
  'start_date, type, sport_type, moving_time, distance, total_elevation_gain, ' +
  'average_heartrate, max_heartrate';

/**
 * Set once a write has failed because migration 133's columns are missing, so
 * a cron sweeping many users doesn't fail-and-retry every one of them.
 */
let splitColumnsMissing = false;

/** Test hook: forget a previous missing-column fallback. */
export function resetSplitColumnsFallback() {
  splitColumnsMissing = false;
}

/** True for PostgREST's "that column doesn't exist" family of errors. */
export function isMissingSplitColumnError(error) {
  const msg = String(error?.message || '');
  return (
    /(rss|tfi|afi)_(cycling|running|other)/.test(msg) &&
    /(does not exist|schema cache|Could not find)/i.test(msg)
  );
}

const withoutSplit = (row) => {
  const copy = { ...row };
  for (const c of SPLIT_COLUMNS) delete copy[c];
  return copy;
};

/** YYYY-MM-DD for `date` in the given IANA timezone. */
export function localDateKey(date, timeZone) {
  return new Date(date).toLocaleDateString('en-CA', { timeZone });
}

function addDaysKey(dateKey, days) {
  const d = new Date(`${dateKey}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const round1 = (v) => Math.round(v * 10) / 10;
const round2 = (v) => Math.round(v * 100) / 100;

/** Days between two YYYY-MM-DD keys (b − a). */
function daysBetweenKeys(a, b) {
  return Math.round(
    (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000,
  );
}

/**
 * Seed tfi/afi from the last stored row before the window start, decaying
 * across any gap as zero-RSS days. Returns null when no prior row exists
 * (true cold start).
 *
 * `sports` carries the per-sport split of that row (migration 133), decayed
 * the same way, or null when the row predates it or the columns are missing —
 * the caller then apportions the combined seed. Read in a second, fail-soft
 * query so an unapplied migration cannot break seeding.
 */
export async function fetchSeedState(supabase, userId, startKey, tfiTau, afiTau) {
  const { data: prior, error } = await supabase
    .from('training_load_daily')
    .select('date, tfi, afi')
    .eq('user_id', userId)
    .lt('date', startKey)
    .order('date', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`seed row fetch failed: ${error.message}`);
  if (!prior || !Number.isFinite(Number(prior.tfi))) return null;

  let sports = null;
  if (!splitColumnsMissing) {
    const { data: split, error: splitError } = await supabase
      .from('training_load_daily')
      .select(SPLIT_SPORTS.flatMap((sp) => [`tfi_${sp}`, `afi_${sp}`]).join(', '))
      .eq('user_id', userId)
      .eq('date', prior.date)
      .maybeSingle();
    if (!splitError && split && SPLIT_SPORTS.every((sp) => Number.isFinite(Number(split[`tfi_${sp}`])) && split[`tfi_${sp}`] != null)) {
      sports = Object.fromEntries(
        SPLIT_SPORTS.map((sp) => [sp, { tfi: Number(split[`tfi_${sp}`]), afi: Number(split[`afi_${sp}`]) || 0 }]),
      );
    }
  }

  let tfi = Number(prior.tfi);
  let afi = Number(prior.afi) || 0;

  // Decay across the gap between the prior row and the day before startKey.
  // Nightly cadence makes this 0 days; a lapsed user resuming after months
  // gets correct decay instead of a stale jump. Past ~10×tfiTau days the
  // state is indistinguishable from zero (e^-10), so cap the walk there.
  const gapDays = Math.min(
    Math.max(daysBetweenKeys(prior.date, startKey) - 1, 0),
    Math.ceil(tfiTau * 10),
  );
  for (let i = 0; i < gapDays; i++) {
    tfi = tfi + (0 - tfi) / tfiTau;
    afi = afi + (0 - afi) / afiTau;
    if (sports) {
      for (const sp of SPLIT_SPORTS) {
        sports[sp].tfi += (0 - sports[sp].tfi) / tfiTau;
        sports[sp].afi += (0 - sports[sp].afi) / afiTau;
      }
    }
  }
  return { tfi, afi, sports };
}

/**
 * Split a combined seed across sports when the stored row has no split
 * (written before migration 133): by each sport's share of the window's RSS,
 * or all to cycling for an empty window. Keeps sum-over-sports = combined from
 * the first day; the shares wash out within a few TFI time constants.
 */
export function apportionSeed(seed, rssBySport) {
  const total = SPLIT_SPORTS.reduce((sum, sp) => sum + (rssBySport[sp] || 0), 0);
  return Object.fromEntries(
    SPLIT_SPORTS.map((sp) => {
      const share = total > 0 ? (rssBySport[sp] || 0) / total : sp === 'cycling' ? 1 : 0;
      return [sp, { tfi: seed.tfi * share, afi: seed.afi * share }];
    }),
  );
}

/**
 * The athlete's run-load anchors: entered thresholds from user_profiles, the
 * rest estimated from `runs`. Fail-soft — a failed read yields estimates only.
 */
async function fetchRunAnchors(supabase, userId) {
  const { data, error } = await supabase
    .from('user_profiles')
    .select(RUN_ANCHOR_COLUMNS)
    .eq('id', userId)
    .maybeSingle();
  if (error) {
    console.warn('[trainingLoadRecompute] run anchors unavailable:', error.message);
    return null;
  }
  return data ?? null;
}

/**
 * Resolve a user's run profile on its own — for callers outside the recompute
 * (process-deviation) and for short recompute windows, which must score a run
 * exactly as the nightly recompute does: same RUN_HISTORY_DAYS before `now`.
 */
export async function loadRunProfile(supabase, userId, { now = new Date() } = {}) {
  const since = new Date(now.getTime() - RUN_HISTORY_DAYS * 86400000).toISOString();
  const [anchors, { data: recent, error }] = await Promise.all([
    fetchRunAnchors(supabase, userId),
    supabase
      .from('activities')
      .select(RUN_FIELDS)
      .eq('user_id', userId)
      .or('is_hidden.eq.false,is_hidden.is.null')
      .is('duplicate_of', null)
      .gte('start_date', since)
      .limit(1000),
  ]);
  if (error) console.warn('[trainingLoadRecompute] run history unavailable:', error.message);
  return resolveRunProfile(anchors, (recent ?? []).filter(isRunningActivityRow));
}

/**
 * Compute the per-day training load rows for a user without writing.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {{ days?: number, now?: Date, includeToday?: boolean }} [opts]
 * @returns {Promise<{rows: Array<object>, profile: {ftp: number|null, tfiTau: number, afiTau: number, timezone: string}}>}
 */
export async function computeTrainingLoadRows(supabase, userId, opts = {}) {
  const days = opts.days ?? DEFAULT_WINDOW_DAYS;
  const now = opts.now ?? new Date();

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('timezone, ftp, tfi_tau, afi_tau')
    .eq('id', userId)
    .maybeSingle();

  const timezone = profile?.timezone || DEFAULT_TZ;
  const ftp = profile?.ftp ?? null;
  const tfiTau = Number(profile?.tfi_tau) > 0 ? Number(profile.tfi_tau) : 42;
  const afiTau = Number(profile?.afi_tau) > 0 ? Number(profile.afi_tau) : 7;

  // Window: [today - days, yesterday] in the user's local calendar —
  // or through today itself for ingest-triggered refreshes (see header).
  const todayKey = localDateKey(now, timezone);
  const endKey = opts.includeToday ? todayKey : addDaysKey(todayKey, -1);
  const startKey = addDaysKey(todayKey, -days);

  // Fetch activities with a ±1-day UTC buffer so timezone conversion can't
  // drop edge activities out of the window. Paginated: supabase-js silently
  // caps un-ranged selects at 1000 rows, which a full-history rebuild
  // (opts.days spanning years) or a very active user would exceed.
  const PAGE_SIZE = 1000;
  const activities = [];
  for (let page = 0; ; page++) {
    const { data: batch, error } = await supabase
      .from('activities')
      .select(
        'start_date, type, sport_type, moving_time, distance, ' +
          'total_elevation_gain, average_watts, average_heartrate, max_heartrate, ' +
          'kilojoules, rss, tss, effective_power, normalized_power',
      )
      .eq('user_id', userId)
      .or('is_hidden.eq.false,is_hidden.is.null')
      .is('duplicate_of', null)
      .gte('start_date', `${addDaysKey(startKey, -1)}T00:00:00Z`)
      .lte('start_date', `${addDaysKey(endKey, 2)}T00:00:00Z`)
      .order('start_date', { ascending: true })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (error) throw new Error(`activities fetch failed: ${error.message}`);
    activities.push(...(batch ?? []));
    if (!batch || batch.length < PAGE_SIZE) break;
  }

  // Run thresholds: entered values first, the rest estimated from the runs of
  // the RUN_HISTORY_DAYS before `now` — never from "this window", or the
  // 30-day ingest refresh and the 180-day nightly run would estimate
  // different thresholds and keep overwriting each other's rows.
  const historyStartMs = now.getTime() - RUN_HISTORY_DAYS * 86400000;
  const runProfile =
    days >= RUN_HISTORY_DAYS
      ? resolveRunProfile(
          await fetchRunAnchors(supabase, userId),
          activities.filter((a) => isRunningActivityRow(a) && Date.parse(a.start_date) >= historyStartMs),
        )
      : await loadRunProfile(supabase, userId, { now });

  // Bucket per local day. Track the dominant (largest-RSS) activity's
  // source/terrain for the day's rss_source/terrain_class, and the RSS per
  // sport for the split.
  const byDay = new Map();
  const windowRssBySport = { cycling: 0, running: 0, other: 0 };
  for (const a of activities ?? []) {
    if (!a.start_date) continue;
    const day = localDateKey(a.start_date, timezone);
    if (day < startKey || day > endKey) continue;
    const est = estimateTSSWithSource(a, ftp, runProfile);
    const rss = Math.min(est.tss || 0, PER_ACTIVITY_RSS_CAP);
    const sport = sportTypeOfActivity(a);
    const bucket = byDay.get(day) ?? {
      rss: 0,
      bySport: { cycling: 0, running: 0, other: 0 },
      weightedConfidence: 0,
      topRss: -1,
      source: null,
      terrain: null,
    };
    bucket.rss += rss;
    bucket.bySport[sport] += rss;
    windowRssBySport[sport] += rss;
    bucket.weightedConfidence += rss * (est.confidence ?? 0);
    if (rss > bucket.topRss) {
      bucket.topRss = rss;
      bucket.source = est.source;
      bucket.terrain = est.terrain_class ?? null;
    }
    byDay.set(day, bucket);
  }

  // Walk the window with the adaptive-tau EWA, seeded from the stored row
  // before the window (continuity with history; see header). No stored row
  // → true cold start from 0.
  const seed = await fetchSeedState(supabase, userId, startKey, tfiTau, afiTau);
  const rows = [];
  const confidenceTrail = [];
  let tfi = seed?.tfi ?? 0;
  let afi = seed?.afi ?? 0;
  const split = seed
    ? seed.sports ?? apportionSeed(seed, windowRssBySport)
    : Object.fromEntries(SPLIT_SPORTS.map((sp) => [sp, { tfi: 0, afi: 0 }]));

  for (let key = startKey; key <= endKey; key = addDaysKey(key, 1)) {
    const bucket = byDay.get(key);
    const rss = bucket?.rss ?? 0;
    // Rest day = certain zero (see header). Activity day = RSS-weighted
    // mean of the activities' tier confidences.
    const confidence =
      bucket && bucket.rss > 0
        ? round2(bucket.weightedConfidence / bucket.rss)
        : 1.0;

    const prevTfi = tfi;
    const prevAfi = afi;
    tfi = tfi + (rss - tfi) / tfiTau;
    afi = afi + (rss - afi) / afiTau;
    const splitColumns = {};
    for (const sp of SPLIT_SPORTS) {
      const sportRss = bucket?.bySport[sp] ?? 0;
      split[sp].tfi += (sportRss - split[sp].tfi) / tfiTau;
      split[sp].afi += (sportRss - split[sp].afi) / afiTau;
      splitColumns[`rss_${sp}`] = round1(sportRss);
      splitColumns[`tfi_${sp}`] = round2(split[sp].tfi);
      splitColumns[`afi_${sp}`] = round2(split[sp].afi);
    }

    confidenceTrail.push(confidence);
    if (confidenceTrail.length > 7) confidenceTrail.shift();

    // Spec §3.6 — yesterday's state. With a seed, the first row's
    // "yesterday" is the seeded state (prevTfi/prevAfi); only a true cold
    // start falls back to same-day (matches upsertTrainingLoadDaily so the
    // two writers agree).
    const formScore =
      rows.length > 0 || seed
        ? round2(prevTfi - prevAfi)
        : round2(tfi - afi);

    rows.push({
      user_id: userId,
      date: key,
      rss: round1(rss),
      tfi: round2(tfi),
      afi: round2(afi),
      form_score: formScore,
      rss_source: bucket && bucket.rss > 0 ? bucket.source : null,
      confidence,
      fs_confidence: calculateFormScoreConfidence(confidenceTrail),
      terrain_class: bucket?.terrain ?? null,
      tfi_composition: null,
      tfi_tau: tfiTau,
      afi_tau: afiTau,
      ...splitColumns,
    });
  }

  return { rows, profile: { ftp, tfiTau, afiTau, timezone }, runProfile };
}

/**
 * Recompute and persist the trailing window for one user.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {{ days?: number, dryRun?: boolean, now?: Date, includeToday?: boolean }} [opts]
 * @returns {Promise<{rowsWritten: number, lastDay: object|null, dryRun: boolean, runProfile?: object|null, timezone?: string}>}
 */
export async function recomputeTrainingLoadForUser(supabase, userId, opts = {}) {
  const { rows, profile, runProfile } = await computeTrainingLoadRows(supabase, userId, opts);
  const lastDay = rows.length > 0 ? rows[rows.length - 1] : null;

  if (opts.dryRun) {
    return { rowsWritten: 0, lastDay, dryRun: true, runProfile, timezone: profile.timezone };
  }

  for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
    const chunk = rows.slice(i, i + UPSERT_CHUNK);
    let { error } = await supabase
      .from('training_load_daily')
      .upsert(splitColumnsMissing ? chunk.map(withoutSplit) : chunk, { onConflict: 'user_id,date' });
    // Migration 133 not applied: write the combined load without the split
    // rather than stop updating everyone's fitness.
    if (error && !splitColumnsMissing && isMissingSplitColumnError(error)) {
      splitColumnsMissing = true;
      console.error(
        '[trainingLoadRecompute] per-sport columns missing — apply migration 133. Writing combined load only.',
      );
      ({ error } = await supabase
        .from('training_load_daily')
        .upsert(chunk.map(withoutSplit), { onConflict: 'user_id,date' }));
    }
    if (error) throw new Error(`training_load_daily upsert failed: ${error.message}`);
  }

  return { rowsWritten: rows.length, lastDay, dryRun: false, runProfile, timezone: profile.timezone };
}

/**
 * Users with at least one activity in the trailing window — the nightly
 * roll-forward set.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {number} [days]
 * @returns {Promise<string[]>}
 */
export async function findActiveUserIds(supabase, days = DEFAULT_WINDOW_DAYS) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const { data, error } = await supabase
    .from('activities')
    .select('user_id')
    .gte('start_date', since.toISOString());
  if (error) throw new Error(`active-user scan failed: ${error.message}`);
  return [...new Set((data ?? []).map((r) => r.user_id).filter(Boolean))];
}
