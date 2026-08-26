/**
 * The coach's one calendar tool.
 *
 * `calendar_change` replaces `recommend_workout`, `adjust_schedule` and the
 * calendar-writing half of `create_training_plan` for athletes on the rebuilt
 * calendar, and adds the capability whose absence started this whole rebuild:
 * the coach could not create a race. Asked to schedule a cyclocross season it
 * reached for `create_training_plan`, because that was the only tool that
 * wrote anything, and then reported success having scheduled nothing.
 *
 * TWO RULES GOVERN THIS FILE.
 *
 * 1. THE SERVER DECIDES WHETHER A CHANGE APPLIES OR IS PROPOSED — never the
 *    model. `adjudicateOps` below is that decision, and the tool schema
 *    deliberately gives the model no way to express a preference about it.
 *    A model that could mark its own edits "safe to apply" would eventually
 *    do so for the destructive ones.
 *
 * 2. THE MODEL NEVER SEES A ROW UUID. Entries are addressed by opaque
 *    `sess_xxxxxxxx` handles, derived here and resolved here, exactly as
 *    correctionTools.js does for planned_workouts. A model that has seen a
 *    real id can construct one it was never given.
 *
 * This module is PURE — no Supabase, no network — so the adjudication rule is
 * unit-testable without a database. The executor lives in calendarChangeApply.js.
 */

// ─── Handles ──────────────────────────────────────────────────────────────────

/**
 * Derive the opaque handle the model sees for a calendar entry.
 * Same derivation as correctionTools.js so the two surfaces agree.
 *
 * @param {string} entryId calendar_entries.id (uuid)
 * @returns {string} e.g. "sess_1af3bc12"
 */
export function entryHandle(entryId) {
  return 'sess_' + String(entryId).replace(/-/g, '').slice(0, 8);
}

/**
 * Build handle → entry lookup for a set of rows.
 *
 * Collisions are possible in principle (8 hex chars = 32 bits) and are
 * resolved by REFUSING the ambiguous handle rather than guessing: a coach edit
 * landing on the wrong session is worse than a coach edit that fails loudly.
 *
 * @param {Array<{id: string}>} entries
 * @returns {{ byHandle: Map<string, object>, ambiguous: Set<string> }}
 */
export function buildHandleMap(entries = []) {
  const byHandle = new Map();
  const ambiguous = new Set();
  for (const entry of entries) {
    if (!entry?.id) continue;
    const handle = entryHandle(entry.id);
    if (byHandle.has(handle)) {
      ambiguous.add(handle);
      continue;
    }
    byHandle.set(handle, entry);
  }
  for (const handle of ambiguous) byHandle.delete(handle);
  return { byHandle, ambiguous };
}

// ─── Tool definition ──────────────────────────────────────────────────────────

const OPS = ['create', 'generate_block', 'update', 'move', 'delete', 'set_status'];

export const CALENDAR_CHANGE_TOOL = {
  name: 'calendar_change',
  description: `Read-write access to the athlete's training calendar. Use this for ANY change to what is on their calendar: adding a session or a race, moving something, changing its details, marking it done, or removing it.

This is the ONLY tool that can put a race on the calendar. When the athlete plans a race season — "I want to do these cyclocross races this fall", "add the state championship" — create one entry per race with type "race". A race with only a name and a date is worth creating; missing details can be filled in later, and an entry on the calendar is far more useful to the athlete than a promise in prose.

FOR TRAINING SPANNING MORE THAN ABOUT TWO WEEKS, USE "generate_block", NOT ONE "create" PER SESSION. A season of training is 60-80 sessions; writing them out individually will not fit in one reply, and you will silently deliver a fraction of what was asked for. generate_block takes a weekly pattern and a date range and the server expands it. Use several blocks to shape a season — base, build, peak, taper — one call each.

When an athlete asks for races AND training ("plan my cross season with training"), you must do BOTH: create the races, then generate the training blocks around them. Delivering only the races is a half-answer.

Address existing entries by their handle from the CALENDAR block (e.g. "sess_1af3bc12"). Never reference an entry by date or day name, and never invent a handle.

WHAT HAPPENS AFTER YOU CALL THIS is decided by the server, not by you:
- Creating new entries takes effect immediately, however many you create.
- Changing, moving or removing a single untouched entry takes effect immediately.
- Changing more than one existing entry, or touching anything the athlete has already edited or completed, becomes a proposal they accept or reject.

So do NOT promise a specific outcome in your reply. After calling this, describe what you did — the tool result tells you whether it applied or is awaiting their approval, and you should say which.`,
  input_schema: {
    type: 'object',
    properties: {
      operations: {
        type: 'array',
        description: 'The changes to make, in order. Each targets one calendar entry.',
        items: {
          type: 'object',
          properties: {
            op: {
              type: 'string',
              enum: OPS,
              description: 'create: add ONE new entry on a date. generate_block: add many sessions across a date range from a weekly pattern — use this for anything longer than about two weeks. update: change an existing entry\'s details. move: change its date. delete: remove it. set_status: mark it done, skipped or back to planned.',
            },
            handle: {
              type: 'string',
              description: 'For update/move/delete/set_status: the entry handle from the CALENDAR block (e.g. "sess_1af3bc12"). Omit for create.',
            },
            date: {
              type: 'string',
              description: 'For create: the date (YYYY-MM-DD). For move: the destination date.',
            },
            type: {
              type: 'string',
              enum: ['workout', 'race', 'rest', 'note'],
              description: 'For create: what this entry is. Use "race" for any event the athlete is targeting.',
            },
            title: {
              type: 'string',
              description: 'Short name shown on the calendar, e.g. "Sweet Spot 3x12" or "Boulder Cyclocross Series #3".',
            },
            workout_type: {
              type: 'string',
              description: 'Training focus, e.g. "endurance", "sweet_spot", "threshold", "vo2max", "recovery". For a race, the discipline (e.g. "cyclocross").',
            },
            workout_id: {
              type: 'string',
              description: 'Optional id from the workout library, when this entry is a library workout.',
            },
            target_load: {
              type: 'number',
              description: 'Planned RSS for the session. Omit for races and rest days.',
            },
            target_duration_min: {
              type: 'integer',
              description: 'Planned duration in minutes.',
            },
            target_distance_km: {
              type: 'number',
              description: 'Planned or race distance in kilometres, when distance is the meaningful target.',
            },
            status: {
              type: 'string',
              enum: ['planned', 'done', 'skipped'],
              description: 'For set_status only.',
            },
            from: {
              type: 'string',
              description: 'For generate_block: first date of the block (YYYY-MM-DD).',
            },
            to: {
              type: 'string',
              description: 'For generate_block: last date of the block (YYYY-MM-DD), inclusive.',
            },
            weekly_pattern: {
              type: 'array',
              description: 'For generate_block: what a typical week looks like. The server repeats it across every week in [from, to], skipping any day that already has a session or a race so existing entries are never overwritten. Omit days that should stay empty rather than adding rest entries for them.',
              items: {
                type: 'object',
                properties: {
                  day: {
                    type: 'string',
                    enum: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
                    description: 'Day of the week for this session.',
                  },
                  title: { type: 'string', description: 'e.g. "Threshold Intervals", "Long Endurance Ride".' },
                  workout_type: { type: 'string', description: 'e.g. "endurance", "sweet_spot", "threshold", "vo2max", "recovery", "openers".' },
                  workout_id: { type: 'string', description: 'Optional id from the workout library.' },
                  target_load: { type: 'number', description: 'Planned RSS for this session.' },
                  target_duration_min: { type: 'integer', description: 'Planned duration in minutes.' },
                  notes: { type: 'string', description: 'Execution detail for the athlete.' },
                },
                required: ['day', 'title'],
              },
            },
            load_progression: {
              type: 'number',
              description: 'For generate_block: fraction to change target_load by per week across the block, e.g. 0.05 for a 5%/week build, -0.1 for a taper, 0 or omitted for steady. Applied cumulatively from the first week.',
            },
            notes: {
              type: 'string',
              description: 'Detail the athlete should see on the entry — course notes, race priority, execution cues.',
            },
            reason: {
              type: 'string',
              description: 'One sentence, in your own voice, on why this change serves their goals. Shown to the athlete on the entry and on the approval card.',
            },
          },
          required: ['op', 'reason'],
        },
      },
      summary: {
        type: 'string',
        description: 'One sentence covering all the operations together. Shown as the heading if these become a proposal.',
      },
    },
    required: ['operations'],
  },
};

// ─── Validation ───────────────────────────────────────────────────────────────

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
export const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
/** Ceiling on one generate_block expansion. A season is ~80; 400 is a misread. */
export const MAX_GENERATED_ENTRIES = 400;

/** Whole weeks spanned by an inclusive date range, at least 1. */
export function spanWeeks(fromKey, toKey) {
  const a = Date.parse(`${fromKey}T00:00:00Z`);
  const b = Date.parse(`${toKey}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return 1;
  return Math.max(1, Math.ceil((b - a) / 86400000 / 7));
}
const ENTRY_TYPES = new Set(['workout', 'race', 'rest', 'note']);
const SETTABLE_STATUSES = new Set(['planned', 'done', 'skipped']);

/**
 * Check the model's operations against the athlete's real entries.
 *
 * Fails CLOSED and WHOLE: if any operation is invalid, none are applied. A
 * partial application of a list the model built as a unit is worse than a
 * clean rejection it can retry — the retry-once-then-fail loop in coach.js
 * depends on the errors being specific enough to correct.
 *
 * @param {Array} operations Raw tool input
 * @param {Map<string, object>} byHandle From buildHandleMap
 * @param {Set<string>} [ambiguous] Handles that collided
 * @returns {{ valid: boolean, errors: string[], resolved: Array }}
 */
export function validateOps(operations, byHandle, ambiguous = new Set()) {
  const errors = [];
  const resolved = [];

  if (!Array.isArray(operations) || operations.length === 0) {
    return { valid: false, errors: ['No operations supplied.'], resolved: [] };
  }

  operations.forEach((op, i) => {
    const at = `operation ${i + 1}`;

    if (!OPS.includes(op?.op)) {
      errors.push(`${at}: unknown op "${op?.op}". Expected one of ${OPS.join(', ')}.`);
      return;
    }
    if (!op.reason || !String(op.reason).trim()) {
      errors.push(`${at}: every operation needs a one-sentence reason.`);
    }

    if (op.op === 'generate_block') {
      if (!DATE_PATTERN.test(op.from || '')) {
        errors.push(`${at}: generate_block needs \`from\` as YYYY-MM-DD (got ${JSON.stringify(op.from)}).`);
      }
      if (!DATE_PATTERN.test(op.to || '')) {
        errors.push(`${at}: generate_block needs \`to\` as YYYY-MM-DD (got ${JSON.stringify(op.to)}).`);
      }
      if (DATE_PATTERN.test(op.from || '') && DATE_PATTERN.test(op.to || '') && op.to < op.from) {
        errors.push(`${at}: generate_block \`to\` (${op.to}) is before \`from\` (${op.from}).`);
      }
      if (!Array.isArray(op.weekly_pattern) || op.weekly_pattern.length === 0) {
        errors.push(`${at}: generate_block needs a weekly_pattern with at least one day.`);
      } else {
        op.weekly_pattern.forEach((d, j) => {
          if (!WEEKDAYS.includes(d?.day)) {
            errors.push(`${at}, pattern day ${j + 1}: unknown day "${d?.day}". Expected one of ${WEEKDAYS.join(', ')}.`);
          }
          if (!d?.title || !String(d.title).trim()) {
            errors.push(`${at}, pattern day ${j + 1}: needs a title.`);
          }
        });
        // A block bigger than this is almost certainly a misread of intent, and
        // it is cheaper to say so than to write hundreds of rows and undo them.
        const span = spanWeeks(op.from, op.to);
        const projected = span * op.weekly_pattern.length;
        if (projected > MAX_GENERATED_ENTRIES) {
          errors.push(
            `${at}: that block would create about ${projected} sessions (${span} weeks x ${op.weekly_pattern.length}/week), ` +
            `over the ${MAX_GENERATED_ENTRIES} limit. Split it into shorter blocks.`
          );
        }
      }
      resolved.push({ ...op, entry: null });
      return;
    }

    if (op.op === 'create') {
      if (!DATE_PATTERN.test(op.date || '')) {
        errors.push(`${at}: create needs a date as YYYY-MM-DD (got ${JSON.stringify(op.date)}).`);
      }
      if (!op.title || !String(op.title).trim()) {
        errors.push(`${at}: create needs a title.`);
      }
      if (op.type && !ENTRY_TYPES.has(op.type)) {
        errors.push(`${at}: unknown type "${op.type}".`);
      }
      resolved.push({ ...op, entry: null });
      return;
    }

    // Every other op addresses an existing entry.
    if (!op.handle) {
      errors.push(`${at}: ${op.op} needs the handle of the entry to change.`);
      return;
    }
    if (ambiguous.has(op.handle)) {
      errors.push(`${at}: handle "${op.handle}" matches more than one entry and cannot be used.`);
      return;
    }
    const entry = byHandle.get(op.handle);
    if (!entry) {
      errors.push(`${at}: handle "${op.handle}" is not an entry on this athlete's calendar.`);
      return;
    }

    if (op.op === 'move' && !DATE_PATTERN.test(op.date || '')) {
      errors.push(`${at}: move needs a destination date as YYYY-MM-DD.`);
    }
    if (op.op === 'set_status' && !SETTABLE_STATUSES.has(op.status)) {
      errors.push(`${at}: set_status needs status one of ${[...SETTABLE_STATUSES].join(', ')}.`);
    }
    if (op.op === 'update' && op.type && !ENTRY_TYPES.has(op.type)) {
      errors.push(`${at}: unknown type "${op.type}".`);
    }

    resolved.push({ ...op, entry });
  });

  return { valid: errors.length === 0, errors, resolved };
}

// ─── Adjudication: apply now, or ask the athlete? ─────────────────────────────

/**
 * Decide whether a validated operation list applies immediately or becomes a
 * proposal. THE MODEL HAS NO INPUT INTO THIS.
 *
 * The rule, and why each half of it is where it is:
 *
 *   • CREATES ALWAYS APPLY, at any count. Approval exists to guard against
 *     losing work, and a create on a free day destroys nothing. Gating them
 *     on count would mean the athlete who asks for a ten-race cyclocross
 *     season gets a card to tick instead of a calendar — which is the
 *     original complaint wearing a nicer hat.
 *
 *   • ONE untouched, unfinished entry changed → APPLIES. This is the "move
 *     Thursday's ride to Friday" case, and making the athlete confirm it
 *     twice is friction with no safety in it.
 *
 *   • MORE THAN ONE existing entry changed → PROPOSES. Not because two edits
 *     are twice as dangerous as one, but because a multi-entry edit is where
 *     a misread of intent stops being obvious at a glance.
 *
 *   • ANY pinned entry touched → PROPOSES. `pinned` means the athlete already
 *     made a decision about this entry. Overriding that silently is precisely
 *     what the old plan-owned calendar did.
 *
 *   • ANY completed entry touched → PROPOSES. Editing history needs a human.
 *
 * @param {Array} resolved From validateOps
 * @returns {{ apply: boolean, reasonCode: string|null, reasons: string[] }}
 */
export function adjudicateOps(resolved = []) {
  // generate_block expands into creates only — it never touches an existing
  // entry (the expander skips occupied days). So it adjudicates as a create.
  const existing = resolved.filter(
    (op) => op.op !== 'create' && op.op !== 'generate_block' && op.entry
  );

  const pinned = existing.filter((op) => op.entry.pinned === true);
  const completed = existing.filter((op) => op.entry.status === 'done');
  const multi = existing.length > 1;

  const reasons = [];
  if (multi) reasons.push('multi_entry');
  if (pinned.length > 0) reasons.push('pinned');
  if (completed.length > 0) reasons.push('completed');

  if (reasons.length === 0) {
    return { apply: true, reasonCode: null, reasons: [] };
  }
  return {
    apply: false,
    reasonCode: reasons.length > 1 ? 'mixed' : reasons[0],
    reasons,
  };
}

/**
 * Human-readable explanation of an adjudication, for the tool result the model
 * reads back. It needs to know what happened so its reply to the athlete is
 * true — "I've added those" versus "I've put that up for you to approve".
 *
 * @param {{apply: boolean, reasons: string[]}} verdict
 * @param {number} createCount
 * @returns {string}
 */
export function describeVerdict(verdict, createCount = 0) {
  if (verdict.apply) {
    return createCount > 0
      ? 'Applied immediately. Tell the athlete plainly what is now on their calendar.'
      : 'Applied immediately. State the change as done.';
  }
  const why = {
    multi_entry: 'more than one existing entry would change',
    pinned: 'it touches an entry the athlete has already adjusted',
    completed: 'it touches a session already marked done',
  };
  const parts = verdict.reasons.map((r) => why[r] || r);
  return `NOT applied — awaiting the athlete's approval because ${parts.join(' and ')}. Tell them you have put the change up for them to accept, not that you have made it.`;
}

export default CALENDAR_CHANGE_TOOL;
