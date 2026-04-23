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
export function buildTemporalAnchor(timezone, plannedWorkouts = [], raceGoals = [], now = new Date()) {
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

  // Build a set of dates that need labels: today, tomorrow, +days with sessions or goals
  const goalDateSet = new Set((raceGoals || []).map(g => g.race_date).filter(Boolean));
  const sessionDateSet = new Set(
    (plannedWorkouts || []).map(w => w.scheduled_date).filter(Boolean)
  );

  // Collect all offsets 0..13; we always include today(0) and tomorrow(1)
  const relevantOffsets = new Set([0, 1]);
  for (let i = 2; i <= 13; i++) {
    const dateStr = localDateOffset(todayNoon, i, safeTz);
    if (goalDateSet.has(dateStr) || sessionDateSet.has(dateStr)) {
      relevantOffsets.add(i);
    }
  }

  // Build the CALENDAR_ANCHOR entries and a dateStr→label lookup
  const usedLabels = new Set();
  const dateToLabel = new Map(); // dateStr → anchor label
  const anchorLines = [];

  for (const offset of [...relevantOffsets].sort((a, b) => a - b)) {
    const dateStr = offset === 0 ? todayStr : localDateOffset(todayNoon, offset, safeTz);
    const label = anchorLabel(offset, todayDow, usedLabels, dateStr);
    usedLabels.add(label);
    dateToLabel.set(dateStr, label);

    const goal = (raceGoals || []).find(g => g.race_date === dateStr);
    const goalSuffix = goal
      ? `  (goal_event: ${goal.name.toLowerCase().replace(/\s+/g, '_')})`
      : '';

    anchorLines.push(`  ${label.padEnd(12)} → ${prettyDate(dateStr, safeTz)}${goalSuffix}`);
  }

  // DAYS_UNTIL for race goals within 90 days
  const daysUntilLines = [];
  for (const goal of (raceGoals || [])) {
    if (!goal.race_date) continue;
    const goalNoon = noonUTCFor(goal.race_date);
    const diffDays = Math.round((goalNoon.getTime() - todayNoon.getTime()) / (24 * 60 * 60 * 1000));
    if (diffDays >= 0 && diffDays <= 90) {
      const key = goal.name.toLowerCase().replace(/\s+/g, '_');
      daysUntilLines.push(`  ${key}: ${diffDays}`);
    }
  }

  // SESSIONS — planned workouts in the anchor window
  const sessionLines = [];
  const workoutsInWindow = (plannedWorkouts || [])
    .filter(w => dateToLabel.has(w.scheduled_date))
    .sort((a, b) => (a.scheduled_date > b.scheduled_date ? 1 : -1));

  for (const session of workoutsInWindow) {
    const sessionId = 'sess_' + session.id.replace(/-/g, '').slice(0, 8);
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

  if (sessionLines.length > 0) {
    lines.push(
      '',
      'SESSIONS (next 14 days, resolved):',
      ...sessionLines
    );
  }

  lines.push(
    '',
    'CONSTRAINT: Refer to days only by labels in CALENDAR_ANCHOR. Refer to',
    'sessions only by session_id. Do not compute new dates.'
  );

  return lines.join('\n');
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

  const [workoutsResult, goalsResult] = await Promise.all([
    supabase
      .from('planned_workouts')
      .select('id, scheduled_date, workout_type, name, target_duration, target_rss')
      .eq('user_id', userId)
      .eq('completed', false)
      .gte('scheduled_date', todayStr)
      .lte('scheduled_date', cutoffStr)
      .order('scheduled_date', { ascending: true }),
    supabase
      .from('race_goals')
      .select('id, name, race_date, race_type, priority')
      .eq('user_id', userId)
      .eq('status', 'upcoming')
      .gte('race_date', todayStr)
      .order('race_date', { ascending: true })
      .limit(10),
  ]);

  return {
    plannedWorkouts: workoutsResult.data || [],
    raceGoals: goalsResult.data || [],
  };
}
