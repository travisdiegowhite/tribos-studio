/**
 * Correction Proposal Tools
 *
 * Defines the two Anthropic tools used exclusively in the correction-proposal
 * pipeline (not in the main ALL_COACH_TOOLS list). Also handles server-side
 * token resolution and Phase 6 validation.
 */

// ─── Tool definitions ─────────────────────────────────────────────────────────

export const PROPOSE_MODIFICATION_TOOL = {
  name: 'propose_modification',
  description: `Propose a specific modification to a planned training session.
Call this once for each session you want to modify. Use session IDs from the
SESSIONS block in the TEMPORAL ANCHOR — never reference sessions by date or
day name. All proposed changes must address the TFI shortfall; do not propose
changes for other reasons in this mode.`,
  input_schema: {
    type: 'object',
    properties: {
      session_id: {
        type: 'string',
        description: 'Session ID from the SESSIONS block (e.g. "sess_1af3bc12"). Must match exactly.',
      },
      op: {
        type: 'string',
        enum: ['extend', 'swap', 'add', 'reduce', 'skip'],
        description: 'extend: add training load. reduce: cut load. swap: change workout type. add: insert a new session. skip: drop this session (only valid if skipping reduces overtraining risk, rare).',
      },
      delta_minutes: {
        type: 'integer',
        description: 'For extend/reduce: minutes to add (positive) or remove (negative). Omit for swap/add/skip.',
      },
      new_type: {
        type: 'string',
        description: 'For swap/add: replacement workout type (e.g. "sweet_spot", "endurance", "vo2max").',
      },
      new_rss: {
        type: 'integer',
        description: 'Target RSS for the modified session after the change. Omit for skip.',
      },
      reason: {
        type: 'string',
        description: 'One sentence: why this specific change addresses the TFI shortfall.',
      },
    },
    required: ['session_id', 'op', 'reason'],
  },
};

export const RENDER_COACH_VOICE_TOOL = {
  name: 'render_coach_voice',
  description: `Write the opening and closing prose for the correction proposal card.
Call this exactly once after all propose_modification calls.

TOKEN RULES — you MUST follow these:
- To reference a date: use {<anchor_label>} where <anchor_label> is a label
  from CALENDAR_ANCHOR (e.g. {today}, {tomorrow}, {this_fri}, {next_sun}).
- Do NOT write raw day names like "Monday", "Tuesday", "Wednesday", etc.
- Do NOT compute or invent dates. Only use labels from the anchor.

Example opener: "Your {this_fri} session is the linchpin right now —
{today} is the moment to decide whether to extend it."`,
  input_schema: {
    type: 'object',
    properties: {
      opener: {
        type: 'string',
        description: '2-3 sentence opening in coach voice. Explain why the coach is proposing changes. Use {anchor_label} tokens for all date references.',
      },
      closer: {
        type: 'string',
        description: '1-2 sentence closing. Projected outcome if accepted. Use {anchor_label} tokens for all date references.',
      },
    },
    required: ['opener', 'closer'],
  },
};

// Both tools bundled for tool_choice injection
export const CORRECTION_TOOLS = [PROPOSE_MODIFICATION_TOOL, RENDER_COACH_VOICE_TOOL];

// ─── Token resolution ─────────────────────────────────────────────────────────

const WEEKDAY_PATTERN = /\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/i;
const TOKEN_PATTERN = /\{([a-z0-9_]+)\}/g;

/**
 * Build a token→pretty-date map from the structured anchor data.
 *
 * @param {string}  timezone        IANA timezone
 * @param {Array}   plannedWorkouts planned_workouts rows (same as buildTemporalAnchor)
 * @param {Array}   raceGoals       race_goals rows
 * @param {Date}    [now]
 * @returns {Map<string, string>}   e.g. Map { "today" → "Wed Apr 23", "this_fri" → "Fri Apr 25", ... }
 */
export function buildTokenMap(timezone, plannedWorkouts = [], raceGoals = [], now = new Date()) {
  // Re-use the same logic as buildTemporalAnchor to build the label→date mapping.
  // We duplicate the minimal date math here to avoid a circular import.
  const safeTz = timezone || 'UTC';

  function toLocalDateStr(date) {
    try {
      return date.toLocaleDateString('en-CA', { timeZone: safeTz });
    } catch {
      return date.toISOString().split('T')[0];
    }
  }

  function noonUTCFor(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d, 12, 0, 0, 0));
  }

  function prettyDate(dateStr) {
    const d = noonUTCFor(dateStr);
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: safeTz, weekday: 'short', month: 'short', day: 'numeric',
    }).formatToParts(d);
    const get = (t) => parts.find(p => p.type === t)?.value || '';
    return `${get('weekday')} ${get('month')} ${get('day')}`;
  }

  const FULL_DAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const SHORT_DAY = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

  const todayStr = toLocalDateStr(now);
  const todayNoon = noonUTCFor(todayStr);
  const dowName = now.toLocaleDateString('en-US', { weekday: 'long', timeZone: safeTz });
  const todayDow = FULL_DAY.indexOf(dowName);

  const goalDates = new Set((raceGoals || []).map(g => g.race_date).filter(Boolean));
  const sessionDates = new Set((plannedWorkouts || []).map(w => w.scheduled_date).filter(Boolean));
  const relevantOffsets = new Set([0, 1]);
  for (let i = 2; i <= 13; i++) {
    const ms = todayNoon.getTime() + i * 24 * 60 * 60 * 1000;
    const dateStr = toLocalDateStr(new Date(ms));
    if (goalDates.has(dateStr) || sessionDates.has(dateStr)) relevantOffsets.add(i);
  }

  const daysUntilSunday = todayDow === 0 ? 0 : 7 - todayDow;
  const usedLabels = new Set();
  const tokenMap = new Map();

  for (const offset of [...relevantOffsets].sort((a, b) => a - b)) {
    const ms = todayNoon.getTime() + offset * 24 * 60 * 60 * 1000;
    const dateStr = offset === 0 ? todayStr : toLocalDateStr(new Date(ms));
    const targetDow = (todayDow + offset) % 7;

    let label;
    if (offset === 0) label = 'today';
    else if (offset === 1) label = 'tomorrow';
    else {
      const prefix = offset <= daysUntilSunday ? 'this' : 'next';
      const candidate = `${prefix}_${SHORT_DAY[targetDow]}`;
      label = usedLabels.has(candidate) ? dateStr : candidate;
    }
    usedLabels.add(label);
    tokenMap.set(label, prettyDate(dateStr));
  }

  return tokenMap;
}

/**
 * Replace {anchor_label} tokens in prose with pretty-date strings.
 * Unknown tokens are left as-is (safer than silently deleting them).
 *
 * @param {string}           text
 * @param {Map<string,string>} tokenMap
 * @returns {string}
 */
export function resolveTokens(text, tokenMap) {
  if (!text) return text;
  return text.replace(TOKEN_PATTERN, (match, label) => {
    return tokenMap.has(label) ? tokenMap.get(label) : match;
  });
}

// ─── Validation (Phase 6) ─────────────────────────────────────────────────────

const VALID_OPS = new Set(['extend', 'swap', 'add', 'reduce', 'skip']);
const REST_TYPES = new Set(['rest', 'rest_day', 'off']);

/**
 * Validate proposed modifications against the actual planned_workouts rows.
 *
 * @param {Array}  modifications  Raw tool outputs (op, session_id, ...)
 * @param {Array}  plannedWorkouts Full rows from fetchTemporalAnchorData
 * @param {string} resolvedOpener  Voice text after token resolution
 * @param {string} resolvedCloser  Voice text after token resolution
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateCorrectionProposal(modifications, plannedWorkouts, resolvedOpener, resolvedCloser) {
  const errors = [];

  // Build session lookup: sess_ prefix → full row
  const sessionById = new Map();
  for (const w of (plannedWorkouts || [])) {
    const shortId = 'sess_' + w.id.replace(/-/g, '').slice(0, 8);
    sessionById.set(shortId, w);
  }

  for (const mod of (modifications || [])) {
    if (!mod.session_id) {
      errors.push(`Missing session_id in modification: ${JSON.stringify(mod)}`);
      continue;
    }
    if (!VALID_OPS.has(mod.op)) {
      errors.push(`Invalid op "${mod.op}" for session ${mod.session_id}`);
    }

    const row = sessionById.get(mod.session_id);
    if (!row) {
      errors.push(`session_id "${mod.session_id}" not found in planned_workouts within 14-day window`);
      continue;
    }

    // Can't swap a rest day (nothing meaningful to swap)
    if (mod.op === 'swap' && REST_TYPES.has((row.workout_type || '').toLowerCase())) {
      errors.push(`Cannot swap a rest day (session ${mod.session_id})`);
    }
  }

  // Regex scan resolved voice for raw weekday names
  const voiceText = [resolvedOpener, resolvedCloser].filter(Boolean).join(' ');
  if (WEEKDAY_PATTERN.test(voiceText)) {
    const found = voiceText.match(new RegExp(WEEKDAY_PATTERN.source, 'gi'));
    errors.push(`Coach voice contains raw weekday name(s): ${[...new Set(found)].join(', ')}. Use CALENDAR_ANCHOR labels instead.`);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Enrich modifications with the resolved planned_workout UUID.
 * Converts "sess_1af3bc12" → the full planned_workouts.id.
 *
 * @param {Array}  modifications
 * @param {Array}  plannedWorkouts
 * @returns {Array} modifications with planned_workout_id added
 */
export function enrichModificationsWithIds(modifications, plannedWorkouts) {
  const sessionById = new Map();
  for (const w of (plannedWorkouts || [])) {
    const shortId = 'sess_' + w.id.replace(/-/g, '').slice(0, 8);
    sessionById.set(shortId, w);
  }

  return (modifications || []).map(mod => {
    const row = sessionById.get(mod.session_id);
    return row
      ? { ...mod, planned_workout_id: row.id, scheduled_date: row.scheduled_date }
      : mod;
  });
}
