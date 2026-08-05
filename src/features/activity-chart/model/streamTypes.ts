/**
 * Types for the normalized activity-stream payload served by
 * /api/activity-streams (see api/utils/activityStreams.js for the producing
 * side — shapes must stay in sync).
 */

import { cumulativeDistancesKm } from '../../../utils/streamChartData';

export type StreamTier =
  | 'per_second'
  | 'streams_1hz'
  | 'coach_ts'
  | 'simplified'
  | 'summary';

export type StreamSource =
  | 'fit_storage'
  | 'stored_streams'
  | 'strava_api'
  | 'fit_coach_context'
  | 'activity_streams'
  | 'none';

export interface NormalizedStreams {
  version: number;
  tier: StreamTier;
  source: StreamSource;
  sample_seconds: number | null;
  tier_degraded?: boolean;
  decimated?: boolean;
  /** Real elapsed seconds since start; absent for 'simplified'/'summary'. */
  t?: number[];
  power?: (number | null)[];
  hr?: (number | null)[];
  cadence?: (number | null)[];
  speed_mps?: (number | null)[];
  elevation_m?: (number | null)[];
  distance_m?: (number | null)[];
  /** Canonical [lng, lat] pairs; null where GPS dropped out. */
  coords?: ([number, number] | null)[];
}

export type XMode = 'time_s' | 'distance_km';

export interface XAxis {
  xMode: XMode;
  /** Monotonic x value per sample (seconds or km), parallel to the series. */
  xs: number[];
}

/** True when the payload carries a real time axis. */
export function hasTimeAxis(streams: NormalizedStreams): boolean {
  return Array.isArray(streams.t) && streams.t.length >= 2;
}

/**
 * Derive the chart x-axis for a payload: the real time axis when present
 * (per_second / streams_1hz / coach_ts), else a distance axis for the
 * simplified tier (from distance_m, or cumulative haversine over coords) —
 * never a faked clock.
 */
export function xAxisFor(streams: NormalizedStreams): XAxis | null {
  if (hasTimeAxis(streams)) {
    return { xMode: 'time_s', xs: streams.t as number[] };
  }
  const dist = streams.distance_m;
  if (Array.isArray(dist) && dist.length >= 2 && dist.some((d) => d != null)) {
    let last = 0;
    const xs = dist.map((d) => {
      if (d != null) last = d / 1000;
      return last;
    });
    return { xMode: 'distance_km', xs };
  }
  if (Array.isArray(streams.coords) && streams.coords.length >= 2) {
    const coords = streams.coords.map((c) => c ?? [0, 0]);
    return { xMode: 'distance_km', xs: cumulativeDistancesKm(coords as [number, number][]) };
  }
  return null;
}

export type MetricKey = 'power' | 'hr' | 'speed_mps';

/** Series values for a metric key, or null when the payload lacks it. */
export function seriesFor(
  streams: NormalizedStreams,
  metric: MetricKey
): (number | null)[] | null {
  const arr = streams[metric];
  return Array.isArray(arr) && arr.some((v) => v != null) ? arr : null;
}
