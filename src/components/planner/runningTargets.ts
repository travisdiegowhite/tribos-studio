/**
 * Display helpers for running workouts in the planner (multisport phase 3).
 *
 * Running library workouts describe their targets in `runningStructure`
 * (pace bands, % of threshold pace) and spell cadence as steps per minute;
 * the modal was written for rides and labelled every cadence "rpm".
 */

import type { RunningWorkoutStructure, RunningWorkoutSegment, RunningWorkoutInterval } from '../../types/training';

/** "85-95 rpm" for a ride, "170-180 spm" for a run; a value that already names its unit is left alone. */
export function formatCadence(cadence: string | number | null | undefined, sportType?: string | null): string | null {
  if (cadence == null || cadence === '') return null;
  const text = String(cadence).trim();
  if (/[a-z]/i.test(text)) return text;
  return `${text} ${sportType === 'running' ? 'spm' : 'rpm'}`;
}

export interface PaceTarget {
  label: string;
  pace: string;
}

function paceOf(seg: RunningWorkoutSegment): string | null {
  if (seg.targetPace) return seg.targetPace;
  if (seg.pacePctThreshold) return `${seg.pacePctThreshold}% of threshold pace`;
  return null;
}

function amountOf(seg: RunningWorkoutSegment): string {
  if (seg.distance) return seg.distance >= 1000 ? `${seg.distance / 1000} km` : `${seg.distance} m`;
  if (seg.duration) return `${seg.duration} min`;
  return '';
}

/** One line per part of a run that has a pace target, warmup to cooldown. */
export function runningPaceTargets(structure: RunningWorkoutStructure | null | undefined): PaceTarget[] {
  if (!structure) return [];
  const out: PaceTarget[] = [];
  const add = (label: string, seg: RunningWorkoutSegment | null | undefined) => {
    if (!seg) return;
    const pace = paceOf(seg);
    if (pace) out.push({ label, pace });
  };

  add(`Warmup ${amountOf(structure.warmup ?? ({} as RunningWorkoutSegment))}`.trim(), structure.warmup);
  for (const item of structure.main ?? []) {
    if ((item as RunningWorkoutInterval).type === 'repeat') {
      const rep = item as RunningWorkoutInterval;
      add(`${rep.sets} × ${amountOf(rep.work)}`.trim(), rep.work);
    } else {
      const seg = item as RunningWorkoutSegment;
      add(`${seg.description || 'Run'}${amountOf(seg) ? ` (${amountOf(seg)})` : ''}`, seg);
    }
  }
  add(`Cooldown ${amountOf(structure.cooldown ?? ({} as RunningWorkoutSegment))}`.trim(), structure.cooldown);
  return out;
}
