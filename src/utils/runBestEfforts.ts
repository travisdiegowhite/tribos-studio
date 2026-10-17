/**
 * Running bests: the fastest 1k / 5k / 10k / half (multisport phase 4).
 *
 * Two sources, merged per distance:
 *   stream     — the true best effort INSIDE a run, from its activity_streams
 *                (coords + speed per simplified GPS point; FIT/Garmin only).
 *                The streams carry no time array, so each segment's time is
 *                its length over its average speed. Segments slower than a
 *                credible running speed are treated as stopped and skipped,
 *                like moving time.
 *   whole_run  — the fastest average pace among whole runs at least that
 *                long. Works for every provider (Strava runs have no
 *                streams), but measures the run, not the best part of it.
 *
 * The faster of the two wins and keeps its source, so the UI can say which
 * one it is showing. Paces are seconds per km.
 */

import { haversineMeters } from './distanceUnits';
import { MAX_VALID_SPEED_MPS } from './streamChartData';
import { MIN_CREDIBLE_RUN_SPEED_MPS } from './paceFormat';

export type BestEffortKey = '1k' | '5k' | '10k' | 'half';

export const BEST_EFFORT_TARGETS: ReadonlyArray<{ key: BestEffortKey; label: string; meters: number }> = [
  { key: '1k', label: '1 km', meters: 1000 },
  { key: '5k', label: '5 km', meters: 5000 },
  { key: '10k', label: '10 km', meters: 10000 },
  { key: 'half', label: 'Half', meters: 21097.5 },
];

/** Faster than this (2:30/km) over 1 km or more is a GPS glitch, not a run. */
const FASTEST_CREDIBLE_PACE_SEC_PER_KM = 150;

export type BestEffortSource = 'stream' | 'whole_run';

export interface BestEffort {
  key: BestEffortKey;
  seconds: number;
  paceSecPerKm: number;
  activityId: string | null;
  date: string | null;
  source: BestEffortSource;
}

export interface RunStreams {
  coords?: Array<[number, number]>;
  speed?: Array<number | null>;
}

function credibleSpeed(v: number | null | undefined): number | null {
  const s = Number(v);
  return s >= MIN_CREDIBLE_RUN_SPEED_MPS && s < MAX_VALID_SPEED_MPS ? s : null;
}

/**
 * Best time (seconds) over each target distance inside one run's streams.
 * Returns only the targets the run is long enough for.
 */
export function streamBestEfforts(
  streams: RunStreams | null | undefined,
  targets = BEST_EFFORT_TARGETS,
): Partial<Record<BestEffortKey, number>> {
  const coords = streams?.coords;
  const speed = streams?.speed;
  if (!Array.isArray(coords) || !Array.isArray(speed) || coords.length < 2) return {};

  // Cumulative moving distance and time over credible segments.
  const cumD = [0];
  const cumT = [0];
  for (let i = 1; i < coords.length; i++) {
    const a = credibleSpeed(speed[i - 1]);
    const b = credibleSpeed(speed[i]);
    const v = a != null && b != null ? (a + b) / 2 : (a ?? b);
    const [lng1, lat1] = coords[i - 1];
    const [lng2, lat2] = coords[i];
    const d = v != null ? haversineMeters(lat1, lng1, lat2, lng2) : 0;
    cumD.push(cumD[i - 1] + d);
    cumT.push(cumT[i - 1] + (v != null ? d / v : 0));
  }

  const out: Partial<Record<BestEffortKey, number>> = {};
  const n = cumD.length;
  for (const { key, meters } of targets) {
    if (cumD[n - 1] < meters) continue;
    let best = Infinity;
    let i = 0;
    for (let j = 1; j < n; j++) {
      // Largest i whose window i..j still covers the target.
      while (i + 1 < j && cumD[j] - cumD[i + 1] >= meters) i++;
      const span = cumD[j] - cumD[i];
      if (span < meters) continue;
      const segD = cumD[i + 1] - cumD[i];
      const segT = cumT[i + 1] - cumT[i];
      const trim = segD > 0 ? ((span - meters) / segD) * segT : 0;
      const t = cumT[j] - cumT[i] - trim;
      if (t > 0 && t < best) best = t;
    }
    if (Number.isFinite(best) && (best / meters) * 1000 >= FASTEST_CREDIBLE_PACE_SEC_PER_KM) {
      out[key] = best;
    }
  }
  return out;
}

export interface RunRow {
  id?: string | null;
  start_date?: string | null;
  distance?: number | null;
  moving_time?: number | null;
}

function effort(
  key: BestEffortKey,
  meters: number,
  seconds: number,
  run: RunRow,
  source: BestEffortSource,
): BestEffort {
  return {
    key,
    seconds,
    paceSecPerKm: (seconds / meters) * 1000,
    activityId: run.id ?? null,
    date: run.start_date ?? null,
    source,
  };
}

/**
 * Fastest whole-run average pace among runs at least each target long,
 * expressed as the time that pace would take over the target.
 */
export function wholeRunBests(
  runs: ReadonlyArray<RunRow>,
  targets = BEST_EFFORT_TARGETS,
): Partial<Record<BestEffortKey, BestEffort>> {
  const out: Partial<Record<BestEffortKey, BestEffort>> = {};
  for (const { key, meters } of targets) {
    for (const run of runs) {
      const d = Number(run.distance);
      const t = Number(run.moving_time);
      if (!(d >= meters) || !(t > 0)) continue;
      const pace = (t / d) * 1000;
      if (pace < FASTEST_CREDIBLE_PACE_SEC_PER_KM || d / t < MIN_CREDIBLE_RUN_SPEED_MPS) continue;
      const seconds = (pace * meters) / 1000;
      if (!out[key] || seconds < out[key]!.seconds) out[key] = effort(key, meters, seconds, run, 'whole_run');
    }
  }
  return out;
}

export interface StreamedRun extends RunRow {
  activity_streams?: RunStreams | null;
}

/**
 * Bests across all runs: stream efforts where streams exist, whole-run pace
 * otherwise; the faster wins per distance and keeps its source.
 */
export function mergeBests(
  runs: ReadonlyArray<RunRow>,
  streamedRuns: ReadonlyArray<StreamedRun>,
  targets = BEST_EFFORT_TARGETS,
): BestEffort[] {
  const merged = wholeRunBests(runs, targets);
  for (const run of streamedRuns) {
    const efforts = streamBestEfforts(run.activity_streams, targets);
    for (const { key, meters } of targets) {
      const seconds = efforts[key];
      if (seconds == null) continue;
      if (!merged[key] || seconds < merged[key]!.seconds) {
        merged[key] = effort(key, meters, seconds, run, 'stream');
      }
    }
  }
  return targets.map((t) => merged[t.key]).filter((e): e is BestEffort => !!e);
}
