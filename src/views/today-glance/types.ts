/**
 * Today — Routing-First Glance: the single data contract.
 *
 * Every element of the new Today glance binds to one `Today` object produced
 * by `getToday()` (see getToday.ts). No glance component fetches its own
 * truth — this is the source-of-truth fix that the redesign spec calls for.
 *
 * Terminology is canonical Tribos only: RSS / TFI / AFI / Form Score (FS).
 * Never TSS / CTL / ATL / TSB in any user-facing field. Numeric athlete-state
 * inputs are read canonical-first with legacy fallback per CLAUDE.md.
 */

import type { Coordinate } from '../../types/geo';
import type { SparklinePoint } from '../today/athleteMetrics';

export type { SparklinePoint };

// ── Hero state machine ──────────────────────────────────────────────────────
// The hero map is one component that renders a state based on what's known —
// never a blank map. See HeroMap.tsx for the per-state rendering.
export type HeroState =
  | 'matched' // plan + workout + a saved route hits a good match
  | 'generated' // plan + workout, no good saved match → training-aware route
  | 'suggested' // history, no plan → spin on familiar roads
  | 'first-run' // no plan, no history → starter loop + generate prompt
  | 'generating' // transient: a solve is in flight
  | 'rest'; // plan + rest day → no map

// Archetype-only persona tokens (lowercase). `pending` collapses to
// `pragmatist` for display, matching the rest of the app.
export type PersonaId =
  | 'hammer'
  | 'scientist'
  | 'encourager'
  | 'pragmatist'
  | 'competitor'
  | 'pending';

// ── Prescription ────────────────────────────────────────────────────────────
export interface TodayPrescription {
  /** Workout category, e.g. 'tempo', 'threshold', 'endurance', 'rest'. */
  type: string;
  /** Human title, e.g. 'Tempo Intervals'. */
  title: string;
  durationMin: number;
  /** Canonical Ride Stress Score target. Null when not prescribed. */
  targetRSS: number | null;
  /** Free-text/structured interval description, when present. */
  structure?: string | null;
  /** planned_workouts.id — used by `Ride today` / route match. */
  workoutId: string | null;
}

// ── Route + interval-on-terrain segments ────────────────────────────────────
/**
 * A stretch of the route geometry that carries the prescription's effort
 * structure. `kind: 'work'` renders in effort-orange over the teal route line;
 * `recovery` stays on the base line. Fractions are 0..1 positions along the
 * decoded geometry. Empty until the segment schema is confirmed ready (the
 * interval-coloring gating dependency) — see deriveIntervalSegments.ts.
 */
export interface IntervalSegment {
  startFraction: number;
  endFraction: number;
  kind: 'work' | 'recovery';
  /** Power/effort zone label for the legend, e.g. 'threshold'. */
  zone: string;
}

export interface TodayRoute {
  id: string;
  name: string;
  /** GeoJSON LineString built from the matched route's geometry/polyline. */
  geojson: GeoJSON.Geometry | null;
  /** Google-encoded polyline (for Send-to-Garmin reuse). */
  polyline: string | null;
  distanceKm: number;
  elevationGainM: number;
  /** 0–100 route↔workout match. Reuses the existing match concept. */
  matchPct: number;
  intervalSegments: IntervalSegment[];
  /** Start point for the map marker, when geometry is available. */
  start: Coordinate | null;
}

// ── Coach take (one line, not a thread) ─────────────────────────────────────
export interface TodayCoach {
  personaId: PersonaId;
  /** Display name, e.g. 'The Pragmatist'. */
  personaName: string;
  oneLineTake: string | null;
}

// ── Athlete state / FORM + fitness story ────────────────────────────────────
export interface TodayAthleteState {
  fs: number | null; // Form Score
  tfi: number | null; // Training Fitness Index
  afi: number | null; // Acute Fatigue Index
  /** §5 display band, e.g. 'optimal training load'. */
  formBand: string | null;
  /** One-word state for the FORM line (from todayVocabulary). */
  formWord: string;
  formColor: string;
  /** Plain-language verdict, e.g. 'cleared for quality'. */
  formVerdict: string;
  /** Position of the marker on the heat ramp, 0..1. */
  formRampPos: number;
  confidenceTier: 'high' | 'moderate' | 'low' | null;

  // FITNESS (where you've been / heading) — 28-pt TFI sparkline + trend.
  fitnessHistory: SparklinePoint[];
  fitnessWord: string;
  fitnessColor: string;
  fitnessSlope14d: number; // TFI/day
  fitnessDelta28d: number; // signed TFI points
  fitnessEmpty: boolean;

  // FATIGUE — relative position in the rider's own 28-day AFI range.
  fatigueRelative: number; // 0..1
  fatigueWord: string;
  fatigueColor: string;

  /** 28-day TFI %-change, for the persona fitness summary. */
  ctlDeltaPct: number;
}

// ── Plan context (the single chip) ──────────────────────────────────────────
export interface TodayPlanContext {
  blockName: string | null;
  dayIndex: number | null;
  dayTotal: number | null;
  /** Pre-formatted chip, e.g. 'Tempo block · Day 2 of 5'. Null when no plan. */
  chipLabel: string | null;
}

// ── Forward outlook ("where you're going") ──────────────────────────────────
export interface TodayOutlook {
  /** Block intent verb, e.g. 'Sharpening', 'Building aerobic base'. */
  blockGoal: string | null;
  raceName: string | null;
  daysToRace: number | null;
  /** Pre-composed line, e.g. 'Sharpening for Gravel Worlds · 9 days out'. */
  line: string | null;
}

// ── Consistency ribbon (optional, bounded) ──────────────────────────────────
export type RibbonKind = 'ride' | 'run' | 'rest' | 'today';
export interface ConsistencyDay {
  date: string; // YYYY-MM-DD
  kind: RibbonKind;
}

// ── The object ──────────────────────────────────────────────────────────────
export interface Today {
  date: string; // YYYY-MM-DD (local)
  heroState: HeroState;
  prescription: TodayPrescription | null;
  /** Resolved lazily — see useToday() routePromise. Null on the shell. */
  route: TodayRoute | null;
  coach: TodayCoach;
  athleteState: TodayAthleteState;
  planContext: TodayPlanContext;
  /** Forward-looking "where you're going" readout. */
  outlook: TodayOutlook;
  ribbon: ConsistencyDay[];
}
