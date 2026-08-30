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
import { WEEKDAYS } from './calendarChangeTool.js';

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
 * Expand a weekly pattern across a date range into concrete entries.
 *
 * THE REASON THIS EXISTS. The coach's reply is capped at 4096 tokens (often
 * 1024). A cyclocross season is ~14 weeks at ~5 sessions a week — around 70
 * operations at ~80 tokens each, so roughly 5,600 tokens of tool input. It
 * does not fit. On 2026-08-25 the athlete asked for "my cyclocross season,
 * planned out with training"; the coach emitted the nine races, ran out of
 * room, and delivered no training at all. Nothing errored. It just quietly
 * did half the job.
 *
 * One compact pattern plus a range is ~200 tokens for the same season. That is
 * the whole point: the SERVER does the expansion, so the size of a training
 * block is bounded by the calendar rather than by the model's output budget.
 *
 * NON-DESTRUCTIVE BY CONSTRUCTION. A day that already holds a workout or a
 * race is skipped, not stacked on and not overwritten. Training therefore
 * fills in around a race season rather than burying it, and re-running a
 * generator is safe. Skips are reported so the coach can say what it did.
 *
 * @param {Array} existingByDate  Map-like of dateKey → true for occupied days.
 * @returns {{entries: Array, skipped: Array}}
 */
export function expandBlock(op, occupiedDates = new Set()) {
  const entries = [];
  const skipped = [];

  const start = Date.parse(`${op.from}T00:00:00Z`);
  const end = Date.parse(`${op.to}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return { entries, skipped };

  const byDay = new Map();
  for (const d of op.weekly_pattern || []) {
    if (!byDay.has(d.day)) byDay.set(d.day, []);
    byDay.get(d.day).push(d);
  }

  const progression = Number(op.load_progression) || 0;

  // Step day by day in UTC so DST can neither add nor drop one.
  for (let t = start, dayIndex = 0; t <= end; t += 86400000, dayIndex += 1) {
    const date = new Date(t);
    const dateKey = date.toISOString().slice(0, 10);
    // getUTCDay: 0=Sun. WEEKDAYS is mon-first.
    const dow = WEEKDAYS[(date.getUTCDay() + 6) % 7];
    const sessions = byDay.get(dow);
    if (!sessions) continue;

    if (occupiedDates.has(dateKey)) {
      skipped.push({ date: dateKey, reason: 'day already has an entry' });
      continue;
    }

    const weekIndex = Math.floor(dayIndex / 7);
    for (const session of sessions) {
      const base = Number(session.target_load);
      const load = Number.isFinite(base)
        ? Math.round(base * (1 + progression * weekIndex))
        : null;
      entries.push({
        date: dateKey,
        title: String(session.title).trim(),
        type: 'workout',
        workout_id: session.workout_id ?? null,
        workout_type: session.workout_type ?? null,
        target_load: load,
        target_duration_min: session.target_duration_min ?? null,
        target_distance_km: session.target_distance_km ?? null,
        notes: session.notes ?? null,
      });
    }
    // One session per day from a pattern; a genuine double day is a `create`.
    occupiedDates.add(dateKey);
  }

  return { entries, skipped };
}

/** Every date in [from, to] this athlete already has an entry on. */
async function occupiedDatesIn(supabase, userId, fromKey, toKey) {
  const { data, error } = await supabase
    .from('calendar_entries')
    .select('date')
    .eq('user_id', userId)
    .gte('date', fromKey)
    .lte('date', toKey);
  if (error) throw new Error(`Could not read the block's range: ${error.message}`);
  return new Set((data || []).map((r) => r.date));
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
 * @param {boolean} [opts.pin=false]  Whether this run represents a HUMAN
 *   decision about the entries it changes, and should therefore pin them.
 *   False for a coach change the server applied on its own authority; true
 *   only when the athlete approved a proposal.
 * @returns {Promise<{success: boolean, applied: number, failed: number,
 *                    results: Array, undo: Array, error?: string}>}
 */
export async function applyCalendarOps(userId, resolved, opts = {}) {
  if (!userId) return { success: false, applied: 0, failed: 0, results: [], undo: [], error: 'Missing user' };

  const supabase = getSupabaseAdmin();
  const source = opts.source || 'coach';
  const pin = opts.pin === true;
  const results = [];
  const undo = [];

  for (const op of resolved) {
    try {
      if (op.op === 'generate_block') {
        const occupied = await occupiedDatesIn(supabase, userId, op.from, op.to);
        const { entries, skipped } = expandBlock(op, occupied);

        if (entries.length === 0) {
          results.push({
            op: 'generate_block', handle: null, ok: true, created: 0, skipped: skipped.length,
            note: 'Every day in that range already had an entry; nothing was added.',
          });
          continue;
        }

        // Batch insert: one round trip for a season, not seventy. Slot is
        // always 0 because the expander only writes to unoccupied days.
        const rows = entries.map((e) => ({
          id: randomUUID(),
          user_id: userId,
          slot: 0,
          status: 'planned',
          source,
          coach_rationale: op.reason ?? null,
          pinned: false,
          ...e,
        }));
        const { error } = await supabase.from('calendar_entries').insert(rows);
        if (error) throw error;

        results.push({
          op: 'generate_block', handle: null, ok: true,
          created: rows.length, skipped: skipped.length,
          from: op.from, to: op.to,
          skipped_dates: skipped.slice(0, 10).map((s2) => s2.date),
        });
        undo.push({ op: 'delete_many', ids: rows.map((r) => r.id) });
        continue;
      }

      if (op.op === 'create') {
        // DEDUPE. Slot allocation makes a second entry on a day legitimate —
        // that is how doubles and bricks work — but it also means a repeated
        // create silently stacks. On 2026-08-27 the athlete asked for their
        // cyclocross season three times, the coach truncated and retried each
        // time, and they ended up with three copies of all nine races at slots
        // 0, 1 and 2. The calendar should be idempotent for the same thing on
        // the same day: same date, same type, same title is the SAME entry.
        const { data: dupes, error: dupeError } = await supabase
          .from('calendar_entries')
          .select('id, title')
          .eq('user_id', userId)
          .eq('date', op.date)
          .eq('type', op.type || 'workout');
        if (dupeError) throw dupeError;

        const wanted = String(op.title).trim().toLowerCase();
        const existing = (dupes || []).find(
          (d) => String(d.title || '').trim().toLowerCase() === wanted
        );
        if (existing) {
          results.push({
            op: 'create', handle: null, id: existing.id, date: op.date, ok: true,
            deduped: true,
            note: `"${op.title}" was already on ${op.date}; kept the existing entry.`,
          });
          continue;
        }

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

      // PINNING IS A HUMAN ACT. This used to set pinned:true on every write,
      // which made the coach pin whatever it touched — so its own next edit to
      // the same entry hit adjudicateOps' `pinned` branch and was queued for
      // approval. One unremarkable coach change was enough to make every
      // subsequent one need a tap. That is how the weekend swap ended up in a
      // proposal queue.
      //
      // `pinned` means the ATHLETE decided about this entry: they edited it on
      // /train, or they approved a proposal that changed it. A change the
      // server applied on the coach's own authority is neither, so it leaves
      // the flag exactly as it found it — including leaving an athlete's
      // existing pin intact, since an unpin is a decision too.
      const { error } = await supabase
        .from('calendar_entries')
        .update({
          ...patch,
          coach_rationale: op.reason ?? entry.coach_rationale ?? null,
          ...(pin ? { pinned: true } : {}),
        })
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
