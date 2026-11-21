/**
 * steps — a session's structure as one flat, sport-native list of steps.
 *
 * Every training graphic (the session detail profile, the calendar glyph, the
 * Today card) draws from this list, so they cannot disagree. A step carries
 * its zone (on the sport's own zone table), its intensity as a fraction of
 * threshold (bar height and load maths), and the target the athlete is given:
 * %FTP for a ride, % of threshold pace for a run.
 */

import type {
  RunningWorkoutInterval,
  RunningWorkoutSegment,
  RunningWorkoutStructure,
  TrainingZone,
  WorkoutInterval,
  WorkoutSegment,
  WorkoutStructure,
  WorkoutWarmupCooldown,
} from '../../../types/training';
import {
  POWER_ZONE_PCT,
  PACE_ZONE_PCT,
  powerZoneFor,
  paceZoneFor,
  intensityFromPowerPct,
  intensityFromPacePct,
  type ZoneKey,
} from './zones';

export type StepPhase = 'warmup' | 'work' | 'rest' | 'steady' | 'cooldown';

export interface StepTarget {
  kind: 'power' | 'pace';
  /** %FTP, or % of threshold pace (100 = threshold, higher = slower). */
  value: number;
  min?: number;
  max?: number;
}

export interface SessionStep {
  phase: StepPhase;
  durationMin: number;
  zone: ZoneKey | null;
  /** Fraction of threshold (1.0 = FTP / threshold speed). */
  intensity: number;
  target: StepTarget | null;
  label: string;
  cadence?: string;
  /** For repeats: which rep this is, of how many. */
  rep?: { index: number; count: number };
}

/** Default threshold pace (sec/km) used only to turn a distance rep into minutes. */
const DEFAULT_THRESHOLD_PACE_SEC = 300;

function isRepeat(item: unknown): item is WorkoutInterval {
  return !!item && typeof item === 'object' && (item as WorkoutInterval).type === 'repeat';
}

/** A run zone for a cycling-zone number (synthesized runs reuse the ride zones). */
function runZoneFromRideZone(zone: TrainingZone): ZoneKey {
  if (zone === 3.5) return 3;
  if (zone >= 7) return 6;
  return zone;
}

function targetFor(
  seg: { zone: TrainingZone | null; powerPctFTP?: number; pacePctThreshold?: number; targetRange?: { min: number; max: number } },
  sport: string | null | undefined,
): { zone: ZoneKey | null; intensity: number; target: StepTarget | null } {
  if (sport === 'running') {
    const pct =
      seg.pacePctThreshold ??
      (seg.zone != null ? PACE_ZONE_PCT[runZoneFromRideZone(seg.zone)] : null) ??
      PACE_ZONE_PCT[2];
    return {
      zone: paceZoneFor(pct),
      intensity: intensityFromPacePct(pct),
      target: { kind: 'pace', value: pct, ...(seg.targetRange ?? {}) },
    };
  }
  const pct = seg.powerPctFTP ?? (seg.zone != null ? POWER_ZONE_PCT[seg.zone] : null) ?? POWER_ZONE_PCT[1];
  return {
    zone: powerZoneFor(pct),
    intensity: intensityFromPowerPct(pct),
    target: { kind: 'power', value: pct, ...(seg.targetRange ?? {}) },
  };
}

/** Flatten a `WorkoutStructure` (rides, and runs that carry only zones) into steps. */
export function stepsFromStructure(
  structure: WorkoutStructure | null | undefined,
  sport: string | null | undefined,
): SessionStep[] {
  if (!structure) return [];
  const out: SessionStep[] = [];

  const push = (seg: WorkoutSegment | WorkoutWarmupCooldown, phase: StepPhase, label: string, rep?: SessionStep['rep']) => {
    if (!(seg.duration > 0)) return;
    const t = targetFor(seg, sport);
    out.push({
      phase,
      durationMin: seg.duration,
      ...t,
      label,
      ...('cadence' in seg && seg.cadence ? { cadence: seg.cadence } : {}),
      ...(rep ? { rep } : {}),
    });
  };

  const walk = (item: WorkoutSegment | WorkoutInterval) => {
    if (isRepeat(item)) {
      const works = Array.isArray(item.work) ? item.work : [item.work];
      for (let i = 1; i <= item.sets; i++) {
        for (const w of works) {
          if (isRepeat(w)) walk(w);
          else push(w as WorkoutSegment, 'work', (w as WorkoutSegment).description || 'Work', { index: i, count: item.sets });
        }
        if (i < item.sets && item.rest && item.rest.duration > 0) {
          const rest = item.rest as WorkoutSegment;
          push({ ...rest, zone: rest.zone ?? 1 }, 'rest', rest.description || 'Recovery', { index: i, count: item.sets });
        }
      }
      return;
    }
    const seg = item as WorkoutSegment;
    const { zone } = targetFor(seg, sport);
    const easy = zone != null && zone <= 2;
    push(seg, easy ? 'steady' : 'work', seg.description || (easy ? 'Steady' : 'Effort'));
  };

  if (structure.warmup) push(structure.warmup, 'warmup', structure.warmup.description || 'Warmup');
  for (const item of structure.main) walk(item);
  if (structure.cooldown) push(structure.cooldown, 'cooldown', structure.cooldown.description || 'Cooldown');
  return out;
}

/** Minutes a running segment takes: its duration, or its distance at its pace. */
function runMinutes(seg: RunningWorkoutSegment, pct: number, thresholdPaceSec: number): number {
  if (seg.duration && seg.duration > 0) return seg.duration;
  if (seg.distance && seg.distance > 0) {
    const secPerKm = thresholdPaceSec * (pct / 100);
    return Math.round(((seg.distance / 1000) * secPerKm) / 6) / 10;
  }
  return 0;
}

/** Flatten a running library workout's pace structure into steps. */
export function stepsFromRunningStructure(
  structure: RunningWorkoutStructure | null | undefined,
  thresholdPaceSec?: number | null,
): SessionStep[] {
  if (!structure) return [];
  const tp = thresholdPaceSec && thresholdPaceSec > 0 ? thresholdPaceSec : DEFAULT_THRESHOLD_PACE_SEC;
  const out: SessionStep[] = [];

  const push = (seg: RunningWorkoutSegment | { duration: number; paceZone: null }, phase: StepPhase, label: string, rep?: SessionStep['rep']) => {
    const s = seg as RunningWorkoutSegment;
    const pct = s.pacePctThreshold ?? (s.paceZone != null ? PACE_ZONE_PCT[s.paceZone] : PACE_ZONE_PCT[1]);
    const minutes = runMinutes(s, pct, tp);
    if (!(minutes > 0)) return;
    out.push({
      phase,
      durationMin: minutes,
      zone: paceZoneFor(pct),
      intensity: intensityFromPacePct(pct),
      target: { kind: 'pace', value: pct },
      label: s.targetPace ? `${label} · ${s.targetPace}` : label,
      ...(s.cadence ? { cadence: s.cadence } : {}),
      ...(rep ? { rep } : {}),
    });
  };

  if (structure.warmup) push(structure.warmup, 'warmup', structure.warmup.description || 'Warmup');
  for (const item of structure.main ?? []) {
    if ((item as RunningWorkoutInterval).type === 'repeat') {
      const rep = item as RunningWorkoutInterval;
      for (let i = 1; i <= rep.sets; i++) {
        push(rep.work, 'work', rep.work.description || 'Rep', { index: i, count: rep.sets });
        if (i < rep.sets && rep.rest && (rep.rest.duration ?? 0) > 0) push(rep.rest, 'rest', (rep.rest as RunningWorkoutSegment).description || 'Easy jog', { index: i, count: rep.sets });
      }
    } else {
      const seg = item as RunningWorkoutSegment;
      const pct = seg.pacePctThreshold ?? (seg.paceZone != null ? PACE_ZONE_PCT[seg.paceZone] : 125);
      push(seg, pct >= 115 ? 'steady' : 'work', seg.description || 'Run');
    }
  }
  if (structure.cooldown) push(structure.cooldown, 'cooldown', structure.cooldown.description || 'Cooldown');
  return out;
}

export function stepsMinutes(steps: SessionStep[]): number {
  return Math.round(steps.reduce((sum, s) => sum + s.durationMin, 0) * 10) / 10;
}

/** RSS of a step list: Σ intensity² × hours × 100 (the actual-load formula). */
export function stepsLoad(steps: SessionStep[]): number {
  return Math.round(steps.reduce((sum, s) => sum + s.intensity ** 2 * (s.durationMin / 60) * 100, 0));
}

/** The hardest zone a session reaches, for colouring a whole-session mark. */
export function peakZone(steps: SessionStep[]): ZoneKey | null {
  let peak: ZoneKey | null = null;
  for (const s of steps) {
    if (s.phase === 'warmup' || s.phase === 'cooldown') continue;
    if (s.zone != null && (peak == null || s.zone > peak)) peak = s.zone;
  }
  return peak ?? steps.find((s) => s.zone != null)?.zone ?? null;
}

/**
 * Fit a step list to a planned length the way a coach would: a longer day
 * adds easy running/riding (steady steps grow, else an easy block is added
 * before the cooldown); a shorter day trims the warmup, cooldown and steady
 * steps, never the reps. A session that still does not fit is returned whole
 * — drawing the set as written beats shrinking "4×8" into 4×4.8.
 */
export function fitSteps(steps: SessionStep[], targetMin: number | null | undefined): SessionStep[] {
  if (!targetMin || targetMin <= 0 || steps.length === 0) return steps;
  const current = stepsMinutes(steps);
  const delta = targetMin - current;
  if (Math.abs(delta) < 1) return steps;
  const round1 = (n: number) => Math.round(n * 10) / 10;

  if (delta > 0) {
    const steadyIdx = steps.map((s, i) => (s.phase === 'steady' ? i : -1)).filter((i) => i >= 0);
    if (steadyIdx.length > 0) {
      const steadyMin = steadyIdx.reduce((sum, i) => sum + steps[i].durationMin, 0);
      return steps.map((s, i) => (s.phase === 'steady' ? { ...s, durationMin: round1(s.durationMin * ((steadyMin + delta) / steadyMin)) } : s));
    }
    const easy = steps.find((s) => s.phase === 'warmup') ?? steps[0];
    const filler: SessionStep = { ...easy, phase: 'steady', durationMin: round1(delta), label: 'Easy', rep: undefined };
    const coolAt = steps.findIndex((s) => s.phase === 'cooldown');
    const out = [...steps];
    out.splice(coolAt >= 0 ? coolAt : out.length, 0, filler);
    return out;
  }

  const flexible = (s: SessionStep) => s.phase === 'warmup' || s.phase === 'cooldown' || s.phase === 'steady';
  const flexMin = steps.filter(flexible).reduce((sum, s) => sum + Math.max(0, s.durationMin - 5), 0);
  if (flexMin <= 0) return steps;
  const take = Math.min(-delta, flexMin);
  return steps.map((s) => {
    if (!flexible(s)) return s;
    const room = Math.max(0, s.durationMin - 5);
    return { ...s, durationMin: round1(s.durationMin - (room / flexMin) * take) };
  });
}
