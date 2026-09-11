/**
 * rideMetricStats — summary numbers and display formatting for the ride
 * map's selected metric (the stats card and hover readout).
 *
 * Stream units are the activity_streams convention: power W, heartRate bpm,
 * speed m/s, elevation m, cadence rpm. Display converts speed to km/h.
 */

export type RideMapMetric = 'speed' | 'power' | 'elevation' | 'heartRate';

export interface MetricSummary {
  avg: number;
  max: number;
  min: number;
  /** Samples that contributed. */
  count: number;
}

/**
 * Heart rate and elevation never legitimately read zero on a bike; a zero
 * there is a dropout, so it's excluded. Power and speed do read zero
 * (coasting, stopped) and those samples belong in the average, matching how
 * average_watts is computed upstream.
 */
function isUsable(metric: RideMapMetric, v: number | null | undefined): v is number {
  if (v == null || !Number.isFinite(v)) return false;
  if (metric === 'heartRate' || metric === 'elevation') return v > 0;
  return v >= 0;
}

export function summarizeMetric(
  metric: RideMapMetric,
  values: ReadonlyArray<number | null | undefined> | null | undefined,
): MetricSummary | null {
  if (!values) return null;
  let sum = 0;
  let max = -Infinity;
  let min = Infinity;
  let count = 0;
  for (const v of values) {
    if (!isUsable(metric, v)) continue;
    sum += v;
    if (v > max) max = v;
    if (v < min) min = v;
    count += 1;
  }
  if (count === 0) return null;
  return { avg: sum / count, max, min, count };
}

/** Display unit for a metric. */
export function metricUnit(metric: RideMapMetric): string {
  switch (metric) {
    case 'speed':
      return 'km/h';
    case 'power':
      return 'W';
    case 'elevation':
      return 'm';
    case 'heartRate':
      return 'bpm';
  }
}

/** Value in display units, as a whole-number string (speed converts m/s → km/h). */
export function formatMetricValue(metric: RideMapMetric, value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '–';
  const shown = metric === 'speed' ? value * 3.6 : value;
  return String(Math.round(shown));
}

/** Distance along the ride, e.g. "12.3 km". */
export function formatDistanceKm(distance_km: number | null | undefined): string {
  if (distance_km == null || !Number.isFinite(distance_km)) return '–';
  return `${distance_km.toFixed(1)} km`;
}

/**
 * Index of the entry in a sorted, non-decreasing array of positions closest
 * to `x`. Used to sync the strip chart cursor, the map marker and the
 * readout on a shared distance along the ride. Empty array → -1.
 */
export function nearestIndex(sorted: ReadonlyArray<number>, x: number): number {
  const n = sorted.length;
  if (n === 0 || !Number.isFinite(x)) return -1;
  let lo = 0;
  let hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] < x) lo = mid + 1;
    else hi = mid;
  }
  if (lo > 0 && Math.abs(sorted[lo - 1] - x) <= Math.abs(sorted[lo] - x)) return lo - 1;
  return lo;
}
