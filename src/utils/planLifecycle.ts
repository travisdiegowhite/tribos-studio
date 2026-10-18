/**
 * A training plan's lifespan, derived from its dates — never from `status`.
 *
 * Browser twin of api/utils/planLifecycle.js (the deliberate-duplicate pattern
 * of src/lib/calendar vs api/utils/calendar*). Keep the two in step.
 *
 * A plan is bounded by its ANCHOR DATE and is history the day after it:
 *   1. `target_event_date` — the race the plan was built for;
 *   2. else the last `blocks[].end_date` (arc plans);
 *   3. else `end_date`;
 *   4. else start + duration_weeks·7 − 1 (template plans).
 */

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

export interface PlanDates {
  started_at?: string | null;
  start_date?: string | null;
  duration_weeks?: number | null;
  end_date?: string | null;
  target_event_date?: string | null;
  blocks?: unknown;
}

export type PlanState = 'upcoming' | 'active' | 'ended';

function ymd(value: unknown): string | null {
  const s = String(value ?? '').slice(0, 10);
  return YMD_RE.test(s) ? s : null;
}

function addDays(dateStr: string, days: number): string {
  return new Date(Date.parse(`${dateStr}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

function daysBetween(fromStr: string, toStr: string): number {
  return Math.round((Date.parse(`${toStr}T00:00:00Z`) - Date.parse(`${fromStr}T00:00:00Z`)) / DAY_MS);
}

/** Today as the browser's local YYYY-MM-DD. */
export function localTodayStr(now: Date = new Date()): string {
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${m}-${d}`;
}

export function planStartDate(plan: PlanDates | null | undefined): string | null {
  return ymd(plan?.started_at) || ymd(plan?.start_date);
}

/** The plan's last day (inclusive), or null when nothing dates it. */
export function planAnchorDate(plan: PlanDates | null | undefined): string | null {
  if (!plan) return null;
  const target = ymd(plan.target_event_date);
  if (target) return target;

  if (Array.isArray(plan.blocks)) {
    const ends = (plan.blocks as Array<{ end_date?: unknown } | null>)
      .map((b) => ymd(b?.end_date))
      .filter((s): s is string => Boolean(s))
      .sort();
    if (ends.length > 0) return ends[ends.length - 1];
  }

  const end = ymd(plan.end_date);
  if (end) return end;

  const start = planStartDate(plan);
  const weeks = Number(plan.duration_weeks) || 0;
  if (start && weeks > 0) return addDays(start, weeks * 7 - 1);
  return null;
}

export function planLifecycle(
  plan: PlanDates | null | undefined,
  todayStr: string,
): { state: PlanState; anchorDate: string | null; daysSinceEnd: number | null } {
  const anchorDate = planAnchorDate(plan);
  const today = ymd(todayStr);
  if (!today) return { state: 'active', anchorDate, daysSinceEnd: null };

  if (anchorDate && today > anchorDate) {
    return { state: 'ended', anchorDate, daysSinceEnd: daysBetween(anchorDate, today) };
  }
  const start = planStartDate(plan);
  if (start && today < start) return { state: 'upcoming', anchorDate, daysSinceEnd: null };
  return { state: 'active', anchorDate, daysSinceEnd: null };
}

/** True unless the plan's anchor date has passed. */
export function isPlanCurrent(plan: PlanDates | null | undefined, todayStr: string = localTodayStr()): boolean {
  return planLifecycle(plan, todayStr).state !== 'ended';
}
