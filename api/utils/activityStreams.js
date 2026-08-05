// Activity stream normalization for the flagship activity chart.
//
// Different providers leave activity data at very different fidelities:
// raw FIT bytes (Garmin, per-second with real timestamps), faithful 1 Hz
// stored streams (indoor rides), the Strava streams API (per-second, on
// demand), the AI-coach resampled time series (5–60 s), or only the
// RDP-simplified map streams (~10% of points, no time axis). This module
// resolves the best available source per activity and normalizes every
// shape into ONE canonical payload with a real, pause-honest time axis
// wherever the source has one.
//
// Canonical payload (keys omitted when the metric has no data):
//   {
//     version: 1,
//     tier: 'per_second' | 'streams_1hz' | 'coach_ts' | 'simplified' | 'summary',
//     source: 'fit_storage' | 'stored_streams' | 'strava_api'
//           | 'fit_coach_context' | 'activity_streams' | 'none',
//     sample_seconds: number | null,   // null = irregular sampling
//     tier_degraded: true?,            // a higher tier existed but failed (e.g. Strava 429)
//     t: [seconds since start],        // REAL elapsed seconds; absent for 'simplified'/'summary'
//     power: [], hr: [], cadence: [],
//     speed_mps: [], elevation_m: [], distance_m: [],
//     coords: [[lng, lat] | null],     // GeoJSON order (canonical Coordinate convention)
//   }
// All arrays are parallel and index-aligned.

import {
  MAX_VALID_POWER_WATTS,
  MAX_VALID_HR_BPM,
  MAX_VALID_CADENCE_RPM,
} from './fitParser.js';

export const STREAM_CACHE_BUCKET = 'activity-streams';
export const STREAM_SHAPE_VERSION = 1;
// 6 hours at 1 Hz. Beyond this we stride-decimate: still far denser than any
// screen, and it caps worst-case payload/memory for ultra-endurance rides.
export const MAX_STREAM_SAMPLES = 21600;

// Bump STREAM_SHAPE_VERSION to invalidate every cached object at once.
export function streamCachePath(userId, activityId) {
  return `${userId}/${activityId}.v${STREAM_SHAPE_VERSION}.json`;
}

const round1 = (v) => (v == null ? null : Math.round(v * 10) / 10);
const round2 = (v) => (v == null ? null : Math.round(v * 100) / 100);
const round5 = (v) => (v == null ? null : Math.round(v * 100000) / 100000);

/**
 * Per-second-faithfulness test for stored activity_streams, encoded the same
 * way as scripts/backfill-curve-analytics.js: the arrays are only a real
 * 1 Hz time series when the sample count is close to the moving time (the
 * indoor/no-GPS ingest path); GPS rides store RDP-simplified points.
 */
export function hasFaithfulStoredStreams(row) {
  const streams = row.activity_streams;
  if (!streams || !row.moving_time) return false;
  const streamLen = Math.max(
    streams.power?.length ?? 0,
    streams.heartRate?.length ?? 0,
    streams.cadence?.length ?? 0
  );
  return streamLen >= 0.8 * row.moving_time;
}

/**
 * Decide which source to serve from. Mirrors the faithfulness ladder in
 * scripts/backfill-curve-analytics.js resolveSource(): stored streams are
 * only trustworthy as a time series when they're per-second-faithful
 * (the indoor/no-GPS ingest path); GPS rides store RDP-simplified streams.
 *
 * @param {object} row - narrow activities row:
 *   { fit_storage_path, moving_time, activity_streams, fit_coach_context, stravaId }
 * @returns {{ kind: string, stravaId?: string }}
 */
export function resolveStreamSource(row) {
  if (row.fit_storage_path) return { kind: 'fit_storage' };

  const anyStream =
    row.activity_streams &&
    Object.values(row.activity_streams).some((arr) => Array.isArray(arr) && arr.length > 0);
  if (hasFaithfulStoredStreams(row)) {
    return { kind: 'stored_streams' };
  }

  if (row.stravaId) return { kind: 'strava_api', stravaId: row.stravaId };

  if (Array.isArray(row.fit_coach_context?.time_series) && row.fit_coach_context.time_series.length >= 2) {
    return { kind: 'fit_coach_context' };
  }

  if (anyStream) return { kind: 'activity_streams' };

  return { kind: 'none' };
}

/**
 * Detect the dominant sampling interval of a time axis. Returns the integer
 * interval when ≥90% of deltas agree (e.g. 1 for 1 Hz FIT records even when
 * the ride includes pauses), else null (irregular).
 */
export function detectSampleSeconds(t) {
  if (!Array.isArray(t) || t.length < 3) return null;
  const counts = new Map();
  for (let i = 1; i < t.length; i++) {
    const dt = t[i] - t[i - 1];
    counts.set(dt, (counts.get(dt) || 0) + 1);
  }
  let best = null;
  let bestCount = 0;
  for (const [dt, count] of counts) {
    if (count > bestCount) {
      best = dt;
      bestCount = count;
    }
  }
  if (best == null || best <= 0) return null;
  return bestCount >= 0.9 * (t.length - 1) ? best : null;
}

const hasAny = (arr) => arr.some((v) => v != null);

/** Attach only the metric arrays that carry data; keeps payloads lean. */
function attachSeries(payload, series) {
  for (const [key, arr] of Object.entries(series)) {
    if (arr && hasAny(arr)) payload[key] = arr;
  }
  return payload;
}

/**
 * Normalize the full-resolution FIT record points from
 * api/utils/fitParser.js extractAllDataPoints() (real timestamps — the time
 * axis stays honest across autopause gaps). Power/HR/cadence arrive already
 * sentinel-filtered to null by the extractor.
 */
export function normalizeFromFitDataPoints(allDataPoints, source = 'fit_storage') {
  const points = (allDataPoints || []).filter((p) => {
    const ms = Date.parse(p.timestamp);
    return Number.isFinite(ms);
  });
  if (points.length < 2) return null;

  const t0 = Date.parse(points[0].timestamp);
  const t = points.map((p) => Math.round((Date.parse(p.timestamp) - t0) / 1000));

  const hasGps = points.filter((p) => p.latitude != null && p.longitude != null).length >= 2;

  const payload = {
    version: STREAM_SHAPE_VERSION,
    tier: 'per_second',
    source,
    sample_seconds: detectSampleSeconds(t),
    t,
  };
  attachSeries(payload, {
    power: points.map((p) => p.power ?? null),
    hr: points.map((p) => p.heartRate ?? null),
    cadence: points.map((p) => p.cadence ?? null),
    speed_mps: points.map((p) => round2(p.speed)),
    elevation_m: points.map((p) => round1(p.elevation)),
    distance_m: points.map((p) => round1(p.distance)),
  });
  if (hasGps) {
    payload.coords = points.map((p) =>
      p.latitude != null && p.longitude != null ? [round5(p.longitude), round5(p.latitude)] : null
    );
  }
  return payload;
}

/**
 * Normalize faithful 1 Hz stored streams (the indoor/no-GPS ingest path in
 * buildActivityStreamsFromDataPoints). The arrays are one sample per second
 * of recording, so t is the sample index.
 */
export function normalizeFromStoredStreams(streams) {
  const arrays = ['power', 'heartRate', 'cadence', 'speed', 'elevation']
    .map((k) => streams?.[k])
    .filter((a) => Array.isArray(a) && a.length > 0);
  if (arrays.length === 0) return null;
  const n = Math.max(...arrays.map((a) => a.length));
  if (n < 2) return null;

  const payload = {
    version: STREAM_SHAPE_VERSION,
    tier: 'streams_1hz',
    source: 'stored_streams',
    sample_seconds: 1,
    t: Array.from({ length: n }, (_, i) => i),
  };
  const at = (arr, i) => (Array.isArray(arr) && arr[i] != null ? arr[i] : null);
  attachSeries(payload, {
    power: Array.from({ length: n }, (_, i) => at(streams.power, i)),
    hr: Array.from({ length: n }, (_, i) => at(streams.heartRate, i)),
    cadence: Array.from({ length: n }, (_, i) => at(streams.cadence, i)),
    speed_mps: Array.from({ length: n }, (_, i) => round2(at(streams.speed, i))),
    elevation_m: Array.from({ length: n }, (_, i) => round1(at(streams.elevation, i))),
  });
  if (Array.isArray(streams.coords) && streams.coords.length > 0) {
    payload.coords = Array.from({ length: n }, (_, i) => {
      const c = streams.coords[i];
      return Array.isArray(c) ? [round5(c[0]), round5(c[1])] : null;
    });
  }
  return payload;
}

/**
 * Normalize a Strava streams API response (key_by_type=true). Strava's
 * `time` stream is elapsed seconds since start, so pauses appear as gaps —
 * the axis stays honest. `latlng` arrives [lat, lng] and is flipped to the
 * canonical [lng, lat].
 */
export function normalizeFromStravaStreams(streams) {
  const t = streams?.time?.data;
  if (!Array.isArray(t) || t.length < 2) return null;

  const clean = (arr, max) =>
    Array.isArray(arr)
      ? arr.map((v) => (v != null && v > 0 && v < max ? v : null))
      : null;

  const payload = {
    version: STREAM_SHAPE_VERSION,
    tier: 'per_second',
    source: 'strava_api',
    sample_seconds: detectSampleSeconds(t),
    t,
  };
  attachSeries(payload, {
    power: clean(streams.watts?.data, MAX_VALID_POWER_WATTS),
    hr: clean(streams.heartrate?.data, MAX_VALID_HR_BPM),
    cadence: clean(streams.cadence?.data, MAX_VALID_CADENCE_RPM),
    speed_mps: Array.isArray(streams.velocity_smooth?.data)
      ? streams.velocity_smooth.data.map(round2)
      : null,
    elevation_m: Array.isArray(streams.altitude?.data)
      ? streams.altitude.data.map(round1)
      : null,
    distance_m: Array.isArray(streams.distance?.data)
      ? streams.distance.data.map(round1)
      : null,
  });
  if (Array.isArray(streams.latlng?.data)) {
    payload.coords = streams.latlng.data.map((pair) =>
      Array.isArray(pair) ? [round5(pair[1]), round5(pair[0])] : null
    );
  }
  return payload;
}

/**
 * Normalize the AI-coach resampled time series (fit_coach_context) — real
 * elapsed-seconds axis at 5–60 s resolution, power zeros preserved. No
 * speed/elevation/GPS at this tier.
 */
export function normalizeFromCoachContext(fitCoachContext) {
  const series = fitCoachContext?.time_series;
  if (!Array.isArray(series) || series.length < 2) return null;

  const payload = {
    version: STREAM_SHAPE_VERSION,
    tier: 'coach_ts',
    source: 'fit_coach_context',
    sample_seconds: fitCoachContext.interval_seconds ?? null,
    t: series.map((s) => s.t),
  };
  attachSeries(payload, {
    power: series.map((s) => s.power ?? null),
    hr: series.map((s) => s.hr ?? null),
    cadence: series.map((s) => s.cadence ?? null),
  });
  return payload;
}

/**
 * Normalize RDP-simplified activity_streams (the GPS ingest path). These
 * points are unevenly spaced and carry no timestamps, so the payload has NO
 * time axis — the client charts this tier on the distance axis it derives
 * from coords (matching today's behavior). Honest, never a faked clock.
 */
export function normalizeSimplifiedStreams(streams) {
  const arrays = ['power', 'heartRate', 'cadence', 'speed', 'elevation']
    .map((k) => streams?.[k])
    .filter((a) => Array.isArray(a) && a.length > 0);
  const coords = Array.isArray(streams?.coords) ? streams.coords : null;
  if (arrays.length === 0 && (!coords || coords.length < 2)) return null;
  const n = Math.max(coords?.length ?? 0, ...arrays.map((a) => a.length), 0);
  if (n < 2) return null;

  const at = (arr, i) => (Array.isArray(arr) && arr[i] != null ? arr[i] : null);
  const payload = {
    version: STREAM_SHAPE_VERSION,
    tier: 'simplified',
    source: 'activity_streams',
    sample_seconds: null,
  };
  attachSeries(payload, {
    power: Array.from({ length: n }, (_, i) => at(streams.power, i)),
    hr: Array.from({ length: n }, (_, i) => at(streams.heartRate, i)),
    cadence: Array.from({ length: n }, (_, i) => at(streams.cadence, i)),
    speed_mps: Array.from({ length: n }, (_, i) => round2(at(streams.speed, i))),
    elevation_m: Array.from({ length: n }, (_, i) => round1(at(streams.elevation, i))),
  });
  if (coords && coords.length >= 2) {
    payload.coords = Array.from({ length: n }, (_, i) => {
      const c = coords[i];
      return Array.isArray(c) ? [round5(c[0]), round5(c[1])] : null;
    });
  }
  return payload;
}

const SERIES_KEYS = ['t', 'power', 'hr', 'cadence', 'speed_mps', 'elevation_m', 'distance_m', 'coords'];

/**
 * Stride-decimate every parallel array so the payload stays under `cap`
 * samples. Always keeps the first and last sample; the (real) t values of
 * kept samples are untouched, so the axis stays honest — only density drops.
 */
export function decimateToCap(payload, cap = MAX_STREAM_SAMPLES) {
  if (!payload) return payload;
  const reference = payload.t ?? payload.power ?? payload.coords ?? payload.hr;
  const n = reference?.length ?? 0;
  if (n <= cap) return payload;

  const stride = Math.ceil(n / cap);
  const indices = [];
  for (let i = 0; i < n; i += stride) indices.push(i);
  if (indices[indices.length - 1] !== n - 1) indices.push(n - 1);

  const out = { ...payload, decimated: true };
  for (const key of SERIES_KEYS) {
    if (Array.isArray(payload[key])) out[key] = indices.map((i) => payload[key][i]);
  }
  if (payload.sample_seconds != null) out.sample_seconds = payload.sample_seconds * stride;
  return out;
}
