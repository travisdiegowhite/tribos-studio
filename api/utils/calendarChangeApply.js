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
import { normalizeIntervals, buildPrescription, withPrescription } from './prescription.js';
import { entrySport } from './entrySport.js';
import { buildDayIndex, placeSession, OCCUPANCY_COLUMNS } from './calendarOccupancy.js';
import { selectWithSportFallback, writeWithSportFallback } from './calendarSportColumn.js';

/** Fields an op may write onto an entry. Anything else the model sends is dropped. */
const WRITABLE = [
  'type', 'title', 'workout_id', 'workout_type',
  'target_load', 'target_duration_min', 'target_distance_km', 'notes',
  'sport',
];

/**
 * The stored prescription for an op's `intervals`, or undefined when the op
 * carries none (leave the row's details alone) — an explicit empty array
 * means "remove the structure" and yields null.
 */
function prescriptionFrom(op, sport = null, source = 'coach') {
  if (op.intervals === undefined) return undefined;
  const { intervals } = normalizeIntervals(op.intervals, 'intervals', sport);
  return intervals ? buildPrescription(intervals, source) : null;
}

/**
 * The sport a new entry gets: what the coach said, else the athlete's primary
 * sport for a workout, else what the row itself implies (entrySport.js).
 * Rest days and notes have none.
 */
function sportFor(draft, defaultSport = null) {
  const type = draft.type || 'workout';
  if (type === 'rest' || type === 'note') return null;
  if (draft.sport) return draft.sport;
  if (type === 'workout' && defaultSport) return defaultSport;
  return entrySport({ ...draft, type });
}

/**
 * Pull the writable subset out of a raw op. `intervals` becomes
 * `details.prescription`, merged over the entry's existing details so a race's
 * own detail JSON survives a coach edit.
 */
function draftFrom(op, existingDetails = null, sport = null) {
  const draft = {};
  for (const key of WRITABLE) {
    if (op[key] !== undefined) draft[key] = op[key];
  }
  const prescription = prescriptionFrom(op, op.sport ?? sport);
  if (prescription !== undefined) draft.details = withPrescription(existingDetails, prescription);
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
    'status', 'notes', 'coach_rationale', 'pinned', 'details', 'sport',
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
 * NON-DESTRUCTIVE BY CONSTRUCTION. A session is skipped on a race day, a rest
 * day, or a day that already holds a session of the SAME sport — never stacked
 * on and never overwritten. A run may join a day that holds a ride
 * (multisport phase 3, calendarOccupancy.js) and takes the next free slot.
 * Training therefore fills in around a race season rather than burying it, and
 * re-running a generator is safe. Skips are reported so the coach can say what
 * it did.
 *
 * @param {Map|Set} occupied  buildDayIndex() of the range's existing rows. A
 *   plain Set of dates is accepted for older callers and blocks those days
 *   outright.
 * @param {string|null} defaultSport  Sport for a session that names none.
 * @returns {{entries: Array, skipped: Array}}  Entries carry `slot` and `sport`.
 */
export function expandBlock(op, occupied = new Map(), design = null, defaultSport = null) {
  const index = occupied instanceof Map ? occupied : blockedDates(occupied);
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

    const weekIndex = Math.floor(dayIndex / 7);
    for (const session of sessions) {
      const sport = sportFor({ ...session, sport: session.sport ?? op.sport, type: 'workout' }, defaultSport);
      const placed = placeSession(index, dateKey, {
        type: 'workout',
        sport,
        workout_id: session.workout_id ?? null,
        workout_type: session.workout_type ?? null,
      });
      if ('skip' in placed) {
        skipped.push({ date: dateKey, reason: placed.skip });
        continue;
      }
      const base = Number(session.target_load);
      const load = Number.isFinite(base)
        ? Math.round(base * (1 + progression * weekIndex))
        : null;
      const entry = {
        date: dateKey,
        slot: placed.slot,
        sport,
        title: String(session.title).trim(),
        type: 'workout',
        workout_id: session.workout_id ?? null,
        workout_type: session.workout_type ?? null,
        target_load: load,
        target_duration_min: session.target_duration_min ?? null,
        target_distance_km: session.target_distance_km ?? null,
        notes: session.notes ?? null,
        details: withPrescription(null, prescriptionFrom(session, sport) ?? null),
      };
      entries.push(applyDesign(entry, design, { weekIndex }));
    }
  }

  return { entries, skipped };
}

/** A day index in which every given date is blocked outright. */
function blockedDates(dates) {
  const index = new Map();
  for (const date of dates ?? []) {
    index.set(date, { slots: new Set([0]), blocked: 'day already has an entry', sports: new Set(), count: 1 });
  }
  return index;
}

/**
 * Let the session designer fill a draft that carries no structure of its own.
 * The designer is injected (see designForCalendar.js) so this module stays a
 * pure writer; a draft the coach gave `intervals` to is left exactly as is.
 */
function applyDesign(entry, design, meta = {}) {
  if (typeof design !== 'function' || entry.details?.prescription) return entry;
  // The designer prescribes %FTP structure: rides only. A run keeps the
  // coach's own description (or its pace intervals) untouched.
  if (entry.sport && entry.sport !== 'cycling') return entry;
  let result;
  try {
    result = design(entry, meta);
  } catch (err) {
    console.error('session design failed (entry written undesigned):', err?.message || err);
    return entry;
  }
  if (!result) return entry;
  const out = { ...entry, ...(result.patch || {}) };
  if (result.prescription) out.details = withPrescription(entry.details, result.prescription);
  if (result.summary) out.__design = result.summary;
  return out;
}

/** What this athlete already has on each day of [from, to], for placement. */
async function dayIndexIn(supabase, userId, fromKey, toKey) {
  const { data, error } = await selectWithSportFallback(OCCUPANCY_COLUMNS, (columns) =>
    supabase
      .from('calendar_entries')
      .select(columns)
      .eq('user_id', userId)
      .gte('date', fromKey)
      .lte('date', toKey),
  );
  if (error) throw new Error(`Could not read the block's range: ${error.message}`);
  return buildDayIndex(data || []);
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
 * @param {Function} [opts.design]  Session designer for creates that carry no
 *   structure (designForCalendar.js makeCalendarDesigner). Optional; without
 *   it entries are written as the coach described them.
 * @param {string|null} [opts.defaultSport]  The athlete's primary sport, for a
 *   workout op that names none (multisport phase 3).
 * @returns {Promise<{success: boolean, applied: number, failed: number,
 *                    results: Array, undo: Array, error?: string}>}
 */
export async function applyCalendarOps(userId, resolved, opts = {}) {
  if (!userId) return { success: false, applied: 0, failed: 0, results: [], undo: [], error: 'Missing user' };

  const supabase = getSupabaseAdmin();
  const source = opts.source || 'coach';
  const pin = opts.pin === true;
  const design = typeof opts.design === 'function' ? opts.design : null;
  const defaultSport = opts.defaultSport ?? null;
  const results = [];
  const undo = [];

  for (const op of resolved) {
    try {
      if (op.op === 'generate_block') {
        const occupied = await dayIndexIn(supabase, userId, op.from, op.to);
        const { entries, skipped } = expandBlock(op, occupied, design, defaultSport);

        if (entries.length === 0) {
          results.push({
            op: 'generate_block', handle: null, ok: true, created: 0, skipped: skipped.length,
            note: 'Every day in that range was a race or rest day, or already had a session of that sport; nothing was added.',
          });
          continue;
        }

        // Batch insert: one round trip for a season, not seventy. Each entry
        // carries the slot the expander placed it in — 0 on an empty day, the
        // next free one beside another sport's session.
        const designs = entries.filter((e) => e.__design);
        const rows = entries.map(({ __design, ...e }) => ({
          id: randomUUID(),
          user_id: userId,
          status: 'planned',
          source,
          coach_rationale: op.reason ?? null,
          pinned: false,
          ...e,
        }));
        const { error } = await writeWithSportFallback(rows, (payload) =>
          supabase.from('calendar_entries').insert(payload),
        );
        if (error) throw error;

        results.push({
          op: 'generate_block', handle: null, ok: true,
          created: rows.length, skipped: skipped.length,
          from: op.from, to: op.to,
          skipped_dates: skipped.slice(0, 10).map((s2) => s2.date),
          designed: designs.length,
          // The first few, so the coach can describe the block's sessions truthfully.
          designs: designs.slice(0, 4).map((e) => `${e.date} ${e.title}: ${e.__design}`),
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
        // the same day: same date, same type, same title — and same sport —
        // is the SAME entry. (A "Long session" ride and a "Long session" run
        // on one day are two.)
        const createSport = sportFor(op, defaultSport);
        const { data: dupes, error: dupeError } = await selectWithSportFallback(
          'id, title, type, workout_id, workout_type, sport',
          (columns) =>
            supabase
              .from('calendar_entries')
              .select(columns)
              .eq('user_id', userId)
              .eq('date', op.date)
              .eq('type', op.type || 'workout'),
        );
        if (dupeError) throw dupeError;

        const wanted = String(op.title).trim().toLowerCase();
        const existing = (dupes || []).find(
          (d) =>
            String(d.title || '').trim().toLowerCase() === wanted &&
            entrySport(d) === (createSport ?? entrySport(d)),
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
        const draft = applyDesign({
          date: op.date,
          type: op.type || 'workout',
          title: String(op.title).trim(),
          workout_id: op.workout_id ?? null,
          workout_type: op.workout_type ?? null,
          target_load: op.target_load ?? null,
          target_duration_min: op.target_duration_min ?? null,
          target_distance_km: op.target_distance_km ?? null,
          notes: op.notes ?? null,
          sport: createSport,
          details: withPrescription(null, prescriptionFrom(op, createSport) ?? null),
        }, design);
        const { __design, ...fields } = draft;
        const { error } = await writeWithSportFallback(
          {
            id,
            user_id: userId,
            slot,
            ...fields,
            coach_rationale: op.reason ?? null,
            status: 'planned',
            source,
            // A coach entry the athlete has not touched is NOT pinned: a
            // generator may still reshape it. Pinning happens when a human
            // decision is expressed — the athlete editing it, or approving a
            // proposal that changes it.
            pinned: false,
          },
          (payload) => supabase.from('calendar_entries').insert(payload),
        );
        if (error) throw error;
        results.push({ op: 'create', handle: null, id, date: op.date, ok: true, ...(__design ? { design: __design } : {}) });
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
        patch = draftFrom(op, entry.details ?? null, entrySport(entry));
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
      const { error } = await writeWithSportFallback(
        {
          ...patch,
          coach_rationale: op.reason ?? entry.coach_rationale ?? null,
          ...(pin ? { pinned: true } : {}),
        },
        (payload) =>
          supabase
            .from('calendar_entries')
            .update(payload)
            .eq('user_id', userId)
            .eq('id', entry.id),
      );
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
          : draftFrom(op, op.entry?.details ?? null, op.entry ? entrySport(op.entry) : null),
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
