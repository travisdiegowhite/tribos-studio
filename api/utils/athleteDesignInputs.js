/**
 * athleteDesignInputs — everything the session designer knows about one
 * athlete, fetched in one batch and mapped by a pure function.
 *
 * Same discipline as toRiderState.js: a field we cannot measure is null,
 * never a default. The designer reads null as "unknown" and says so in its
 * rationale rather than inventing a number.
 *
 * Sources:
 *   user_profiles         ftp, weight, recovery mode, age
 *   fitness_snapshots     weekly FTP record → how old the current FTP is;
 *                         estimated FTP and its confidence
 *   activities (90 d)     power_curve_summary → 1/5/20-minute bests, CP and W′,
 *                         rides per week (consistency)
 *   training_load_daily   form score, four-day fatigue growth
 *
 * Readiness (the morning check-in) is NOT read here: the coach already runs
 * the rules engine, and passes its call (`skip` / `modify` / null) in.
 */

import { ageFromProfile } from './coachingBible.js';
import { sportTypeOfActivity } from './sportTypes.js';
import { coefficientsForMode } from './sequencerBlockOps.js';

const DAY_MS = 86400000;

// ─── Fetch ───────────────────────────────────────────────────────────────────

/**
 * @param {object} supabase  service-role client (api/utils/supabaseAdmin.js)
 * @param {string} userId    VERIFIED athlete id — the security boundary
 * @param {Date}   [now]
 */
export async function fetchAthleteDesignInputs(supabase, userId, now = new Date()) {
  const sinceIso = (days) => new Date(now.getTime() - days * DAY_MS).toISOString();
  const sinceDate = (days) => new Date(now.getTime() - days * DAY_MS).toISOString().slice(0, 10);
  const safe = (p, label) =>
    p.then(
      (r) => (r?.error ? (console.error(`athleteDesignInputs ${label}:`, r.error.message), null) : r?.data ?? null),
      (e) => (console.error(`athleteDesignInputs ${label}:`, e.message), null),
    );

  const [profile, snapshots, activities, load] = await Promise.all([
    safe(
      supabase
        .from('user_profiles')
        .select('ftp, weight_kg, recovery_mode, date_of_birth, birth_year, metrics_age')
        .eq('id', userId)
        .maybeSingle(),
      'user_profiles',
    ),
    safe(
      supabase
        .from('fitness_snapshots')
        .select('snapshot_week, ftp, estimated_ftp, ftp_estimation_confidence, best_efforts')
        .eq('user_id', userId)
        .gte('snapshot_week', sinceDate(200))
        .order('snapshot_week', { ascending: false })
        .limit(30),
      'fitness_snapshots',
    ),
    safe(
      supabase
        .from('activities')
        .select('start_date, sport_type, type, power_curve_summary')
        .eq('user_id', userId)
        .is('duplicate_of', null)
        .or('is_hidden.eq.false,is_hidden.is.null')
        .gte('start_date', sinceIso(90))
        .order('start_date', { ascending: false })
        .limit(300),
      'activities',
    ),
    safe(
      supabase
        .from('training_load_daily')
        .select('date, tfi, afi, form_score, fs_confidence')
        .eq('user_id', userId)
        .gte('date', sinceDate(14))
        .order('date', { ascending: false }),
      'training_load_daily',
    ),
  ]);

  return { profile, snapshots, activities, load };
}

// ─── Pure helpers ────────────────────────────────────────────────────────────

function daysBetween(fromKey, toKey) {
  const a = Date.parse(`${fromKey}T00:00:00Z`);
  const b = Date.parse(`${toKey}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / DAY_MS);
}

/**
 * How long the profile FTP has stood, from the weekly snapshot record.
 *
 * Snapshots run every Monday and copy the profile FTP into `ftp`. Walking
 * back from the newest, the streak of snapshots that equal today's FTP
 * bounds when it was last changed. Newest snapshot disagreeing with the
 * profile means it changed since — under a week old.
 *
 * Returns null with no snapshots: unknown, not zero.
 */
export function ftpAgeDaysFromSnapshots(profileFtp, snapshots, todayStr) {
  if (!profileFtp || !Array.isArray(snapshots) || snapshots.length === 0) return null;
  const sorted = [...snapshots]
    .filter((s) => s?.snapshot_week)
    .sort((a, b) => (a.snapshot_week < b.snapshot_week ? 1 : -1));
  if (sorted.length === 0) return null;
  if (Number(sorted[0].ftp) !== Number(profileFtp)) {
    return Math.max(0, Math.min(6, daysBetween(sorted[0].snapshot_week, todayStr) ?? 0));
  }
  let oldest = sorted[0].snapshot_week;
  for (const s of sorted) {
    if (Number(s.ftp) === Number(profileFtp)) oldest = s.snapshot_week;
    else break;
  }
  return daysBetween(oldest, todayStr);
}

function isRide(activity) {
  return sportTypeOfActivity(activity) === 'cycling';
}

/** Best power at the durations the designer reads, over the window. */
export function bestsFromActivities(activities) {
  const keys = { p60: '60s', p300: '300s', p600: '600s', p1200: '1200s' };
  const out = { p60: null, p300: null, p600: null, p1200: null };
  let any = false;
  for (const a of activities || []) {
    if (!isRide(a) || !a?.power_curve_summary) continue;
    for (const [field, key] of Object.entries(keys)) {
      const v = Number(a.power_curve_summary[key]);
      if (Number.isFinite(v) && v > 0 && (out[field] == null || v > out[field])) {
        out[field] = Math.round(v);
        any = true;
      }
    }
  }
  return any ? out : null;
}

/**
 * Critical power and W′ from the bests, two-parameter model (P = CP + W′/t).
 * Server port of src/components/CriticalPowerModel.jsx estimateCPandWPrime;
 * keep the two in step. Returns null rather than a guess when the fit is
 * implausible or there are fewer than three points.
 */
export function criticalPowerFromBests(bests) {
  if (!bests) return null;
  const points = [[60, bests.p60], [300, bests.p300], [600, bests.p600], [1200, bests.p1200]]
    .filter(([, p]) => Number.isFinite(p) && p > 0);
  if (points.length < 3) return null;
  const n = points.length;
  let sumT = 0; let sumW = 0; let sumT2 = 0; let sumTW = 0;
  for (const [t, p] of points) {
    const w = p * t;
    sumT += t; sumW += w; sumT2 += t * t; sumTW += t * w;
  }
  const denom = n * sumT2 - sumT * sumT;
  if (denom === 0) return null;
  const cp = (n * sumTW - sumT * sumW) / denom;
  const wPrime = (sumW - cp * sumT) / n;
  if (cp < 50 || cp > 500 || wPrime < 5000 || wPrime > 50000) return null;
  return { cp: Math.round(cp), wPrime: Math.round(wPrime) };
}

/** Rides per week over the last 28 days, from activity rows. */
export function ridesPerWeek(activities, todayStr) {
  if (!Array.isArray(activities)) return null;
  const since = Date.parse(`${todayStr}T00:00:00Z`) - 28 * DAY_MS;
  if (Number.isNaN(since)) return null;
  const rides = activities.filter((a) => isRide(a) && Date.parse(a.start_date) >= since);
  return Math.round((rides.length / 4) * 10) / 10;
}

/** Four-day AFI growth, the sequencer's definition. Null with too few rows. */
export function afiGrowth4dFromLoad(loadRows) {
  const rows = [...(loadRows || [])].sort((a, b) => (a.date < b.date ? 1 : -1));
  if (rows.length < 5) return null;
  const today = Number(rows[0].afi);
  const before = Number(rows[4].afi);
  if (!(before > 0) || !Number.isFinite(today)) return null;
  return (today - before) / before;
}

// ─── The adapter ─────────────────────────────────────────────────────────────

/**
 * @param {object} data      result of fetchAthleteDesignInputs
 * @param {object} o
 * @param {string} o.todayStr  athlete-local YYYY-MM-DD
 * @param {string|null} [o.readinessCall]  'skip' | 'modify' | null, from the rules engine
 * @param {string|null} [o.pdShortTrend]   from the evidence engine
 * @param {number|null} [o.goalDurationMin] the goal event's expected duration
 */
export function toAthleteDesign(data, { todayStr, readinessCall = null, pdShortTrend = null, goalDurationMin = null } = {}) {
  const d = data || {};
  const profile = d.profile || {};
  const ftp = Number(profile.ftp) > 0 ? Math.round(Number(profile.ftp)) : null;
  const bests = bestsFromActivities(d.activities);
  const cpw = criticalPowerFromBests(bests);
  const recoveryMode = profile.recovery_mode || 'standard';
  const coefficients = coefficientsForMode(recoveryMode);
  const latestLoad = [...(d.load || [])].sort((a, b) => (a.date < b.date ? 1 : -1))[0] || null;
  const latestSnapshot = [...(d.snapshots || [])].sort((a, b) => (a.snapshot_week < b.snapshot_week ? 1 : -1))[0] || null;

  return {
    ftp,
    ftpAgeDays: ftpAgeDaysFromSnapshots(ftp, d.snapshots, todayStr),
    estimatedFtp: latestSnapshot?.estimated_ftp ?? null,
    estimatedFtpConfidence: latestSnapshot?.ftp_estimation_confidence ?? null,
    weightKg: Number(profile.weight_kg) > 0 ? Number(profile.weight_kg) : null,
    age: ageFromProfile(profile),
    recoveryMode,
    afiGrowthCeiling: coefficients?.afi_growth_ceiling_4d ?? 0.25,
    ridesPerWeek4wk: ridesPerWeek(d.activities, todayStr),
    bests,
    cp: cpw?.cp ?? null,
    wPrime: cpw?.wPrime ?? null,
    tfi: latestLoad?.tfi ?? null,
    afi: latestLoad?.afi ?? null,
    formScore: latestLoad?.form_score ?? null,
    formConfidence: latestLoad?.fs_confidence ?? null,
    afiGrowth4d: afiGrowth4dFromLoad(d.load),
    readinessCall,
    pdShortTrend,
    goalDurationMin,
  };
}
