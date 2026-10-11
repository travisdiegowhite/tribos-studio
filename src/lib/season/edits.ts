/**
 * Season edits — pure changes to race_goals rows, and what each change means.
 *
 * The Season tab applies these locally so the engine re-runs at once, then
 * saves the changed rows (src/lib/season/seasonWrites.ts). Comparing the last
 * saved row with the current one gives both the change-log events and the
 * sentence the athlete sees, so several clicks before a save collapse into one
 * event and one message.
 */

import { addDaysToDate, diffPlans, formatSeasonDate, type Priority, type SeasonPlan, type Verdict } from './engine.ts';
import { PRIORITY_ROLE, type RaceGoalRow } from './view.ts';

export type SeasonEventKind = 'add' | 'move' | 'remove' | 'priority' | 'focus';

/** A season_plan_events row before it gets a plan id. */
export interface SeasonEventDraft {
  raceId: string;
  kind: SeasonEventKind;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}

const mapRace = (rows: RaceGoalRow[], id: string, change: (r: RaceGoalRow) => RaceGoalRow) =>
  rows.map((r) => (r.id === id ? change(r) : r));

/** Move a race by whole weeks (negative = earlier). Keeps the weekday. */
export function moveRace(rows: RaceGoalRow[], id: string, weeks: number): RaceGoalRow[] {
  return mapRace(rows, id, (r) => ({ ...r, race_date: addDaysToDate(String(r.race_date).slice(0, 10), weeks * 7) }));
}

export function setPriority(rows: RaceGoalRow[], id: string, priority: Priority): RaceGoalRow[] {
  return mapRace(rows, id, (r) => ({ ...r, priority }));
}

/**
 * Make `id` the focus of its block of back-to-back goal races: it gets
 * is_focus, every other race in the same block loses it. Uses the engine's
 * block grouping, so only races the engine treats as one block are touched.
 */
export function setFocus(rows: RaceGoalRow[], id: string, plan: SeasonPlan): RaceGoalRow[] {
  const race = plan.races.find((r) => r.id === id);
  if (!race || race.blockFocusId === null) return rows;
  const block = new Set(plan.races.filter((r) => r.blockFocusId === race.blockFocusId).map((r) => r.id));
  return rows.map((r) => (block.has(r.id) ? { ...r, is_focus: r.id === id } : r));
}

export function removeRace(rows: RaceGoalRow[], id: string): RaceGoalRow[] {
  return rows.filter((r) => r.id !== id);
}

/** The change-log events between a race's last saved row and its current one. */
export function eventsFor(before: RaceGoalRow | undefined, after: RaceGoalRow | undefined): SeasonEventDraft[] {
  if (!before && !after) return [];
  if (!before && after) return [{ raceId: after.id, kind: 'add', before: null, after: snapshot(after) }];
  if (before && !after) return [{ raceId: before.id, kind: 'remove', before: snapshot(before), after: null }];
  const b = before as RaceGoalRow;
  const a = after as RaceGoalRow;
  const events: SeasonEventDraft[] = [];
  if (dateOf(b) !== dateOf(a)) {
    events.push({ raceId: a.id, kind: 'move', before: { race_date: dateOf(b) }, after: { race_date: dateOf(a) } });
  }
  if ((b.priority ?? null) !== (a.priority ?? null)) {
    events.push({ raceId: a.id, kind: 'priority', before: { priority: b.priority ?? null }, after: { priority: a.priority ?? null } });
  }
  if (Boolean(b.is_focus) !== Boolean(a.is_focus)) {
    events.push({ raceId: a.id, kind: 'focus', before: { is_focus: Boolean(b.is_focus) }, after: { is_focus: Boolean(a.is_focus) } });
  }
  return events;
}

/** One plain sentence for a saved change, e.g. "Moved Boulder Roubaix to Sun, May 2, 2027." */
export function describeChange(before: RaceGoalRow | undefined, after: RaceGoalRow | undefined): string {
  const name = (after ?? before)?.name?.trim() || 'Race';
  const events = eventsFor(before, after);
  if (events.length === 0) return `${name} is unchanged.`;
  if (events.length > 1) return `Updated ${name}.`;
  const [e] = events;
  switch (e.kind) {
    case 'add':
      return `Added ${name}.`;
    case 'remove':
      return `Removed ${name}.`;
    case 'move':
      return `Moved ${name} to ${formatSeasonDate(String(e.after?.race_date))}.`;
    case 'priority': {
      const p = String(e.after?.priority ?? 'B') as Priority;
      return `${name} is now a ${(PRIORITY_ROLE[p] ?? PRIORITY_ROLE.B).toLowerCase()} race.`;
    }
    case 'focus':
      return e.after?.is_focus ? `${name} is now the race that matters most in its block.` : `${name} is no longer the focus of its block.`;
  }
}

/** Two rows are the same for saving purposes. */
export function sameRace(a: RaceGoalRow | undefined, b: RaceGoalRow | undefined): boolean {
  return eventsFor(a, b).length === 0;
}

function dateOf(r: RaceGoalRow): string {
  return String(r.race_date).slice(0, 10);
}

function snapshot(r: RaceGoalRow): Record<string, unknown> {
  return { id: r.id, name: r.name, race_date: dateOf(r), priority: r.priority ?? null, race_type: r.race_type ?? null, is_focus: Boolean(r.is_focus) };
}

const VERDICT_ORDER: Record<Verdict, number> = { on_track: 0, tight: 1, conflict: 2 };
const VERDICT_WORD: Record<Verdict, string> = { on_track: 'On track', tight: 'Tight', conflict: 'Conflict' };

/**
 * Races an edit made worse (On track → Tight, anything → Conflict), as
 * sentences for the save toast. Moves are never blocked; this is the flag
 * that says you won't be prepared.
 */
export function worsenedVerdicts(before: SeasonPlan, after: SeasonPlan): { conflict: boolean; text: string }[] {
  return diffPlans(before, after)
    .verdictChanges.filter((v) => VERDICT_ORDER[v.to] > VERDICT_ORDER[v.from])
    .map((v) => ({ conflict: v.to === 'conflict', text: `${v.name}: ${VERDICT_WORD[v.to]}. ${v.reason}` }));
}
