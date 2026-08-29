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
