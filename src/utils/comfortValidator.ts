/**
 * comfortValidator — the authority on whether a route keeps its comfort
 * promise (docs/COMFORT-ROUTING-SPEC.md §3, §5.2).
 *
 * Engine-agnostic: give it the route line and the OSM ways along it (BRouter
 * `taggedWays`, a BRouter re-ride, or Overpass) and it classifies every
 * segment, builds flagged stretches, totals them, and says pass/fail with a
 * heads-up per stretch. The optimizer (BRouter profile, Valhalla costing)
 * only has to steer well; this decides.
 *
 * Unknowns:
 *  - A segment no way matched within the snap radius (the re-ride took a
 *    parallel road, or there was no data) is `unknown` — never counted as
 *    within comfort. This is the trace-fidelity check.
 *  - A road whose speed isn't mapped (`confidence: 'unknown'`) is within
 *    comfort only if its worst case would be; otherwise `unknown`: flagged
 *    with a heads-up, drawn grey dashed, counted in `unknownPct`, and NOT
 *    counted toward the stretch or route limits (decision 2026-11-02).
 *
 * Pure. Browser and Node (the harness).
 */

import type { Coordinate } from '../types/geo';
import type { TaggedWay } from './wayTags';
import { haversineMeters } from './distanceUnits';
import { matchRouteWays } from './surfaceOverlay.js';
import {
  COMFORT_RULES,
  classStatus,
  levelsAboveText,
  type ComfortClass,
  type ComfortLevel,
} from './comfortLevels';
import { comfortClassForTags, type ComfortClassResult, type ComfortExtras } from './comfortClass';

export type SegmentStatus = 'free' | 'flagged' | 'blocked' | 'unknown';
/** Map/strip colour role: within (≤ L−1), at (= L), flagged (> L), blocked, unknown. */
export type SegmentTone = 'within' | 'at' | 'flagged' | 'blocked' | 'unknown';

export const VALIDATOR_REASONS = {
  notConfirmed: 'road not confirmed',
} as const;

export interface ComfortSegment {
  length_m: number;
  status: SegmentStatus;
  tone: SegmentTone;
  /** Null when no way matched. */
  cls: ComfortClass | null;
  confidence: ComfortClassResult['confidence'] | 'unmatched';
  reasons: string[];
}

export interface ComfortStretch {
  kind: 'flagged' | 'blocked' | 'unknown';
  /** Index of the first and last coordinate segment in the stretch. */
  startIdx: number;
  endIdx: number;
  /** Distance from the route start, metres. */
  start_m: number;
  length_m: number;
  /** Highest numeric class in the stretch (X counts as 6); null for unmatched-only unknowns. */
  maxCls: ComfortClass | null;
  levelsAbove: number;
  /** True when this flagged stretch is longer than its limit. */
  overLimit: boolean;
  reasons: string[];
}

export interface HeadsUp {
  kind: 'flagged' | 'unknown';
  start_m: number;
  length_m: number;
  /** "One level above your comfort", or for unknowns "Speed limit not mapped". */
  title: string;
  reasons: string[];
  levelsAbove: number;
}

export type ComfortFailure =
  | { kind: 'blocked'; length_m: number; stretches: number }
  | { kind: 'stretch_too_long'; start_m: number; length_m: number; limit_m: number }
  | { kind: 'too_much_flagged'; flagged_m: number; limit_m: number };

export interface ComfortValidation {
  level: ComfortLevel;
  total_m: number;
  within_m: number;
  flagged_m: number;
  blocked_m: number;
  unknown_m: number;
  /** Distance within comfort ÷ total, 0–100. Unknown is not within. */
  withinPct: number;
  unknownPct: number;
  segments: ComfortSegment[];
  flaggedStretches: ComfortStretch[];
  blockedStretches: ComfortStretch[];
  unknownStretches: ComfortStretch[];
  longestFlagged_m: number;
  passes: boolean;
  failures: ComfortFailure[];
  headsUps: HeadsUp[];
}

export interface ValidateOptions {
  level: ComfortLevel;
  /** Conflated per-way overrides (spec §6). */
  extrasForWay?: (way: TaggedWay) => ComfortExtras | null | undefined;
}

function numericClass(cls: ComfortClass | null): number {
  if (cls === 'X') return 6;
  return cls ?? 0;
}

function segmentLengths(coordinates: ReadonlyArray<Coordinate>): number[] {
  const out: number[] = [];
  for (let i = 1; i < coordinates.length; i++) {
    const a = coordinates[i - 1];
    const b = coordinates[i];
    out.push(haversineMeters(a[1], a[0], b[1], b[0]));
  }
  return out;
}

function classify(result: ComfortClassResult | null, level: ComfortLevel, length_m: number): ComfortSegment {
  if (!result) {
    return {
      length_m,
      status: 'unknown',
      tone: 'unknown',
      cls: null,
      confidence: 'unmatched',
      reasons: [VALIDATOR_REASONS.notConfirmed],
    };
  }
  let status: SegmentStatus;
  let toneCls: ComfortClass = result.cls;
  if (result.confidence === 'unknown') {
    if (classStatus(result.worstCaseCls, level) === 'free') {
      status = 'free';
      toneCls = result.worstCaseCls;
    } else {
      status = 'unknown';
    }
  } else {
    status = classStatus(result.cls, level);
  }
  let tone: SegmentTone;
  if (status === 'unknown') tone = 'unknown';
  else if (status === 'flagged') tone = 'flagged';
  else if (status === 'blocked') tone = 'blocked';
  else tone = numericClass(toneCls) === level ? 'at' : 'within';
  return {
    length_m,
    status,
    tone,
    cls: result.cls,
    confidence: result.confidence,
    reasons: result.reasons,
  };
}

interface Run {
  startIdx: number;
  endIdx: number;
}

/**
 * Contiguous runs of segments matching `inRun`, merging across gaps shorter
 * than `mergeGapM` whose segments all satisfy `bridgeable`.
 */
function runsOf(
  segments: ReadonlyArray<ComfortSegment>,
  inRun: (s: ComfortSegment) => boolean,
  bridgeable: (s: ComfortSegment) => boolean,
  mergeGapM: number,
): Run[] {
  const runs: Run[] = [];
  let i = 0;
  while (i < segments.length) {
    if (!inRun(segments[i])) {
      i++;
      continue;
    }
    const startIdx = i;
    let endIdx = i;
    let j = i + 1;
    while (j < segments.length) {
      if (inRun(segments[j])) {
        endIdx = j;
        j++;
        continue;
      }
      // Look ahead across a short bridgeable gap.
      let gap = 0;
      let k = j;
      while (k < segments.length && !inRun(segments[k]) && bridgeable(segments[k]) && gap < mergeGapM) {
        gap += segments[k].length_m;
        k++;
      }
      if (k < segments.length && inRun(segments[k]) && gap < mergeGapM) {
        endIdx = k;
        j = k + 1;
        continue;
      }
      break;
    }
    runs.push({ startIdx, endIdx });
    i = endIdx + 1;
  }
  return runs;
}

function dedupe(list: string[]): string[] {
  return [...new Set(list)];
}

function buildStretch(
  kind: ComfortStretch['kind'],
  run: Run,
  segments: ReadonlyArray<ComfortSegment>,
  offsets: ReadonlyArray<number>,
  level: ComfortLevel,
): ComfortStretch {
  let length_m = 0;
  let worst: ComfortSegment | null = null;
  for (let i = run.startIdx; i <= run.endIdx; i++) {
    const s = segments[i];
    length_m += s.length_m;
    const relevant = kind === 'unknown' ? s.status === 'unknown' : s.status === kind;
    if (!relevant) continue;
    if (
      !worst ||
      numericClass(s.cls) > numericClass(worst.cls) ||
      (numericClass(s.cls) === numericClass(worst.cls) && s.length_m > worst.length_m)
    ) {
      worst = s;
    }
  }
  const maxCls = worst?.cls ?? null;
  const levelsAbove = Math.max(0, Math.min(numericClass(maxCls), 6) - level);
  const limit = levelsAbove >= 2 ? COMFORT_RULES.maxStretchTwoAboveM : COMFORT_RULES.maxStretchM;
  return {
    kind,
    startIdx: run.startIdx,
    endIdx: run.endIdx,
    start_m: offsets[run.startIdx],
    length_m,
    maxCls,
    levelsAbove,
    overLimit: kind === 'flagged' && length_m > limit,
    reasons: dedupe(worst?.reasons ?? []).slice(0, 3),
  };
}

/**
 * Validate a route given one tag map (or null) per coordinate segment.
 * The pure core; `validateComfortRoute` does the way matching.
 */
export function validateMatchedSegments(
  coordinates: ReadonlyArray<Coordinate>,
  segmentClasses: ReadonlyArray<ComfortClassResult | null>,
  level: ComfortLevel,
): ComfortValidation {
  const lengths = segmentLengths(coordinates);
  const segments = lengths.map((len, i) => classify(segmentClasses[i] ?? null, level, len));

  const offsets: number[] = [];
  let acc = 0;
  for (const s of segments) {
    offsets.push(acc);
    acc += s.length_m;
  }
  const total_m = acc;

  let within_m = 0;
  let flaggedSeg_m = 0;
  let blocked_m = 0;
  let unknown_m = 0;
  for (const s of segments) {
    if (s.status === 'free') within_m += s.length_m;
    else if (s.status === 'flagged') flaggedSeg_m += s.length_m;
    else if (s.status === 'blocked') blocked_m += s.length_m;
    else unknown_m += s.length_m;
  }

  const gap = COMFORT_RULES.mergeGapM;
  const notBlocked = (s: ComfortSegment) => s.status !== 'blocked';
  const flaggedStretches = runsOf(segments, (s) => s.status === 'flagged', notBlocked, gap).map((r) =>
    buildStretch('flagged', r, segments, offsets, level),
  );
  const blockedStretches = runsOf(segments, (s) => s.status === 'blocked', () => true, gap).map((r) =>
    buildStretch('blocked', r, segments, offsets, level),
  );
  const unknownStretches = runsOf(segments, (s) => s.status === 'unknown', notBlocked, gap).map((r) =>
    buildStretch('unknown', r, segments, offsets, level),
  );

  // Stretch lengths include any short bridged gap, so this is ≥ the sum of
  // flagged segments — the conservative reading of the 10% limit.
  const flagged_m = Math.max(
    flaggedStretches.reduce((sum, s) => sum + s.length_m, 0),
    flaggedSeg_m,
  );
  const longestFlagged_m = flaggedStretches.reduce((m, s) => Math.max(m, s.length_m), 0);

  const failures: ComfortFailure[] = [];
  if (blockedStretches.length > 0) {
    failures.push({ kind: 'blocked', length_m: blocked_m, stretches: blockedStretches.length });
  }
  for (const s of flaggedStretches) {
    if (!s.overLimit) continue;
    failures.push({
      kind: 'stretch_too_long',
      start_m: s.start_m,
      length_m: s.length_m,
      limit_m: s.levelsAbove >= 2 ? COMFORT_RULES.maxStretchTwoAboveM : COMFORT_RULES.maxStretchM,
    });
  }
  const routeLimit = total_m * COMFORT_RULES.maxFlaggedShare;
  if (flagged_m > routeLimit) {
    failures.push({ kind: 'too_much_flagged', flagged_m, limit_m: routeLimit });
  }

  const headsUps: HeadsUp[] = [
    ...flaggedStretches.map((s) => ({
      kind: 'flagged' as const,
      start_m: s.start_m,
      length_m: s.length_m,
      title: levelsAboveText(s.levelsAbove),
      reasons: s.reasons,
      levelsAbove: s.levelsAbove,
    })),
    ...unknownStretches.map((s) => ({
      kind: 'unknown' as const,
      start_m: s.start_m,
      length_m: s.length_m,
      title: s.maxCls == null ? 'Road not confirmed' : 'Speed limit not mapped',
      reasons: s.reasons,
      levelsAbove: 0,
    })),
  ].sort((a, b) => a.start_m - b.start_m);

  const pct = (m: number) => (total_m > 0 ? Math.round((m / total_m) * 1000) / 10 : 0);

  return {
    level,
    total_m,
    within_m,
    flagged_m,
    blocked_m,
    unknown_m,
    withinPct: pct(within_m),
    unknownPct: pct(unknown_m),
    segments,
    flaggedStretches,
    blockedStretches,
    unknownStretches,
    longestFlagged_m,
    passes: failures.length === 0,
    failures,
    headsUps,
  };
}

/** Classify each coordinate segment from the ways along it. Null when no way data matched at all. */
export function classifyRouteSegments(
  coordinates: ReadonlyArray<Coordinate>,
  ways: ReadonlyArray<TaggedWay>,
  extrasForWay?: ValidateOptions['extrasForWay'],
): Array<ComfortClassResult | null> | null {
  const matched = matchRouteWays(coordinates, ways) as Array<TaggedWay | null> | null;
  if (!matched) return null;
  const memo = new Map<TaggedWay, ComfortClassResult | null>();
  return matched.map((way) => {
    if (!way) return null;
    if (!memo.has(way)) memo.set(way, comfortClassForTags(way.tags, extrasForWay?.(way) ?? undefined));
    return memo.get(way)!;
  });
}

/**
 * Validate a route against the ways along it. Null when the geometry is
 * unusable or no way matched (no data — the caller must not treat that as a
 * pass).
 */
export function validateComfortRoute(
  coordinates: ReadonlyArray<Coordinate>,
  ways: ReadonlyArray<TaggedWay>,
  options: ValidateOptions,
): ComfortValidation | null {
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;
  const classes = classifyRouteSegments(coordinates, ways, options.extrasForWay);
  if (!classes) return null;
  return validateMatchedSegments(coordinates, classes, options.level);
}

export interface ToneRun {
  start_m: number;
  end_m: number;
  tone: SegmentTone;
}

/** Consecutive segments of the same tone merged — the comfort strip and map line. */
export function toneRuns(validation: Pick<ComfortValidation, 'segments'>): ToneRun[] {
  const runs: ToneRun[] = [];
  let at = 0;
  for (const s of validation.segments) {
    const last = runs[runs.length - 1];
    if (last && last.tone === s.tone) last.end_m += s.length_m;
    else runs.push({ start_m: at, end_m: at + s.length_m, tone: s.tone });
    at += s.length_m;
  }
  return runs;
}
