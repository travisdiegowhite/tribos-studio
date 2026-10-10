/**
 * Sector binning for the REPEATS comparison.
 *
 * The stored `activity_streams` are RDP-simplified at write time
 * (api/utils/fitParser.js → simplifyTrack): a row survives only where the
 * road bends, and each row carries a single instantaneous sample. A straight
 * 5 km road can be two rows. Joining those rows with a line invents a trace
 * that was never measured, so the comparison works in sectors instead: every
 * sample lands in the stretch of road it belongs to, and a sector with too
 * few samples is left blank rather than interpolated.
 */
import type { StreamRow } from './streamChartData';

export type SectorKey = 'power' | 'heartRate' | 'speed_kmh';

export interface SectorBin {
  /** Span-weighted mean of the samples in this sector, null when too sparse. */
  mean: number | null;
  /** Samples that landed in the sector. */
  n: number;
}

/** Cap on how much road one sample may speak for, km. */
const MAX_SPAN_KM = 1;

/** Sector count for the grid view: ~3 km sectors, 4–12 of them. */
export function gridSectorCount(lengthKm: number): number {
  return clamp(Math.round(lengthKm / 3), 4, 12);
}

/** Bin count for the step-line view: ~750 m bins, 8–60 of them. */
export function lineBinCount(lengthKm: number): number {
  return clamp(Math.round(lengthKm / 0.75), 8, 60);
}

/** Equal-distance edges from 0 to lengthKm: count + 1 numbers. */
export function sectorBounds(lengthKm: number, count: number): number[] {
  const len = Math.max(lengthKm, 0.01);
  const n = Math.max(1, Math.floor(count));
  return Array.from({ length: n + 1 }, (_, i) => (i === n ? len : (i * len) / n));
}

/** Index of the sector containing x, clamped into range. */
export function sectorIndexAt(edges: readonly number[], x: number): number {
  const n = edges.length - 1;
  if (n < 1) return 0;
  const len = edges[n];
  if (len <= 0) return 0;
  return clamp(Math.floor((x / len) * n), 0, n - 1);
}

/**
 * Average one metric of an effort's rows per sector. Each sample is weighted
 * by the road it represents (half the gap to each neighbour, capped), so a
 * cluster of bend points doesn't outvote a long straight.
 */
export function binEffort(
  rows: readonly StreamRow[],
  key: SectorKey,
  edges: readonly number[],
  minSamples: number,
): SectorBin[] {
  const n = Math.max(0, edges.length - 1);
  const sum = new Array<number>(n).fill(0);
  const weight = new Array<number>(n).fill(0);
  const count = new Array<number>(n).fill(0);
  if (n === 0) return [];
  const len = edges[n];

  const pts: Array<{ x: number; v: number }> = [];
  for (const r of rows) {
    const v = r[key];
    if (v == null || !Number.isFinite(v) || !Number.isFinite(r.x)) continue;
    if (r.x < 0 || r.x > len) continue;
    pts.push({ x: r.x, v });
  }
  pts.sort((a, b) => a.x - b.x);

  for (let i = 0; i < pts.length; i++) {
    const { x, v } = pts[i];
    const before = i > 0 ? (x - pts[i - 1].x) / 2 : 0;
    const after = i < pts.length - 1 ? (pts[i + 1].x - x) / 2 : 0;
    // A lone sample still counts, with a nominal weight.
    const w = Math.min(before + after, MAX_SPAN_KM) || 0.001;
    const s = sectorIndexAt(edges, x);
    sum[s] += v * w;
    weight[s] += w;
    count[s] += 1;
  }

  return sum.map((total, i) => ({
    mean: count[i] >= minSamples && weight[i] > 0 ? total / weight[i] : null,
    n: count[i],
  }));
}

/** Per-sector median across efforts, ignoring blank cells. */
export function sectorMedians(binned: readonly (readonly SectorBin[])[]): Array<number | null> {
  const n = binned.reduce((m, b) => Math.max(m, b.length), 0);
  return Array.from({ length: n }, (_, i) => {
    const vals = binned
      .map((b) => b[i]?.mean)
      .filter((v): v is number => v != null)
      .sort((a, b) => a - b);
    if (vals.length === 0) return null;
    const mid = Math.floor(vals.length / 2);
    return vals.length % 2 ? vals[mid] : (vals[mid - 1] + vals[mid]) / 2;
  });
}

/** Per-sector spread (max − min) across efforts, ignoring blank cells. */
export function sectorSpreads(binned: readonly (readonly SectorBin[])[]): number[] {
  const n = binned.reduce((m, b) => Math.max(m, b.length), 0);
  return Array.from({ length: n }, (_, i) => {
    const vals = binned.map((b) => b[i]?.mean).filter((v): v is number => v != null);
    return vals.length > 1 ? Math.max(...vals) - Math.min(...vals) : 0;
  });
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
