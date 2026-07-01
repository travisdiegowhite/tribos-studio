// arcBuilder — the living arc (Increment B1)
//
// Builds a deterministic, phase-banded plan toward a race and fills it with real
// `planned_workouts` rows. It harvests the (retired-System-B but kept) pure
// periodization math:
//   - buildEventAnchoredSequence: race + tier → block chain (the phase bands)
//   - generateSessionsForBlock:   block → one session per day
//   - coefficientsForMode:        recovery-mode presets (masters factor)
//
// There is NO LLM call and NO fatigue gating here — the fill is deterministic
// and stable at set-time (future fatigue is unknown). Fatigue-aware re-fill is
// deferred to B2. The output rows attach to a real `training_plans` row, so
// everything downstream (calendar header, compliance trigger, dashboard) works
// unchanged; `source`/`phase` are the new intent tags (migration 101).

import { buildEventAnchoredSequence } from './sequencerPlanner.js';
import {
  generateSessionsForBlock,
  coefficientsForMode,
} from './sequencerBlockOps.js';

// session_type (sequencer) → workout_type (planned_workouts). Same mapping the
// deleted eventAnchoredCalendarBridge used. workout_type has no DB CHECK, but we
// keep it aligned with the values the calendar/library understand.
const SESSION_TYPE_TO_WORKOUT_TYPE = {
  rest: 'rest',
  z1: 'recovery',
  z2: 'endurance',
  tempo: 'tempo',
  threshold: 'threshold',
  vo2: 'vo2max',
  race_sim: 'intervals',
  opener: 'recovery',
};

// session_type → human-friendly calendar name (planned_workouts.name is NOT NULL).
const SESSION_TYPE_TO_NAME = {
  rest: 'Rest Day',
  z1: 'Recovery Spin',
  z2: 'Endurance Ride',
  tempo: 'Tempo Ride',
  threshold: 'Threshold Intervals',
  vo2: 'VO2 Max Intervals',
  race_sim: 'Race Simulation',
  opener: 'Pre-Race Opener',
};

function daysBetween(startStr, endStr) {
  const a = new Date(startStr + 'T00:00:00Z');
  const b = new Date(endStr + 'T00:00:00Z');
  return Math.round((b - a) / 86400000);
}

// Per-block: a display label and the one-line "why" the coach uses to explain the
// arc. Keyed by block_type from buildEventAnchoredSequence.
const BLOCK_INFO = {
  reactivation: { label: 'Reactivation', why: 'ease back into structure and rebuild the habit after time off the bike' },
  maintenance: { label: 'Maintenance', why: 'hold your aerobic base while the race is still far out' },
  recovery: { label: 'Recovery', why: 'absorb the work and let your body adapt' },
  aerobic_build: { label: 'Aerobic Base', why: 'build aerobic durability and raise your base — the foundation everything else sits on' },
  threshold: { label: 'Threshold', why: 'lift your sustainable power (FTP) with sweet-spot and threshold work' },
  vo2: { label: 'VO2 Max', why: 'sharpen your top-end for the hard surges and accelerations' },
  race_specific: { label: 'Race-Specific', why: 'rehearse the demands of race day with race-pace efforts' },
  taper: { label: 'Taper', why: 'shed fatigue so you arrive fresh and fast on race day' },
};

const TIER_RATIONALE = {
  A: 'a full periodization — base, then threshold, then VO2, then a taper — because this is your top goal',
  B: 'a focused sharpening block — threshold into VO2, then a short taper — since it\'s an important but secondary race',
  C: 'a short, sharp build — VO2 into a brief taper — since it\'s a lower-priority tune-up',
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Format a YYYY-MM-DD as "Mon D" without timezone drift.
function fmtDate(dateStr) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  return `${MONTHS[m - 1]} ${d}`;
}

function fmtSpan(days) {
  if (days >= 7) {
    const wks = Math.round(days / 7);
    return `${wks} wk${wks === 1 ? '' : 's'}`;
  }
  return `${days} day${days === 1 ? '' : 's'}`;
}

/**
 * The FACTUAL spine of the arc explanation — tier rationale, every phase with
 * dates/durations/purpose, the taper note, an optional compression heads-up, an
 * optional blocked-day note, and the calendar/session-count line. Every number,
 * date, and phase name is computed here from the real block structure. This text
 * is meant to be used VERBATIM — it must never be paraphrased by an LLM, so the
 * facts can't drift. Pure + testable. Returns markdown.
 *
 * @param {object} arc result of buildArc ({ blocks, validation_status })
 * @param {object} opts
 * @param {'A'|'B'|'C'} [opts.tier]
 * @param {number} [opts.workoutCount]
 * @param {number} [opts.redistributedCount]
 * @param {string[]} [opts.blockedDayNames]
 * @returns {string}
 */
export function buildArcFactSpine(arc, opts = {}) {
  const blocks = Array.isArray(arc?.blocks) ? arc.blocks : [];
  const { tier = 'A', workoutCount, redistributedCount = 0, blockedDayNames = [] } = opts;
  if (blocks.length === 0) return '';

  const lines = [];
  const tierArticle = tier === 'A' ? 'an' : 'a';
  lines.push(`Because it's ${tierArticle} **${tier}-priority race**, I built ${TIER_RATIONALE[tier] || TIER_RATIONALE.A}.`);
  lines.push('');

  blocks.forEach((b, i) => {
    const info = BLOCK_INFO[b.block_type] || { label: b.block_type, why: '' };
    const span = fmtSpan(b.duration_days ?? (daysBetween(b.start_date, b.end_date) + 1));
    lines.push(`${i + 1}. **${info.label}** (${fmtDate(b.start_date)}–${fmtDate(b.end_date)}, ${span})${info.why ? ` — ${info.why}.` : ''}`);
  });

  lines.push('');
  lines.push('Each block builds on the one before it — base before intensity — and the taper lands the week of the race so you peak at the right time.');

  if (arc.validation_status === 'warning') {
    lines.push('');
    lines.push('Heads up: the race is close, so I compressed the early blocks to fit a proper taper in. A bit more lead time would let the base phase do more.');
  }

  if (redistributedCount > 0 && blockedDayNames.length > 0) {
    lines.push('');
    lines.push(`You've got **${blockedDayNames.join(' and ')}** blocked, so I shifted your hard sessions off ${blockedDayNames.length > 1 ? 'those days' : 'that day'} onto open days.`);
  }

  lines.push('');
  lines.push(`It's all on your calendar${typeof workoutCount === 'number' ? ` — ${workoutCount} sessions` : ''}.`);

  return lines.join('\n');
}

/**
 * Build a grounded, coach-toned explanation of WHY the arc is shaped the way it
 * is. Fully deterministic — used directly, and as the FALLBACK when the persona
 * hybrid is unavailable or fails validation. Pure + testable. Returns markdown.
 *
 * @param {object} arc result of buildArc ({ blocks, chain_used, validation_status })
 * @param {object} opts see buildArcFactSpine, plus:
 * @param {string} [opts.raceName]
 * @param {string} [opts.raceDate]   YYYY-MM-DD
 * @param {string} [opts.today]      YYYY-MM-DD (arc start)
 * @returns {string}
 */
export function buildArcExplanation(arc, opts = {}) {
  const spine = buildArcFactSpine(arc, opts);
  if (!spine) return '';

  const { raceName, raceDate, today } = opts;
  const weeksOut = today && raceDate ? Math.max(1, Math.round(daysBetween(today, raceDate) / 7)) : null;
  const intro = `Here's your plan to **${raceName || 'your race'}**${raceDate ? ` (${fmtDate(raceDate)})` : ''}${weeksOut ? `, ${weeksOut} weeks out` : ''} — and the thinking behind it:`;
  const outro = 'Tap any day to see the details, and tell me if anything needs to move.';

  return `${intro}\n\n${spine}\n\n${outro}`;
}

// Month-abbreviation guard for persona-voice validation (a bare month word is
// low-risk, but combined with the no-digit rule it keeps dates out entirely).
const MONTH_RE = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/i;

/**
 * Gate for LLM-generated persona wrapper text (lead-in / sign-off). Returns true
 * only for short, voice-only lines that contain NO digits and NO month names — so
 * a hallucinated date, week count, session count, or phase number is structurally
 * impossible in the persona layer. All real facts live in the deterministic spine.
 *
 * @param {unknown} text
 * @returns {boolean}
 */
export function isCleanPersonaVoice(text) {
  if (typeof text !== 'string') return false;
  const t = text.trim();
  if (t.length === 0 || t.length > 180) return false;
  if (/[0-9]/.test(t)) return false;           // no numerals → no fabricated counts/dates
  if (MONTH_RE.test(t)) return false;          // no month words → no fabricated dates
  return true;
}

/**
 * Assemble the hybrid message: a persona-voiced lead-in, the verbatim factual
 * spine, and a persona-voiced sign-off. Returns null if either wrapper line fails
 * validation, so the caller falls back to the fully-deterministic explanation.
 *
 * @param {object} arc
 * @param {object} opts see buildArcFactSpine
 * @param {{ leadIn?: string, signOff?: string }} wrapper
 * @returns {string|null}
 */
export function assembleHybridArcMessage(arc, opts, wrapper) {
  const spine = buildArcFactSpine(arc, opts);
  if (!spine) return null;
  const leadIn = wrapper?.leadIn?.trim();
  const signOff = wrapper?.signOff?.trim();
  if (!isCleanPersonaVoice(leadIn) || !isCleanPersonaVoice(signOff)) return null;
  return `${leadIn}\n\n${spine}\n\n${signOff}`;
}

/**
 * Build the deterministic arc shape (phase bands) toward a race. Pure: no I/O.
 *
 * @param {object} params
 * @param {string} params.today        YYYY-MM-DD (arc start, inclusive)
 * @param {string} params.raceDate     YYYY-MM-DD (the A/target race)
 * @param {'A'|'B'|'C'} params.tier    race priority tier → chain
 * @param {string} [params.recoveryMode] 'standard'|'conservative'|'adaptive'
 * @returns {{ blocks: Array, chain_used: string[], validation_status: string,
 *             validation_messages: Array, horizon_days: number }}
 */
export function buildArc({ today, raceDate, tier, recoveryMode }) {
  const coefficients = coefficientsForMode(recoveryMode || 'standard');
  return buildEventAnchoredSequence({
    today,
    race_date: raceDate,
    tier: tier || 'A',
    coefficients,
  });
}

/**
 * Map one sequencer session to a `planned_workouts`-shaped arc row. Pure.
 * The row also carries `session_type` + `prescribed_intervals` — these are NOT
 * `planned_workouts` columns (writers insert an explicit column list and ignore
 * them), but the refill loop needs them to re-run `evaluateGating`, and the
 * availability swap keeps them in sync (see ARC_SWAP_FIELDS).
 *
 * @param {object} s        a session from generateSessionsForBlock
 * @param {string} blockType the block's block_type → row.phase
 * @param {string} arcStart  arc start date (for week_number)
 * @returns {object} planned_workouts-shaped row (no plan_id/user_id)
 */
export function arcSessionToRow(s, blockType, arcStart) {
  const workoutType = SESSION_TYPE_TO_WORKOUT_TYPE[s.session_type] || 'endurance';
  const name = SESSION_TYPE_TO_NAME[s.session_type] || 'Workout';
  const load = s.target_rss ?? null;
  const duration = s.target_duration_min ?? 0;
  const dow = new Date(s.date + 'T12:00:00').getDay();
  const weekNumber = Math.floor(daysBetween(arcStart, s.date) / 7) + 1;

  return {
    scheduled_date: s.date,
    day_of_week: dow,
    week_number: weekNumber,
    workout_type: workoutType,
    workout_id: null,
    name,
    // dual-write canonical + legacy load per CLAUDE.md metrics freeze
    target_rss: load,
    target_tss: load,
    target_duration: duration || null,
    duration_minutes: duration || 0,
    long_ride_flag: !!s.long_ride_flag,
    notes: s.notes || '',
    phase: blockType,
    source: 'arc',
    completed: false,
    // transient — not persisted; used by the refill gating pass
    session_type: s.session_type,
    prescribed_intervals: s.prescribed_intervals ?? null,
  };
}

/**
 * Expand the arc's phase bands into one `planned_workouts` row per day.
 * Pure + unit-testable.
 *
 * @param {Array<{block_type:string,start_date:string,end_date:string}>} blocks
 * @param {object} [options]
 * @param {object} [options.ctx]   optional sequencer ctx (coefficients, upcoming_events,...)
 * @param {string} [options.arcStart] arc start date for week_number (defaults to first block start)
 * @returns {Array<object>} planned_workouts-shaped rows (no plan_id/user_id — set by the writer)
 */
export function generateArcWorkouts(blocks, options = {}) {
  const list = Array.isArray(blocks) ? blocks : [];
  if (list.length === 0) return [];
  const ctx = options.ctx || undefined;
  const arcStart = options.arcStart || list[0].start_date;

  const rows = [];
  for (const block of list) {
    const sessions = generateSessionsForBlock(
      block.block_type,
      block.start_date,
      block.end_date,
      ctx,
    );
    for (const s of sessions) {
      rows.push(arcSessionToRow(s, block.block_type, arcStart));
    }
  }
  return rows;
}

// The session-content fields that move when we swap two day-slots to honour
// availability. `scheduled_date`/`day_of_week`/`week_number`/`phase`/`source` stay
// put — phase stays tied to its calendar date (the block banding is date-accurate),
// only the prescription itself moves.
const ARC_SWAP_FIELDS = [
  'workout_type',
  'name',
  'target_rss',
  'target_tss',
  'target_duration',
  'duration_minutes',
  'long_ride_flag',
  'notes',
  // transient gating fields — kept in sync so a swapped slot's session_type/intervals
  // still match its (swapped) workout content for the refill gating pass.
  'session_type',
  'prescribed_intervals',
];

function swapArcContent(a, b) {
  for (const f of ARC_SWAP_FIELDS) {
    const tmp = a[f];
    a[f] = b[f];
    b[f] = tmp;
  }
}

/**
 * Move quality sessions off the athlete's blocked days, honouring training
 * preferences (preferred days, weekend long rides). Mirrors the static
 * generator's redistributeForAvailability, adapted to arc rows: it swaps the
 * session CONTENT between day-slots within a week, so dates/day_of_week/phase
 * stay fixed. Mutates + returns the rows.
 *
 * @param {Array<object>} rows arc planned-workout rows (from generateArcWorkouts)
 * @param {object} [availability] { weeklyAvailability:[{dayOfWeek,status}], preferences:{...} }
 * @returns {{ workouts: Array<object>, redistributedCount: number }}
 */
export function applyAvailabilityToArcWorkouts(rows, availability) {
  const list = Array.isArray(rows) ? rows : [];
  if (!availability?.weeklyAvailability || list.length === 0) {
    return { workouts: list, redistributedCount: 0 };
  }

  const dayStatus = {};
  for (const d of availability.weeklyAvailability) dayStatus[d.dayOfWeek] = d.status;

  const blockedDays = new Set(
    Object.entries(dayStatus)
      .filter(([, status]) => status === 'blocked')
      .map(([day]) => Number(day)),
  );
  if (blockedDays.size === 0) return { workouts: list, redistributedCount: 0 };

  const preferredDays = new Set(
    Object.entries(dayStatus)
      .filter(([, status]) => status === 'preferred')
      .map(([day]) => Number(day)),
  );
  const preferWeekendLong =
    availability.preferences?.preferWeekendLongRides
    ?? availability.preferences?.preferWeekendLongRuns
    ?? true;

  const isReal = (w) => w.workout_type !== 'rest' && (w.target_rss > 0 || w.duration_minutes > 0);

  // Group by week so swaps stay within a 7-day microcycle.
  const weekMap = new Map();
  for (const w of list) {
    if (!weekMap.has(w.week_number)) weekMap.set(w.week_number, []);
    weekMap.get(w.week_number).push(w);
  }

  let redistributedCount = 0;

  for (const [, weekWorkouts] of weekMap) {
    const onBlockedDays = weekWorkouts.filter(
      (w) => blockedDays.has(w.day_of_week) && isReal(w),
    );

    for (const blocked of onBlockedDays) {
      let bestTarget = null;
      let bestScore = -Infinity;

      for (const candidate of weekWorkouts) {
        if (candidate === blocked) continue;
        if (blockedDays.has(candidate.day_of_week)) continue;

        const candidateIsReal = isReal(candidate);
        let score = 50;
        // Prefer dropping the session onto a rest/easy slot, not doubling up.
        if (!candidateIsReal) score += 25;
        else score -= 20;
        if (preferredDays.has(candidate.day_of_week)) score += 15;
        // Weekend bonus for long rides.
        if (preferWeekendLong && (candidate.day_of_week === 0 || candidate.day_of_week === 6)) {
          const isLong = blocked.long_ride_flag || blocked.duration_minutes >= 120;
          if (isLong) score += 10;
        }
        const dist = Math.min(
          Math.abs(candidate.day_of_week - blocked.day_of_week),
          7 - Math.abs(candidate.day_of_week - blocked.day_of_week),
        );
        score -= dist * 3;

        if (score > bestScore) {
          bestScore = score;
          bestTarget = candidate;
        }
      }

      if (bestTarget) {
        swapArcContent(blocked, bestTarget);
        redistributedCount++;
      }
    }
  }

  return { workouts: list, redistributedCount };
}

export { SESSION_TYPE_TO_WORKOUT_TYPE, SESSION_TYPE_TO_NAME };
