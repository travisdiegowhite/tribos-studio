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
import { rideHasStreamTrack, ridePolylineOf, rideRouteCoords, rideStreamsOf } from './rideGeo';
import { buildStreamRows, cumulativeDistancesKm, type StreamRow } from './streamChartData';

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
  /** Bounding-box padding used to skip rides nowhere near the anchor. */
  bboxPadMeters?: number;
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

/** The ride's drawable track: stream coords when present, else the polyline. */
export function rideTrackCoords(ride: RideRow | null | undefined): LngLat[] {
  if (!ride) return [];
  if (rideHasStreamTrack(ride)) return rideStreamsOf(ride)!.coords as LngLat[];
  return rideRouteCoords(ride);
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
  return { kind: 'ride', id: ride.id, name: rideName(ride), coords, lengthKm: km[km.length - 1] };
}

export function anchorFromSegment(
  segment:
    | { id: string; display_name?: string | null; geojson?: { coordinates?: unknown } | null }
    | null
    | undefined,
): RepeatAnchor | null {
  const raw = segment?.geojson?.coordinates;
  if (!segment || !Array.isArray(raw)) return null;
  const coords = raw.filter(
    (c): c is LngLat => Array.isArray(c) && c.length >= 2 && Number.isFinite(c[0]) && Number.isFinite(c[1]),
  );
  if (coords.length < 2) return null;
  const km = cumulativeDistancesKm(coords);
  return {
    kind: 'segment',
    id: segment.id,
    name: segment.display_name || 'Segment',
    coords,
    lengthKm: km[km.length - 1],
  };
}

// ── slice statistics ─────────────────────────────────────────────────────────

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  let s = 0;
  for (const v of values) s += v;
  return s / values.length;
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
  const streams = rideHasStreamTrack(ride) ? rideStreamsOf(ride) : null;
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
    maxPower: powers.length ? Math.max(...powers) : null,
    avgHr: avgHr == null ? null : Math.round(avgHr),
    maxHr: hrs.length ? Math.max(...hrs) : null,
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
  if (rideHasStreamTrack(ride)) {
    const streams = rideStreamsOf(ride)!;
    const all = buildStreamRows(streams).rows;
    const slice = all.slice(lo, hi + 1);
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

/**
 * Every ride in `rides` that repeats the anchor, newest first.
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
  if (!anchor || anchor.coords.length < 2) return [];
  const minCoverage = opts.minCoverage ?? COVERAGE_DEFAULTS.minCoverage;
  const pad = opts.bboxPadMeters ?? 100;
  const anchorBox = bboxOf(anchor.coords);
  const cfg = { minCoverage };

  const efforts: RepeatEffort[] = [];
  for (const ride of rides) {
    if (!ride || (ride.duplicate_of as string | null)) continue;
    if (!rideHasStreamTrack(ride) && !ridePolylineOf(ride)) continue;
    const track = rideTrackCoords(ride);
    if (track.length < 2) continue;
    if (!bboxIntersects(anchorBox, bboxOf(track), pad)) continue;

    let cov: CoverageLike & { passes: boolean };
    if (anchor.kind === 'ride') {
      const m = mutualCoverage(anchor.coords, track, cfg);
      if (!m.aInB || !m.aInB.passes || m.score < minCoverage) continue;
      cov = m.aInB;
    } else {
      const c = pathCoverage(anchor.coords, buildTrackIndex(track, cfg), cfg);
      if (!c.passes) continue;
      cov = c;
    }

    const effort = alignEffort(ride, track, cov);
    if (effort) efforts.push(effort);
  }

  efforts.sort((a, b) => (b.startDate > a.startDate ? 1 : b.startDate < a.startDate ? -1 : 0));
  return efforts;
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
