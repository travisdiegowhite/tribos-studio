/**
 * calendarMutations — the write half of the calendar, paired with
 * getCalendarRange as the read half.
 *
 * THE POINT OF THIS FILE
 * ----------------------
 * Not one of these functions takes a `plan_id`, and none requires an active
 * plan to exist. That is the whole ownership inversion: on the old table a
 * session's identity was `(plan_id, scheduled_date)`, so `TrainingCalendar.jsx`
 * had to hard-return on `!activePlan` before adding, moving, editing or
 * deleting anything, and clamp every date to the plan's `duration_weeks`. Here
 * the athlete owns the entry and a plan is provenance.
 *
 * SLOT ALLOCATION is the only real logic. `UNIQUE (user_id, date, slot)` means
 * a second entry on an occupied day needs the next free slot, and a move must
 * vacate the slot it left. Note what is NOT needed: the three-write
 * park/move/restore dance with rollback in api/coach.js:229, mirrored in
 * check-in-apply.js and deviation-resolve.js, exists only because the old key
 * made a swap collide with itself. Here a swap is two plain updates.
 *
 * PINNED. Every athlete-initiated write sets `pinned = true`. That single flag
 * is the contract that stops a plan generator overwriting work the athlete did
 * — replacing the four-column "touch marker" predicate the old model needed.
 */

import { supabase } from '../supabase';
import { toDateKey } from '../../utils/dateUtils';
import type { CalendarEntryRow, CalendarEntryType, CalendarEntryStatus } from './getCalendarRange';

export interface MutationResult<T = CalendarEntryRow> {
  success: boolean;
  data?: T;
  error?: string;
}

/** Fields an athlete (or the coach on their behalf) may set. */
export interface EntryDraft {
  type?: CalendarEntryType;
  title: string;
  workout_id?: string | null;
  workout_type?: string | null;
  target_load?: number | null;
  target_duration_min?: number | null;
  target_distance_km?: number | null;
  notes?: string | null;
  coach_rationale?: string | null;
  details?: Record<string, unknown> | null;
  source?: string;
  plan_id?: string | null;
  generation_id?: string | null;
}

const fail = (error: string): MutationResult => ({ success: false, error });

/**
 * Lowest slot not already taken on that day.
 *
 * Deliberately a read-then-write rather than an insert-and-retry: the caller
 * gets a deterministic slot to render optimistically, and a genuine race still
 * surfaces as a 23505 from the unique index rather than being silently
 * swallowed. With one athlete per calendar, that race is theoretical.
 */
export async function nextFreeSlot(userId: string, dateKey: string): Promise<number> {
  const { data, error } = await supabase
    .from('calendar_entries')
    .select('slot')
    .eq('user_id', userId)
    .eq('date', dateKey)
    .order('slot', { ascending: true });

  if (error) throw new Error(`Could not read slots for ${dateKey}: ${error.message}`);

  const taken = new Set((data ?? []).map((r: { slot: number }) => r.slot));
  let slot = 0;
  while (taken.has(slot)) slot += 1;
  return slot;
}

/** Add an entry to a day. No plan required, no plan consulted. */
export async function createEntry(
  userId: string,
  date: string,
  draft: EntryDraft,
): Promise<MutationResult> {
  const dateKey = toDateKey(date);
  if (!userId) return fail('Not signed in');
  if (!dateKey) return fail('A valid date is required');
  if (!draft?.title?.trim()) return fail('A title is required');

  try {
    const slot = await nextFreeSlot(userId, dateKey);
    const { data, error } = await supabase
      .from('calendar_entries')
      .insert({
        id: crypto.randomUUID(),
        user_id: userId,
        date: dateKey,
        slot,
        type: draft.type ?? 'workout',
        title: draft.title.trim(),
        workout_id: draft.workout_id ?? null,
        workout_type: draft.workout_type ?? null,
        target_load: draft.target_load ?? null,
        target_duration_min: draft.target_duration_min ?? null,
        target_distance_km: draft.target_distance_km ?? null,
        notes: draft.notes ?? null,
        coach_rationale: draft.coach_rationale ?? null,
        details: draft.details ?? null,
        status: 'planned',
        source: draft.source ?? 'manual',
        plan_id: draft.plan_id ?? null,
        generation_id: draft.generation_id ?? null,
        // Athlete-created: a generator must never overwrite it.
        pinned: draft.source === 'manual' || !draft.source,
      })
      .select()
      .single();

    if (error) throw error;
    return { success: true, data: data as CalendarEntryRow };
  } catch (err) {
    const message = (err as Error)?.message ?? 'Could not add to the calendar';
    console.error('createEntry failed', message);
    return fail(message);
  }
}

/**
 * Write a whole plan's worth of sessions in one round trip.
 *
 * Every plan-activation path used to build a `planned_workouts` row array by
 * hand — plan_id, week_number, day_of_week, duration_minutes, target_tss,
 * completed — and insert it. Six copies of the same mapping, each with its own
 * drift. This is the one place a template becomes calendar entries.
 *
 * NON-DESTRUCTIVE, like the coach's generate_block: a day that already holds an
 * entry is SKIPPED, not stacked on and not overwritten. Activating a plan over
 * a calendar the athlete has already shaped therefore fills the gaps rather
 * than burying their work, and re-running an activation is safe. Skips are
 * counted so the caller can say what it did.
 *
 * UNPINNED, because a generator wrote them. Pinning is the athlete's act; see
 * updateEntry and the note at the top of this file.
 *
 * The plan lands in `plan_id` as PROVENANCE. Nothing reads an entry through its
 * plan any more, and nothing should: that ownership is what made a December
 * race unschedulable.
 */
export async function insertSessions(
  userId: string,
  drafts: Array<EntryDraft & { date: string }>,
  options: { source?: string; planId?: string | null; generationId?: string | null } = {},
): Promise<MutationResult<{ inserted: number; skipped: number }>> {
  if (!userId) return { success: false, error: 'Not signed in' };
  const usable = (drafts ?? []).filter((d) => d?.title?.trim() && toDateKey(d.date));
  if (usable.length === 0) return { success: true, data: { inserted: 0, skipped: 0 } };

  const dateKeys = usable.map((d) => toDateKey(d.date) as string);
  const from = dateKeys.reduce((a, b) => (b < a ? b : a));
  const to = dateKeys.reduce((a, b) => (b > a ? b : a));

  try {
    const { data: existing, error: readError } = await supabase
      .from('calendar_entries')
      .select('date')
      .eq('user_id', userId)
      .gte('date', from)
      .lte('date', to);
    if (readError) throw readError;

    const occupied = new Set((existing ?? []).map((r) => r.date as string));
    const rows: Array<Record<string, unknown>> = [];
    let skipped = 0;

    for (const draft of usable) {
      const dateKey = toDateKey(draft.date) as string;
      if (occupied.has(dateKey)) {
        skipped += 1;
        continue;
      }
      // Claim the day so two drafts on the same date cannot collide on slot 0.
      occupied.add(dateKey);
      rows.push({
        id: crypto.randomUUID(),
        user_id: userId,
        date: dateKey,
        slot: 0,
        type: draft.type ?? 'workout',
        title: draft.title.trim(),
        workout_id: draft.workout_id ?? null,
        workout_type: draft.workout_type ?? null,
        target_load: draft.target_load ?? null,
        target_duration_min: draft.target_duration_min ?? null,
        target_distance_km: draft.target_distance_km ?? null,
        notes: draft.notes ?? null,
        coach_rationale: draft.coach_rationale ?? null,
        details: draft.details ?? null,
        status: 'planned',
        source: options.source ?? draft.source ?? 'plan',
        plan_id: options.planId ?? draft.plan_id ?? null,
        generation_id: options.generationId ?? draft.generation_id ?? null,
        pinned: false,
      });
    }

    if (rows.length > 0) {
      const { error } = await supabase.from('calendar_entries').insert(rows);
      if (error) throw error;
    }
    return { success: true, data: { inserted: rows.length, skipped } };
  } catch (err) {
    const message = (err as Error)?.message ?? 'Could not write the plan to the calendar';
    console.error('insertSessions failed', message);
    return { success: false, error: message };
  }
}

/** Edit an entry in place. Any athlete edit pins it. */
export async function updateEntry(
  userId: string,
  entryId: string,
  patch: Partial<EntryDraft> & { status?: CalendarEntryStatus },
): Promise<MutationResult> {
  if (!userId) return fail('Not signed in');
  if (!entryId) return fail('Missing entry');

  try {
    const { data, error } = await supabase
      .from('calendar_entries')
      .update({ ...patch, pinned: true })
      .eq('id', entryId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;
    return { success: true, data: data as CalendarEntryRow };
  } catch (err) {
    const message = (err as Error)?.message ?? 'Could not update the entry';
    console.error('updateEntry failed', message);
    return fail(message);
  }
}

/**
 * Move an entry to another day, taking the next free slot there.
 *
 * The vacated slot is simply left empty rather than renumbering the old day.
 * Slots are an ordering device, not an index — leaving a hole is invisible to
 * every reader, and renumbering would rewrite rows the athlete did not touch.
 *
 * The original date is recorded in `provenance` so the move stays auditable,
 * the way `original_scheduled_date` did on the old table.
 */
export async function moveEntry(
  userId: string,
  entryId: string,
  toDate: string,
): Promise<MutationResult> {
  const targetKey = toDateKey(toDate);
  if (!userId) return fail('Not signed in');
  if (!entryId) return fail('Missing entry');
  if (!targetKey) return fail('A valid target date is required');

  try {
    const { data: existing, error: readError } = await supabase
      .from('calendar_entries')
      .select('id, date, slot, provenance')
      .eq('id', entryId)
      .eq('user_id', userId)
      .maybeSingle();

    if (readError) throw readError;
    if (!existing) return fail('That entry no longer exists');
    if (existing.date === targetKey) return { success: true, data: existing as CalendarEntryRow };

    const slot = await nextFreeSlot(userId, targetKey);
    const provenance = {
      ...(existing.provenance ?? {}),
      // Keep the FIRST original, so repeated moves still point at where it began.
      original_date: (existing.provenance as { original_date?: string })?.original_date ?? existing.date,
    };

    const { data, error } = await supabase
      .from('calendar_entries')
      .update({ date: targetKey, slot, provenance, pinned: true })
      .eq('id', entryId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;
    return { success: true, data: data as CalendarEntryRow };
  } catch (err) {
    const message = (err as Error)?.message ?? 'Could not move the entry';
    console.error('moveEntry failed', message);
    return fail(message);
  }
}

/**
 * Exchange two entries' dates.
 *
 * THE GESTURE THIS REBUILD EXISTS FOR. "Move the long ride to Sunday and the
 * threshold session to Saturday" is the single most common thing an athlete
 * does to a training week, and until now it was the one thing the calendar
 * could not do:
 *
 *   - On `planned_workouts`, `UNIQUE (plan_id, scheduled_date)` makes a direct
 *     two-row swap collide with itself, so it needed a three-write
 *     park/move/restore with rollback (api/coach.js:229, mirrored in
 *     check-in-apply.js and deviation-resolve.js).
 *   - Through the coach it counted as two edits, tripped the multi-entry rule,
 *     and landed in an approval queue that had no accept button.
 *
 * Here it is two plain updates. The key is `(user_id, date, slot)`, so the two
 * rows never contend for the same identity: A takes B's (date, slot) and B
 * takes A's, and neither slot is ever occupied twice.
 *
 * Both entries are pinned afterwards — a swap is a decision about both days,
 * and a generator must not undo either half of it.
 */
export async function swapEntries(
  userId: string,
  entryIdA: string,
  entryIdB: string,
): Promise<MutationResult> {
  if (!userId) return fail('Not signed in');
  if (!entryIdA || !entryIdB) return fail('Two entries are required to swap');
  if (entryIdA === entryIdB) return fail('Cannot swap an entry with itself');

  try {
    const { data: rows, error: readError } = await supabase
      .from('calendar_entries')
      .select('id, date, slot, provenance')
      .in('id', [entryIdA, entryIdB])
      .eq('user_id', userId);

    if (readError) throw readError;
    const a = (rows ?? []).find((r) => r.id === entryIdA);
    const b = (rows ?? []).find((r) => r.id === entryIdB);
    if (!a || !b) return fail('One of those entries no longer exists');

    const keepOrigin = (row: { date: string; provenance: unknown }) => ({
      ...((row.provenance as Record<string, unknown>) ?? {}),
      original_date:
        (row.provenance as { original_date?: string })?.original_date ?? row.date,
    });

    // A leaves first, so its (date, slot) is free before B claims it. Without
    // the park the second update would collide with the first on the way past.
    const PARK = -1;
    const park = await supabase
      .from('calendar_entries')
      .update({ slot: PARK })
      .eq('id', a.id).eq('user_id', userId);
    if (park.error) throw park.error;

    const moveB = await supabase
      .from('calendar_entries')
      .update({ date: a.date, slot: a.slot, provenance: keepOrigin(b), pinned: true })
      .eq('id', b.id).eq('user_id', userId);
    if (moveB.error) throw moveB.error;

    const moveA = await supabase
      .from('calendar_entries')
      .update({ date: b.date, slot: b.slot, provenance: keepOrigin(a), pinned: true })
      .eq('id', a.id).eq('user_id', userId);
    if (moveA.error) throw moveA.error;

    return { success: true };
  } catch (err) {
    const message = (err as Error)?.message ?? 'Could not swap those entries';
    console.error('swapEntries failed', message);
    return fail(message);
  }
}

/** Remove an entry outright. */
export async function deleteEntry(userId: string, entryId: string): Promise<MutationResult<null>> {
  if (!userId) return { success: false, error: 'Not signed in' };
  if (!entryId) return { success: false, error: 'Missing entry' };

  try {
    const { error } = await supabase
      .from('calendar_entries')
      .delete()
      .eq('id', entryId)
      .eq('user_id', userId);

    if (error) throw error;
    return { success: true, data: null };
  } catch (err) {
    const message = (err as Error)?.message ?? 'Could not remove the entry';
    console.error('deleteEntry failed', message);
    return { success: false, error: message };
  }
}

/**
 * Link a completed activity to the entry it satisfies.
 *
 * One call rather than setEntryStatus plus an update, because the four things
 * it writes are one fact: this ride happened, it was this session, and here is
 * what it actually cost. Splitting them is how `completed`, `status` and
 * `completed_at` drifted apart on the old table.
 *
 * PINS the entry. A session backed by a real ride is not something a generator
 * or the coach may silently reshape — and adjudicateOps already treats a done
 * entry as needing the athlete.
 */
export async function linkEntryToActivity(
  userId: string,
  entryId: string,
  link: {
    activityId: string;
    actualLoad?: number | null;
    actualDurationMin?: number | null;
    actualDistanceKm?: number | null;
    /** When the ride happened. Defaults to now. */
    completedAt?: string | null;
  },
): Promise<MutationResult> {
  if (!userId) return fail('Not signed in');
  if (!entryId) return fail('Missing entry');
  if (!link?.activityId) return fail('Missing activity');

  try {
    const { data, error } = await supabase
      .from('calendar_entries')
      .update({
        activity_id: link.activityId,
        status: 'done',
        completed_at: link.completedAt ?? new Date().toISOString(),
        actual_load: link.actualLoad ?? null,
        actual_duration_min: link.actualDurationMin ?? null,
        actual_distance_km: link.actualDistanceKm ?? null,
        skipped_reason: null,
        pinned: true,
      })
      .eq('id', entryId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;
    return { success: true, data: data as CalendarEntryRow };
  } catch (err) {
    const message = (err as Error)?.message ?? 'Could not link the activity';
    console.error('linkEntryToActivity failed', message);
    return fail(message);
  }
}

/**
 * Count, then remove, every not-yet-done entry from a date forward.
 *
 * The "clear my calendar" escape hatch. Deliberately two functions rather than
 * a delete that reports its own count: the athlete is shown the number BEFORE
 * confirming, and a count computed by a different query than the delete would
 * be a lie waiting to happen — so `countUpcomingClearable` and
 * `clearUpcomingEntries` share one predicate, defined once below.
 *
 * Completed sessions and past days are never touched: they are history, and
 * the load distribution TFI/AFI derive from is built on them.
 */
function clearableFrom(fromDate: string) {
  return supabase
    .from('calendar_entries')
    .select('id', { count: 'exact', head: true })
    .gte('date', fromDate)
    .neq('status', 'done');
}

export async function countUpcomingClearable(
  userId: string,
  fromDate: string,
): Promise<number> {
  if (!userId) return 0;
  const { count, error } = await clearableFrom(fromDate).eq('user_id', userId);
  if (error) {
    console.error('countUpcomingClearable failed', error.message);
    return 0;
  }
  return count ?? 0;
}

export async function clearUpcomingEntries(
  userId: string,
  fromDate: string,
): Promise<MutationResult<null>> {
  if (!userId) return { success: false, error: 'Not signed in' };
  const dateKey = toDateKey(fromDate);
  if (!dateKey) return { success: false, error: 'A valid date is required' };

  try {
    const { error } = await supabase
      .from('calendar_entries')
      .delete()
      .eq('user_id', userId)
      .gte('date', dateKey)
      .neq('status', 'done');

    if (error) throw error;
    return { success: true, data: null };
  } catch (err) {
    const message = (err as Error)?.message ?? 'Could not clear the calendar';
    console.error('clearUpcomingEntries failed', message);
    return { success: false, error: message };
  }
}

/**
 * Mark an entry done / skipped / planned.
 *
 * `completed_at` is kept consistent with `status` here rather than left to
 * callers — on the old table `completed`, `status` and `completed_at` were
 * three separate columns that drifted apart.
 */
export async function setEntryStatus(
  userId: string,
  entryId: string,
  status: CalendarEntryStatus,
  options: { activityId?: string | null; skippedReason?: string | null } = {},
): Promise<MutationResult> {
  if (!userId) return fail('Not signed in');
  if (!entryId) return fail('Missing entry');

  const patch: Record<string, unknown> = {
    status,
    completed_at: status === 'done' ? new Date().toISOString() : null,
    pinned: true,
  };
  if (status === 'skipped') patch.skipped_reason = options.skippedReason ?? null;
  if (options.activityId !== undefined) patch.activity_id = options.activityId;

  try {
    const { data, error } = await supabase
      .from('calendar_entries')
      .update(patch)
      .eq('id', entryId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;
    return { success: true, data: data as CalendarEntryRow };
  } catch (err) {
    const message = (err as Error)?.message ?? 'Could not update the entry';
    console.error('setEntryStatus failed', message);
    return fail(message);
  }
}
