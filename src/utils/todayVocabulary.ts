/**
 * Today View Vocabulary
 *
 * Pure deterministic mappings from numeric metric values to the words and
 * colors rendered in the Today view's metric cells. Centralized here so the
 * cell components can stay presentational and so the same mapping can be
 * referenced by tests or by the orchestrator hook when computing colors.
 *
 * Tribos terminology only — never TSS, CTL, ATL, TSB, NP, IF in user-facing
 * strings. Numeric inputs use the canonical names: Form Score (FS),
 * Training Fitness Index (TFI), Acute Fatigue Index (AFI), EFI, TCAS.
 *
 * Color palette (locked — see docs/today-view + CLAUDE.md):
 *   teal     #2A8C82  positive / on-track / sweet spot / building
 *   gold     #C49A0A  achievement / sharp / strong
 *   orange   #D4600A  effort / loaded / drifting / building (TCAS)
 *   coral    #C43C2A  warning / drained / overload / off-plan
 *   gray     #B4B2A9  neutral / stale / low / inactive
 */

export const todayColors = {
  teal: '#2A8C82',
  gold: '#C49A0A',
  orange: '#D4600A',
  coral: '#C43C2A',
  gray: '#B4B2A9',
  black: '#141410',
} as const;

export type ZoneColor = (typeof todayColors)[keyof typeof todayColors];

export interface ZoneStop {
  /** Inclusive lower bound. -Infinity means "open below". */
  min: number;
  /** Exclusive upper bound. Infinity means "open above". */
  max: number;
  /** Word shown under the bar. */
  word: string;
  /** Hex color used for the bar segment and word. */
  color: ZoneColor;
}

/** Pick the matching zone for `value`, or null if value is null/NaN. */
function pickZone(value: number | null | undefined, zones: ZoneStop[]): ZoneStop | null {
  if (value == null || !Number.isFinite(value)) return null;
  for (const z of zones) {
    if (value >= z.min && value < z.max) return z;
  }
  return zones[zones.length - 1] ?? null;
}

// ────────────────────────────────────────────────────────────────────────────
// FORM SCORE (legacy: TSB)
// Zones (left to right) mirror what the bar renders.
// ────────────────────────────────────────────────────────────────────────────

export const formZones: ZoneStop[] = [
  { min: -Infinity, max: -20, word: 'Drained',    color: todayColors.coral },
  { min: -20,       max: -10, word: 'Loaded',     color: todayColors.orange },
  { min: -10,       max: 5,   word: 'Sweet spot', color: todayColors.teal },
  { min: 5,         max: 15,  word: 'Sharp',      color: todayColors.gold },
  { min: 15,        max: Infinity, word: 'Stale', color: todayColors.gray },
];

export interface FormVerdict {
  word: string;
  color: ZoneColor;
}

export function freshnessFromFormScore(score: number | null): FormVerdict {
  const zone = pickZone(score, formZones);
  if (!zone) return { word: 'Building baseline', color: todayColors.gray };
  return { word: zone.word, color: zone.color };
}

// ────────────────────────────────────────────────────────────────────────────
// FITNESS — slope of the last 14 days of TFI drives the word.
// ────────────────────────────────────────────────────────────────────────────

export type FitnessTrend = 'up' | 'flat' | 'down';

export interface FitnessVerdict {
  word: string;
  color: ZoneColor;
}

export function fitnessWordFromSlope(slope14d: number | null): FitnessVerdict {
  if (slope14d == null || !Number.isFinite(slope14d)) {
    return { word: 'Holding', color: todayColors.teal };
  }
  if (slope14d > 0.3) return { word: 'Building', color: todayColors.teal };
  if (slope14d < -0.2) return { word: 'Detraining', color: todayColors.orange };
  return { word: 'Holding', color: todayColors.teal };
}

// ────────────────────────────────────────────────────────────────────────────
// FATIGUE — % of 28d AFI max.
// ────────────────────────────────────────────────────────────────────────────

export const fatigueZones: ZoneStop[] = [
  { min: 0,    max: 0.25, word: 'Low',        color: todayColors.gray },
  { min: 0.25, max: 0.70, word: 'Productive', color: todayColors.teal },
  { min: 0.70, max: 0.88, word: 'High',       color: todayColors.orange },
  { min: 0.88, max: Infinity, word: 'Overload', color: todayColors.coral },
];

export function fatigueWordFromAFI(relative: number | null): FormVerdict {
  const zone = pickZone(relative, fatigueZones);
  if (!zone) return { word: 'Building baseline', color: todayColors.gray };
  return { word: zone.word, color: zone.color };
}

// ────────────────────────────────────────────────────────────────────────────
// EFI · 28D
// ────────────────────────────────────────────────────────────────────────────

export const efiZones: ZoneStop[] = [
  { min: -Infinity, max: 35, word: 'Off plan',   color: todayColors.coral },
  { min: 35,        max: 60, word: 'Drifting',   color: todayColors.orange },
  { min: 60,        max: 85, word: 'On track',   color: todayColors.gold },
  { min: 85,        max: Infinity, word: 'Locked in', color: todayColors.teal },
];

export function efiWord(value: number | null): FormVerdict {
  const zone = pickZone(value, efiZones);
  if (!zone) return { word: 'Building baseline', color: todayColors.gray };
  return { word: zone.word, color: zone.color };
}

// ────────────────────────────────────────────────────────────────────────────
// TCAS · 6W
// ────────────────────────────────────────────────────────────────────────────

export const tcasZones: ZoneStop[] = [
  { min: -Infinity, max: 30, word: 'Review',   color: todayColors.coral },
  { min: 30,        max: 60, word: 'Building', color: todayColors.orange },
  { min: 60,        max: 85, word: 'Strong',   color: todayColors.gold },
  { min: 85,        max: Infinity, word: 'Peak', color: todayColors.teal },
];

export function tcasWord(value: number | null): FormVerdict {
  const zone = pickZone(value, tcasZones);
  if (!zone) return { word: 'Building baseline', color: todayColors.gray };
  return { word: zone.word, color: zone.color };
}

// ────────────────────────────────────────────────────────────────────────────
// PLAN PHASE — color per phase for the strip.
// ────────────────────────────────────────────────────────────────────────────

export const phaseColors: Record<string, ZoneColor> = {
  base:     todayColors.teal,
  build:    todayColors.gold,
  peak:     todayColors.orange,
  taper:    todayColors.coral,
  recovery: todayColors.gray,
};

export function phaseColor(phase: string | null | undefined): ZoneColor {
  if (!phase) return todayColors.gray;
  return phaseColors[phase.toLowerCase()] ?? todayColors.gray;
}
