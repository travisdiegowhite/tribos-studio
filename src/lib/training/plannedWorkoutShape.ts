/**
 * plannedWorkoutShape — give EVERY on-bike calendar entry a paintable,
 * exportable workout structure.
 *
 * WHY
 * ---
 * The calendar's detail modal draws its interval chart from a library
 * workout's `structure` and offers FIT/ZWO/TCX downloads from a
 * `cyclingStructure`. Only entries whose `workout_id` names a library workout
 * get either, and in production most entries do not: the arc generator
 * (`api/utils/arcBuilder.js`) and the coach (`calendar_change`) write
 * `workout_id: null` and describe the session with a type, a length, a load
 * and a sentence of notes. The `prescribed_intervals` the block generators
 * compute are transient and never reach `calendar_entries.details`. So the
 * athlete opens "VO2 Max Intervals" and sees a name, two numbers and no shape.
 *
 * This module resolves an entry to a `WorkoutDefinition` that always carries a
 * `structure` when the session is ridden, in order of fidelity:
 *
 *   0. `prescribed`  — `details.prescription` holds the session's own
 *                      structure (coach tool, arc refill or designer). This
 *                      IS the prescription; nothing is inferred.
 *   1. `library`     — `workout_id` names a library workout. Used as-is, with
 *                      its structure fitted to the entry's planned duration.
 *   2. `notes`       — the notes spell the set out ("5x3min at VO2 effort").
 *                      Built from that, at the intensity the words name.
 *   3. `inferred`    — closest library workout by type and length (the same
 *                      stand-in `workoutResolution` gives the RB2 overlay),
 *                      renamed and fitted to the entry.
 *   4. `synthesized` — nothing better: warmup, a steady block at the type's
 *                      primary zone, cooldown.
 *
 * Rest days and off-bike sessions (strength, core, flexibility) have no ride
 * shape and resolve with an empty structure; the modal's other sections
 * still render for them.
 *
 * Every result is honest about its origin (`source`, `note`) so the UI can say
 * "stand-in" rather than pass an inference off as the prescription.
 */

import { WORKOUT_TYPES } from '../../utils/trainingPlans';
import { getAnyWorkoutById } from '../../data/workoutLookup';
import { inferWorkoutForType, workoutCategoryForPlanType } from '../../data/workoutResolution';
import { powerZoneFor, paceZoneFor, PACE_ZONE_PCT } from './session/zones';
import type {
  IntervalPrescription,
  StoredPrescription,
  TrainingZone,
  WorkoutCategory,
  WorkoutDefinition,
  WorkoutInterval,
  WorkoutSegment,
  WorkoutStructure,
} from '../../types/training';

// ============================================================
// TYPES
// ============================================================

/** The subset of a calendar row (legacy planned_workouts shape) this reads. */
export interface PlannedEntryShape {
  /** The calendar row's id; keeps a resolved stand-in's id unique per row. */
  id?: string | null;
  workout_id?: string | null;
  workout_type?: string | null;
  /** Arc rows also carry the sequencer's own session vocabulary. */
  session_type?: string | null;
  name?: string | null;
  title?: string | null;
  target_duration?: number | null;
  target_duration_min?: number | null;
  duration_minutes?: number | null;
  target_rss?: number | null;
  target_tss?: number | null;
  target_load?: number | null;
  notes?: string | null;
  /** The row's detail JSON; `details.prescription` is the stored structure. */
  details?: Record<string, unknown> | null;
  /** calendar_entries.sport (cycling | running | multi | other). */
  sport?: string | null;
}

export type ShapeSource = 'prescribed' | 'library' | 'notes' | 'inferred' | 'synthesized';

export interface PlannedWorkoutShape {
  /** Always has a `structure` when the session is on-bike. */
  workout: WorkoutDefinition;
  /** Where the structure came from; null when there is no ride shape (rest, off-bike). */
  source: ShapeSource | null;
  /** One sentence for the UI when the shape is not the athlete's own prescription. */
  note: string | null;
}

// ============================================================
// CONSTANTS
// ============================================================

/** Power targets the library uses for each zone, % FTP. */
const ZONE_POWER: Record<number, number> = {
  1: 50,
  2: 65,
  3: 80,
  3.5: 90,
  4: 100,
  5: 115,
  6: 135,
  7: 170,
};

const ZONE_LABEL: Record<number, string> = {
  1: 'Recovery',
  2: 'Endurance',
  3: 'Tempo',
  3.5: 'Sweet Spot',
  4: 'Threshold',
  5: 'VO2',
  6: 'Anaerobic',
  7: 'Sprint',
};

/** Working zone for each library category (the "primary" zone of that kind of session). */
const CATEGORY_ZONE: Record<WorkoutCategory, TrainingZone | null> = {
  recovery: 1,
  endurance: 2,
  tempo: 3,
  sweet_spot: 3.5,
  threshold: 4,
  vo2max: 5,
  anaerobic: 6,
  climbing: 4,
  racing: 4,
  strength: null,
  core: null,
  flexibility: null,
  rest: null,
};

const OFF_BIKE: ReadonlySet<string> = new Set(['strength', 'core', 'flexibility', 'rest']);

/** Categories whose sessions are interval sets rather than a steady block. */
const INTERVAL_CATEGORIES: ReadonlySet<WorkoutCategory> = new Set([
  'tempo',
  'sweet_spot',
  'threshold',
  'vo2max',
  'anaerobic',
  'climbing',
  'racing',
]);

/** Shortest warmup/cooldown a fit will leave behind, minutes. */
const MIN_BOOKEND_MIN = 5;
/** Longest a warmup / cooldown grows to when a session is lengthened; the rest is endurance. */
const MAX_GROWN_WARMUP_MIN = 20;
const MAX_GROWN_COOLDOWN_MIN = 15;
/** Below this delta the structure is left untouched — the numbers already agree. */
const FIT_TOLERANCE_MIN = 1;
const FALLBACK_DURATION_MIN = 60;

/** What a session with nothing to ride carries: the modal draws nothing for it. */
export const EMPTY_STRUCTURE: WorkoutStructure = { warmup: null, main: [], cooldown: null };

// ============================================================
// STRUCTURE ARITHMETIC
// ============================================================

function isInterval(item: WorkoutSegment | WorkoutInterval): item is WorkoutInterval {
  return 'type' in item && item.type === 'repeat';
}

function intervalMinutes(interval: WorkoutInterval): number {
  const workItems = Array.isArray(interval.work) ? interval.work : [interval.work];
  let work = 0;
  for (const item of workItems) {
    work += isInterval(item) ? intervalMinutes(item) : item.duration;
  }
  const rest = interval.rest?.duration ?? 0;
  const sets = interval.sets || 1;
  // The modal's flattener skips the rest after the final set; match it.
  return work * sets + rest * Math.max(0, sets - 1);
}

/** Total minutes a structure prescribes. */
export function structureDurationMin(structure: WorkoutStructure): number {
  let total = (structure.warmup?.duration ?? 0) + (structure.cooldown?.duration ?? 0);
  for (const item of structure.main) {
    total += isInterval(item) ? intervalMinutes(item) : item.duration;
  }
  return total;
}

/** %FTP a segment is ridden at: its own figure, else its zone's, else easy. */
function segmentPct(seg: { powerPctFTP?: number; zone: TrainingZone | null } | null | undefined): number {
  if (!seg) return 0;
  if (typeof seg.powerPctFTP === 'number' && seg.powerPctFTP > 0) return seg.powerPctFTP;
  if (seg.zone != null && ZONE_POWER[seg.zone]) return ZONE_POWER[seg.zone];
  return ZONE_POWER[1];
}

/** RSS of `minutes` at `pct` of FTP: (pct/100)² × h × 100 — the actual-load formula. */
function segmentRss(pct: number, minutes: number): number {
  return (pct / 100) ** 2 * (minutes / 60) * 100;
}

function intervalRss(interval: WorkoutInterval): number {
  const workItems = Array.isArray(interval.work) ? interval.work : [interval.work];
  let work = 0;
  for (const item of workItems) {
    work += isInterval(item) ? intervalRss(item) : segmentRss(segmentPct(item), item.duration);
  }
  const rest = interval.rest ? segmentRss(segmentPct(interval.rest as WorkoutSegment), interval.rest.duration) : 0;
  const sets = interval.sets || 1;
  return work * sets + rest * Math.max(0, sets - 1);
}

/**
 * Planned RSS of a structure, segment by segment, with the same arithmetic the
 * actual-load scorer applies to a ride (IF² × hours × 100 per segment). The
 * workout library's `targetTSS` constants are checked against this, so a
 * session's planned number describes the session it actually prescribes.
 */
export function structureLoad(structure: WorkoutStructure): number {
  let total = segmentRss(segmentPct(structure.warmup), structure.warmup?.duration ?? 0)
    + segmentRss(segmentPct(structure.cooldown), structure.cooldown?.duration ?? 0);
  for (const item of structure.main) {
    total += isInterval(item) ? intervalRss(item) : segmentRss(segmentPct(item), item.duration);
  }
  return Math.round(total);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function scaleInterval(interval: WorkoutInterval, ratio: number): WorkoutInterval {
  const scaleWork = (item: WorkoutSegment | WorkoutInterval): WorkoutSegment | WorkoutInterval =>
    isInterval(item) ? scaleInterval(item, ratio) : { ...item, duration: round1(item.duration * ratio) };
  const work = Array.isArray(interval.work)
    ? interval.work.map(scaleWork)
    : scaleWork(interval.work);
  return {
    ...interval,
    work: work as WorkoutInterval['work'],
    rest: { ...interval.rest, duration: round1((interval.rest?.duration ?? 0) * ratio) },
  };
}

/**
 * Stretch or trim a structure to a planned length without changing what the
 * session IS.
 *
 * Longer: the delta goes into steady Z1/Z2 blocks in the main set, or else
 * the bookends grow (warmup to 20, cooldown to 15 minutes) and the rest is a
 * steady endurance block after the main set — how a coach lengthens a session
 * ("add endurance around the intervals").
 * Shorter: the easy riding is trimmed first, in proportion to its length.
 * Only when the target is shorter than those bookends can absorb (each keeps
 * at least 5 minutes) is everything, intervals included, scaled together.
 */
export function fitStructureToDuration(
  structure: WorkoutStructure,
  targetMin: number | null | undefined,
): WorkoutStructure {
  if (!targetMin || targetMin <= 0) return structure;
  const current = structureDurationMin(structure);
  if (current <= 0) return structure;
  const delta = targetMin - current;
  if (Math.abs(delta) < FIT_TOLERANCE_MIN) return structure;

  // Flexible minutes: bookends plus steady easy blocks in the main set.
  const flexMain = structure.main.map(
    (item) => !isInterval(item) && item.zone !== null && item.zone <= 2 ? item.duration : 0,
  );
  const flexWarm = structure.warmup?.duration ?? 0;
  const flexCool = structure.cooldown?.duration ?? 0;
  const flexTotal = flexWarm + flexCool + flexMain.reduce((a, b) => a + b, 0);

  // How much shortening the easy riding can absorb while keeping its floor.
  const floor = (min: number) => (min > 0 ? Math.min(min, MIN_BOOKEND_MIN) : 0);
  const shrinkable =
    flexWarm - floor(flexWarm) +
    flexCool - floor(flexCool) +
    flexMain.reduce((a, b) => a + (b - floor(b)), 0);

  // LONGER: the extra time is endurance riding, not a longer warmup. Easy
  // blocks already in the main set take it; otherwise the bookends grow to a
  // sensible length and the rest becomes a steady Z2 block after the main set
  // (a 60-minute sweet-spot workout on a 3-hour day used to draw a 70-minute
  // warmup).
  if (delta > 0) {
    const easyMain = flexMain.reduce((a, b) => a + b, 0);
    if (easyMain > 0) {
      const ratio = (easyMain + delta) / easyMain;
      return {
        ...structure,
        main: structure.main.map((item, i) =>
          flexMain[i] > 0 ? { ...(item as WorkoutSegment), duration: round1(flexMain[i] * ratio) } : item,
        ),
      };
    }
    let left = delta;
    const growTo = (current: number, cap: number) => {
      const add = Math.max(0, Math.min(left, cap - current));
      left -= add;
      return round1(current + add);
    };
    const warmup = structure.warmup ? { ...structure.warmup, duration: growTo(flexWarm, MAX_GROWN_WARMUP_MIN) } : null;
    const cooldown = structure.cooldown ? { ...structure.cooldown, duration: growTo(flexCool, MAX_GROWN_COOLDOWN_MIN) } : null;
    const main = [...structure.main];
    if (left > 0 && left < FIT_TOLERANCE_MIN) {
      // A sliver isn't worth its own block; the cooldown takes it.
      if (cooldown) cooldown.duration = round1(cooldown.duration + left);
      else if (warmup) warmup.duration = round1(warmup.duration + left);
      left = 0;
    }
    if (left >= FIT_TOLERANCE_MIN) {
      const steady: WorkoutSegment = {
        duration: round1(left),
        zone: 2,
        powerPctFTP: ZONE_POWER[2],
        description: 'Endurance',
      };
      main.push(steady);
    }
    return { warmup, main, cooldown };
  }

  if (flexTotal > 0 && -delta <= shrinkable) {
    const ratio = (flexTotal + delta) / flexTotal;
    const adjust = (min: number) => round1(Math.max(floor(min), min * ratio));
    return {
      warmup: structure.warmup ? { ...structure.warmup, duration: adjust(flexWarm) } : structure.warmup,
      main: structure.main.map((item, i) =>
        flexMain[i] > 0 ? { ...(item as WorkoutSegment), duration: adjust(flexMain[i]) } : item,
      ),
      cooldown: structure.cooldown
        ? { ...structure.cooldown, duration: adjust(flexCool) }
        : structure.cooldown,
    };
  }

  // Nothing easy to trim (or not enough): scale the whole session.
  const ratio = targetMin / current;
  return {
    warmup: structure.warmup
      ? { ...structure.warmup, duration: round1(structure.warmup.duration * ratio) }
      : structure.warmup,
    main: structure.main.map((item) =>
      isInterval(item) ? scaleInterval(item, ratio) : { ...item, duration: round1(item.duration * ratio) },
    ),
    cooldown: structure.cooldown
      ? { ...structure.cooldown, duration: round1(structure.cooldown.duration * ratio) }
      : structure.cooldown,
  };
}

// ============================================================
// BUILDERS
// ============================================================

function bookends(durationMin: number): { warmup: number; cooldown: number } {
  // Library convention: 10–15 min warmup, 5–10 min cooldown, shorter on short days.
  const warmup = durationMin >= 60 ? 15 : durationMin >= 40 ? 10 : 5;
  const cooldown = durationMin >= 60 ? 10 : 5;
  return { warmup, cooldown };
}

/**
 * A steady session: warmup, one block at the category's zone, cooldown.
 * The fallback shape when nothing names the intervals.
 */
export function buildSteadyStructure(zone: TrainingZone, durationMin: number): WorkoutStructure {
  const total = Math.max(15, durationMin);
  const { warmup, cooldown } = bookends(total);
  const mainMin = Math.max(5, total - warmup - cooldown);
  const warmZone: TrainingZone = zone >= 3 ? 2 : 1;
  return {
    warmup: { duration: warmup, zone: warmZone, powerPctFTP: ZONE_POWER[warmZone] },
    main: [
      {
        duration: mainMin,
        zone,
        powerPctFTP: ZONE_POWER[zone],
        description: `Steady ${ZONE_LABEL[zone] ?? `Zone ${zone}`}`,
      },
    ],
    cooldown: { duration: cooldown, zone: 1, powerPctFTP: ZONE_POWER[1] },
  };
}

/**
 * An interval session: warmup, N x work / rest at a zone, cooldown, with the
 * easy riding sized to land on the planned duration.
 */
export function buildIntervalStructure(params: {
  sets: number;
  workMin: number;
  restMin: number;
  zone: TrainingZone;
  durationMin: number;
}): WorkoutStructure {
  const { sets, workMin, restMin, zone, durationMin } = params;
  const workLabel = workMin < 1 ? `${Math.round(workMin * 60)}s` : `${round1(workMin)}min`;
  const structure: WorkoutStructure = {
    warmup: { duration: 15, zone: 2, powerPctFTP: ZONE_POWER[2] },
    main: [
      {
        type: 'repeat',
        sets,
        work: {
          duration: workMin,
          zone,
          powerPctFTP: ZONE_POWER[zone],
          description: `${workLabel} ${ZONE_LABEL[zone] ?? `Zone ${zone}`}`,
        },
        rest: { duration: restMin, zone: 1, powerPctFTP: ZONE_POWER[1], description: 'Recovery' },
      },
    ],
    cooldown: { duration: 10, zone: 1, powerPctFTP: ZONE_POWER[1] },
  };
  return fitStructureToDuration(structure, durationMin);
}

// ============================================================
// STORED PRESCRIPTION
// ============================================================

/** Zone a %FTP band's midpoint falls in, on the library's zone edges. */
export function zoneForPctFtp(pct: number): TrainingZone {
  return powerZoneFor(pct);
}

/** Whether a stored set is a run's (threshold-pace band) rather than a ride's (%FTP). */
function isPaceSet(set: IntervalPrescription): boolean {
  return !Number.isFinite(Number(set.target_pct_ftp_min)) &&
    Number.isFinite(Number(set.target_pct_threshold_pace_min));
}

/** The prescription on a row's details, or null. Tolerates any JSON shape. */
export function readStoredPrescription(details: unknown): StoredPrescription | null {
  if (!details || typeof details !== 'object') return null;
  const p = (details as { prescription?: unknown }).prescription;
  if (!p || typeof p !== 'object') return null;
  const intervals = (p as { intervals?: unknown }).intervals;
  if (!Array.isArray(intervals) || intervals.length === 0) return null;
  const clean = intervals.filter(
    (i): i is IntervalPrescription =>
      !!i && typeof i === 'object' &&
      Number((i as IntervalPrescription).repeats) >= 1 &&
      Number((i as IntervalPrescription).duration_min) > 0 &&
      // A ride's set carries a %FTP band, a run's a threshold-pace band. Runs
      // used to be filtered out here, so every coach-written run lost its
      // structure and was drawn as a cycling stand-in.
      (Number.isFinite(Number((i as IntervalPrescription).target_pct_ftp_min)) ||
        Number.isFinite(Number((i as IntervalPrescription).target_pct_threshold_pace_min))),
  );
  if (clean.length === 0) return null;
  return { ...(p as StoredPrescription), intervals: clean };
}

/**
 * Turn a stored prescription into the structure the modal draws and the
 * exporters encode. Each set becomes one repeat block at its band's midpoint;
 * warmup and cooldown come from the prescription when it names them, else from
 * the library convention, and the whole is fitted to the planned duration.
 */
export function prescriptionToStructure(
  prescription: StoredPrescription,
  durationMin: number | null | undefined,
): WorkoutStructure {
  const pace = prescription.basis === 'pace' || prescription.intervals.some(isPaceSet);
  const main: WorkoutInterval[] = prescription.intervals.map((set) => {
    const runSet = isPaceSet(set);
    const lo = Number(runSet ? set.target_pct_threshold_pace_min : set.target_pct_ftp_min);
    const hi = Number(
      runSet
        ? set.target_pct_threshold_pace_max ?? set.target_pct_threshold_pace_min
        : set.target_pct_ftp_max ?? set.target_pct_ftp_min,
    );
    const pct = Math.round((lo + hi) / 2);
    const zone = runSet ? paceZoneFor(pct) : zoneForPctFtp(pct);
    const workMin = Number(set.duration_min);
    const workLabel = workMin < 1 ? `${Math.round(workMin * 60)}s` : `${round1(workMin)}min`;
    const band = lo === hi ? `${lo}%` : `${lo}–${hi}%`;
    const bandText = runSet ? `${band} of threshold pace` : band;
    const inner: WorkoutInterval = {
      type: 'repeat',
      sets: Math.max(1, Math.round(Number(set.repeats))),
      work: {
        duration: workMin,
        zone,
        ...(runSet ? { pacePctThreshold: pct } : { powerPctFTP: pct }),
        targetRange: { min: Math.min(lo, hi), max: Math.max(lo, hi) },
        description: set.notes ? `${workLabel} at ${bandText} · ${set.notes}` : `${workLabel} at ${bandText}`,
      },
      rest: runSet
        ? {
          duration: Math.max(0, Number(set.recovery_min) || 0),
          zone: 1,
          pacePctThreshold: PACE_ZONE_PCT[1],
          description: 'Easy jog',
        }
        : {
          duration: Math.max(0, Number(set.recovery_min) || 0),
          zone: 1,
          powerPctFTP: ZONE_POWER[1],
          description: 'Recovery',
        },
    };
    const outerSets = Math.round(Number(set.sets) || 1);
    if (outerSets <= 1) return inner;
    // Sets of sets: the inner repeat nests inside an outer one whose rest is
    // the longer break between sets. The flattener and the exporters both
    // walk nested repeats.
    return {
      type: 'repeat',
      sets: outerSets,
      work: inner,
      rest: {
        duration: Math.max(0, Number(set.set_recovery_min) || 0),
        zone: 1,
        powerPctFTP: ZONE_POWER[1],
        description: 'Between sets',
      },
    };
  });

  const guess = bookends(durationMin ?? 60);
  const warmupMin = prescription.warmup_min ?? guess.warmup;
  const cooldownMin = prescription.cooldown_min ?? guess.cooldown;
  const structure: WorkoutStructure = {
    warmup: warmupMin > 0
      ? pace
        ? { duration: warmupMin, zone: 2, pacePctThreshold: PACE_ZONE_PCT[2] }
        : { duration: warmupMin, zone: 2, powerPctFTP: ZONE_POWER[2] }
      : null,
    main,
    cooldown: cooldownMin > 0
      ? pace
        ? { duration: cooldownMin, zone: 1, pacePctThreshold: PACE_ZONE_PCT[1] }
        : { duration: cooldownMin, zone: 1, powerPctFTP: ZONE_POWER[1] }
      : null,
  };
  // A prescription that names its own bookends is exact; only fit when it did
  // not, so the easy riding absorbs the difference the way the modal expects.
  if (prescription.warmup_min != null && prescription.cooldown_min != null) return structure;
  return fitStructureToDuration(structure, durationMin);
}

// ============================================================
// NOTES PARSER
// ============================================================

/** Intensity words a coach uses in notes → the zone they mean. */
const INTENSITY_WORDS: Array<[RegExp, TrainingZone]> = [
  [/\bsprint/i, 7],
  [/\banaerobic|\bneuromuscular/i, 6],
  [/\bvo2|\bv02|aerobic capacity/i, 5],
  [/\bthreshold|\bftp\b|\blactate/i, 4],
  [/sweet[\s-]?spot|\bsst\b/i, 3.5],
  [/\btempo/i, 3],
  [/\bendurance|\bz2\b|zone 2/i, 2],
  [/\brecovery|\bz1\b|zone 1|\beasy\b/i, 1],
];

const SET_PATTERN = /(\d{1,2})\s*[x×]\s*(\d{1,3}(?:\.\d+)?)\s*(min(?:ute)?s?|m\b|s\b|sec(?:ond)?s?)/i;
const REST_PATTERN =
  /(\d{1,3}(?:\.\d+)?)\s*(min(?:ute)?s?|m\b|s\b|sec(?:ond)?s?)\s*(?:easy\s+)?(?:rest|recovery|recover|off|between)/i;

function toMinutes(value: number, unit: string): number {
  return /^s/i.test(unit) ? value / 60 : value;
}

export interface ParsedIntervals {
  sets: number;
  workMin: number;
  restMin: number | null;
  zone: TrainingZone | null;
}

/**
 * Read a set prescription out of free text: "5x3min at VO2 effort with full
 * recovery", "4 x 8 min threshold, 4min rest", "3x10min SST".
 * Returns null unless the text names both a count and a duration.
 */
export function parseIntervalsFromNotes(notes: string | null | undefined): ParsedIntervals | null {
  if (!notes) return null;
  const set = SET_PATTERN.exec(notes);
  if (!set) return null;
  const sets = parseInt(set[1], 10);
  const workMin = toMinutes(parseFloat(set[2]), set[3]);
  if (!(sets >= 1 && sets <= 40) || !(workMin > 0 && workMin <= 120)) return null;

  const rest = REST_PATTERN.exec(notes.slice(set.index + set[0].length));
  const restMin = rest ? toMinutes(parseFloat(rest[1]), rest[2]) : null;

  // The intensity word NEAREST the set names its effort: "2x20min threshold,
  // finish with 4x30s sprints" is threshold work, not sprints. (Taking the
  // first word found anywhere in priority order drew every set containing
  // "sprint" anywhere as Z7.)
  let zone: TrainingZone | null = null;
  let bestDistance = Infinity;
  const setStart = set.index;
  const setEnd = set.index + set[0].length;
  for (const [pattern, z] of INTENSITY_WORDS) {
    const global = new RegExp(pattern.source, 'gi');
    for (let m = global.exec(notes); m; m = global.exec(notes)) {
      const at = m.index;
      const distance = at >= setEnd ? at - setEnd : at < setStart ? setStart - (at + m[0].length) : 0;
      if (distance < bestDistance) {
        bestDistance = distance;
        zone = z;
      }
    }
  }
  return { sets, workMin, restMin, zone };
}

/** Recovery a coach implies when the notes name none: roughly equal for hard work, half for sub-threshold. */
function defaultRestMin(workMin: number, zone: TrainingZone): number {
  if (zone >= 5) return round1(Math.max(workMin * 0.75, 0.25));
  if (zone >= 4) return round1(Math.max(workMin * 0.5, 1));
  return round1(Math.max(workMin * 0.33, 1));
}

// ============================================================
// RESOLUTION
// ============================================================

function entryDuration(row: PlannedEntryShape): number | null {
  const min = row.target_duration ?? row.target_duration_min ?? row.duration_minutes ?? null;
  return min && min > 0 ? min : null;
}

function entryLoad(row: PlannedEntryShape): number | null {
  const load = row.target_rss ?? row.target_tss ?? row.target_load ?? null;
  return load && load > 0 ? Number(load) : null;
}

function entryName(row: PlannedEntryShape, fallback: string): string {
  return row.name?.trim() || row.title?.trim() || fallback;
}

function entryType(row: PlannedEntryShape): string | null {
  return row.workout_type || row.session_type || null;
}

/** The row's sport: stored, else implied by a run_* library id, else the named workout's. */
export function entrySportOf(row: PlannedEntryShape): string | null {
  if (row.sport) return row.sport;
  if (typeof row.workout_id === 'string' && row.workout_id.startsWith('run_')) return 'running';
  return getAnyWorkoutById(row.workout_id)?.sportType ?? null;
}

/** Category implied by a prescription's hardest set, for rows whose type says nothing. */
function categoryForPrescription(p: StoredPrescription): WorkoutCategory {
  const zone = Math.max(
    ...p.intervals.map((i) =>
      isPaceSet(i)
        ? paceZoneFor(Math.min(Number(i.target_pct_threshold_pace_min), Number(i.target_pct_threshold_pace_max ?? i.target_pct_threshold_pace_min)))
        : zoneForPctFtp(Number(i.target_pct_ftp_max ?? i.target_pct_ftp_min) || 0),
    ),
  );
  if (zone >= 6) return 'anaerobic';
  if (zone >= 5) return 'vo2max';
  if (zone >= 4) return 'threshold';
  if (zone >= 3.5) return 'sweet_spot';
  if (zone >= 3) return 'tempo';
  return 'endurance';
}

/** Ride Intensity implied by a load over a duration (RSS = h × RI² × 100). */
function impliedIntensity(load: number | null, durationMin: number): number {
  if (!load || durationMin <= 0) return 0;
  return round1(Math.sqrt(load / ((durationMin / 60) * 100)) * 100) / 100;
}

function baseDefinition(
  row: PlannedEntryShape,
  category: WorkoutCategory,
  durationMin: number,
  fallbackName: string,
): WorkoutDefinition {
  const load = entryLoad(row);
  const sport = entrySportOf(row);
  return {
    ...(sport === 'running' ? { sportType: 'running' as WorkoutDefinition['sportType'] } : {}),
    id: row.workout_id || `planned:${row.id || category}`,
    name: entryName(row, fallbackName),
    category,
    difficulty: 'intermediate',
    duration: durationMin,
    targetTSS: load ?? WORKOUT_TYPES[category]?.defaultTSS ?? 0,
    intensityFactor: impliedIntensity(load, durationMin),
    description: '',
    focusArea: category,
    tags: [category],
    terrainType: 'flat',
    structure: EMPTY_STRUCTURE,
    coachNotes: '',
  };
}

/**
 * Resolve a calendar row to a workout the modal can draw and export.
 * Null only when the row is missing entirely.
 */
export function resolvePlannedWorkoutShape(
  row: PlannedEntryShape | null | undefined,
): PlannedWorkoutShape | null {
  if (!row) return null;

  const plannedMin = entryDuration(row);
  const load = entryLoad(row);

  // 0. The entry carries its own structure.
  const stored = readStoredPrescription(row.details);
  if (stored) {
    const type = entryType(row);
    const category = workoutCategoryForPlanType(type) ?? categoryForPrescription(stored);
    const durationMin = plannedMin ?? Math.round(structureDurationMin(prescriptionToStructure(stored, null)));
    // The prescription IS the session. A library workout_id on the same row is
    // provenance only: its description, coach notes and run structure describe
    // a different set, so they are carried over only when the prescription
    // came from that library workout.
    const named = getAnyWorkoutById(row.workout_id);
    const fromLibrary = stored.source === 'library' && !!named;
    const base = fromLibrary && named
      ? named
      : baseDefinition(row, category, durationMin, named?.name ?? WORKOUT_TYPES[type?.toLowerCase() ?? '']?.name ?? 'Workout');
    const runPrescription = stored.basis === 'pace' || stored.intervals.some(isPaceSet);
    const sportType = runPrescription ? 'running' : (entrySportOf(row) === 'running' ? 'running' : base.sportType);
    const workout: WorkoutDefinition = {
      ...base,
      ...(sportType ? { sportType: sportType as WorkoutDefinition['sportType'] } : {}),
      name: entryName(row, base.name),
      category,
      duration: durationMin,
      targetTSS: load ?? base.targetTSS,
      intensityFactor: load ? impliedIntensity(load, durationMin) : base.intensityFactor,
      structure: prescriptionToStructure(stored, durationMin),
      runningStructure: undefined,
      cyclingStructure: undefined,
    };
    return { workout, source: 'prescribed', note: null };
  }

  // 1. The entry names a library workout.
  const named = getAnyWorkoutById(row.workout_id);
  if (named) {
    const durationMin = plannedMin ?? named.duration;
    const workout: WorkoutDefinition = {
      ...named,
      name: entryName(row, named.name),
      duration: durationMin,
      targetTSS: load ?? named.targetTSS,
      structure: named.structure ? fitStructureToDuration(named.structure, durationMin) : named.structure,
    };
    return { workout, source: 'library', note: null };
  }

  const type = entryType(row);
  const typeDef = type ? WORKOUT_TYPES[type.toLowerCase()] : undefined;
  const category = workoutCategoryForPlanType(type);
  const fallbackName = typeDef?.name ?? 'Workout';

  const sport = entrySportOf(row);

  // Rest days and off-bike sessions have no ride shape to paint.
  if (!category || OFF_BIKE.has(category) || sport === 'other') {
    const offCategory = ((type && OFF_BIKE.has(type) ? type : null) ?? 'rest') as WorkoutCategory;
    const workout = baseDefinition(row, offCategory, plannedMin ?? 0, fallbackName);
    return { workout, source: null, note: null };
  }

  const durationMin = plannedMin ?? typeDef?.defaultDuration ?? FALLBACK_DURATION_MIN;
  const categoryZone = CATEGORY_ZONE[category] ?? 2;

  // 2. The notes spell the set out.
  const parsed = parseIntervalsFromNotes(row.notes);
  if (parsed && (INTERVAL_CATEGORIES.has(category) || parsed.zone !== null)) {
    const zone = parsed.zone ?? categoryZone;
    const restMin = parsed.restMin ?? defaultRestMin(parsed.workMin, zone);
    const workout = baseDefinition(row, category, durationMin, fallbackName);
    workout.structure = buildIntervalStructure({
      sets: parsed.sets,
      workMin: parsed.workMin,
      restMin,
      zone,
      durationMin,
    });
    workout.description = `${parsed.sets}x${parsed.workMin < 1 ? `${Math.round(parsed.workMin * 60)}s` : `${round1(parsed.workMin)}min`} at ${ZONE_LABEL[zone]}, from your coach's notes.`;
    return {
      workout,
      source: 'notes',
      note: 'Intervals drawn from the session notes. Recovery lengths are typical for the effort unless the notes give them.',
    };
  }

  // 3. The closest library session of this type and length.
  const stand = inferWorkoutForType(type, durationMin, sport);
  if (stand?.structure) {
    const workout: WorkoutDefinition = {
      ...stand,
      id: `planned:${row.id || category}`,
      name: entryName(row, stand.name),
      duration: durationMin,
      targetTSS: load ?? stand.targetTSS,
      intensityFactor: load ? impliedIntensity(load, durationMin) : stand.intensityFactor,
      structure: fitStructureToDuration(stand.structure, durationMin),
    };
    return {
      workout,
      source: 'inferred',
      note: `Stand-in shape from the library's ${stand.name}. The coach prescribed a ${typeDef?.name?.toLowerCase() ?? category.replace('_', ' ')} session by type and length, not by interval.`,
    };
  }

  // 4. A steady block at the type's zone.
  const workout = baseDefinition(row, category, durationMin, fallbackName);
  workout.structure = buildSteadyStructure((typeDef?.primaryZone ?? categoryZone) as TrainingZone, durationMin);
  return {
    workout,
    source: 'synthesized',
    note: 'Drawn as a steady effort at this session type’s zone; no intervals were prescribed.',
  };
}
