/**
 * The season coach's payload — built in the browser from the engine's output.
 *
 * The coach narrates; it never computes. Every date in here is already
 * formatted ("Sat, Jun 19, 2027") and every week count comes from the engine,
 * so the server only adds the athlete's persona and asks Claude to explain.
 * See api/season-coach.js and docs/season-planner-build-plan.md (Coach panel).
 */

import { diffPlans, formatSeasonDate, type PlanDiff, type SeasonPlan, type Verdict } from './engine.ts';
import { PRIORITY_ROLE, seasonEndDate, type RaceGoalRow } from './view.ts';

/** Longest question the athlete can send with a request. */
export const MAX_QUESTION_CHARS = 500;

const VERDICT_TEXT: Record<Verdict, string> = { on_track: 'On track', tight: 'Tight', conflict: 'Conflict' };

/** What the coach last discussed: the engine's plan, plus the race fields Reset puts back. */
export interface DiscussedSnapshot {
  plan: SeasonPlan;
  rows: { id: string; race_date: string; priority: string | null; is_focus: boolean }[];
}

export interface CoachPayloadRace {
  name: string;
  role: string;
  date: string;
  sport: string;
  effort: string;
  verdict: string;
  reason: string;
  buildWeeks: number | null;
  /** "Shares one build with X" for back-to-back goal races. */
  blockNote: string | null;
}

export interface CoachPayloadChange {
  kind: 'moved' | 'added' | 'removed' | 'priority' | 'focus' | 'build' | 'verdict';
  text: string;
}

export interface CoachPayload {
  today: string;
  season: { from: string; to: string; typicalHours: number };
  races: CoachPayloadRace[];
  /** True when there is no earlier conversation to compare with. */
  firstLook: boolean;
  /** What changed since the last conversation, as plain sentences. */
  changes: CoachPayloadChange[];
  question: string | null;
}

const VERDICT_LOWER: Record<Verdict, string> = { on_track: 'on track', tight: 'tight', conflict: 'a conflict' };

/** The engine's PlanDiff as plain sentences, every date already formatted. */
export function describeDiff(diff: PlanDiff): CoachPayloadChange[] {
  const weeks = (n: number) => `${Math.abs(n)} week${Math.abs(n) === 1 ? '' : 's'}`;
  return [
    ...diff.changed.map((c) => ({
      kind: 'moved' as const,
      text: `${c.name} moved ${weeks(c.weeks)} ${c.weeks >= 0 ? 'later' : 'earlier'}, from ${c.fromDate} to ${c.toDate}.`,
    })),
    ...diff.added.map((a) => ({ kind: 'added' as const, text: `${a.name} was added (${a.date}, ${PRIORITY_ROLE[a.priority].toLowerCase()} race).` })),
    ...diff.removed.map((r) => ({ kind: 'removed' as const, text: `${r.name} (${r.date}) was removed.` })),
    ...diff.priorityChanges.map((p) => ({
      kind: 'priority' as const,
      text: `${p.name} changed from a ${PRIORITY_ROLE[p.from].toLowerCase()} race to a ${PRIORITY_ROLE[p.to].toLowerCase()} race.`,
    })),
    ...diff.buildChanges.map((b) => ({
      kind: 'build' as const,
      text: `The build into ${b.name} went from ${weeks(b.fromWeeks)} to ${weeks(b.toWeeks)}.`,
    })),
    ...diff.verdictChanges.map((v) => ({
      kind: 'verdict' as const,
      text: `${v.name} went from ${VERDICT_LOWER[v.from]} to ${VERDICT_LOWER[v.to]}: ${v.reason}`,
    })),
  ];
}

/**
 * Races the athlete has newly picked as the one their back-to-back block builds
 * toward. The engine's PlanDiff doesn't carry focus, but the pick changes what
 * the build aims at, so the coach should hear about it.
 */
export function focusChanges(before: SeasonPlan, after: SeasonPlan): CoachPayloadChange[] {
  type Race = SeasonPlan['races'][number];
  // A lone race is trivially its own focus; only a pick inside a real block counts.
  const isFocus = (plan: SeasonPlan, r: Race) =>
    r.blockFocusId === r.id && r.focusConfirmed === true && plan.races.some((o) => o.id !== r.id && o.blockFocusId === r.id);
  const was = new Map(before.races.map((r) => [r.id, r]));
  return after.races
    .filter((r) => isFocus(after, r) && was.has(r.id) && !isFocus(before, was.get(r.id) as Race))
    .map((r) => ({ kind: 'focus' as const, text: `${r.name} is now the race its back-to-back block builds toward.` }));
}

/** Everything that changed since the conversation, as sentences. */
export function changesSince(discussed: SeasonPlan, plan: SeasonPlan): CoachPayloadChange[] {
  const all = describeDiff(diffPlans(discussed, plan));
  // Focus picks read best right after the priority changes, before the knock-on effects.
  const firstEffect = all.findIndex((c) => c.kind === 'build' || c.kind === 'verdict');
  const at = firstEffect < 0 ? all.length : firstEffect;
  return [...all.slice(0, at), ...focusChanges(discussed, plan), ...all.slice(at)];
}

export function buildCoachPayload(
  plan: SeasonPlan,
  discussed: DiscussedSnapshot | null,
  todayLocal: string,
  question?: string | null,
): CoachPayload {
  const byId = new Map(plan.races.map((r) => [r.id, r]));
  const upcoming = plan.races.filter((r) => r.date >= todayLocal);
  const races: CoachPayloadRace[] = upcoming.map((r) => {
    const focus = r.blockFocusId ? byId.get(r.blockFocusId) : null;
    const partners = r.blockFocusId ? plan.races.filter((o) => o.blockFocusId === r.blockFocusId && o.id !== r.id) : [];
    return {
      name: r.name,
      role: PRIORITY_ROLE[r.priority],
      date: formatSeasonDate(r.date),
      sport: r.sport,
      effort: r.profile.band,
      verdict: VERDICT_TEXT[r.verdict],
      reason: r.reason,
      buildWeeks: r.buildWeeks,
      blockNote:
        partners.length > 0
          ? `Shares one build with ${partners.map((p) => p.name).join(' and ')}; the build aims at ${focus?.name ?? r.name}${r.focusConfirmed ? '' : ' (not confirmed by the athlete)'}.`
          : null,
    };
  });

  const trimmed = (question ?? '').trim().slice(0, MAX_QUESTION_CHARS);
  return {
    today: formatSeasonDate(todayLocal),
    season: {
      from: formatSeasonDate(plan.startDate),
      to: formatSeasonDate(seasonEndDate(plan.startDate, plan.weeks)),
      typicalHours: plan.typicalWeeklyHours,
    },
    races,
    firstLook: discussed === null,
    changes: discussed ? changesSince(discussed.plan, plan) : [],
    question: trimmed || null,
  };
}

/** The baseline saved after a conversation. */
export function toSnapshot(plan: SeasonPlan, rows: RaceGoalRow[]): DiscussedSnapshot {
  return {
    plan,
    rows: rows.map((r) => ({
      id: r.id,
      race_date: String(r.race_date).slice(0, 10),
      priority: r.priority ?? null,
      is_focus: Boolean(r.is_focus),
    })),
  };
}

/**
 * Put races back to the discussed version: date, priority and focus, for races
 * present in both. Races added or removed since are left alone and reported,
 * so the athlete can deal with them deliberately.
 */
export function resetRows(
  rows: RaceGoalRow[],
  snapshot: DiscussedSnapshot,
): { rows: RaceGoalRow[]; addedSince: string[]; removedSince: string[] } {
  const saved = new Map(snapshot.rows.map((r) => [r.id, r]));
  const current = new Set(rows.map((r) => r.id));
  const next = rows.map((r) => {
    const s = saved.get(r.id);
    if (!s) return r;
    const same =
      String(r.race_date).slice(0, 10) === s.race_date && (r.priority ?? null) === s.priority && Boolean(r.is_focus) === s.is_focus;
    return same ? r : { ...r, race_date: s.race_date, priority: s.priority, is_focus: s.is_focus };
  });
  const names = new Map(snapshot.plan.races.map((r) => [r.id, r.name]));
  return {
    rows: next,
    addedSince: rows.filter((r) => !saved.has(r.id)).map((r) => r.name?.trim() || 'Race'),
    removedSince: snapshot.rows.filter((r) => !current.has(r.id)).map((r) => names.get(r.id) ?? 'Race'),
  };
}

/** The athlete's own edits since the last conversation (not their knock-on effects on builds and verdicts). */
export function athleteChanges(changes: CoachPayloadChange[]): CoachPayloadChange[] {
  return changes.filter((c) => c.kind !== 'build' && c.kind !== 'verdict');
}

/** How many changes since the last conversation (for the panel summary). */
export function countChanges(plan: SeasonPlan, discussed: DiscussedSnapshot | null): number {
  return discussed ? athleteChanges(changesSince(discussed.plan, plan)).length : 0;
}
