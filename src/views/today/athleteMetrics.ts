/**
 * athleteMetrics — client-side Form Score / TFI / AFI computation, extracted
 * from useTodayData so both the live Today and the routing-first glance compute
 * athlete state the same way (single source of truth).
 *
 * Reads canonical-first per CLAUDE.md (rss ?? tss via estimateActivityTSS;
 * prefers server training_load_daily rows, fills tail days with a client EWA).
 * Pure functions — no Supabase, no React.
 */

import { estimateActivityTSS } from '../../utils/computeFitnessSnapshots';

export interface SparklinePoint {
  date: string; // ISO date (YYYY-MM-DD)
  tfi: number;
}

export interface AthleteActivityRow {
  start_date: string;
  rss?: number | null;
  tss?: number | null;
  moving_time?: number | null;
  distance?: number | null;
  total_elevation_gain?: number | null;
  average_watts?: number | null;
  effective_power?: number | null;
  normalized_power?: number | null;
  kilojoules?: number | null;
  type?: string | null;
  sport_type?: string | null;
  average_heartrate?: number | null;
  is_hidden?: boolean | null;
}

export interface ServerLoadRow {
  date: string;
  tfi: number | null;
  afi: number | null;
  form_score: number | null;
  /**
   * The row's stored daily RSS. Optional — callers that select it enable the
   * "today floor" staleness guard in buildDailyLoadSeries; callers that don't
   * leave the guard inert.
   */
  rss?: number | null;
}

/** Adaptive EWA time constants (user_profiles.tfi_tau / afi_tau). */
export interface TauPair {
  tfi: number;
  afi: number;
}

export const DEFAULT_TAUS: TauPair = { tfi: 42, afi: 7 };

export interface AthleteMetrics {
  formScore: number | null;
  tfiCurrent: number | null;
  afiCurrent: number | null;
  tfiHistory: SparklinePoint[]; // 28 days, ascending
  afiLast28: number[];
}

export function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

export interface DailyLoadPoint {
  date: string; // ISO date (YYYY-MM-DD)
  /** Client-estimated daily RSS (activity-derived, capped 500/activity). */
  rss: number;
  /** Unrounded running TFI (server value when the day has a row). */
  tfi: number;
  /** Unrounded running AFI (server value when the day has a row). */
  afi: number;
  /**
   * Form Score for the day per spec §3.6 — yesterday's TFI − AFI (readiness
   * going INTO the day), preferring the server row's stored form_score.
   * Rounded, since form_score is stored rounded.
   */
  fs: number;
}

/**
 * The shared server-preferred day walk. One implementation so every surface
 * (Today, Glance, Dashboard, /train) derives fitness/fatigue/form from the
 * same math: per day, prefer the server-stored TFI/AFI from
 * `training_load_daily` (terrain + MTB multipliers, per-athlete tau); fall
 * through to a client EWA over activity-derived RSS for dates the server
 * hasn't written. Callers pass the athlete's adaptive tau (`taus`) so the
 * client fill decays at the same rate as the server engine; the 42/7 default
 * matches the previous hard-coded behavior. See docs/tfi-duality-decision.md.
 *
 * Today-floor guard: today's server row is partial by design (written on
 * activity ingest). When the caller selected `rss` on the server rows and the
 * client's activity-derived RSS for TODAY exceeds the stored row's, the row is
 * stale (e.g. a second ride whose refresh trigger failed) — fall through to
 * the client EWA step for that one day instead of adopting the stale row.
 * Finalized past rows are never second-guessed.
 */
export function buildDailyLoadSeries(
  activities: AthleteActivityRow[],
  ftp: number,
  serverHistory: ServerLoadRow[],
  windowDays = 90,
  taus: TauPair = DEFAULT_TAUS,
): DailyLoadPoint[] {
  if (activities.length === 0 && serverHistory.length === 0) return [];

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const windowStart = new Date(today);
  windowStart.setDate(today.getDate() - windowDays);

  const dailyRSS: Record<string, number> = {};
  for (let d = new Date(windowStart); d <= today; d.setDate(d.getDate() + 1)) {
    dailyRSS[fmtDate(d)] = 0;
  }
  for (const a of activities) {
    // Local-date key to match the fmtDate-keyed map above — a UTC split would
    // shift evening rides to the next day and drop today's ride entirely.
    const date = a.start_date ? fmtDate(new Date(a.start_date)) : undefined;
    if (date && dailyRSS[date] !== undefined) {
      dailyRSS[date] += Math.min(estimateActivityTSS(a, ftp), 500);
    }
  }

  // Index server rows by date.
  const serverByDate = new Map<string, ServerLoadRow>();
  for (const row of serverHistory) serverByDate.set(row.date, row);

  // Walk forward. For each day, prefer the server's TFI/AFI when present;
  // otherwise advance the running EWA with the day's RSS. The EWA state
  // carries across server-vs-client days so we can resume cleanly.
  const series: DailyLoadPoint[] = [];
  const todayKey = fmtDate(today);
  let tfi = 0;
  let afi = 0;

  for (const day of Object.keys(dailyRSS).sort()) {
    const tfiYesterday = tfi;
    const afiYesterday = afi;
    const server = serverByDate.get(day);
    // Trust a server row only when tfi/afi are actually present — Number(null)
    // is 0 (finite), so a null-valued row would silently zero fitness instead
    // of falling through to the client EWA.
    const serverUsable =
      server &&
      server.tfi != null &&
      server.afi != null &&
      Number.isFinite(Number(server.tfi)) &&
      Number.isFinite(Number(server.afi));
    // Today-floor guard (see header): a today row that undercounts the
    // client-visible RSS is stale — step past it.
    const staleTodayRow =
      serverUsable &&
      day === todayKey &&
      server.rss != null &&
      dailyRSS[day] > Number(server.rss) + 1;
    if (serverUsable && !staleTodayRow) {
      tfi = Number(server.tfi);
      afi = Number(server.afi);
    } else {
      const rss = dailyRSS[day];
      tfi = tfi + (rss - tfi) / taus.tfi;
      afi = afi + (rss - afi) / taus.afi;
    }
    const fs =
      server?.form_score != null && Number.isFinite(Number(server.form_score))
        ? Math.round(Number(server.form_score))
        : Math.round(tfiYesterday - afiYesterday);
    series.push({ date: day, rss: dailyRSS[day], tfi, afi, fs });
  }

  return series;
}

/**
 * Compute athlete state metrics from the shared server-preferred day walk
 * (buildDailyLoadSeries above).
 */
export function buildAthleteMetrics(
  activities: AthleteActivityRow[],
  ftp: number,
  serverHistory: ServerLoadRow[],
  taus: TauPair = DEFAULT_TAUS,
): AthleteMetrics {
  const series = buildDailyLoadSeries(activities, ftp, serverHistory, 90, taus);
  if (series.length === 0) {
    return {
      formScore: null,
      tfiCurrent: null,
      afiCurrent: null,
      tfiHistory: [],
      afiLast28: [],
    };
  }

  const last28 = series.slice(-28);
  const last = series[series.length - 1];

  return {
    formScore: last.fs,
    tfiCurrent: Math.round(last.tfi),
    afiCurrent: Math.round(last.afi),
    tfiHistory: last28.map((p) => ({ date: p.date, tfi: Math.round(p.tfi) })),
    afiLast28: last28.map((p) => p.afi),
  };
}

/**
 * Linear-regression slope of the last `n` points in `series`. Units are
 * "TFI per day" since each step is exactly one calendar day. Returns 0 when
 * there are fewer than `n` points.
 */
export function slopeLastN(series: SparklinePoint[], n: number): number {
  if (series.length < n) return 0;
  const slice = series.slice(-n);
  const meanX = (n - 1) / 2;
  const meanY = slice.reduce((s, p) => s + p.tfi, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    const dx = i - meanX;
    num += dx * (slice[i].tfi - meanY);
    den += dx * dx;
  }
  return den === 0 ? 0 : num / den;
}
