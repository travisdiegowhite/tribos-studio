/**
 * Coach Context Enrichment — server-fetched training snapshot for /api/coach.
 *
 * Every coach surface sends a client-rendered `trainingContext` string, but the
 * thin surfaces (Today spine, glance, command bar) send only a couple of
 * sentences, leaving the coach without FTP, recent activities, weekly load, or
 * plan status. This module fetches that grounding server-side so all surfaces
 * are equally informed. The client's on-screen TFI/AFI/FS snapshot stays
 * authoritative for CURRENT fitness — the block's precedence note says so.
 *
 * Split into fetch (runs inside coach.js's existing Promise.all batch) and a
 * pure formatter (runs later, once the user's timezone is resolved).
 *
 * DST safety: date arithmetic goes through noon-UTC timestamps, same pattern
 * as temporalAnchor.js.
 */

import { getSportType } from './sportTypes.js';

// ─── Timezone-safe date helpers (module-private, mirrors temporalAnchor.js) ──

function toLocalDateStr(date, timezone) {
  try {
    return date.toLocaleDateString('en-CA', { timeZone: timezone });
  } catch {
    return date.toISOString().split('T')[0];
  }
}

function noonUTCFor(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0, 0));
}

function localDateOffset(todayNoon, offsetDays, timezone) {
  const ms = todayNoon.getTime() + offsetDays * 24 * 60 * 60 * 1000;
  return toLocalDateStr(new Date(ms), timezone);
}

const FULL_DAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function dowForDateStr(dateStr, timezone) {
  const d = noonUTCFor(dateStr);
  const dayName = d.toLocaleDateString('en-US', { weekday: 'long', timeZone: timezone });
  return FULL_DAY.indexOf(dayName);
}

/** Format YYYY-MM-DD as "Mon Jul 21". */
function prettyDate(dateStr, timezone) {
  const d = noonUTCFor(dateStr);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).formatToParts(d);
  const get = (t) => parts.find((p) => p.type === t)?.value || '';
  return `${get('weekday')} ${get('month')} ${get('day')}`;
}

function formatDuration(totalSeconds) {
  if (!totalSeconds || totalSeconds <= 0) return null;
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.round((totalSeconds % 3600) / 60);
  if (hrs > 0) return `${hrs}h${mins.toString().padStart(2, '0')}m`;
  return `${mins}m`;
}

function formatMinutes(totalMinutes) {
  if (!totalMinutes || totalMinutes <= 0) return null;
  const hrs = Math.floor(totalMinutes / 60);
  const mins = Math.round(totalMinutes % 60);
  if (hrs > 0 && mins > 0) return `${hrs}h${mins.toString().padStart(2, '0')}m`;
  if (hrs > 0) return `${hrs}h`;
  return `${mins}min`;
}

// ─── Fetch ───────────────────────────────────────────────────────────────────

/**
 * Fetch the raw rows the enrichment block needs. Runs inside the coach
 * handler's parallel batch, before the user's timezone is known, so windows
 * are UTC-generous; the formatter trims to the athlete's local week.
 *
 * Never throws — returns null on failure so the coach degrades gracefully.
 *
 * @param {object} supabase  Supabase admin client (from supabaseAdmin.js)
 * @param {string} userId    Verified user id
 * @returns {Promise<{recentActivities: Array, latestLoad: object|null, weekPlanned: Array}|null>}
 */
export async function fetchCoachEnrichmentData(supabase, userId) {
  try {
    const now = new Date();
    const todayNoon = noonUTCFor(now.toISOString().split('T')[0]);
    const dayMs = 24 * 60 * 60 * 1000;
    const activitiesSince = new Date(todayNoon.getTime() - 15 * dayMs).toISOString();
    const plannedStart = new Date(todayNoon.getTime() - 8 * dayMs).toISOString().split('T')[0];
    const plannedEnd = new Date(todayNoon.getTime() + 7 * dayMs).toISOString().split('T')[0];

    const [activitiesResult, loadResult, plannedResult] = await Promise.all([
      supabase
        .from('activities')
        .select('id, name, type, sport_type, start_date, distance, moving_time, average_watts, rss, tss')
        .eq('user_id', userId)
        .is('duplicate_of', null)
        .or('is_hidden.eq.false,is_hidden.is.null')
        .gte('start_date', activitiesSince)
        .order('start_date', { ascending: false })
        .limit(30),
      // training_load_daily is canonical-only: legacy ctl/atl/tsb/tss columns
      // were dropped by migration 071 (see METRICS_ROLLOUT_FREEZE).
      supabase
        .from('training_load_daily')
        .select('date, tfi, afi, form_score, rss, fs_confidence')
        .eq('user_id', userId)
        .order('date', { ascending: false })
        .limit(1)
        .maybeSingle(),
      // All completion states — the temporal anchor only fetches uncompleted
      // future sessions, so DONE/MISSED status for this week comes from here.
      supabase
        .from('planned_workouts')
        .select('id, scheduled_date, name, workout_type, target_rss, target_tss, actual_rss, actual_tss, target_duration, completed, skipped_reason, activity_id')
        .eq('user_id', userId)
        .gte('scheduled_date', plannedStart)
        .lte('scheduled_date', plannedEnd)
        .order('scheduled_date', { ascending: true }),
    ]);

    return {
      recentActivities: activitiesResult?.data || [],
      latestLoad: loadResult?.data || null,
      weekPlanned: plannedResult?.data || [],
    };
  } catch (err) {
    console.error('Coach enrichment fetch failed (non-blocking):', err.message);
    return null;
  }
}

// ─── Format ──────────────────────────────────────────────────────────────────

function confidenceLabel(fsConfidence) {
  if (fsConfidence == null) return null;
  if (fsConfidence >= 0.9) return 'high';
  if (fsConfidence >= 0.65) return 'medium';
  return 'low';
}

function activityRss(a) {
  // Canonical-first with legacy fallback per the metrics freeze policy.
  return a.rss ?? a.tss ?? null;
}

function activityPower(a) {
  return a.average_watts ?? null;
}

/**
 * Build the SERVER TRAINING SNAPSHOT prompt block.
 *
 * Pure function — safe to unit test with an injected `now`.
 *
 * @param {object|null} data       Result of fetchCoachEnrichmentData (or null)
 * @param {object}      opts
 * @param {object|null} opts.profile    user_profiles row with { ftp, weight_kg }
 * @param {Array}       opts.raceGoals  race_goals rows (from fetchTemporalAnchorData,
 *                                      with detail columns when available)
 * @param {string}      opts.timezone   Resolved IANA timezone
 * @param {Date}        [opts.now]      Override "now" (for testing)
 * @returns {string|null}  Formatted block, or null when there is nothing to say
 */
export function buildCoachEnrichmentBlock(data, { profile = null, raceGoals = [], timezone = 'UTC', now = new Date() } = {}) {
  const ftp = profile?.ftp || null;
  if (!data && !ftp) return null;

  const safeTz = timezone || 'UTC';
  const todayStr = toLocalDateStr(now, safeTz);
  const todayNoon = noonUTCFor(todayStr);
  const todayDow = dowForDateStr(todayStr, safeTz);
  const mondayOffset = (todayDow + 6) % 7; // days back to Monday (0 when today is Monday)
  const weekStartStr = localDateOffset(todayNoon, -mondayOffset, safeTz);
  const weekEndStr = localDateOffset(todayNoon, 6 - mondayOffset, safeTz);

  const lines = [
    '=== SERVER TRAINING SNAPSHOT (DB-VERIFIED) ===',
    'Data fetched from the training database at request time.',
    "PRECEDENCE: if the ATHLETE'S CURRENT TRAINING CONTEXT block above includes TFI/AFI/FS values,",
    'those on-screen values are authoritative for CURRENT fitness — use the FITNESS line below only',
    'when they are absent above. Everything else in this block (FTP, recent activities, weekly',
    'volume, plan status, race details) is authoritative regardless of what the context above contains.',
  ];

  // FTP / weight
  if (ftp) {
    const weightKg = profile?.weight_kg || null;
    let line = `FTP: ${Math.round(ftp)}W`;
    if (weightKg) {
      line += ` | Weight: ${Math.round(weightKg)}kg (${(ftp / weightKg).toFixed(1)} W/kg)`;
    }
    lines.push('', line);
  }

  // Server-computed fitness (fallback only, per the precedence note above)
  const load = data?.latestLoad;
  if (load && (load.tfi != null || load.afi != null || load.form_score != null)) {
    const conf = confidenceLabel(load.fs_confidence);
    const parts = [];
    if (load.tfi != null) parts.push(`TFI ${Math.round(load.tfi)}`);
    if (load.afi != null) parts.push(`AFI ${Math.round(load.afi)}`);
    if (load.form_score != null) parts.push(`FS ${Math.round(load.form_score)}`);
    lines.push(
      '',
      `FITNESS (server-computed, as of ${load.date}): ${parts.join(', ')}${conf ? ` (confidence: ${conf})` : ''}`
    );
  }

  const activities = data?.recentActivities || [];
  const localDateOf = (a) => (a.start_date ? toLocalDateStr(new Date(a.start_date), safeTz) : null);

  // ── TODAY: the headline fact — what has (and hasn't) happened today. The
  // model must never infer today's status from the absence of a dated line.
  if (data) {
    const todayActivities = activities.filter((a) => localDateOf(a) === todayStr);
    const todayPlanned = (data.weekPlanned || []).filter((w) => w.scheduled_date === todayStr);
    const todayLines = [];

    if (todayActivities.length === 0 && todayPlanned.length === 0) {
      todayLines.push('  no activity recorded yet today; nothing planned for today');
    } else {
      for (const a of todayActivities) {
        const parts = [];
        if (a.distance) parts.push(`${(a.distance / 1000).toFixed(1)} km`);
        const dur = formatDuration(a.moving_time);
        if (dur) parts.push(dur);
        const rss = activityRss(a);
        if (rss != null) parts.push(`${Math.round(rss)} RSS`);
        todayLines.push(
          `  completed: ${a.name || 'Activity'} (${a.sport_type ?? a.type ?? 'Unknown'})${parts.length ? ` — ${parts.join(', ')}` : ''}`
        );
      }
      if (todayActivities.length === 0) {
        todayLines.push('  no activity recorded yet today');
      }
      for (const w of todayPlanned) {
        if (w.workout_type === 'rest') {
          todayLines.push('  planned: rest day scheduled');
          continue;
        }
        const parts = [w.name || w.workout_type || 'Workout'];
        const dur = formatMinutes(w.target_duration);
        if (dur) parts.push(dur);
        const targetRss = w.target_rss ?? w.target_tss;
        if (targetRss) parts.push(`~${Math.round(targetRss)} RSS`);
        const status = w.completed ? '[DONE]' : w.skipped_reason ? '[SKIPPED]' : '[NOT YET DONE]';
        todayLines.push(`  planned: ${parts.join(', ')} ${status}`);
      }
    }

    lines.push('', `TODAY (${prettyDate(todayStr, safeTz)}):`, ...todayLines);
  }

  // ── THIS WEEK: completed volume per sport + plan status ────────────────────
  const weekActivities = activities.filter((a) => {
    const d = localDateOf(a);
    return d && d >= weekStartStr && d <= weekEndStr;
  });

  const weekLines = [];
  if (weekActivities.length > 0) {
    const totalKm = weekActivities.reduce((s, a) => s + (a.distance || 0), 0) / 1000;
    const totalSecs = weekActivities.reduce((s, a) => s + (a.moving_time || 0), 0);
    const totalRss = weekActivities.reduce((s, a) => s + (activityRss(a) || 0), 0);
    weekLines.push(
      `  Completed: ${weekActivities.length} session${weekActivities.length === 1 ? '' : 's'} — ` +
        `${totalKm.toFixed(0)} km, ${formatDuration(totalSecs) || '0m'}, ${Math.round(totalRss)} RSS total`
    );

    const bySport = new Map();
    for (const a of weekActivities) {
      const sport = getSportType(a.sport_type ?? a.type);
      if (!bySport.has(sport)) bySport.set(sport, []);
      bySport.get(sport).push(a);
    }
    for (const [sport, list] of bySport) {
      const km = list.reduce((s, a) => s + (a.distance || 0), 0) / 1000;
      const secs = list.reduce((s, a) => s + (a.moving_time || 0), 0);
      const rss = list.reduce((s, a) => s + (activityRss(a) || 0), 0);
      const powered = list.filter((a) => activityPower(a));
      const avgW = powered.length > 0
        ? Math.round(powered.reduce((s, a) => s + activityPower(a), 0) / powered.length)
        : null;
      weekLines.push(
        `    ${sport}: ${list.length}, ${km.toFixed(0)} km, ${formatDuration(secs) || '0m'}, ` +
          `${Math.round(rss)} RSS${avgW ? `, ${avgW}W avg` : ''}`
      );
    }
  } else if (data) {
    weekLines.push('  Completed: no activities recorded yet this week');
  }

  // Plan status for the tz-local Mon–Sun week
  const weekPlanned = (data?.weekPlanned || []).filter(
    (w) => w.scheduled_date >= weekStartStr && w.scheduled_date <= weekEndStr
  );
  if (weekPlanned.length > 0) {
    // Weekly compliance counts only past-due non-rest workouts (same rule as
    // the training dashboard) — future sessions are not failures.
    const pastDue = weekPlanned.filter((w) => w.scheduled_date < todayStr && w.workout_type !== 'rest');
    const pastDueDone = pastDue.filter((w) => w.completed).length;
    const compliance = pastDue.length > 0 ? Math.round((pastDueDone / pastDue.length) * 100) : 100;
    const upcoming = weekPlanned.filter(
      (w) => !w.completed && !w.skipped_reason && w.scheduled_date >= todayStr && w.workout_type !== 'rest'
    );
    const upcomingRss = upcoming.reduce((s, w) => s + ((w.target_rss ?? w.target_tss) || 0), 0);
    weekLines.push(
      `  Plan status: ${pastDueDone}/${pastDue.length} past-due workouts done (weekly compliance ${compliance}%)` +
        (upcoming.length > 0 ? `; ${upcoming.length} upcoming (~${Math.round(upcomingRss)} RSS remaining)` : '')
    );
    for (const w of weekPlanned) {
      const status = w.completed
        ? 'DONE'
        : w.skipped_reason
          ? 'SKIPPED'
          : w.scheduled_date < todayStr
            ? 'MISSED'
            : w.scheduled_date === todayStr
              ? 'TODAY'
              : 'UPCOMING';
      const parts = [w.name || w.workout_type || 'Workout'];
      const dur = formatMinutes(w.target_duration);
      if (dur) parts.push(dur);
      const targetRss = w.target_rss ?? w.target_tss;
      if (targetRss) parts.push(`~${Math.round(targetRss)} RSS`);
      let actualStr = '';
      const actualRss = w.actual_rss ?? w.actual_tss;
      if (w.completed && actualRss != null) {
        actualStr = ` -> actual ${Math.round(actualRss)} RSS`;
        if (targetRss > 0) actualStr += ` (${Math.round((actualRss / targetRss) * 100)}%)`;
      }
      weekLines.push(`    ${prettyDate(w.scheduled_date, safeTz)}: [${status}] ${parts.join(', ')}${actualStr}`);
    }
  }

  if (weekLines.length > 0) {
    lines.push('', `THIS WEEK (${prettyDate(weekStartStr, safeTz)} – ${prettyDate(weekEndStr, safeTz)}, athlete's timezone):`, ...weekLines);
  }

  // ── RECENT ACTIVITIES (last 14 local days, newest first, max 10) ──────────
  const cutoffStr = localDateOffset(todayNoon, -14, safeTz);
  const recent = activities
    .filter((a) => {
      const d = localDateOf(a);
      return d && d >= cutoffStr;
    })
    .slice(0, 10);
  if (recent.length > 0) {
    lines.push('', 'RECENT ACTIVITIES (last 14 days, newest first, metric units):');
    for (const a of recent) {
      const parts = [];
      if (a.distance) parts.push(`${(a.distance / 1000).toFixed(1)} km`);
      const dur = formatDuration(a.moving_time);
      if (dur) parts.push(dur);
      const watts = activityPower(a);
      if (watts) parts.push(`${Math.round(watts)}W avg`);
      const rss = activityRss(a);
      if (rss != null) parts.push(`${Math.round(rss)} RSS`);
      const label = `${a.name || 'Activity'} (${a.sport_type ?? a.type ?? 'Unknown'})`;
      lines.push(`  ${prettyDate(localDateOf(a), safeTz)}: ${label}${parts.length ? ` — ${parts.join(', ')}` : ''}`);
    }
  }

  // ── RACE GOAL DETAILS (dates/countdowns live in the temporal anchor) ──────
  const detailedGoals = (raceGoals || []).filter(
    (g) => g.distance_km != null || g.elevation_gain_m != null || g.goal_time_minutes != null || g.goal_power_watts != null
  );
  if (detailedGoals.length > 0) {
    lines.push('', 'RACE GOAL DETAILS (dates and countdowns are in the TEMPORAL ANCHOR — do not recompute):');
    for (const g of detailedGoals) {
      const parts = [];
      if (g.distance_km != null) parts.push(`${g.distance_km} km`);
      if (g.elevation_gain_m != null) parts.push(`${g.elevation_gain_m} m gain`);
      if (g.goal_time_minutes != null) parts.push(`goal time ${formatMinutes(g.goal_time_minutes)}`);
      if (g.goal_power_watts != null) parts.push(`goal power ${g.goal_power_watts}W`);
      const priority = g.priority ? ` [${g.priority.toUpperCase()}]` : '';
      lines.push(`  ${g.name}${priority}: ${parts.join(', ')}`);
    }
  }

  // Header + precedence alone isn't worth injecting.
  if (lines.length <= 6) return null;

  return lines.join('\n');
}
