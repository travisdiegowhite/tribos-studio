/**
 * Season view helpers — pure glue between race_goals rows and the engine, and
 * the layout numbers the year view draws (month labels, today line).
 */

import { addDaysToDate, mondayOf, weekIndexOf, type SeasonPlan, type SeasonRaceInput } from './engine.ts';
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

/**
 * Season start when the athlete has no saved plan: the Monday of the current
 * week, so "today" sits at the left edge. (Fixed vs rolling seasons is an
 * open question; a saved season_plans row always wins.)
 */
export function defaultSeasonStart(todayLocal: string): string {
  return mondayOf(todayLocal);
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
