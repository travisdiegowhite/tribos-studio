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
import { writeWithSportFallback } from './calendarSportColumn.js';

/** Fields a server writer may set on an entry. Anything else is dropped. */
const WRITABLE = [
  'type', 'title', 'workout_id', 'workout_type',
  'target_load', 'target_duration_min', 'target_distance_km', 'notes',
  'coach_rationale',
  // `details.prescription` — the session's interval structure. Writers build
  // it through `prescription.js`; this list only lets it through.
  'details',
  // cycling | running | multi | other (migration 134). Written through
  // writeWithSportFallback so an unapplied migration cannot fail the write.
  'sport',
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

const ACTUAL_LOAD_CHUNK = 200;

/**
 * Put the server's per-activity RSS on every calendar entry linked to one of
 * those activities, wherever it differs.
 *
 * WHY. The calendar's "actual" used to be whatever the browser computed at
 * link time (useActivityAutoLink): average power instead of normalized power
 * for rides, a flat 50 RSS/h for runs. The fitness chart used the server
 * scorer. The same ride read 41 on the calendar and 49 on the chart, and a
 * hard run 26 against ~43. The recompute is the one scorer; this makes the
 * calendar show its number.
 *
 * Takes the client as a parameter (like nextFreeSlot) so the recompute's
 * injected client is the one used. Never touches `pinned` or `status`: this is
 * bookkeeping, not anyone's decision about the session.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {Map<string, number>} rssByActivityId
 * @returns {Promise<{updated: number}>}
 */
export async function syncActualLoads(supabase, userId, rssByActivityId) {
  if (!userId || !rssByActivityId || rssByActivityId.size === 0) return { updated: 0 };
  const ids = [...rssByActivityId.keys()];
  let updated = 0;
  for (let i = 0; i < ids.length; i += ACTUAL_LOAD_CHUNK) {
    const chunk = ids.slice(i, i + ACTUAL_LOAD_CHUNK);
    const { data, error } = await supabase
      .from('calendar_entries')
      .select('id, activity_id, actual_load')
      .eq('user_id', userId)
      .in('activity_id', chunk);
    if (error) throw new Error(`calendar actual-load read failed: ${error.message}`);
    for (const row of data ?? []) {
      const rss = rssByActivityId.get(row.activity_id);
      if (rss == null) continue;
      if (row.actual_load != null && Math.round(Number(row.actual_load)) === rss) continue;
      const { error: upErr } = await supabase
        .from('calendar_entries')
        .update({ actual_load: rss })
        .eq('user_id', userId)
        .eq('id', row.id);
      if (upErr) throw new Error(`calendar actual-load write failed: ${upErr.message}`);
      updated += 1;
    }
  }
  return { updated };
}

/**
 * Mark an entry done by the activity that completed it — the server half of
 * the calendar's auto-link (useActivityAutoLink is the browser half, and only
 * runs while the calendar is open). Writes the forward link only:
 * `activities.matched_planned_workout_id` still has a foreign key to the
 * retired planned_workouts table, so it cannot point at a calendar entry.
 * Only an unlinked entry is touched, so an athlete's own link is never moved.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @returns {Promise<{linked: boolean}>}
 */
export async function linkEntryToActivityServer(supabase, userId, entryId, activity) {
  if (!userId || !entryId || !activity?.id) return { linked: false };
  const load = Number(activity.rss ?? activity.tss);
  const minutes = Number(activity.moving_time ?? activity.elapsed_time) / 60;
  const { data, error } = await supabase
    .from('calendar_entries')
    .update({
      activity_id: activity.id,
      status: 'done',
      completed_at: new Date().toISOString(),
      ...(Number.isFinite(load) && load > 0 ? { actual_load: Math.round(load) } : {}),
      ...(Number.isFinite(minutes) && minutes > 0 ? { actual_duration_min: Math.round(minutes) } : {}),
    })
    .eq('user_id', userId)
    .eq('id', entryId)
    .is('activity_id', null)
    .select('id');
  if (error) throw new Error(`calendar link failed: ${error.message}`);
  return { linked: (data ?? []).length > 0 };
}

/** Edit an entry in place. Does NOT pin — pinning is the athlete's act. */
export async function updateEntry(userId, entryId, patch) {
  if (!userId || !entryId) return { success: false, error: 'Missing user or entry' };
  const draft = draftFrom(patch);
  if (Object.keys(draft).length === 0) return { success: true, data: null };

  const supabase = getSupabaseAdmin();
  const { data, error } = await writeWithSportFallback(draft, (payload) =>
    supabase
      .from('calendar_entries')
      .update(payload)
      .eq('user_id', userId)
      .eq('id', entryId)
      .select()
      .single(),
  );

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
    const row = {
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
    };
    const { data, error } = await writeWithSportFallback(row, (payload) =>
      supabase.from('calendar_entries').insert(payload).select().single(),
    );
    if (error) throw error;
    return { success: true, data };
  } catch (err) {
    console.error('createEntry failed:', err.message);
    return { success: false, error: err.message };
  }
}
