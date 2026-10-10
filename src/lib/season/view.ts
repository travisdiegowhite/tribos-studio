/**
 * Season view helpers — pure glue between race_goals rows and the engine, and
 * the layout numbers the season profile draws (the ridge, flags, notes).
 */

import {
  addDaysToDate,
  mondayOf,
  weekIndexOf,
  type Phase,
  type Priority,
  type SeasonPlan,
  type SeasonRaceInput,
  type SeasonRaceResult,
} from './engine.ts';
import { profileForRace, type RaceProfileSource } from './raceProfile.ts';

/** Weekly hours to plan around when there is no history and no athlete-entered number. */
export const DEFAULT_WEEKLY_HOURS = 6;

/** race_goals columns the season view reads. */
export interface RaceGoalRow extends RaceProfileSource {
  id: string;
  name: string | null;
  race_date: string;
  priority: string | null;
  is_focus?: boolean | null;
  status?: string | null;
}

/** Statuses that take a race off the plan. */
const DROPPED_STATUSES = new Set(['cancelled', 'dns']);

/** race_goals rows → engine input, each with its sport and taper/recovery profile. */
export function toSeasonRaces(rows: RaceGoalRow[]): SeasonRaceInput[] {
  return rows
    .filter((r) => !DROPPED_STATUSES.has(r.status ?? ''))
    .map((r) => {
      const { sport, profile } = profileForRace(r);
      return {
        id: r.id,
        name: r.name?.trim() || 'Race',
        date: String(r.race_date).slice(0, 10),
        priority: r.priority,
        sport,
        profile,
        focus: r.is_focus === true,
      };
    });
}

/** Default window: the last 8 weeks (drawn as what you rode) plus a year ahead. */
export const DEFAULT_WEEKS_BACK = 8;
export const DEFAULT_WEEKS_AHEAD = 52;
export const DEFAULT_SEASON_WEEKS = DEFAULT_WEEKS_BACK + DEFAULT_WEEKS_AHEAD;

/**
 * Season start when the athlete has no saved plan: the Monday 8 weeks before
 * this one, so the ridden line shows to the left of today. (Fixed vs rolling
 * seasons is an open question; a saved season_plans row always wins.)
 */
export function defaultSeasonStart(todayLocal: string): string {
  return addDaysToDate(mondayOf(todayLocal), -7 * DEFAULT_WEEKS_BACK);
}

/** Last day covered by a season. */
export function seasonEndDate(startDate: string, weeks: number): string {
  return addDaysToDate(startDate, weeks * 7 - 1);
}

/** Index of the week containing today, or null when today is outside the season. */
export function todayWeekIndex(plan: SeasonPlan, todayLocal: string): number | null {
  const w = weekIndexOf(plan.startDate, todayLocal);
  return w >= 0 && w < plan.weeks ? w : null;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** A month label at the first week whose Monday falls in a new month (and at week 0). */
export function monthMarks(plan: SeasonPlan): { week: number; label: string }[] {
  const marks: { week: number; label: string }[] = [];
  let last = -1;
  for (const w of plan.schedule) {
    const month = Number(w.startDate.slice(5, 7)) - 1;
    if (month !== last) {
      marks.push({ week: w.index, label: MONTHS[month] });
      last = month;
    }
  }
  return marks;
}

// ─── Vocabulary ─────────────────────────────────────────────────────────────
// What the athlete reads. The engine keeps its own names internally.

export const PRIORITY_ROLE: Record<Priority, string> = { A: 'Goal', B: 'Target', C: 'Tune-up' };

export const PHASE_LABEL: Record<Phase, string> = {
  recover: 'Recover',
  base: 'Base',
  build: 'Climb',
  peak: 'Sharpen',
  taper: 'Descend',
};

// ─── The ridge ──────────────────────────────────────────────────────────────

/**
 * Hours per week for the profile: what was ridden for weeks that are over
 * (before this week), the plan from this week on. `ridden` is keyed by the
 * week's Monday; a missing ridden week falls back to the plan.
 */
export function seasonHoursSeries(plan: SeasonPlan, ridden: Record<string, number>, todayWeek: number | null): number[] {
  return plan.schedule.map((w) => {
    const over = todayWeek === null ? w.startDate < plan.startDate : w.index < todayWeek;
    const r = ridden[w.startDate];
    return over && typeof r === 'number' && Number.isFinite(r) ? r : w.targetHours;
  });
}

/** A smooth SVG path through points (Catmull-Rom spline as cubic Béziers). */
export function smoothPath(points: [number, number][]): string {
  if (points.length === 0) return '';
  const f = (n: number) => n.toFixed(1);
  let d = `M${f(points[0][0])},${f(points[0][1])}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${f(c1[0])},${f(c1[1])} ${f(c2[0])},${f(c2[1])} ${f(p2[0])},${f(p2[1])}`;
  }
  return d;
}

// ─── Flags ──────────────────────────────────────────────────────────────────

export interface FlagLayout {
  week: number;
  /** The highest-priority race that week; the flag selects it. */
  lead: SeasonRaceResult;
  races: SeasonRaceResult[];
  label: string;
  /** 0 = lowest label row. */
  level: number;
  /** Label sits left of the pole (near the right edge). */
  flip: boolean;
  conflict: boolean;
}

/**
 * One flag per week with races, labels staggered over `levels` rows so they
 * never overlap, flipped to the left of the pole near the right edge.
 * `x` maps a week to its centre; `charWidth` estimates label width.
 */
export function layoutFlags(
  plan: SeasonPlan,
  x: (week: number) => number,
  rightEdge: number,
  charWidth = 8,
  levels = 3,
): FlagLayout[] {
  const byWeek = new Map<number, SeasonRaceResult[]>();
  for (const r of plan.races) {
    if (r.week === null) continue;
    byWeek.set(r.week, [...(byWeek.get(r.week) ?? []), r]);
  }
  const taken: [number, number][][] = Array.from({ length: levels }, () => []);
  return [...byWeek.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([week, races]) => {
      const sorted = [...races].sort((a, b) => a.priority.localeCompare(b.priority));
      const lead = sorted[0];
      const label = lead.name + (sorted.length > 1 ? ` +${sorted.length - 1}` : '');
      const fx = x(week);
      const width = label.length * charWidth + 24;
      const flip = fx + width > rightEdge;
      const span: [number, number] = flip ? [fx - width, fx] : [fx, fx + width];
      let level = 0;
      while (level < levels - 1 && taken[level].some(([a, b]) => span[0] < b && span[1] > a)) level++;
      taken[level].push(span);
      return { week, lead, races: sorted, label, level, flip, conflict: sorted.some((r) => r.verdict === 'conflict') };
    });
}

// ─── Coach notes ────────────────────────────────────────────────────────────

export interface ProfileNote {
  kind: 'conflict' | 'springboard' | 'recover';
  text: string;
  /** Week the note points at (may be fractional, e.g. the middle of a valley). */
  week: number;
  raceId: string;
}

/** A short handle for a hand-lettered note: "Bolder Boulder 10K" → "10K", else at most the first two words. */
export function shortRaceName(name: string): string {
  const words = name.trim().split(/\s+/);
  const distance = words.find((w) => /^\d+(k|mi)$/i.test(w));
  if (distance) return distance.toUpperCase();
  return words.length > 2 ? words.slice(0, 2).join(' ') : name.trim();
}

/** Notes shown on the profile, at most `max`: they are moments, not labels. */
export function pickNotes(plan: SeasonPlan, todayWeek: number | null, max = 3): ProfileNote[] {
  const from = todayWeek ?? 0;
  const upcoming = plan.races.filter((r) => r.week !== null && (r.week as number) >= from);
  const notes: ProfileNote[] = [];

  const conflict = upcoming.find((r) => r.verdict === 'conflict');
  if (conflict) {
    const inTaper = /taper/i.test(conflict.reason);
    notes.push({
      kind: 'conflict',
      text: inTaper ? `${shortRaceName(conflict.name)} lands in the taper!` : `${shortRaceName(conflict.name)} clashes!`,
      week: conflict.week as number,
      raceId: conflict.id,
    });
  }

  const springboard = upcoming.find(
    (r) => r.priority === 'A' && r.focusConfirmed === false && r.blockFocusId !== null && r.blockFocusId !== r.id,
  );
  if (springboard) {
    notes.push({ kind: 'springboard', text: 'springboard: one build for both', week: springboard.week as number, raceId: springboard.id });
  }

  // The valley after the next goal race (or block).
  const nextGoal = upcoming.find((r) => r.priority === 'A' && (r.blockFocusId === null || r.blockFocusId === r.id));
  if (nextGoal) {
    // A block recovers after its last race, for its longest recovery.
    const block = upcoming.filter((r) => r.priority === 'A' && (r.blockFocusId ?? r.id) === (nextGoal.blockFocusId ?? nextGoal.id));
    const lastWeek = Math.max(...block.map((r) => r.week as number));
    const recover = Math.max(...block.map((r) => r.profile.recoverWeeks));
    notes.push({
      kind: 'recover',
      text: `${recover} wk easy`,
      week: lastWeek + (recover + 1) / 2,
      raceId: nextGoal.id,
    });
  }

  return notes.slice(0, max);
}
