/**
 * A training plan's lifespan, derived from its dates — never from `status`.
 *
 * Nothing used to end a plan: `status` stayed 'active' until the athlete
 * pressed "End plan", so three weeks after The Rad the coach was still
 * reading "Plan: The Rad · taper" as the current plan. A plan is now bounded
 * by its ANCHOR DATE and is history the day after it:
 *
 *   1. `target_event_date` — the race the plan was built for;
 *   2. else the last `blocks[].end_date` (arc plans);
 *   3. else `end_date`;
 *   4. else start + duration_weeks·7 − 1 (template plans).
 *
 * Every "active plan" reader filters with `isPlanCurrent` after its
 * `status = 'active'` query, so an ended plan disappears even before
 * arc-refill's auto-close (which writes status='completed') has run.
 *
 * Browser twin: src/utils/planLifecycle.ts — keep the two in step.
 */

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

function ymd(value) {
  const s = String(value ?? '').slice(0, 10);
  return YMD_RE.test(s) ? s : null;
}

function addDays(dateStr, days) {
  return new Date(Date.parse(`${dateStr}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

function daysBetween(fromStr, toStr) {
  return Math.round((Date.parse(`${toStr}T00:00:00Z`) - Date.parse(`${fromStr}T00:00:00Z`)) / DAY_MS);
}

/** The plan's first day, YYYY-MM-DD, or null. */
export function planStartDate(plan) {
  return ymd(plan?.started_at) || ymd(plan?.start_date);
}

/**
 * The plan's last day (inclusive), YYYY-MM-DD, or null when nothing dates it.
 * A plan with no anchor is treated as current — we never end a plan on a guess.
 */
export function planAnchorDate(plan) {
  if (!plan) return null;
  const target = ymd(plan.target_event_date);
  if (target) return target;

  if (Array.isArray(plan.blocks)) {
    const ends = plan.blocks.map((b) => ymd(b?.end_date)).filter(Boolean).sort();
    if (ends.length > 0) return ends[ends.length - 1];
  }

  const end = ymd(plan.end_date);
  if (end) return end;

  const start = planStartDate(plan);
  const weeks = Number(plan.duration_weeks) || 0;
  if (start && weeks > 0) return addDays(start, weeks * 7 - 1);
  return null;
}

/**
 * @param {object} plan  training_plans row
 * @param {string} todayStr  athlete-local YYYY-MM-DD
 * @returns {{ state: 'upcoming'|'active'|'ended', anchorDate: string|null, daysSinceEnd: number|null }}
 */
export function planLifecycle(plan, todayStr) {
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

/** True unless the plan's anchor date has passed. Upcoming plans count as current. */
export function isPlanCurrent(plan, todayStr) {
  return planLifecycle(plan, todayStr).state !== 'ended';
}
