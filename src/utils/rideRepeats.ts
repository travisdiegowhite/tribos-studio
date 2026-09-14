/**
 * rideRepeats — find the rides that repeat an anchor path and align each of
 * them to it, so several efforts over the same road can be overlaid.
 *
 * The anchor is either a whole ride's track ("repeats of this ride") or a
 * saved training segment's geometry. Membership and alignment both come from
 * the segment-coverage matcher the server already uses to link rides to
 * segments (api/utils/segmentCoverage.js — pure, browser-safe): a ride is a
 * repeat when the anchor path lies along its track, and the matcher's
 * entry/exit indices say where in the ride that happens.
 *
 * Identity is geometric, so a polyline-only ride (most Strava imports) is a
 * repeat too — it draws on the map and counts, it just has no trace and no
 * time. Time is integrated from the speed stream when one exists and is
 * never invented; migration 110 is the cautionary tale.
 *
 * Pure: no React, no Supabase.
 */

import {
  bboxIntersects,
  bboxOf,
  buildTrackIndex,
  mutualCoverage,
  pathCoverage,
  COVERAGE_DEFAULTS,
} from '../../api/utils/segmentCoverage.js';
import { ridePolylineOf, rideRouteCoords, rideStreamsOf, type RideStreams } from './rideGeo';
import { buildStreamRows, cumulativeDistancesKm, type StreamRow } from './streamChartData';
import { haversineKm } from './distanceUnits';

export type LngLat = [number, number];
type RideRow = Record<string, unknown> & { id: string };

export type AnchorKind = 'ride' | 'segment';

export interface RepeatAnchor {
  kind: AnchorKind;
  id: string;
  name: string;
  /** The reference path, canonical [lng, lat]. */
  coords: LngLat[];
  /** Length of the reference path, km. */
  lengthKm: number;
}

export interface SliceStats {
  distanceKm: number;
  /** Integrated from the speed stream; null without one. */
  durationSeconds: number | null;
  avgSpeedKmh: number | null;
  avgPower: number | null;
  maxPower: number | null;
  avgHr: number | null;
  maxHr: number | null;
}

export interface RepeatEffort {
  id: string;
  ride: RideRow;
  name: string;
  startDate: string;
  /** Fraction of the anchor path this ride covered. */
  coverage: number;
  direction: 'forward' | 'reverse' | 'unknown';
  /** Source indices into the ride's own track (low → high). */
  entryIdx: number;
  exitIdx: number;
  /** The covered slice of the ride's track, ordered in the anchor's direction. */
  coords: LngLat[];
  /**
   * Aligned metric rows, x = km from where the ride joined the anchor.
   * Null for a polyline-only ride (nothing measured along the track).
   */
  rows: StreamRow[] | null;
  /** True when the slice carries at least one metric stream. */
  measured: boolean;
  stats: SliceStats;
}

export interface FindRepeatsOptions {
  /** Anchor coverage a ride must reach to count. Default 0.8 (matcher default). */
  minCoverage?: number;
}

/** Categorical colours for overlaid efforts — distinct from the zone palette. */
export const REPEAT_PALETTE: readonly string[] = [
  '#2A8C82', // teal
  '#D4600A', // orange
  '#4A6FA5', // slate blue
  '#C49A0A', // gold
  '#C43C2A', // coral
  '#7B5EA7', // grape
  '#5E9C6A', // moss
  '#8C6A4A', // brown
];

export function repeatColor(index: number): string {
  return REPEAT_PALETTE[((index % REPEAT_PALETTE.length) + REPEAT_PALETTE.length) % REPEAT_PALETTE.length];
}

// ── track access ─────────────────────────────────────────────────────────────

/** A plausible [lng, lat] pair. Real streams carry the odd impossible point. */
export function isFiniteLngLat(p: unknown): p is LngLat {
  return (
    Array.isArray(p) &&
    p.length >= 2 &&
    Number.isFinite(p[0]) &&
    Number.isFinite(p[1]) &&
    Math.abs(p[0] as number) <= 180 &&
    Math.abs(p[1] as number) <= 90
  );
}

const STREAM_KEYS = ['power', 'heartRate', 'speed', 'cadence', 'elevation'] as const;
const sanitizedCache = new WeakMap<object, RideStreams | null>();

/**
 * A step between consecutive points longer than this is a GPS glitch, not
 * riding. Simplified tracks average ~300 m between vertices and a dropout in
 * a tunnel or canyon spans a few km; a jump to null island spans thousands,
 * and densifying that at 20 m is what runs the matcher out of memory.
 */
export const MAX_STEP_KM = 8;
/** No ride is this long; a track that is has a glitch the step check missed. */
export const MAX_TRACK_KM = 600;

/**
 * Indices of the longest run of plausible points: each valid, and each within
 * MAX_STEP_KM of the one before it. Returns [] when fewer than two remain.
 */
export function plausibleRun(coords: readonly unknown[]): number[] {
  let best: number[] = [];
  let run: number[] = [];
  let prev: LngLat | null = null;
  for (let i = 0; i < coords.length; i++) {
    const c = coords[i];
    if (!isFiniteLngLat(c)) {
      prev = null;
      continue;
    }
    if (prev && haversineKm(prev[1], prev[0], c[1], c[0]) > MAX_STEP_KM) {
      if (run.length > best.length) best = run;
      run = [];
    }
    run.push(i);
    prev = c;
  }
  if (run.length > best.length) best = run;
  return best.length >= 2 ? best : [];
}

/**
 * The ride's streams with every implausible coordinate removed from ALL
 * parallel arrays, so indices stay aligned. Null when there is no usable
 * track. Cached per row object: the scan touches each ride once per anchor.
 */
export function sanitizedStreams(ride: RideRow | null | undefined): RideStreams | null {
  if (!ride) return null;
  if (sanitizedCache.has(ride)) return sanitizedCache.get(ride) ?? null;
  const raw = rideStreamsOf(ride);
  let out: RideStreams | null = null;
  if (raw && Array.isArray(raw.coords)) {
    const keep = plausibleRun(raw.coords);
    if (keep.length >= 2) {
      if (keep.length === raw.coords.length) {
        out = raw;
      } else {
        out = { coords: keep.map((i) => raw.coords![i] as LngLat) };
        for (const k of STREAM_KEYS) {
          const arr = raw[k];
          if (Array.isArray(arr)) out[k] = keep.map((i) => arr[i] ?? null);
        }
      }
    }
  }
  sanitizedCache.set(ride, out);
  return out;
}

/** True when the ride has a usable stream track (≥ 2 valid coordinates). */
export function hasStreamTrack(ride: RideRow | null | undefined): boolean {
  return (sanitizedStreams(ride)?.coords?.length ?? 0) >= 2;
}

/** The ride's drawable track: stream coords when present, else the polyline. */
export function rideTrackCoords(ride: RideRow | null | undefined): LngLat[] {
  if (!ride) return [];
  const streams = sanitizedStreams(ride);
  if (streams) return streams.coords as LngLat[];
  const decoded = rideRouteCoords(ride);
  const keep = plausibleRun(decoded);
  return keep.length === decoded.length ? decoded : keep.map((i) => decoded[i]);
}

/** Length of a track in km (0 for fewer than two points). */
export function trackLengthKm(coords: LngLat[]): number {
  if (coords.length < 2) return 0;
  const km = cumulativeDistancesKm(coords);
  return km[km.length - 1];
}

function rideName(ride: RideRow): string {
  return (ride.name as string) || 'Untitled ride';
}

function rideStart(ride: RideRow): string {
  return (ride.start_date as string) || (ride.recorded_at as string) || '';
}

// ── anchors ──────────────────────────────────────────────────────────────────

export function anchorFromRide(ride: RideRow | null | undefined): RepeatAnchor | null {
  if (!ride) return null;
  const coords = rideTrackCoords(ride);
  if (coords.length < 2) return null;
  const km = cumulativeDistancesKm(coords);
  const lengthKm = km[km.length - 1];
  if (!(lengthKm > 0) || lengthKm > MAX_TRACK_KM) return null;
  return { kind: 'ride', id: ride.id, name: rideName(ride), coords, lengthKm };
}

export function anchorFromSegment(
  segment:
    | { id: string; display_name?: string | null; geojson?: { coordinates?: unknown } | null }
    | null
    | undefined,
): RepeatAnchor | null {
  const raw = segment?.geojson?.coordinates;
  if (!segment || !Array.isArray(raw)) return null;
  const keep = plausibleRun(raw);
  if (keep.length < 2) return null;
  const coords = keep.map((i) => raw[i] as LngLat);
  const km = cumulativeDistancesKm(coords);
  const lengthKm = km[km.length - 1];
  if (!(lengthKm > 0) || lengthKm > MAX_TRACK_KM) return null;
  return {
    kind: 'segment',
    id: segment.id,
    name: segment.display_name || 'Segment',
    coords,
    lengthKm,
  };
}

// ── slice statistics ─────────────────────────────────────────────────────────

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  let s = 0;
  for (const v of values) s += v;
  return s / values.length;
}

/** Max without spreading (a spread over a long stream can overflow the stack). */
function maxOf(values: number[]): number | null {
  if (values.length === 0) return null;
  let m = -Infinity;
  for (const v of values) if (v > m) m = v;
  return m;
}

/**
 * Metrics over a slice of a ride's streams — the client twin of the server's
 * extractSubTrackStats. Duration is integrated from the speed stream, so a
 * ride without one gets `null`, never a made-up pace.
 */
export function sliceStats(
  ride: RideRow,
  coords: LngLat[],
  lo: number,
  hi: number,
): SliceStats {
  const km = cumulativeDistancesKm(coords.slice(lo, hi + 1));
  const distanceKm = km.length ? km[km.length - 1] : 0;
  const streams = sanitizedStreams(ride);
  const empty: SliceStats = {
    distanceKm,
    durationSeconds: null,
    avgSpeedKmh: null,
    avgPower: null,
    maxPower: null,
    avgHr: null,
    maxHr: null,
  };
  if (!streams) return empty;

  const numeric = (arr: unknown, min: number): number[] =>
    Array.isArray(arr)
      ? (arr.slice(lo, hi + 1).filter((v) => typeof v === 'number' && Number.isFinite(v) && v > min) as number[])
      : [];
  const speeds = numeric(streams.speed, 0.1);
  const powers = numeric(streams.power, 0);
  const hrs = numeric(streams.heartRate, 30);

  let durationSeconds: number | null = null;
  if (speeds.length > 0 && Array.isArray(streams.speed)) {
    let seconds = 0;
    for (let i = lo + 1; i <= hi; i++) {
      const stepKm = km[i - lo] - km[i - lo - 1];
      const spd = streams.speed[i] ?? streams.speed[i - 1];
      if (typeof spd === 'number' && spd > 0.1) seconds += (stepKm * 1000) / spd;
    }
    durationSeconds = seconds > 0 ? Math.round(seconds) : null;
  }

  const avgSpeed = mean(speeds);
  const avgPower = mean(powers);
  const avgHr = mean(hrs);
  return {
    distanceKm,
    durationSeconds,
    avgSpeedKmh: avgSpeed == null ? null : Math.round(avgSpeed * 3.6 * 10) / 10,
    avgPower: avgPower == null ? null : Math.round(avgPower),
    maxPower: maxOf(powers),
    avgHr: avgHr == null ? null : Math.round(avgHr),
    maxHr: maxOf(hrs),
  };
}

// ── alignment ────────────────────────────────────────────────────────────────

interface CoverageLike {
  coverage: number;
  direction: 'forward' | 'reverse' | 'unknown';
  entrySourceIdx: number | null;
  exitSourceIdx: number | null;
}

/**
 * Build the effort for a ride known to cover the anchor: slice its track at
 * the matcher's entry/exit, turn the slice to run the anchor's way, and
 * re-base the metric rows so x is km from the join point.
 */
export function alignEffort(ride: RideRow, track: LngLat[], cov: CoverageLike): RepeatEffort | null {
  if (cov.entrySourceIdx == null || cov.exitSourceIdx == null) return null;
  const lo = Math.max(0, Math.min(cov.entrySourceIdx, cov.exitSourceIdx));
  const hi = Math.min(track.length - 1, Math.max(cov.entrySourceIdx, cov.exitSourceIdx));
  if (hi - lo < 1) return null;

  const reverse = cov.direction === 'reverse';
  const sliceCoords = track.slice(lo, hi + 1);
  const coords = reverse ? [...sliceCoords].reverse() : sliceCoords;

  let rows: StreamRow[] | null = null;
  let measured = false;
  const streams = sanitizedStreams(ride);
  if (streams) {
    const all = buildStreamRows(streams).rows;
    const slice = all.slice(lo, hi + 1);
    if (slice.length < 2) return null;
    const x0 = slice[0].x;
    const x1 = slice[slice.length - 1].x;
    rows = (reverse ? [...slice].reverse() : slice).map((r) => ({
      ...r,
      x: reverse ? x1 - r.x : r.x - x0,
    }));
    measured = rows.some((r) => r.power != null || r.heartRate != null || r.speed_kmh != null);
    // Geometry-only streams (a polyline backfill carries coords and elevation
    // and nothing else) have no trace to draw: treat them like a polyline.
    if (!measured) rows = null;
  }

  return {
    id: ride.id,
    ride,
    name: rideName(ride),
    startDate: rideStart(ride),
    coverage: cov.coverage,
    direction: cov.direction,
    entryIdx: lo,
    exitIdx: hi,
    coords,
    rows,
    measured,
    stats: sliceStats(ride, track, lo, hi),
  };
}

// ── search ───────────────────────────────────────────────────────────────────

interface Bbox {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

/** Is `inner` inside `outer` once `outer` is grown by `padMeters` each side? */
function bboxWithin(inner: Bbox | null, outer: Bbox | null, padMeters: number): boolean {
  if (!inner || !outer) return false;
  const padLat = padMeters / 111320;
  const cosLat = Math.max(0.01, Math.cos(((outer.minLat + outer.maxLat) / 2) * (Math.PI / 180)));
  const padLng = padMeters / (111320 * cosLat);
  return (
    inner.minLat >= outer.minLat - padLat &&
    inner.maxLat <= outer.maxLat + padLat &&
    inner.minLng >= outer.minLng - padLng &&
    inner.maxLng <= outer.maxLng + padLng
  );
}

/**
 * Cheap gates before the matcher runs. Mutual coverage of 0.8 bounds the
 * length ratio to roughly [0.8, 1.25] and forces the two boxes to nearly
 * coincide, so a ride anchor can reject most of a history on length and box
 * alone; a segment anchor only needs the segment's box inside the ride's.
 */
const RIDE_LENGTH_RATIO = [0.7, 1.45] as const;
const RIDE_BBOX_PAD_METERS = 2000;
const SEGMENT_BBOX_PAD_METERS = 100;

function passesPrefilter(anchor: RepeatAnchor, anchorBox: Bbox | null, track: LngLat[]): boolean {
  const box = bboxOf(track) as Bbox | null;
  if (!box) return false;
  const lengthKm = trackLengthKm(track);
  // Nothing real is this long; whatever it is, it must not be densified.
  if (lengthKm > MAX_TRACK_KM) return false;
  if (anchor.kind === 'ride') {
    const ratio = lengthKm / (anchor.lengthKm || 1);
    if (ratio < RIDE_LENGTH_RATIO[0] || ratio > RIDE_LENGTH_RATIO[1]) return false;
    return bboxWithin(anchorBox, box, RIDE_BBOX_PAD_METERS) && bboxWithin(box, anchorBox, RIDE_BBOX_PAD_METERS);
  }
  return bboxWithin(anchorBox, box, SEGMENT_BBOX_PAD_METERS) && bboxIntersects(anchorBox, box, SEGMENT_BBOX_PAD_METERS);
}

/** Match one ride against the anchor; null when it is not a repeat. */
function matchRide(
  anchor: RepeatAnchor,
  anchorBox: Bbox | null,
  ride: RideRow,
  minCoverage: number,
): RepeatEffort | null {
  if (!ride || (ride.duplicate_of as string | null)) return null;
  if (!hasStreamTrack(ride) && !ridePolylineOf(ride)) return null;
  const track = rideTrackCoords(ride);
  if (track.length < 2) return null;
  if (!passesPrefilter(anchor, anchorBox, track)) return null;

  const cfg = { minCoverage };
  let cov: CoverageLike & { passes: boolean };
  if (anchor.kind === 'ride') {
    const m = mutualCoverage(anchor.coords, track, cfg);
    if (!m.aInB || !m.aInB.passes || m.score < minCoverage) return null;
    cov = m.aInB;
  } else {
    const c = pathCoverage(anchor.coords, buildTrackIndex(track, cfg), cfg);
    if (!c.passes) return null;
    cov = c;
  }
  return alignEffort(ride, track, cov);
}

function byNewest(a: RepeatEffort, b: RepeatEffort): number {
  return b.startDate > a.startDate ? 1 : b.startDate < a.startDate ? -1 : 0;
}

export interface RepeatsScan {
  /** Efforts found so far (newest first once `done`). */
  efforts: RepeatEffort[];
  processed: number;
  total: number;
  done: boolean;
  /**
   * Match rides until `budgetMs` has elapsed or the list is exhausted.
   * Returns true when the scan is complete. A ride that throws is skipped,
   * never allowed to abort the scan.
   */
  step(budgetMs?: number): boolean;
}

/**
 * A resumable scan over `rides`, so a UI can match a long history in short
 * slices between frames instead of freezing on one big pass.
 */
export function createRepeatsScan(
  anchor: RepeatAnchor | null,
  rides: readonly RideRow[],
  opts: FindRepeatsOptions = {},
): RepeatsScan {
  const minCoverage = opts.minCoverage ?? COVERAGE_DEFAULTS.minCoverage;
  const usable = anchor != null && anchor.coords.length >= 2;
  const anchorBox = usable ? (bboxOf(anchor!.coords) as Bbox | null) : null;
  const scan: RepeatsScan = {
    efforts: [],
    processed: 0,
    total: usable ? rides.length : 0,
    done: !usable,
    step(budgetMs = 30) {
      if (scan.done) return true;
      const now = typeof performance !== 'undefined' ? () => performance.now() : () => Date.now();
      const deadline = now() + budgetMs;
      while (scan.processed < rides.length) {
        const ride = rides[scan.processed++];
        try {
          const effort = matchRide(anchor!, anchorBox, ride, minCoverage);
          if (effort) scan.efforts.push(effort);
        } catch {
          // One bad row must not take the scan down; it simply is not a repeat.
        }
        if (now() >= deadline) break;
      }
      if (scan.processed >= rides.length) {
        scan.efforts.sort(byNewest);
        scan.done = true;
      }
      return scan.done;
    },
  };
  return scan;
}

/**
 * Every ride in `rides` that repeats the anchor, newest first, in one pass.
 *
 * A ride anchor asks for mutual coverage (the ride is the same loop, not a
 * longer ride that happens to include it); a segment anchor only asks that
 * the segment lies along the ride. Both require the matcher's contiguous,
 * monotonic pass so the slice is one continuous traversal.
 */
export function findRepeats(
  anchor: RepeatAnchor | null,
  rides: readonly RideRow[],
  opts: FindRepeatsOptions = {},
): RepeatEffort[] {
  const scan = createRepeatsScan(anchor, rides, opts);
  while (!scan.step(Infinity)) {
    /* run to completion */
  }
  return scan.efforts;
}

// ── summaries ────────────────────────────────────────────────────────────────

export interface RepeatBests {
  fastestId: string | null;
  strongestId: string | null;
}

/** Which effort was fastest (least time) and which held the most power. */
export function repeatBests(efforts: readonly RepeatEffort[]): RepeatBests {
  let fastest: RepeatEffort | null = null;
  let strongest: RepeatEffort | null = null;
  for (const e of efforts) {
    const t = e.stats.durationSeconds;
    if (t != null && (fastest == null || t < (fastest.stats.durationSeconds as number))) fastest = e;
    const p = e.stats.avgPower;
    if (p != null && (strongest == null || p > (strongest.stats.avgPower as number))) strongest = e;
  }
  return { fastestId: fastest?.id ?? null, strongestId: strongest?.id ?? null };
}

/** The point on an aligned effort nearest a distance along the anchor. */
export function effortPointAt(effort: RepeatEffort, xKm: number): { coord: LngLat; row: StreamRow | null } | null {
  if (!effort.rows || effort.rows.length === 0) {
    // Polyline-only: walk the geometry by cumulative distance.
    if (effort.coords.length === 0) return null;
    const km = cumulativeDistancesKm(effort.coords);
    let i = 0;
    while (i < km.length - 1 && km[i + 1] <= xKm) i++;
    return { coord: effort.coords[i], row: null };
  }
  const rows = effort.rows;
  let lo = 0;
  let hi = rows.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (rows[mid].x < xKm) lo = mid + 1;
    else hi = mid;
  }
  const i = lo > 0 && Math.abs(rows[lo - 1].x - xKm) < Math.abs(rows[lo].x - xKm) ? lo - 1 : lo;
  return { coord: effort.coords[Math.min(i, effort.coords.length - 1)], row: rows[i] };
}
