/**
 * summary — turn a step list into the words a coach would use: blocks
 * ("3 × 12 min at 82–86% FTP, 4 min easy"), one-line interval summaries
 * ("3×12min"), and targets in the athlete's own units (watts from FTP, pace
 * from threshold pace).
 */

import type { SessionStep, StepTarget } from './steps';

export type StepBlock =
  | { kind: 'single'; step: SessionStep }
  | { kind: 'repeat'; count: number; work: SessionStep; rest: SessionStep | null };

/** Group consecutive reps of one set into a single block. */
export function summarizeSteps(steps: SessionStep[]): StepBlock[] {
  const blocks: StepBlock[] = [];
  let i = 0;
  while (i < steps.length) {
    const s = steps[i];
    if (s.rep && s.phase === 'work' && s.rep.index === 1) {
      const count = s.rep.count;
      const rest = steps[i + 1]?.phase === 'rest' && steps[i + 1]?.rep?.count === count ? steps[i + 1] : null;
      blocks.push({ kind: 'repeat', count, work: s, rest });
      // Consume this set's reps and the rests between them.
      let j = i;
      while (j < steps.length) {
        const t = steps[j];
        if (!t.rep || t.rep.count !== count || (t.phase !== 'work' && t.phase !== 'rest')) break;
        j++;
        if (t.phase === 'work' && t.rep.index === count) break;
      }
      i = j;
      continue;
    }
    blocks.push({ kind: 'single', step: s });
    i++;
  }
  return blocks;
}

export function formatMinutes(min: number): string {
  if (min < 1) return `${Math.round(min * 60)}s`;
  const rounded = Math.round(min * 10) / 10;
  if (rounded < 60) return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)} min`;
  const h = Math.floor(rounded / 60);
  const m = Math.round(rounded % 60);
  return m ? `${h}h ${m}m` : `${h}h`;
}

/** "3×12min + 4×4min" — the interval sets only; "Steady" for a session with none. */
export function intervalSummary(steps: SessionStep[]): string {
  const sets = summarizeSteps(steps)
    .filter((b): b is Extract<StepBlock, { kind: 'repeat' }> => b.kind === 'repeat')
    .map((b) => `${b.count}×${formatMinutes(b.work.durationMin).replace(' ', '')}`);
  return sets.length > 0 ? sets.join(' + ') : 'Steady';
}

function paceFromPct(pct: number, thresholdPaceSec: number): string {
  const sec = Math.round(thresholdPaceSec * (pct / 100));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

export interface TargetAnchors {
  ftp?: number | null;
  thresholdPaceSec?: number | null;
}

/**
 * The target in words: "82–86% FTP · 221–233 W" for a ride, "4:10–4:20/km ·
 * threshold" for a run. Falls back to the percentage alone when the athlete's
 * anchor (FTP, threshold pace) is unknown.
 */
export function formatTarget(target: StepTarget | null, anchors: TargetAnchors = {}): string {
  if (!target) return '';
  const lo = target.min ?? target.value;
  const hi = target.max ?? target.value;
  const pct = lo === hi ? `${Math.round(lo)}%` : `${Math.round(lo)}–${Math.round(hi)}%`;
  if (target.kind === 'power') {
    const ftp = anchors.ftp && anchors.ftp > 0 ? anchors.ftp : null;
    if (!ftp) return `${pct} FTP`;
    const w = (p: number) => Math.round((ftp * p) / 100);
    const watts = lo === hi ? `${w(lo)} W` : `${w(lo)}–${w(hi)} W`;
    return `${pct} FTP · ${watts}`;
  }
  const tp = anchors.thresholdPaceSec && anchors.thresholdPaceSec > 0 ? anchors.thresholdPaceSec : null;
  // Pace %: higher = slower, so the faster pace is the lower number.
  if (!tp) return `${pct} of threshold pace`;
  const pace = lo === hi ? `${paceFromPct(lo, tp)}/km` : `${paceFromPct(lo, tp)}–${paceFromPct(hi, tp)}/km`;
  return pace;
}
