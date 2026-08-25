/**
 * Server-side executor for `calendar_change`.
 *
 * The write half of the coach's calendar access. `calendarChangeTool.js`
 * decides WHETHER a validated operation list runs; this runs it.
 *
 * Deliberately a separate module from `src/lib/calendar/calendarMutations.ts`
 * rather than an import of it. That file binds the BROWSER Supabase singleton,
 * which carries the athlete's session and is subject to RLS; this one runs on
 * the service-role client, where RLS does not apply and `user_id` scoping is
 * therefore load-bearing rather than belt-and-braces. Every statement below
 * filters on `user_id`, and every id the model supplied has already been
 * resolved through a handle map built from that same athlete's rows.
 *
 * Uses the shared admin singleton per CLAUDE.md — there is no `createClient`
 * in this file, and there must not be.
 */

import { randomUUID } from 'node:crypto';
import { getSupabaseAdmin } from './supabaseAdmin.js';

/** Fields an op may write onto an entry. Anything else the model sends is dropped. */
const WRITABLE = [
  'type', 'title', 'workout_id', 'workout_type',
  'target_load', 'target_duration_min', 'target_distance_km', 'notes',
];

/** Pull the writable subset out of a raw op. */
function draftFrom(op) {
  const draft = {};
  for (const key of WRITABLE) {
    if (op[key] !== undefined) draft[key] = op[key];
  }
  return draft;
}

/**
 * Lowest free slot on a day, honouring `UNIQUE (user_id, date, slot)`.
 *
 * `skipEntryId` exists for `move`: an entry moving to a date it already
 * occupies must not treat its own row as an obstacle and step to slot 1.
 */
async function nextFreeSlot(supabase, userId, dateKey, skipEntryId = null) {
  const { data, error } = await supabase
    .from('calendar_entries')
    .select('id, slot')
    .eq('user_id', userId)
    .eq('date', dateKey);

  if (error) throw new Error(`Could not read slots for ${dateKey}: ${error.message}`);

  const taken = new Set(
    (data || []).filter((r) => r.id !== skipEntryId).map((r) => r.slot)
  );
  let slot = 0;
  while (taken.has(slot)) slot += 1;
  return slot;
}

/**
 * The fields worth capturing before a change, for the undo token and for the
 * "before" side of a proposal's diff card.
 */
export function snapshot(entry) {
  if (!entry) return null;
  const keep = [
    'id', 'date', 'slot', 'type', 'title', 'workout_id', 'workout_type',
    'target_load', 'target_duration_min', 'target_distance_km',
    'status', 'notes', 'coach_rationale', 'pinned',
  ];
  return Object.fromEntries(keep.map((k) => [k, entry[k] ?? null]));
}

/**
 * Execute one validated, adjudicated operation list.
 *
 * Ops run in order and independently: one failure does NOT roll back the ones
 * before it. That is a deliberate choice for a list that has already been
 * validated whole — a create that collides on a slot should not un-create the
 * nine races that landed before it. The result reports every op's fate, and
 * `undo` carries enough to reverse the ones that succeeded.
 *
 * @param {string} userId  Verified athlete id — NEVER taken from model output.
 * @param {Array}  resolved  From validateOps: ops with `.entry` attached.
 * @param {object} [opts]
 * @param {string} [opts.source='coach']  Provenance stamp on created rows.
 * @returns {Promise<{success: boolean, applied: number, failed: number,
 *                    results: Array, undo: Array, error?: string}>}
 */
export async function applyCalendarOps(userId, resolved, opts = {}) {
  if (!userId) return { success: false, applied: 0, failed: 0, results: [], undo: [], error: 'Missing user' };

  const supabase = getSupabaseAdmin();
  const source = opts.source || 'coach';
  const results = [];
  const undo = [];

  for (const op of resolved) {
    try {
      if (op.op === 'create') {
        const slot = await nextFreeSlot(supabase, userId, op.date);
        const id = randomUUID();
        const { error } = await supabase.from('calendar_entries').insert({
          id,
          user_id: userId,
          date: op.date,
          slot,
          type: op.type || 'workout',
          title: String(op.title).trim(),
          workout_id: op.workout_id ?? null,
          workout_type: op.workout_type ?? null,
          target_load: op.target_load ?? null,
          target_duration_min: op.target_duration_min ?? null,
          target_distance_km: op.target_distance_km ?? null,
          notes: op.notes ?? null,
          coach_rationale: op.reason ?? null,
          status: 'planned',
          source,
          // A coach entry the athlete has not touched is NOT pinned: a
          // generator may still reshape it. Pinning happens when a human
          // decision is expressed — the athlete editing it, or approving a
          // proposal that changes it.
          pinned: false,
        });
        if (error) throw error;
        results.push({ op: 'create', handle: null, id, date: op.date, ok: true });
        undo.push({ op: 'delete', id });
        continue;
      }

      const entry = op.entry;
      const before = snapshot(entry);

      if (op.op === 'delete') {
        const { error } = await supabase
          .from('calendar_entries')
          .delete()
          .eq('user_id', userId)
          .eq('id', entry.id);
        if (error) throw error;
        results.push({ op: 'delete', handle: op.handle, id: entry.id, ok: true });
        undo.push({ op: 'restore', row: before });
        continue;
      }

      let patch;
      if (op.op === 'move') {
        const slot = await nextFreeSlot(supabase, userId, op.date, entry.id);
        patch = { date: op.date, slot };
      } else if (op.op === 'set_status') {
        patch = {
          status: op.status,
          completed_at: op.status === 'done' ? new Date().toISOString() : null,
        };
      } else {
        patch = draftFrom(op);
      }

      // An approved coach change is a human decision about this entry, so it
      // pins — same contract as an athlete edit. Creates above deliberately
      // do not.
      const { error } = await supabase
        .from('calendar_entries')
        .update({ ...patch, coach_rationale: op.reason ?? entry.coach_rationale ?? null, pinned: true })
        .eq('user_id', userId)
        .eq('id', entry.id);
      if (error) throw error;

      results.push({ op: op.op, handle: op.handle, id: entry.id, ok: true });
      undo.push({ op: 'restore', row: before });
    } catch (err) {
      const message = err?.message || String(err);
      console.error(`calendar_change ${op.op} failed:`, message);
      results.push({ op: op.op, handle: op.handle ?? null, ok: false, error: message });
    }
  }

  const applied = results.filter((r) => r.ok).length;
  const failed = results.length - applied;
  return { success: failed === 0, applied, failed, results, undo };
}

/**
 * Persist an operation list the server declined to apply.
 *
 * Targets are stored as CONCRETE entry ids resolved right now, not as
 * selectors. `check-in-apply.js:297` resolves `'next_quality'` at apply time,
 * so with any approval delay the athlete accepts one session and a different
 * one changes; pinning the ids here is the fix.
 *
 * @returns {Promise<{success: boolean, proposalId?: string, error?: string}>}
 */
export async function persistProposal(userId, resolved, verdict, summary, conversationId = null) {
  const supabase = getSupabaseAdmin();

  const ops = resolved.map((op) => ({
    op: op.op,
    entry_id: op.entry?.id ?? null,
    handle: op.handle ?? null,
    before: snapshot(op.entry),
    after: op.op === 'move'
      ? { date: op.date }
      : op.op === 'set_status'
        ? { status: op.status }
        : op.op === 'delete'
          ? null
          : draftFrom(op),
    reason: op.reason ?? null,
  }));

  const { data, error } = await supabase
    .from('calendar_change_proposals')
    .insert({
      user_id: userId,
      reason_code: verdict.reasonCode,
      summary: summary || null,
      ops,
      conversation_id: conversationId,
    })
    .select('id')
    .single();

  if (error) {
    console.error('persistProposal failed:', error.message);
    return { success: false, error: error.message };
  }
  return { success: true, proposalId: data.id };
}
