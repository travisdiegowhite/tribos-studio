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

import { formBandForScore } from './formBands';

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
// Bands are the spec §5 zones — single authority in src/utils/formBands.js
// (transition >+20 / fresh +10..+20 / grey −5..+10 / optimal −30..−5 /
// overreached <−30). Zones (left to right) mirror what the bar renders; the
// verdict itself comes from formBandForScore so boundary handling is
// identical on every surface.
// ────────────────────────────────────────────────────────────────────────────

const formBandColors: Record<string, ZoneColor> = {
  transition: todayColors.orange,
  fresh: todayColors.gold,
  grey: todayColors.gray,
  optimal: todayColors.teal,
  overreached: todayColors.coral,
};

export const formZones: ZoneStop[] = [
  { min: -Infinity, max: -30, word: 'Overloaded',   color: todayColors.coral },
  { min: -30,       max: -5,  word: 'Optimal load', color: todayColors.teal },
  { min: -5,        max: 10,  word: 'Coasting',     color: todayColors.gray },
  { min: 10,        max: 21,  word: 'Fresh',        color: todayColors.gold },
  { min: 21,        max: Infinity, word: 'Too fresh', color: todayColors.orange },
];

export interface FormVerdict {
  word: string;
  color: ZoneColor;
}

export function freshnessFromFormScore(score: number | null): FormVerdict {
  const band = formBandForScore(score);
  if (!band) return { word: 'Building baseline', color: todayColors.gray };
  return { word: band.word, color: formBandColors[band.key] ?? todayColors.gray };
}

// ────────────────────────────────────────────────────────────────────────────
// FORM STATE COPY — the single authority for turning a Form Score band into
// user-facing words. Three registers, all derived from formBandForScore so the
// cuts can never drift between surfaces:
//
//   formStateText     — standing state line on the Spine node ("Carrying
//                       productive load"). Descriptive, never prescriptive:
//                       a persistent surface describes; prescriptions
//                       ("recover", "add load") belong to the gated coach
//                       layer, which can weigh evidence before speaking.
//   formPhrase        — lowercase composable phrase for sentences like
//                       "You're carrying productive load."
//   formVerdictSentence — the glance FORM band's one-line verdict.
// ────────────────────────────────────────────────────────────────────────────

const formStateTexts: Record<string, string> = {
  transition: 'Too fresh — fitness fading',
  fresh: 'Fresh',
  grey: 'Coasting — load and recovery canceling out',
  optimal: 'Carrying productive load',
  overreached: 'Deep in a heavy block',
};

const formPhrases: Record<string, string> = {
  transition: 'too fresh — losing fitness',
  fresh: 'fresh',
  grey: 'coasting — load and recovery canceling out',
  optimal: 'carrying productive load',
  overreached: 'deep in a heavy block',
};

const formVerdictSentences: Record<string, string> = {
  transition: 'too fresh — add load',
  fresh: 'fresh — cleared for hard work',
  grey: 'coasting — cleared for hard work',
  optimal: 'productive load — steady endurance riding',
  overreached: 'deep in a heavy block — absorbing a lot of load',
};

/**
 * Context for the form-state copy. On a *planned* rest/recovery week the
 * neutral band is the plan working, not drift — the copy says so instead of
 * "coasting". Applies to the grey band only: a deeply negative FS during a
 * recovery week keeps its load words, which are still true and more useful.
 */
export interface FormCopyContext {
  recoveryWeek?: boolean;
}

/** Standing state line for the selected day ("Carrying productive load"). */
export function formStateText(fs: number | null | undefined, ctx?: FormCopyContext): string {
  const band = formBandForScore(fs);
  if (!band) return 'Building baseline';
  if (band.key === 'grey' && ctx?.recoveryWeek) return 'Recovery week — freshness coming back on schedule';
  return formStateTexts[band.key];
}

/** Lowercase phrase for composing sentences ("You're carrying productive load."). */
export function formPhrase(fs: number | null | undefined, ctx?: FormCopyContext): string {
  const band = formBandForScore(fs);
  if (!band) return 'building a baseline';
  if (band.key === 'grey' && ctx?.recoveryWeek) return 'on a recovery week — freshness coming back on schedule';
  return formPhrases[band.key];
}

/** One-line FORM verdict for the glance band. */
export function formVerdictSentence(fs: number | null | undefined, ctx?: FormCopyContext): string {
  const band = formBandForScore(fs);
  if (!band) return 'building baseline';
  if (band.key === 'grey' && ctx?.recoveryWeek) return 'recovery week — this is the plan working';
  return formVerdictSentences[band.key];
}

/** Band color for a Form Score, in the locked Today palette. */
export function formStateColor(fs: number | null | undefined): ZoneColor {
  const band = formBandForScore(fs);
  return band ? (formBandColors[band.key] ?? todayColors.gray) : todayColors.gray;
}

// ────────────────────────────────────────────────────────────────────────────
// WORKOUT TYPES — names stay product vocabulary; SENTENCES never lean on them.
// `phrase` composes into prose ("1h30 of hard, steady effort (threshold)"),
// `chip` is the tiny effort tag on the Spine node (replaces the old Z1–Z4),
// `label` is the prettified display name.
// Server-side twin: workoutTypePhrase() in api/utils/pushNotification.js —
// keep the phrases in sync (notifications can never carry a gloss).
// ────────────────────────────────────────────────────────────────────────────

export interface WorkoutTypeCopy {
  label: string;
  phrase: string;
  chip: string;
}

const WORKOUT_TYPE_COPY: Record<string, WorkoutTypeCopy> = {
  rest:        { label: 'Rest',        phrase: 'a day off the bike',            chip: 'REST' },
  recovery:    { label: 'Recovery',    phrase: 'easy spinning',                 chip: 'EASY' },
  endurance:   { label: 'Endurance',   phrase: 'steady riding',                 chip: 'STEADY' },
  tempo:       { label: 'Tempo',       phrase: 'brisk, controlled effort',      chip: 'BRISK' },
  sweet_spot:  { label: 'Sweet Spot',  phrase: 'hard-but-sustainable effort',   chip: 'HARD' },
  threshold:   { label: 'Threshold',   phrase: 'hard, steady effort',           chip: 'HARD' },
  vo2max:      { label: 'VO2 Max',     phrase: 'very hard, punchy efforts',     chip: 'V.HARD' },
  anaerobic:   { label: 'Anaerobic',   phrase: 'all-out short efforts',         chip: 'MAX' },
  race:        { label: 'Race',        phrase: 'race effort',                   chip: 'RACE' },
};

function prettifyType(type: string): string {
  return type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function workoutTypeCopy(type: string | null | undefined): WorkoutTypeCopy {
  const key = (type ?? '').toLowerCase().trim();
  const hit = WORKOUT_TYPE_COPY[key];
  if (hit) return hit;
  const label = key ? prettifyType(key) : 'Workout';
  return { label, phrase: `a ${label.toLowerCase()} session`, chip: 'RIDE' };
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
