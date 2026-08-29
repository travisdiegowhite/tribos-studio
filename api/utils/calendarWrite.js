/**
 * The server's write path for the training calendar.
 *
 * Counterpart to `src/lib/calendar/calendarMutations.ts` and sibling to
 * `calendarRead.js`, and separate from both for the same reason: this runs on
 * the SERVICE-ROLE client, where RLS does not apply, so every statement below
 * filters on `user_id` and that filter is the security boundary rather than a
 * second belt.
 *
 * `calendarChangeApply.js` does the same job for the coach's `calendar_change`
 * tool. This module exists for the other server writers — the check-in engine,
 * the deviation resolver, the correction applier — which express a small fixed
 * set of mutations rather than a validated op list.
 *
 * Uses the shared admin singleton per CLAUDE.md — there is no `createClient` in
 * this file, and there must not be.
 */

import { randomUUID } from 'node:crypto';
import { getSupabaseAdmin } from './supabaseAdmin.js';

/** Fields a server writer may set on an entry. Anything else is dropped. */
const WRITABLE = [
  'type', 'title', 'workout_id', 'workout_type',
  'target_load', 'target_duration_min', 'target_distance_km', 'notes',
  'coach_rationale',
];

function draftFrom(patch) {
  const draft = {};
  for (const key of WRITABLE) {
    if (patch[key] !== undefined) draft[key] = patch[key];
  }
  return draft;
}

/**
 * Lowest free slot on a day, honouring `UNIQUE (user_id, date, slot)`.
 *
 * `skipEntryId` exists for a move onto a date the entry already occupies: it
 * must not treat its own row as an obstacle and step to slot 1.
 */
export async function nextFreeSlot(supabase, userId, dateKey, skipEntryId = null) {
  const { data, error } = await supabase
    .from('calendar_entries')
    .select('id, slot')
    .eq('user_id', userId)
    .eq('date', dateKey);
  if (error) throw new Error(`Could not read slots for ${dateKey}: ${error.message}`);

  const taken = new Set((data || []).filter((r) => r.id !== skipEntryId).map((r) => r.slot));
  let slot = 0;
  while (taken.has(slot)) slot += 1;
  return slot;
}

/** Edit an entry in place. Does NOT pin — pinning is the athlete's act. */
export async function updateEntry(userId, entryId, patch) {
  if (!userId || !entryId) return { success: false, error: 'Missing user or entry' };
  const draft = draftFrom(patch);
  if (Object.keys(draft).length === 0) return { success: true, data: null };

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('calendar_entries')
    .update(draft)
    .eq('user_id', userId)
    .eq('id', entryId)
    .select()
    .single();

  if (error) {
    console.error('updateEntry failed:', error.message);
    return { success: false, error: error.message };
  }
  return { success: true, data };
}

/** Move an entry to another day, taking the next free slot there. */
export async function moveEntry(userId, entryId, toDate) {
  if (!userId || !entryId || !toDate) return { success: false, error: 'Missing user, entry or date' };

  const supabase = getSupabaseAdmin();
  try {
    const slot = await nextFreeSlot(supabase, userId, toDate, entryId);
    const { data, error } = await supabase
      .from('calendar_entries')
      .update({ date: toDate, slot })
      .eq('user_id', userId)
      .eq('id', entryId)
      .select()
      .single();
    if (error) throw error;
    return { success: true, data };
  } catch (err) {
    console.error('moveEntry failed:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Exchange two entries' days.
 *
 * `UNIQUE (user_id, date, slot)` makes a direct two-update swap collide with
 * itself, so A is parked on a sentinel slot first. That is the ONLY reason for
 * the third write — on the old table the same operation needed a park/move/
 * restore over the DATE, with rollback, because the key was
 * `(plan_id, scheduled_date)`; here the dates are simply exchanged.
 */
export async function swapEntries(userId, entryIdA, entryIdB) {
  if (!userId || !entryIdA || !entryIdB) return { success: false, error: 'Missing user or entries' };
  if (entryIdA === entryIdB) return { success: false, error: 'Cannot swap an entry with itself' };

  const supabase = getSupabaseAdmin();
  try {
    const { data: rows, error: readError } = await supabase
      .from('calendar_entries')
      .select('id, date, slot')
      .eq('user_id', userId)
      .in('id', [entryIdA, entryIdB]);
    if (readError) throw readError;

    const a = (rows || []).find((r) => r.id === entryIdA);
    const b = (rows || []).find((r) => r.id === entryIdB);
    if (!a || !b) return { success: false, error: 'One of those sessions is no longer on the calendar' };

    const park = async (id, patch) => {
      const { error } = await supabase
        .from('calendar_entries')
        .update(patch)
        .eq('user_id', userId)
        .eq('id', id);
      if (error) throw error;
    };

    // Slot -1 cannot collide: every real entry allocates from 0 upward.
    await park(entryIdA, { slot: -1 });
    await park(entryIdB, { date: a.date, slot: a.slot });
    await park(entryIdA, { date: b.date, slot: b.slot });

    return { success: true, data: { a: { id: entryIdA, date: b.date }, b: { id: entryIdB, date: a.date } } };
  } catch (err) {
    console.error('swapEntries failed:', err.message);
    return { success: false, error: err.message };
  }
}

/** Remove an entry outright. */
export async function deleteEntry(userId, entryId) {
  if (!userId || !entryId) return { success: false, error: 'Missing user or entry' };

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('calendar_entries')
    .delete()
    .eq('user_id', userId)
    .eq('id', entryId);

  if (error) {
    console.error('deleteEntry failed:', error.message);
    return { success: false, error: error.message };
  }
  return { success: true, data: null };
}

/** Add one entry, taking the next free slot on its day. */
export async function createEntry(userId, date, draft, options = {}) {
  if (!userId || !date || !draft?.title) return { success: false, error: 'Missing user, date or title' };

  const supabase = getSupabaseAdmin();
  try {
    const slot = await nextFreeSlot(supabase, userId, date);
    const id = randomUUID();
    const { data, error } = await supabase
      .from('calendar_entries')
      .insert({
        id,
        user_id: userId,
        date,
        slot,
        type: draft.type ?? 'workout',
        title: String(draft.title).trim(),
        ...draftFrom(draft),
        status: 'planned',
        source: options.source ?? 'coach',
        plan_id: options.planId ?? null,
        pinned: false,
      })
      .select()
      .single();
    if (error) throw error;
    return { success: true, data };
  } catch (err) {
    console.error('createEntry failed:', err.message);
    return { success: false, error: err.message };
  }
}
