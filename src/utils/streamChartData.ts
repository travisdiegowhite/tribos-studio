/**
 * Pure data preparation for activity stream charts (RideStreamsChart).
 *
 * Turns the server-written `activity_streams` parallel arrays into
 * chart-ready rows: sentinel filtering, x-axis derivation (distance,
 * approximate time, or sample index), rolling-average smoothing, and
 * peak-preserving LTTB downsampling.
 */

import { haversineKm } from './distanceUnits';

// FIT protocol sentinel limits — values at/above these are dropouts, not data
export const MAX_VALID_POWER = 2500;
export const MAX_VALID_HR = 250;
export const MAX_VALID_SPEED_MPS = 40; // ~144 km/h
export const MAX_VALID_CADENCE = 200;

export type XMode = 'distance_km' | 'time_s' | 'index';

export interface StreamRow {
  x: number;
  power: number | null;
  heartRate: number | null;
  speed_kmh: number | null;
  cadence: number | null;
  elevation_m: number | null;
}

export interface RawStreams {
  coords?: Array<[number, number]>; // [lng, lat]
  power?: Array<number | null>;
  heartRate?: Array<number | null>;
  speed?: Array<number | null>; // m/s
  cadence?: Array<number | null>;
  elevation?: Array<number | null>;
}

/**
 * Cumulative distance along a [lng, lat] coordinate track, in km.
 * distances_km[0] === 0; monotonically non-decreasing.
 */
export function cumulativeDistancesKm(coords: Array<[number, number]>): number[] {
  if (!coords || coords.length === 0) return [];
  const distances_km = [0];
  for (let i = 1; i < coords.length; i++) {
    const [lng1, lat1] = coords[i - 1];
    const [lng2, lat2] = coords[i];
    distances_km.push(distances_km[i - 1] + haversineKm(lat1, lng1, lat2, lng2));
  }
  return distances_km;
}

/**
 * Build chart rows from parallel stream arrays.
 *
 * X-axis mode: coords present → 'distance_km'; else durationSeconds > 0 →
 * 'time_s' with samples spread uniformly across the duration (FIT records
 * are ~1 Hz but not guaranteed — this is an approximation); else 'index'.
 */
export function buildStreamRows(
  streams: RawStreams | null | undefined,
  opts: { durationSeconds?: number } = {}
): { rows: StreamRow[]; xMode: XMode } {
  if (!streams) return { rows: [], xMode: 'index' };

  const len =
    streams.coords?.length ||
    Math.max(
      streams.power?.length ?? 0,
      streams.heartRate?.length ?? 0,
      streams.speed?.length ?? 0,
      streams.cadence?.length ?? 0,
      streams.elevation?.length ?? 0
    );
  if (len === 0) return { rows: [], xMode: 'index' };

  const distances_km = streams.coords ? cumulativeDistancesKm(streams.coords) : null;
  const durationSeconds = opts.durationSeconds ?? 0;

  let xMode: XMode;
  if (distances_km) xMode = 'distance_km';
  else if (durationSeconds > 0) xMode = 'time_s';
  else xMode = 'index';

  const rows: StreamRow[] = [];
  for (let i = 0; i < len; i++) {
    let x: number;
    if (xMode === 'distance_km') x = distances_km![i];
    else if (xMode === 'time_s') x = len > 1 ? (i * durationSeconds) / (len - 1) : 0;
    else x = i;

    const p = streams.power?.[i];
    const hr = streams.heartRate?.[i];
    const s = streams.speed?.[i];
    const c = streams.cadence?.[i];
    const e = streams.elevation?.[i];

    rows.push({
      x,
      power: p != null && p > 0 && p < MAX_VALID_POWER ? p : null,
      heartRate: hr != null && hr > 0 && hr < MAX_VALID_HR ? hr : null,
      speed_kmh: s != null && s >= 0 && s < MAX_VALID_SPEED_MPS ? s * 3.6 : null,
      cadence: c != null && c >= 0 && c < MAX_VALID_CADENCE ? c : null,
      elevation_m: e != null ? e : null,
    });
  }

  return { rows, xMode };
}

/**
 * Centered rolling mean. Nulls are excluded from the window (never
 * zero-filled); a null source value stays null. Edges use a truncated
 * window. windowSize is coerced to an odd integer, minimum 1 (no-op).
 */
export function rollingAverage(
  values: Array<number | null>,
  windowSize: number
): Array<number | null> {
  let w = Math.max(1, Math.round(windowSize));
  if (w % 2 === 0) w += 1;
  if (w === 1) return values.slice();

  const half = (w - 1) / 2;
  const out: Array<number | null> = new Array(values.length);
  for (let i = 0; i < values.length; i++) {
    if (values[i] == null) {
      out[i] = null;
      continue;
    }
    let sum = 0;
    let count = 0;
    const start = Math.max(0, i - half);
    const end = Math.min(values.length - 1, i + half);
    for (let j = start; j <= end; j++) {
      const v = values[j];
      if (v != null) {
        sum += v;
        count++;
      }
    }
    out[i] = count > 0 ? sum / count : null;
  }
  return out;
}

/**
 * Pick a smoothing window proportional to data density: roughly one
 * window per two output points, so zooming in (fewer visible samples)
 * automatically reduces smoothing. Always odd, clamped to [1, 31].
 */
export function smoothingWindowForCount(pointCount: number, targetPoints = 400): number {
  const raw = Math.floor(pointCount / (targetPoints / 2));
  let w = Math.min(31, Math.max(1, raw));
  if (w % 2 === 0) w += 1;
  return Math.min(31, w);
}

/**
 * Apply rolling-average smoothing to selected metric keys of a row array.
 */
export function smoothRows(
  rows: StreamRow[],
  keys: Array<'power' | 'heartRate' | 'speed_kmh' | 'cadence'>,
  windowSize: number
): StreamRow[] {
  if (windowSize <= 1 || rows.length === 0) return rows;
  const smoothedByKey = new Map<string, Array<number | null>>();
  for (const key of keys) {
    smoothedByKey.set(key, rollingAverage(rows.map((r) => r[key]), windowSize));
  }
  return rows.map((row, i) => {
    const next = { ...row };
    for (const key of keys) {
      next[key] = smoothedByKey.get(key)![i];
    }
    return next;
  });
}

/**
 * Largest-Triangle-Three-Buckets downsampling, returning the SORTED
 * indices of the selected points so one index set (computed on a primary
 * series) can select rows for all series, keeping parallel arrays aligned.
 *
 * Always includes the first and last index. Null-safe: null ys are skipped
 * in bucket averages and never selected over a non-null candidate.
 */
export function lttbIndices(
  xs: number[],
  ys: Array<number | null>,
  threshold: number
): number[] {
  const n = xs.length;
  if (threshold >= n || n <= 2) return xs.map((_, i) => i);
  if (threshold < 3) return [0, n - 1];

  const selected: number[] = [0];
  const bucketSize = (n - 2) / (threshold - 2);
  let prevIndex = 0;

  for (let bucket = 0; bucket < threshold - 2; bucket++) {
    const start = Math.floor(bucket * bucketSize) + 1;
    const end = Math.min(Math.floor((bucket + 1) * bucketSize) + 1, n - 1);

    // Average of the NEXT bucket (the "third point" of the triangle)
    const nextStart = end;
    const nextEnd = Math.min(Math.floor((bucket + 2) * bucketSize) + 1, n);
    let avgX = 0;
    let avgY = 0;
    let avgCount = 0;
    for (let j = nextStart; j < nextEnd; j++) {
      const y = ys[j];
      if (y != null) {
        avgX += xs[j];
        avgY += y;
        avgCount++;
      }
    }
    const prevY = ys[prevIndex];
    if (avgCount > 0) {
      avgX /= avgCount;
      avgY /= avgCount;
    } else {
      // Next bucket entirely null — fall back to a flat continuation
      avgX = xs[Math.min(nextStart, n - 1)];
      avgY = prevY ?? 0;
    }

    const anchorY = prevY ?? avgY;
    let bestIndex = -1;
    let bestArea = -1;
    for (let j = start; j < end; j++) {
      const y = ys[j];
      if (y == null) continue;
      const area = Math.abs(
        (xs[prevIndex] - avgX) * (y - anchorY) - (xs[prevIndex] - xs[j]) * (avgY - anchorY)
      );
      if (area > bestArea) {
        bestArea = area;
        bestIndex = j;
      }
    }
    if (bestIndex === -1) {
      // Bucket entirely null — keep the middle point for x continuity
      bestIndex = Math.min(Math.floor((start + end) / 2), n - 1);
    }
    selected.push(bestIndex);
    prevIndex = bestIndex;
  }

  selected.push(n - 1);
  return selected;
}

/**
 * Downsample rows to at most targetPoints using LTTB on a primary series
 * (first present of power → heartRate → speed → elevation), so peaks in
 * the most important metric are preserved and all series stay aligned.
 */
export function downsampleRows(rows: StreamRow[], targetPoints: number): StreamRow[] {
  if (rows.length <= targetPoints) return rows;

  const primaryKeys: Array<keyof StreamRow> = ['power', 'heartRate', 'speed_kmh', 'elevation_m'];
  const primary =
    primaryKeys.find((key) => rows.some((r) => r[key] != null)) ?? 'power';

  const xs = rows.map((r) => r.x);
  const ys = rows.map((r) => r[primary] as number | null);
  return lttbIndices(xs, ys, targetPoints).map((i) => rows[i]);
}

/**
 * "Nice" axis ticks covering [min, max] with steps of 1 / 2 / 2.5 / 5 × 10^n,
 * at most maxTickCount ticks.
 */
export function niceTicks(min: number, max: number, maxTickCount = 8): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return [min];

  const span = max - min;
  const rawStep = span / maxTickCount;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  let step = 10 * magnitude;
  for (const multiplier of [1, 2, 2.5, 5]) {
    if (multiplier * magnitude >= rawStep) {
      step = multiplier * magnitude;
      break;
    }
  }

  const decimals = Math.max(0, -Math.floor(Math.log10(step)) + 1);
  const ticks: number[] = [];
  for (let tick = Math.ceil(min / step) * step; tick <= max + step * 1e-9; tick += step) {
    ticks.push(Number(tick.toFixed(decimals)));
  }
  return ticks;
}

/**
 * Format elapsed seconds as "m:ss" or "h:mm:ss" for the time x-axis.
 */
export function formatElapsed(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}
