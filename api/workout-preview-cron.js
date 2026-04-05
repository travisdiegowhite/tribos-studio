/**
 * Workout Preview Cron Job
 *
 * Runs hourly. Sends a "Tomorrow's workout" push notification to users
 * for whom it is currently 7pm local time and who have a workout scheduled
 * for tomorrow.
 *
 * Timezone-aware: filters users by their stored timezone preference.
 * Deduplication: uses notification_log with reference_id = tomorrow's date.
 */

import { getSupabaseAdmin } from './utils/supabaseAdmin.js';
import { verifyCronAuth } from './utils/verifyCronAuth.js';
import { sendPushToUser, buildWorkoutPreviewMessage } from './utils/pushNotification.js';

// All IANA timezones we support (from src/utils/timezoneUtils.js)
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

const TARGET_HOUR = 19; // 7pm local time

export default async function handler(req, res) {
  const { authorized } = verifyCronAuth(req);
  if (!authorized) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const supabase = getSupabaseAdmin();
  const now = new Date();

  // Find timezones where local time is currently 7pm (19:00–19:59)
  const targetTimezones = SUPPORTED_TIMEZONES.filter((tz) => {
    try {
      const localHour = parseInt(
        now.toLocaleString('en-US', { timeZone: tz, hour: 'numeric', hour12: false })
      );
      return localHour === TARGET_HOUR;
    } catch {
      return false;
    }
  });

  if (targetTimezones.length === 0) {
    return res.status(200).json({ message: 'No timezones at target hour', sent: 0 });
  }

  // Get tomorrow's date in the first matching timezone (they all share the same date at 7pm)
  const tomorrowDate = getTomorrowDate(targetTimezones[0]);

  // Query users in matching timezones who have workout_preview enabled
  // and have active push subscriptions
  const { data: users, error: usersError } = await supabase
    .from('user_profiles')
    .select('id, timezone')
    .in('timezone', targetTimezones);

  if (usersError || !users?.length) {
    return res.status(200).json({
      message: usersError ? 'Query error' : 'No users in target timezones',
      timezones: targetTimezones,
      sent: 0,
    });
  }

  let sent = 0;
  let skipped = 0;

  for (const user of users) {
    try {
      // Get user-specific tomorrow date (in case of edge timezone differences)
      const userTomorrow = getTomorrowDate(user.timezone);

      // Check scheduled_workouts (coach workouts)
      const { data: scheduledWorkout } = await supabase
        .from('scheduled_workouts')
        .select('workout_type, target_duration_mins, committed_time, status')
        .eq('user_id', user.id)
        .eq('scheduled_date', userTomorrow)
        .in('status', ['planned', 'rescheduled'])
        .limit(1)
        .maybeSingle();

      // Check planned_workouts (training plan workouts) — only from active plans
      const { data: plannedWorkout } = await supabase
        .from('planned_workouts')
        .select('name, workout_type, duration_minutes, target_tss, completed, training_plans!inner(status)')
        .eq('user_id', user.id)
        .eq('scheduled_date', userTomorrow)
        .eq('completed', false)
        .eq('training_plans.status', 'active')
        .limit(1)
        .maybeSingle();

      // Use whichever is available (prefer planned_workouts as it has richer data)
      const workout = plannedWorkout || scheduledWorkout;

      if (!workout) {
        skipped++;
        continue;
      }

      // Skip rest days
      if (workout.workout_type === 'rest') {
        skipped++;
        continue;
      }

      const message = buildWorkoutPreviewMessage(workout);
      const result = await sendPushToUser(user.id, {
        ...message,
        url: '/training',
        notificationType: 'workout_preview',
        referenceId: userTomorrow,
      });

      if (result.sent) {
        sent++;
      } else {
        skipped++;
      }
    } catch (error) {
      console.error(`⚠️ Workout preview failed for user ${user.id}:`, error.message);
      skipped++;
    }
  }

  return res.status(200).json({
    message: 'Workout preview cron complete',
    timezones: targetTimezones,
    usersChecked: users.length,
    sent,
    skipped,
  });
}

/**
 * Get tomorrow's date string (YYYY-MM-DD) in a given timezone.
 */
function getTomorrowDate(timezone) {
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(tomorrow);
}
