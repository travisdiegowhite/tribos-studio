/**
 * comfortLevels — the rider's Comfort 1–5 setting: the rules the router and
 * validator apply, and every word the landing card says about them.
 *
 * docs/COMFORT-ROUTING-SPEC.md §2–§3. The card copy is DERIVED from the same
 * rule numbers the validator uses (`COMFORT_RULES`, `CLASS_DESCRIPTIONS`),
 * so changing what a level allows changes what the card says. Keep it that
 * way: never hand-write a level's "Roads like" / "Kept off" lists.
 *
 * Copy rule: no absolutes ("never", "always", "guaranteed") in anything a
 * rider reads. `comfortLevels.test.ts` greps every exported string.
 *
 * Pure: no I/O, no React. Runs in the browser and in Node (the harness).
 */

import type { TrafficTolerance } from './trafficStress';

export type ComfortLevel = 1 | 2 | 3 | 4 | 5;
/** Road comfort class: 1 (paths, quiet streets) … 5 (fast, no space), X (closed to bikes). */
export type ComfortClass = 1 | 2 | 3 | 4 | 5 | 'X';

export const COMFORT_LEVELS: readonly ComfortLevel[] = [1, 2, 3, 4, 5];
export const DEFAULT_COMFORT_LEVEL: ComfortLevel = 2;

const MI_M = 1609.344;

/**
 * The §3 rules. Starting values; the harness tunes them.
 *
 * - Free: class ≤ L.
 * - Flagged: L < class ≤ L + flaggedLevelsAbove, within both limits.
 * - Blocked: class > L + flaggedLevelsAbove, or X — and class 5 (fast roads
 *   with no space) below `fastNoSpaceMinLevel` (decision 2026-11-03: at
 *   Comfort 1–3 those roads aren't an option at all, so Comfort 3 doesn't
 *   flag them either).
 */
export const COMFORT_RULES = {
  /** How many classes above the rider's level may appear as short flagged stretches. */
  flaggedLevelsAbove: 2,
  /** Lowest level at which a class-5 road may appear, even as a flagged stretch. */
  fastNoSpaceMinLevel: 4,
  /** Longest single flagged stretch (0.5 mi). */
  maxStretchM: 0.5 * MI_M,
  /**
   * Longest single stretch two levels above. Same as `maxStretchM` for now
   * (spec §3 "assumption to confirm"); one value to tighten.
   */
  maxStretchTwoAboveM: 0.5 * MI_M,
  /** Most of the route, summed over flagged stretches. */
  maxFlaggedShare: 0.1,
  /**
   * A within-comfort gap shorter than this doesn't end a flagged stretch, so
   * a driveway or crossing can't split one stretch into two.
   */
  mergeGapM: 50,
} as const;

/** Plain description of each road class, as a rider sees it. */
export const CLASS_DESCRIPTIONS: Record<ComfortClass, string> = {
  1: 'Paths and quiet streets',
  2: 'Quiet connectors and bike lanes',
  3: 'Busier roads with room for you',
  4: 'Fast roads with a shoulder',
  5: 'Fast roads with no space',
  X: 'Roads closed to bikes',
};

const NUMERIC_CLASSES: readonly (1 | 2 | 3 | 4 | 5)[] = [1, 2, 3, 4, 5];

export interface ComfortLevelCopy {
  level: ComfortLevel;
  label: string;
  headline: string;
  tradeoff: string;
}

const LEVEL_COPY: Record<ComfortLevel, ComfortLevelCopy> = {
  1: {
    level: 1,
    label: 'Calm',
    headline: 'Paths and the quietest streets.',
    tradeoff: 'Routes can wander to stay calm, and some starts have no loop this quiet.',
  },
  2: {
    level: 2,
    label: 'Easy',
    headline: 'Quiet roads and bike lanes.',
    tradeoff: 'Usually a little longer than the direct way.',
  },
  3: {
    level: 3,
    label: 'Steady',
    headline: 'Busier roads are fine when there’s room for you.',
    tradeoff: 'More route options, with some traffic alongside.',
  },
  4: {
    level: 4,
    label: 'Confident',
    headline: 'Fast roads are fine with a shoulder.',
    tradeoff: 'Most direct of the cautious options. Expect fast traffic.',
  },
  5: {
    level: 5,
    label: 'Direct',
    headline: 'The most direct way on roads open to bikes.',
    tradeoff: 'Fast roads with no shoulder are allowed.',
  },
};

export function isComfortLevel(value: unknown): value is ComfortLevel {
  return value === 1 || value === 2 || value === 3 || value === 4 || value === 5;
}

/** Coerce anything (number, numeric string, legacy tolerance) to a level. */
export function toComfortLevel(value: unknown, fallback: ComfortLevel = DEFAULT_COMFORT_LEVEL): ComfortLevel {
  if (isComfortLevel(value)) return value;
  if (typeof value === 'string') {
    const n = Number.parseInt(value, 10);
    if (isComfortLevel(n)) return n;
    if (value === 'low' || value === 'medium' || value === 'high') return comfortLevelFromTolerance(value);
  }
  return fallback;
}

/** Legacy `traffic_tolerance` → level (spec §5.4: low→2, medium→3, high→4). */
export function comfortLevelFromTolerance(tolerance: TrafficTolerance | null | undefined): ComfortLevel {
  if (tolerance === 'low') return 2;
  if (tolerance === 'high') return 4;
  if (tolerance === 'medium') return 3;
  return DEFAULT_COMFORT_LEVEL;
}

/**
 * Level → legacy `traffic_tolerance`, for routers that only understand three
 * settings (landing spec §6.1: 1–2→low, 3→medium, 4–5→high).
 */
export function toleranceForComfortLevel(level: ComfortLevel): TrafficTolerance {
  if (level <= 2) return 'low';
  if (level === 3) return 'medium';
  return 'high';
}

export type ClassStatus = 'free' | 'flagged' | 'blocked';

/** What a road class means for a rider at `level`. */
export function classStatus(cls: ComfortClass, level: ComfortLevel): ClassStatus {
  if (cls === 'X') return 'blocked';
  if (cls <= level) return 'free';
  if (cls === 5 && level < COMFORT_RULES.fastNoSpaceMinLevel) return 'blocked';
  if (cls <= level + COMFORT_RULES.flaggedLevelsAbove) return 'flagged';
  return 'blocked';
}

/** Classes ridden freely, flagged and kept off at `level` — the card's lists. */
export function classesForLevel(level: ComfortLevel): {
  free: ComfortClass[];
  flagged: ComfortClass[];
  keptOff: ComfortClass[];
} {
  const free: ComfortClass[] = [];
  const flagged: ComfortClass[] = [];
  const keptOff: ComfortClass[] = [];
  for (const cls of NUMERIC_CLASSES) {
    const s = classStatus(cls, level);
    if (s === 'free') free.push(cls);
    else if (s === 'flagged') flagged.push(cls);
    else keptOff.push(cls);
  }
  keptOff.push('X');
  return { free, flagged, keptOff };
}

export interface ComfortCard {
  level: ComfortLevel;
  label: string;
  headline: string;
  roadsLike: string[];
  shortFlaggedStretchesOnly: string[];
  keptOff: string[];
  tradeoff: string;
}

/** Everything the landing page's comfort card shows for a level. */
export function comfortCard(level: ComfortLevel): ComfortCard {
  const copy = LEVEL_COPY[level];
  const { free, flagged, keptOff } = classesForLevel(level);
  return {
    level,
    label: copy.label,
    headline: copy.headline,
    roadsLike: free.map((c) => CLASS_DESCRIPTIONS[c]),
    shortFlaggedStretchesOnly: flagged.length
      ? flagged.map((c) => CLASS_DESCRIPTIONS[c])
      : ['Nothing is flagged at this level'],
    keptOff: keptOff.map((c) => CLASS_DESCRIPTIONS[c]),
    tradeoff: copy.tradeoff,
  };
}

export function comfortLabel(level: ComfortLevel): string {
  return LEVEL_COPY[level].label;
}

/** "Comfort 2 · Easy" — the result-view chip. */
export function comfortChip(level: ComfortLevel): string {
  return `Comfort ${level} · ${LEVEL_COPY[level].label}`;
}

/** "One level above your comfort" — heads-up subtitle. */
export function levelsAboveText(levelsAbove: number): string {
  if (levelsAbove <= 0) return 'Within your comfort';
  if (levelsAbove === 1) return 'One level above your comfort';
  if (levelsAbove === 2) return 'Two levels above your comfort';
  return `${levelsAbove} levels above your comfort`;
}

/** Every user-facing string this module can produce (for the copy test). */
export function allComfortCopy(): string[] {
  const out: string[] = [...Object.values(CLASS_DESCRIPTIONS)];
  for (const level of COMFORT_LEVELS) {
    const card = comfortCard(level);
    out.push(
      card.label,
      card.headline,
      card.tradeoff,
      comfortChip(level),
      ...card.roadsLike,
      ...card.shortFlaggedStretchesOnly,
      ...card.keptOff,
    );
  }
  for (let n = 0; n <= 3; n++) out.push(levelsAboveText(n));
  return out;
}
