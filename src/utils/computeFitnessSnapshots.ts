/**
 * Client-side fitness snapshot computation from activity data.
 *
 * Produces weekly CTL/ATL/TSB and volume metrics so HistoricalInsights
 * charts render correctly even when server-side fitness_snapshots have gaps.
 *
 * TSS estimation mirrors the server logic in api/utils/fitnessSnapshots.js.
 * CTL/ATL use the standard iterative EWA matching src/utils/trainingPlans.ts.
 */

import { calculateTSS } from './trainingPlans';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ActivityInput {
  start_date: string;
  moving_time?: number | null;       // seconds
  distance?: number | null;          // meters
  total_elevation_gain?: number | null;
  average_watts?: number | null;
  // Canonical columns (spec §2, migration 072) — preferred over legacy
  rss?: number | null;               // Ride Stress Score (canonical)
  effective_power?: number | null;   // Effective Power (canonical)
  // Legacy columns — kept for activities pre-dating migration 072
  normalized_power?: number | null;
  kilojoules?: number | null;
  tss?: number | null;
  type?: string | null;
  sport_type?: string | null;
  average_heartrate?: number | null;
  is_hidden?: boolean | null;
}

export interface WeeklySnapshot {
  snapshot_week: string;      // YYYY-MM-DD (Monday)
  ctl: number;
  atl: number;
  tsb: number;
  weekly_hours: number;
  weekly_tss: number;
  weekly_ride_count: number;
  weekly_run_count: number;
  weekly_distance_km: number;
  weekly_elevation_m: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const RUNNING_TYPES = ['Run', 'VirtualRun', 'TrailRun'];

// ─── TSS Estimation ──────────────────────────────────────────────────────────

/**
 * Estimate running TSS from pace, heart rate, and elevation.
 * Ported from api/utils/fitnessSnapshots.js estimateRunningTSS.
 */
function estimateRunningTSS(activity: ActivityInput): number {
  const durationHours = (activity.moving_time || 0) / 3600;
  if (durationHours === 0) return 0;

  const distanceKm = (activity.distance || 0) / 1000;
  const elevationM = activity.total_elevation_gain || 0;

  let intensityMultiplier = 1.0;

  if (distanceKm > 0 && durationHours > 0) {
    const paceMinPerKm = (durationHours * 60) / distanceKm;
    if (paceMinPerKm < 3.5) intensityMultiplier = 1.6;
    else if (paceMinPerKm < 4.0) intensityMultiplier = 1.4;
    else if (paceMinPerKm < 4.5) intensityMultiplier = 1.2;
    else if (paceMinPerKm < 5.0) intensityMultiplier = 1.05;
    else if (paceMinPerKm < 6.0) intensityMultiplier = 0.85;
    else if (paceMinPerKm < 7.0) intensityMultiplier = 0.7;
    else intensityMultiplier = 0.55;
  }

  if (activity.average_heartrate && activity.average_heartrate > 0) {
    const hr = activity.average_heartrate;
    if (hr >= 175) intensityMultiplier = Math.max(intensityMultiplier, 1.5);
    else if (hr >= 160) intensityMultiplier = Math.max(intensityMultiplier, 1.2);
    else if (hr >= 145) intensityMultiplier = Math.max(intensityMultiplier, 1.0);
    else if (hr >= 130) intensityMultiplier = Math.max(intensityMultiplier, 0.8);
  }

  const baseRTSS = durationHours * 60;
  const elevationFactor = (elevationM / 200) * 10;
  const trailFactor = activity.type === 'TrailRun' ? 1.1 : 1.0;

  return Math.round((baseRTSS + elevationFactor) * intensityMultiplier * trailFactor);
}

/**
 * Estimate TSS for any activity, using a 5-tier fallback:
 * 1. Stored TSS (from device/FIT file)
 * 2. Running-specific estimation (pace + HR)
 * 3. Normalized power + FTP → standard TSS formula
 * 4. Kilojoules → approximate TSS
 * 5. Duration + elevation + avg watts heuristic
 *
 * Mirrors api/utils/fitnessSnapshots.js estimateTSS.
 */
export function estimateActivityTSS(
  activity: ActivityInput,
  ftp?: number | null
): number {
  // Tier 1: stored RSS (canonical, spec §2) or legacy TSS — canonical-first
  // per CLAUDE.md policy. activity.rss is populated by server-side ingestors
  // (garmin-webhook-process, garmin-activities, fit-upload); activity.tss is
  // the legacy column, NULL for most activities since the B9 cut-over.
  const storedRSS = activity.rss ?? activity.tss;
  if (storedRSS && storedRSS > 0) return storedRSS;

  // Tier 2: running-specific
  if (RUNNING_TYPES.includes(activity.type || '')) {
    return estimateRunningTSS(activity);
  }

  // Tier 3: effective_power (canonical) or normalized_power (legacy) + FTP
  const powerForCalc = activity.effective_power ?? activity.normalized_power;
  if (powerForCalc && powerForCalc > 0 && ftp && ftp > 0) {
    const tss = calculateTSS(activity.moving_time || 0, powerForCalc, ftp);
    if (tss !== null && tss > 0) return tss;
  }

  // Tier 4: kilojoules + duration → derive avg power, then standard TSS formula
  if (activity.kilojoules && activity.kilojoules > 0 && activity.moving_time) {
    const hours = activity.moving_time / 3600;
    if (hours > 0) {
      const avgPower = (activity.kilojoules * 1000) / activity.moving_time;
      const effectiveFtp = (ftp && ftp > 0) ? ftp : 200;
      const intensityFactor = avgPower / effectiveFtp;
      return Math.round(hours * intensityFactor * intensityFactor * 100);
    }
  }

  // Tier 5: duration + elevation + avg watts heuristic
  const durationHours = (activity.moving_time || 0) / 3600;
  const elevationM = activity.total_elevation_gain || 0;

  const baseTSS = durationHours * 50;
  const elevationFactor = (elevationM / 300) * 10;

  let intensityMultiplier = 1.0;
  if (activity.average_watts && activity.average_watts > 0) {
    intensityMultiplier = Math.min(1.8, Math.max(0.5, activity.average_watts / 150));
  }

  return Math.round((baseTSS + elevationFactor) * intensityMultiplier);
}

// ─── Week Helpers ────────────────────────────────────────────────────────────

/**
 * Format a Date as YYYY-MM-DD in LOCAL time. All day/week keys in this module
 * are local-calendar dates — `toISOString()` (UTC) would shift evening rides
 * and, for UTC+ timezones, entire week boundaries by a day.
 */
function fmtLocalDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

/** Get the Monday (ISO week start) of the week containing `date`. */
function getWeekStart(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return fmtLocalDate(d);
}

/** Add N days to a YYYY-MM-DD string and return a new YYYY-MM-DD string. */
function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return fmtLocalDate(d);
}

// ─── Main Computation ────────────────────────────────────────────────────────

/**
 * Compute weekly fitness snapshots from raw activity data.
 *
 * Walks day-by-day through the full activity history maintaining a running
 * CTL (42-day EWA) and ATL (7-day EWA). At each week boundary (Sunday),
 * snapshots the current metrics plus that week's volume totals.
 *
 * Performance: O(total_days) — ~900 iterations for 2.5 years.
 */
export function computeWeeklySnapshots(
  activities: ActivityInput[],
  ftp?: number | null
): WeeklySnapshot[] {
  if (!activities || activities.length === 0) return [];

  // Filter to visible activities and sort by date
  const visible = activities
    .filter(a => !a.is_hidden && a.start_date)
    .sort((a, b) => a.start_date.localeCompare(b.start_date));

  if (visible.length === 0) return [];

  // Build daily TSS map and per-day activity lists
  const dailyTSS: Record<string, number> = {};
  const dailyActivities: Record<string, ActivityInput[]> = {};

  for (const activity of visible) {
    const dateStr = fmtLocalDate(new Date(activity.start_date));
    const tss = Math.min(estimateActivityTSS(activity, ftp), 500); // cap at 500
    dailyTSS[dateStr] = (dailyTSS[dateStr] || 0) + tss;
    if (!dailyActivities[dateStr]) dailyActivities[dateStr] = [];
    dailyActivities[dateStr].push(activity);
  }

  // Determine date range
  const firstDate = fmtLocalDate(new Date(visible[0].start_date));
  const firstMonday = getWeekStart(new Date(firstDate + 'T00:00:00'));
  const todayMonday = getWeekStart(new Date());
  const lastMonday = todayMonday; // include current week

  // Walk day-by-day
  const snapshots: WeeklySnapshot[] = [];
  let ctl = 0;
  let atl = 0;
  let currentWeekStart = firstMonday;

  // Weekly accumulators
  let weekHours = 0;
  let weekTSS = 0;
  let weekRides = 0;
  let weekRuns = 0;
  let weekDistKm = 0;
  let weekElevM = 0;

  // Walk only through today: decaying CTL/ATL across the current week's
  // FUTURE zero-TSS days would snapshot end-of-week-projected fitness and
  // disagree with the Today surfaces. Past weeks always end on their Sunday.
  const todayStr = fmtLocalDate(new Date());
  const finalSunday = addDays(lastMonday, 6);
  const walkEnd = finalSunday < todayStr ? finalSunday : todayStr;

  let day = firstMonday;

  while (day <= walkEnd) {
    // Track yesterday's CTL/ATL for TSB calculation
    const ctlYesterday = ctl;
    const atlYesterday = atl;

    const dayTSS = dailyTSS[day] || 0;

    // Advance CTL/ATL
    ctl = ctl + (dayTSS - ctl) / 42;
    atl = atl + (dayTSS - atl) / 7;

    // Accumulate weekly volume
    const dayActs = dailyActivities[day] || [];
    for (const a of dayActs) {
      const hours = (a.moving_time || 0) / 3600;
      weekHours += hours;
      weekTSS += Math.min(estimateActivityTSS(a, ftp), 500);
      weekDistKm += (a.distance || 0) / 1000;
      weekElevM += a.total_elevation_gain || 0;

      if (RUNNING_TYPES.includes(a.type || '')) {
        weekRuns++;
      } else {
        weekRides++;
      }
    }

    // Check if this is the last day of the current week (Sunday)
    const nextDay = addDays(day, 1);
    const nextWeekStart = getWeekStart(new Date(nextDay + 'T00:00:00'));

    if (nextWeekStart !== currentWeekStart || nextDay > walkEnd) {
      // Snapshot this week — TSB uses yesterday's CTL/ATL (freshness going into today)
      snapshots.push({
        snapshot_week: currentWeekStart,
        ctl: Math.round(ctl),
        atl: Math.round(atl),
        tsb: Math.round(ctlYesterday - atlYesterday),
        weekly_hours: Math.round(weekHours * 100) / 100,
        weekly_tss: Math.round(weekTSS),
        weekly_ride_count: weekRides,
        weekly_run_count: weekRuns,
        weekly_distance_km: Math.round(weekDistKm * 100) / 100,
        weekly_elevation_m: Math.round(weekElevM),
      });

      // Reset accumulators
      currentWeekStart = nextWeekStart;
      weekHours = 0;
      weekTSS = 0;
      weekRides = 0;
      weekRuns = 0;
      weekDistKm = 0;
      weekElevM = 0;
    }

    day = nextDay;
  }

  // Return sorted descending (most recent first), matching server convention
  return snapshots.reverse();
}

// ─── Server Load Overlay ─────────────────────────────────────────────────────

/** A daily row from training_load_daily (canonical-only — legacy columns were dropped by migration 071). */
export interface ServerLoadDailyRow {
  date: string; // YYYY-MM-DD
  tfi?: number | null;
  afi?: number | null;
  form_score?: number | null;
}

/**
 * Override each weekly snapshot's ctl/atl/tsb with the server-computed
 * values from `training_load_daily` where available. The server engine is
 * the source of truth (per-athlete tau, terrain multipliers) — this makes
 * Progress/HistoricalInsights agree with the Today surfaces. Fallback is
 * per-week: weeks with no server row keep the client-engine values (the
 * daily table only reaches back to when the server engine shipped, while
 * these charts can span years). Volume fields are untouched — server rows
 * carry no volume.
 */
export function overlayServerLoadOnWeeklySnapshots(
  weekly: WeeklySnapshot[],
  serverRows: ServerLoadDailyRow[] | null | undefined,
): WeeklySnapshot[] {
  if (!weekly?.length || !serverRows?.length) return weekly ?? [];

  // Keep each week's latest usable row (Sunday for complete weeks; today for
  // the in-progress week — matching the walk cap in computeWeeklySnapshots).
  const bestByWeek = new Map<string, ServerLoadDailyRow>();
  for (const row of serverRows) {
    if (!row?.date) continue;
    if (!Number.isFinite(row.tfi as number) || !Number.isFinite(row.afi as number)) continue;
    const week = getWeekStart(new Date(row.date + 'T00:00:00'));
    const prev = bestByWeek.get(week);
    if (!prev || row.date > prev.date) bestByWeek.set(week, row);
  }
  if (bestByWeek.size === 0) return weekly;

  return weekly.map((snap) => {
    const row = bestByWeek.get(snap.snapshot_week);
    if (!row) return snap;
    return {
      ...snap,
      ctl: Math.round(row.tfi as number),
      atl: Math.round(row.afi as number),
      tsb: Number.isFinite(row.form_score as number) ? Math.round(row.form_score as number) : snap.tsb,
    };
  });
}
