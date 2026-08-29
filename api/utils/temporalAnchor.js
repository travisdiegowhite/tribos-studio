/**
 * Temporal Anchor — pre-resolved date vocabulary for coach prompts.
 *
 * The LLM is prohibited from computing dates in prose. Instead this module
 * builds a CALENDAR_ANCHOR block that maps short labels (today, this_fri,
 * next_sun, etc.) to concrete ISO dates. The coach references only these labels.
 *
 * DST safety: all date arithmetic goes through noon-UTC timestamps so that a
 * wall-clock shift (e.g. 2026-11-01 02:00→01:00 in America/Denver) never
 * changes which calendar day we land on.
 */

import { fetchPlannedSessions } from './calendarRead.js';

const SHORT_DAY = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const FULL_DAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// ─── Low-level date helpers (no external deps) ────────────────────────────────

/**
 * Return YYYY-MM-DD string for `date` in the given IANA timezone.
 * en-CA locale consistently produces YYYY-MM-DD format.
 */
function toLocalDateStr(date, timezone) {
  try {
    return date.toLocaleDateString('en-CA', { timeZone: timezone });
  } catch {
    return date.toISOString().split('T')[0];
  }
}

/**
 * Return a Date at noon UTC for a YYYY-MM-DD local date string.
 * Noon UTC is safely away from any DST wall-clock transition
 * (transitions happen at 02:00 or 03:00 local, never at noon).
 * Adding whole multiples of 86 400 000 ms to this value always
 * yields the correct next/previous calendar day.
 */
function noonUTCFor(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0, 0));
}

/**
 * Return YYYY-MM-DD (in `timezone`) for the date that is `offsetDays`
 * calendar days after the noon-UTC anchor date.
 */
function localDateOffset(todayNoon, offsetDays, timezone) {
  const ms = todayNoon.getTime() + offsetDays * 24 * 60 * 60 * 1000;
  return toLocalDateStr(new Date(ms), timezone);
}

/**
 * Return the JS day-of-week (0=Sun … 6=Sat) for a YYYY-MM-DD string
 * interpreted in the given timezone.
 */
function dowForDateStr(dateStr, timezone) {
  const d = noonUTCFor(dateStr);
  const dayName = d.toLocaleDateString('en-US', { weekday: 'long', timeZone: timezone });
  return FULL_DAY.indexOf(dayName);
}

/**
 * Format YYYY-MM-DD as "Fri Apr 24".
 */
function prettyDate(dateStr, timezone) {
  const d = noonUTCFor(dateStr);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).formatToParts(d);
  const get = (t) => parts.find(p => p.type === t)?.value || '';
  return `${get('weekday')} ${get('month')} ${get('day')}`;
}

// ─── Label generation ─────────────────────────────────────────────────────────

/**
 * Choose the canonical anchor label for a day that is `offsetDays` from today.
 *
 * Rules:
 *   offset 0         → "today"
 *   offset 1         → "tomorrow"
 *   offsets 2..N     → "this_{dayname}"  (N = days remaining until Sunday inclusive)
 *   offsets N+1..13  → "next_{dayname}"
 *
 * "This week" is defined as the current Mon–Sun block.
 * Sunday itself is the last day of the current week (daysUntilSunday = 0 when
 * today is Sunday, meaning today is already the last day).
 *
 * If a label was already assigned (rare collision for days 8-13), the
 * ISO date string is returned as a fallback unique label.
 */
function anchorLabel(offsetDays, todayDow, usedLabels, dateStr) {
  if (offsetDays === 0) return 'today';
  if (offsetDays === 1) return 'tomorrow';

  // Days remaining in the current Mon–Sun week (including today).
  // dow 0=Sun → already the last day, daysUntilSunday=0
  // dow 1=Mon → 6 days left, daysUntilSunday=6
  const daysUntilSunday = todayDow === 0 ? 0 : 7 - todayDow;

  const targetDow = (todayDow + offsetDays) % 7;
  const prefix = offsetDays <= daysUntilSunday ? 'this' : 'next';
  const candidate = `${prefix}_${SHORT_DAY[targetDow]}`;

  if (!usedLabels.has(candidate)) return candidate;
  // Collision (happens when the 14-day window spans >2 weeks):
  // fall back to ISO date as a unique, self-describing label.
  return dateStr;
}

// ─── Session description ──────────────────────────────────────────────────────

/** Short internal handle for a planned_workouts row ("sess_" + 8 hex chars). */
function sessionIdFor(session) {
  return 'sess_' + session.id.replace(/-/g, '').slice(0, 8);
}

function describeSession(session) {
  if (!session) return 'workout';

  const type = (session.workout_type || '').toLowerCase();
  if (type === 'rest' || type === 'rest_day' || type === 'off') return 'rest';

  const parts = [];
  const dur = session.target_duration ?? session.duration_minutes;
  if (dur) {
    const hrs = Math.floor(dur / 60);
    const mins = dur % 60;
    if (hrs > 0 && mins > 0) parts.push(`${hrs}h${mins}m`);
    else if (hrs > 0) parts.push(`${hrs}h`);
    else parts.push(`${mins}m`);
  }

  const displayName = session.name || session.workout_type || 'workout';
  parts.push(displayName);
  return parts.join(' ');
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Build the TEMPORAL_ANCHOR block to prepend to every coach system prompt.
 *
 * @param {string} timezone        IANA timezone (e.g. "America/Denver")
 * @param {Array}  plannedWorkouts planned_workouts rows: { id, scheduled_date,
 *                                   workout_type, name, target_duration, target_rss }
 * @param {Array}  raceGoals       race_goals rows: { id, name, race_date, priority }
 * @param {Date}   [now]           Override "now" (for testing)
 * @returns {string}               Formatted anchor block
 */
export function buildTemporalAnchor(timezone, plannedWorkouts = [], raceGoals = [], now = new Date(), { selectedRaceGoalId = null } = {}) {
  const safeTz = timezone || 'UTC';

  const todayStr = toLocalDateStr(now, safeTz);
  const todayNoon = noonUTCFor(todayStr);
  const todayDow = dowForDateStr(todayStr, safeTz);

  // Current time label for the NOW line
  const nowFormatted = new Intl.DateTimeFormat('en-US', {
    timeZone: safeTz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(now);

  const sessionDateSet = new Set(
    (plannedWorkouts || []).map(w => w.scheduled_date).filter(Boolean)
  );

  // Every day in the 14-day window gets a label — including days with nothing
  // planned. A gap day the model cannot name is a gap day it cannot reason
  // about ("you'd have Saturday free before Sunday's race"), and the
  // CONSTRAINT below forbids naming unlabeled days.
  const usedLabels = new Set();
  const dateToLabel = new Map(); // dateStr → anchor label
  const anchorLines = [];

  for (let offset = 0; offset <= 13; offset++) {
    const dateStr = offset === 0 ? todayStr : localDateOffset(todayNoon, offset, safeTz);
    const label = anchorLabel(offset, todayDow, usedLabels, dateStr);
    usedLabels.add(label);
    dateToLabel.set(dateStr, label);

    const goal = (raceGoals || []).find(g => g.race_date === dateStr);
    const suffix = goal
      ? `  (goal_event: ${goal.name.toLowerCase().replace(/\s+/g, '_')})`
      : sessionDateSet.has(dateStr) ? '' : '  (nothing planned)';

    anchorLines.push(`  ${label.padEnd(12)} → ${prettyDate(dateStr, safeTz)}${suffix}`);
  }

  // DAYS_UNTIL for race goals within 90 days, plus the anchor race (soonest
  // A-priority goal; falls back to the soonest upcoming goal). The anchor race
  // gives the coach an unambiguous date to copy into create_training_plan's
  // target_event_date when periodizing toward an event.
  const daysUntilLines = [];
  let anchorRace = null; // { goal, diffDays }
  let selectedRace = null; // { goal, diffDays } — the race open in the Race tab
  for (const goal of (raceGoals || [])) {
    if (!goal.race_date) continue;
    const goalNoon = noonUTCFor(goal.race_date);
    const diffDays = Math.round((goalNoon.getTime() - todayNoon.getTime()) / (24 * 60 * 60 * 1000));
    if (diffDays < 0) continue;
    const priority = (goal.priority || '').toUpperCase();
    const isSelected = selectedRaceGoalId != null && goal.id === selectedRaceGoalId;
    if (isSelected) selectedRace = { goal, diffDays };

    if (diffDays <= 90) {
      const key = goal.name.toLowerCase().replace(/\s+/g, '_');
      const prioritySuffix = priority ? ` (Priority ${priority})` : '';
      const selectedSuffix = isSelected ? ' [CURRENTLY SELECTED]' : '';
      daysUntilLines.push(`  ${key}: ${diffDays}${prioritySuffix}${selectedSuffix}`);
    }

    // raceGoals arrives sorted by race_date ascending, so the first A we see is
    // the soonest A. A-priority always wins; otherwise keep the soonest upcoming.
    if (priority === 'A') {
      if (!anchorRace || anchorRace.priority !== 'A') anchorRace = { goal, diffDays, priority };
    } else if (!anchorRace) {
      anchorRace = { goal, diffDays, priority };
    }
  }

  // SESSIONS — planned workouts in the anchor window
  const sessionLines = [];
  const workoutsInWindow = (plannedWorkouts || [])
    .filter(w => dateToLabel.has(w.scheduled_date))
    .sort((a, b) => (a.scheduled_date > b.scheduled_date ? 1 : -1));

  for (const session of workoutsInWindow) {
    const sessionId = sessionIdFor(session);
    const dayLabel = dateToLabel.get(session.scheduled_date) || session.scheduled_date;
    const goal = (raceGoals || []).find(g => g.race_date === session.scheduled_date);
    const isRaceDay = goal &&
      (session.workout_type === 'race' || (session.name || '').toUpperCase().includes('RACE'));
    const description = isRaceDay
      ? `RACE — ${goal.name}`
      : describeSession(session);
    sessionLines.push(`  ${sessionId.padEnd(14)} ${dayLabel.padEnd(12)} ${description}`);
  }

  // Assemble
  const lines = [
    `USER_TZ: ${safeTz}`,
    `NOW: ${nowFormatted} (${FULL_DAY[todayDow]})`,
    '',
    'CALENDAR_ANCHOR:',
    ...anchorLines,
  ];

  if (daysUntilLines.length > 0) {
    lines.push('', 'DAYS_UNTIL:', ...daysUntilLines);
  }

  if (anchorRace) {
    const label = anchorRace.priority === 'A' ? 'NEXT_A_RACE' : 'NEXT_RACE';
    lines.push(
      '',
      `${label}: ${anchorRace.goal.name} ${anchorRace.goal.race_date} (${anchorRace.diffDays} days)`
    );
  }

  if (selectedRace) {
    // Emitted even past the 90-day DAYS_UNTIL cap so the open race always has
    // an authoritative countdown.
    if (!anchorRace) lines.push('');
    lines.push(
      `SELECTED_RACE: ${selectedRace.goal.name} ${selectedRace.goal.race_date} (${selectedRace.diffDays} days) — the race the athlete is currently viewing in the Race tab`
    );
  }

  if (sessionLines.length > 0) {
    lines.push(
      '',
      'SESSIONS (next 14 days, scheduled and NOT yet completed — finished sessions are not listed here):',
      ...sessionLines
    );
  }

  lines.push(
    '',
    'CONSTRAINT: Refer to days only by labels in CALENDAR_ANCHOR. Do not compute new dates.',
    'session_ids (e.g. "sess_1af3bc12") are INTERNAL identifiers for tool calls only —',
    'NEVER write a session_id in text the athlete will read. In prose, refer to sessions',
    'by their description and day instead (e.g. "tomorrow\'s 1h15m endurance ride").'
  );

  return lines.join('\n');
}

// ─── Session-id sanitization (athlete-facing text) ────────────────────────────

/**
 * Map every planned workout's internal "sess_xxxxxxxx" handle to its
 * human description (same derivation and wording the SESSIONS block uses).
 */
export function buildSessionLabelMap(plannedWorkouts = []) {
  const map = new Map();
  for (const session of plannedWorkouts || []) {
    if (!session?.id) continue;
    map.set(sessionIdFor(session).toLowerCase(), describeSession(session));
  }
  return map;
}

const SESSION_ID_PATTERN = /\bsess_[0-9a-f]{6,12}\b/gi;

/**
 * Replace internal session ids in athlete-facing prose with the session's
 * description. Unknown ids degrade to "the scheduled session" — this runs on
 * display text only (never on tool payloads), so degrading beats leaking an
 * internal handle. Non-strings pass through untouched.
 */
export function sanitizeSessionIds(text, labelMap) {
  if (typeof text !== 'string' || !text) return text;
  return text.replace(SESSION_ID_PATTERN, (match) => {
    const label = labelMap?.get(match.toLowerCase());
    return label || 'the scheduled session';
  });
}

/**
 * Fetch the data needed for buildTemporalAnchor from the database.
 *
 * @param {string} userId
 * @param {object} supabase  Supabase admin client (from supabaseAdmin.js)
 * @param {string} timezone  Resolved IANA timezone for the user
 * @returns {{ plannedWorkouts: Array, raceGoals: Array }}
 */
export async function fetchTemporalAnchorData(userId, supabase, timezone) {
  const safeTz = timezone || 'UTC';
  const now = new Date();
  const todayStr = toLocalDateStr(now, safeTz);
  const todayNoon = noonUTCFor(todayStr);
  const cutoffMs = todayNoon.getTime() + 14 * 24 * 60 * 60 * 1000;
  const cutoffStr = toLocalDateStr(new Date(cutoffMs), safeTz);

  const [plannedWorkouts, goalsResult] = await Promise.all([
    // The CALENDAR, not planned_workouts. The nullable-`completed` dance this
    // replaced is gone with the column: calendar_entries.status is NOT NULL
    // with a default, so "not yet done" is one unambiguous predicate.
    fetchPlannedSessions(userId, {
      from: todayStr,
      to: cutoffStr,
      includeCompleted: false,
    }),
    supabase
      .from('race_goals')
      // Detail columns feed the coach's SERVER TRAINING SNAPSHOT block
      // (coachContextEnrichment.js); buildTemporalAnchor ignores them.
      .select('id, name, race_date, race_type, priority, distance_km, elevation_gain_m, goal_time_minutes, goal_power_watts')
      .eq('user_id', userId)
      .eq('status', 'upcoming')
      .gte('race_date', todayStr)
      .order('race_date', { ascending: true })
      .limit(10),
  ]);

  return {
    plannedWorkouts,
    raceGoals: goalsResult.data || [],
  };
}
