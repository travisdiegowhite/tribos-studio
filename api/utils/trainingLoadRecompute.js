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
 *  - Writes THROUGH YESTERDAY (user's timezone), never today. Readers
 *    prefer a server row when one exists for a date; a today row written
 *    before today's ride would mask the ride until the next run. With no
 *    today row, every reader client-fills today from yesterday's stored
 *    state, which stays live as activities land.
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
 * process-deviation.js keeps using upsertTrainingLoadDaily for its
 * single-day incremental writes; the nightly recompute reconciles both.
 */

import {
  estimateTSSWithSource,
  calculateFormScoreConfidence,
} from './fitnessSnapshots.js';

const DEFAULT_WINDOW_DAYS = 180;
const PER_ACTIVITY_RSS_CAP = 500;
const UPSERT_CHUNK = 500;
const DEFAULT_TZ = 'America/New_York';

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
 */
async function fetchSeedState(supabase, userId, startKey, tfiTau, afiTau) {
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
  }
  return { tfi, afi };
}

/**
 * Compute the per-day training load rows for a user without writing.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {{ days?: number, now?: Date }} [opts]
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

  // Window: [today - days, yesterday] in the user's local calendar.
  const todayKey = localDateKey(now, timezone);
  const endKey = addDaysKey(todayKey, -1);
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
          'total_elevation_gain, average_watts, average_heartrate, ' +
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

  // Bucket per local day. Track the dominant (largest-RSS) activity's
  // source/terrain for the day's rss_source/terrain_class.
  const byDay = new Map();
  for (const a of activities ?? []) {
    if (!a.start_date) continue;
    const day = localDateKey(a.start_date, timezone);
    if (day < startKey || day > endKey) continue;
    const est = estimateTSSWithSource(a, ftp);
    const rss = Math.min(est.tss || 0, PER_ACTIVITY_RSS_CAP);
    const bucket = byDay.get(day) ?? {
      rss: 0,
      weightedConfidence: 0,
      topRss: -1,
      source: null,
      terrain: null,
    };
    bucket.rss += rss;
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
    });
  }

  return { rows, profile: { ftp, tfiTau, afiTau, timezone } };
}

/**
 * Recompute and persist the trailing window for one user.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {{ days?: number, dryRun?: boolean, now?: Date }} [opts]
 * @returns {Promise<{rowsWritten: number, lastDay: object|null, dryRun: boolean}>}
 */
export async function recomputeTrainingLoadForUser(supabase, userId, opts = {}) {
  const { rows } = await computeTrainingLoadRows(supabase, userId, opts);
  const lastDay = rows.length > 0 ? rows[rows.length - 1] : null;

  if (opts.dryRun) {
    return { rowsWritten: 0, lastDay, dryRun: true };
  }

  for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
    const chunk = rows.slice(i, i + UPSERT_CHUNK);
    const { error } = await supabase
      .from('training_load_daily')
      .upsert(chunk, { onConflict: 'user_id,date' });
    if (error) throw new Error(`training_load_daily upsert failed: ${error.message}`);
  }

  return { rowsWritten: rows.length, lastDay, dryRun: false };
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
