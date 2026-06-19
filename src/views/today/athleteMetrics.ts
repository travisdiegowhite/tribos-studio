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
}

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

/**
 * Compute athlete state metrics, preferring server-stored TFI/AFI/form_score
 * from `training_load_daily` (terrain + MTB multipliers, per-athlete tau) and
 * falling through to a client-side EWA over activity-derived RSS for any dates
 * the server hasn't written. See docs/tfi-duality-decision.md.
 */
export function buildAthleteMetrics(
  activities: AthleteActivityRow[],
  ftp: number,
  serverHistory: ServerLoadRow[],
): AthleteMetrics {
  if (activities.length === 0 && serverHistory.length === 0) {
    return {
      formScore: null,
      tfiCurrent: null,
      afiCurrent: null,
      tfiHistory: [],
      afiLast28: [],
    };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const ninetyDaysAgo = new Date(today);
  ninetyDaysAgo.setDate(today.getDate() - 90);

  const dailyRSS: Record<string, number> = {};
  for (let d = new Date(ninetyDaysAgo); d <= today; d.setDate(d.getDate() + 1)) {
    dailyRSS[fmtDate(d)] = 0;
  }
  for (const a of activities) {
    const date = a.start_date?.split('T')[0];
    if (date && dailyRSS[date] !== undefined) {
      dailyRSS[date] += Math.min(estimateActivityTSS(a, ftp), 500);
    }
  }

  const sortedDays = Object.keys(dailyRSS).sort();
  const windowStart28 = new Date(today);
  windowStart28.setDate(today.getDate() - 27);
  const windowKey28 = fmtDate(windowStart28);

  // Index server rows by date.
  const serverByDate = new Map<string, ServerLoadRow>();
  for (const row of serverHistory) serverByDate.set(row.date, row);

  // Walk forward. For each day, prefer the server's TFI/AFI when present;
  // otherwise advance the running EWA with the day's RSS. The EWA state
  // carries across server-vs-client days so we can resume cleanly.
  const tfiHistory: SparklinePoint[] = [];
  const afiLast28: number[] = [];
  let tfi = 0;
  let afi = 0;
  let tfiYesterday = 0;
  let afiYesterday = 0;

  for (const day of sortedDays) {
    tfiYesterday = tfi;
    afiYesterday = afi;
    const server = serverByDate.get(day);
    if (server && Number.isFinite(Number(server.tfi)) && Number.isFinite(Number(server.afi))) {
      tfi = Number(server.tfi);
      afi = Number(server.afi);
    } else {
      const rss = dailyRSS[day];
      tfi = tfi + (rss - tfi) / 42;
      afi = afi + (rss - afi) / 7;
    }
    if (day >= windowKey28) {
      tfiHistory.push({ date: day, tfi: Math.round(tfi) });
      afiLast28.push(afi);
    }
  }

  // Form Score = TFI_yesterday − AFI_yesterday (freshness going into today).
  // Prefer the server's stored form_score for today when present so we match
  // the spec §3.6 calculation exactly (uses yesterday's stored values).
  const todayKey = fmtDate(today);
  const todayServer = serverByDate.get(todayKey);
  const formScore =
    todayServer && Number.isFinite(Number(todayServer.form_score))
      ? Math.round(Number(todayServer.form_score))
      : Math.round(tfiYesterday - afiYesterday);

  return {
    formScore,
    tfiCurrent: Math.round(tfi),
    afiCurrent: Math.round(afi),
    tfiHistory,
    afiLast28,
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
