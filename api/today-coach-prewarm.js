/**
 * Today Coach Paragraph — Pre-warm Cron
 *
 * Runs hourly (UTC). For each supported IANA timezone whose local hour is
 * currently 4 (i.e. ≈ 04:15 local time, ± 30 min), iterate over active
 * users in that timezone and pre-warm the Today coach paragraph cache.
 *
 * Piggybacks on the same per-timezone pattern used by
 * api/workout-preview-cron.js (the 7pm tomorrow's-workout preview).
 *
 * The pre-warm writes into `fitness_summaries` so when the user opens
 * the Today view in the morning, the paragraph is served synchronously
 * from cache. Cold-start (e.g. user wakes before 04:15) falls through to
 * on-demand generation in api/fitness-summary.js.
 */

import { getSupabaseAdmin } from './utils/supabaseAdmin.js';
import { verifyCronAuth } from './utils/verifyCronAuth.js';
import { generateTodaySummary } from './fitness-summary.js';

// Same supported list as api/workout-preview-cron.js — keep in sync.
const SUPPORTED_TIMEZONES = [
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix',
  'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu',
  'America/Toronto', 'America/Vancouver', 'America/Edmonton',
  'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Amsterdam',
  'Europe/Madrid', 'Europe/Rome', 'Europe/Zurich', 'Europe/Brussels',
  'Europe/Vienna', 'Europe/Stockholm', 'Europe/Copenhagen', 'Europe/Oslo',
  'Europe/Helsinki', 'Europe/Athens', 'Europe/Moscow',
  'Asia/Tokyo', 'Asia/Seoul', 'Asia/Shanghai', 'Asia/Hong_Kong',
  'Asia/Singapore', 'Asia/Dubai', 'Asia/Kolkata', 'Asia/Bangkok',
  'Australia/Sydney', 'Australia/Melbourne', 'Australia/Brisbane',
  'Australia/Perth', 'Australia/Adelaide', 'Pacific/Auckland',
  'America/Sao_Paulo', 'America/Buenos_Aires', 'America/Santiago',
  'America/Lima', 'America/Bogota',
  'Africa/Johannesburg', 'Africa/Cairo', 'Africa/Nairobi', 'Asia/Jerusalem',
];

const TARGET_HOUR = 4;

// Mirrors src/utils/todayVocabulary.ts freshnessFromFormScore — kept here
// to avoid a TS→JS import. If the thresholds change, change them in BOTH
// places (or extract to a shared .js module later).
function freshnessFromFormScore(fs) {
  if (fs == null || !Number.isFinite(fs)) return null;
  if (fs < -20) return 'drained';
  if (fs < -10) return 'loaded';
  if (fs < -5) return 'primed';
  if (fs < 5) return 'ready';
  if (fs < 15) return 'sharp';
  return 'stale';
}

function localDateInTz(date, tz) {
  return date.toLocaleDateString('en-CA', { timeZone: tz });
}

function localHourInTz(date, tz) {
  return parseInt(
    date.toLocaleString('en-US', { timeZone: tz, hour: 'numeric', hour12: false }),
    10,
  );
}

export default async function handler(req, res) {
  const { authorized } = verifyCronAuth(req);
  if (!authorized) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const supabase = getSupabaseAdmin();
  const now = new Date();

  const targetTimezones = SUPPORTED_TIMEZONES.filter((tz) => {
    try {
      return localHourInTz(now, tz) === TARGET_HOUR;
    } catch {
      return false;
    }
  });

  if (targetTimezones.length === 0) {
    return res.status(200).json({ message: 'No timezones at target hour', warmed: 0 });
  }

  const { data: users } = await supabase
    .from('user_profiles')
    .select('id, timezone, coach_persona_id')
    .in('timezone', targetTimezones);

  if (!users?.length) {
    return res.status(200).json({
      message: 'No users in target timezones',
      timezones: targetTimezones,
      warmed: 0,
    });
  }

  let warmed = 0;
  let skipped = 0;
  const errors = [];

  for (const user of users) {
    try {
      const userToday = localDateInTz(now, user.timezone);

      // 1. Load latest training_load_daily row (canonical-first with legacy fallback).
      const { data: tld } = await supabase
        .from('training_load_daily')
        .select('tfi, afi, form_score, ctl, atl, tsb, rss, tss, date')
        .eq('user_id', user.id)
        .order('date', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!tld) {
        // No fitness data yet — skip pre-warm; the user will get a cold-start
        // generation if they open the Today view.
        skipped++;
        continue;
      }

      const tfi = tld.tfi ?? tld.ctl ?? 0;
      const afi = tld.afi ?? tld.atl ?? 0;
      const formScore = tld.form_score ?? tld.tsb ?? 0;
      const lastRideRss = tld.rss ?? tld.tss ?? null;

      // 2. Today's workout (use planned_workouts, the canonical source for the Today view)
      const { data: workout } = await supabase
        .from('planned_workouts')
        .select('id, name, workout_id, workout_type, duration_minutes, target_duration')
        .eq('user_id', user.id)
        .eq('scheduled_date', userToday)
        .eq('completed', false)
        .limit(1)
        .maybeSingle();

      // 3. Next A-race within 60 days
      const sixtyDays = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
      const { data: race } = await supabase
        .from('race_goals')
        .select('name, race_date, race_type, priority')
        .eq('user_id', user.id)
        .eq('status', 'upcoming')
        .eq('priority', 'A')
        .gte('race_date', userToday)
        .lte('race_date', localDateInTz(sixtyDays, user.timezone))
        .order('race_date', { ascending: true })
        .limit(1)
        .maybeSingle();

      const daysToRace = race
        ? Math.round((new Date(race.race_date).getTime() - new Date(`${userToday}T12:00:00Z`).getTime()) / (1000 * 60 * 60 * 24))
        : null;

      const todayContext = {
        workoutId: workout?.workout_id || null,
        workoutName: workout?.name || null,
        workoutType: workout?.workout_type || null,
        durationMinutes: workout?.duration_minutes || workout?.target_duration || null,
        // Phase / week-in-phase are passed by the frontend on user-load (template
        // lookup happens in src/utils/todayPhase.ts). The cron leaves them null
        // so the cache_key matches; the LLM sees the on-load phase only.
        phase: null,
        weekInPhase: null,
        weeksInPhase: null,
        weeksRemaining: null,
        freshnessWord: freshnessFromFormScore(formScore),
        raceName: race?.name || null,
        raceType: race?.race_type || null,
        daysToRace,
      };

      await generateTodaySummary(
        user.id,
        { tfi, afi, formScore, lastRideRss },
        todayContext,
        { timezone: user.timezone, forceRefresh: true },
      );

      warmed++;
    } catch (err) {
      errors.push({ userId: user.id, error: err.message });
      console.error(`[today-coach-prewarm] user ${user.id} failed:`, err.message);
    }
  }

  return res.status(200).json({
    message: 'Today coach pre-warm complete',
    timezones: targetTimezones,
    usersChecked: users.length,
    warmed,
    skipped,
    errors: errors.length,
  });
}
