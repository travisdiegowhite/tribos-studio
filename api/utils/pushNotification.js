/**
 * Push Notification Utility
 *
 * Shared utility for sending web push notifications to users.
 * Uses the supabaseAdmin singleton — NEVER creates new Supabase clients.
 *
 * Handles: preference checks, deduplication, multi-device delivery,
 * stale subscription cleanup (410), and notification logging.
 */

import webpush from 'web-push';
import { getSupabaseAdmin } from './supabaseAdmin.js';

// Configure VAPID once at module load
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    process.env.VAPID_MAILTO || 'mailto:travis@tribos.studio',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

/**
 * Send a push notification to all active devices for a user.
 *
 * @param {string} userId - The user's UUID
 * @param {Object} options
 * @param {string} options.title - Notification title
 * @param {string} options.body - Notification body text
 * @param {string} [options.url] - Deep link URL on click (default: /dashboard)
 * @param {string} options.notificationType - One of: post_ride_insight, workout_preview, etc.
 * @param {string} [options.referenceId] - For deduplication (e.g. activity_id, date)
 * @returns {Promise<{sent?: number, skipped?: string}>}
 */
export async function sendPushToUser(userId, { title, body, url, notificationType, referenceId }) {
  const supabase = getSupabaseAdmin();

  // 1. Check user preferences (missing row = all defaults = all true)
  const { data: prefs } = await supabase
    .from('notification_preferences')
    .select(notificationType)
    .eq('user_id', userId)
    .maybeSingle();

  if (prefs && prefs[notificationType] === false) {
    return { skipped: 'opted_out' };
  }

  // 2. Deduplication check
  if (referenceId) {
    const { data: existing } = await supabase
      .from('notification_log')
      .select('id')
      .eq('user_id', userId)
      .eq('notification_type', notificationType)
      .eq('reference_id', referenceId)
      .maybeSingle();

    if (existing) {
      return { skipped: 'already_sent' };
    }
  }

  // 3. Fetch active subscriptions
  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('user_id', userId)
    .eq('is_active', true);

  if (!subs?.length) {
    return { skipped: 'no_subscriptions' };
  }

  // 4. Send to all devices
  const payload = JSON.stringify({
    title,
    body,
    url: url || '/dashboard',
  });

  const results = await Promise.allSettled(
    subs.map((sub) =>
      webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        payload
      )
    )
  );

  // 5. Clean stale subscriptions (410 = subscription expired/unsubscribed)
  for (let i = 0; i < results.length; i++) {
    if (results[i].status === 'rejected' && results[i].reason?.statusCode === 410) {
      await supabase
        .from('push_subscriptions')
        .update({ is_active: false })
        .eq('endpoint', subs[i].endpoint);
    }
  }

  // 6. Log the send
  const succeeded = results.filter((r) => r.status === 'fulfilled').length;
  const firstError = results.find((r) => r.status === 'rejected');

  await supabase.from('notification_log').insert({
    user_id: userId,
    notification_type: notificationType,
    channel: 'push',
    reference_id: referenceId || null,
    delivered: succeeded > 0,
    delivery_error: firstError?.reason?.message || null,
  });

  return { sent: succeeded };
}

/**
 * Build a post-ride insight notification message from training load data.
 *
 * @param {Object} load - Training load row from training_load_daily
 * @param {number} load.tfi - Training Fitness Index (spec §3.4)
 * @param {number} load.afi - Acute Fatigue Index (spec §3.5)
 * @param {number} load.form_score - Form Score (spec §3.6, aka FS)
 * @returns {{ title: string, body: string }}
 */
export function buildPostRideMessage(load) {
  if (!load) {
    return {
      title: 'Ride processed',
      body: 'Your latest ride has been synced and analyzed.',
    };
  }

  const fs = load.form_score;

  // FS interpretation (spec §5 color zones)
  let fatigue;
  if (fs < -20) {
    fatigue = 'You\'re carrying significant fatigue';
  } else if (fs < -10) {
    fatigue = 'You\'re in a solid training block';
  } else if (fs < 5) {
    fatigue = 'You\'re well balanced';
  } else {
    fatigue = 'You\'re fresh and recovered';
  }

  return {
    title: 'Ride processed',
    body: `${fatigue} (FS: ${fs}). Check your updated training load.`,
  };
}

/**
 * Build a workout preview notification message.
 *
 * @param {Object} workout - Workout data from scheduled_workouts or planned_workouts
 * @param {string} workout.workout_type - e.g. 'endurance', 'tempo', 'threshold'
 * @param {string} [workout.name] - Workout name (from planned_workouts)
 * @param {number} [workout.target_duration_mins] - Duration in minutes (scheduled_workouts)
 * @param {number} [workout.duration_minutes] - Duration in minutes (planned_workouts)
 * @param {number} [workout.target_tss] - Target TSS
 * @returns {{ title: string, body: string }}
 */
export function buildWorkoutPreviewMessage(workout) {
  const type = workout.workout_type || 'workout';
  const name = workout.name || type.charAt(0).toUpperCase() + type.slice(1);
  const duration = workout.target_duration_mins || workout.duration_minutes;
  const tss = workout.target_tss;

  let bodyParts = [];
  if (duration) {
    const hrs = Math.floor(duration / 60);
    const mins = duration % 60;
    bodyParts.push(hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`);
  }
  bodyParts.push(type);
  if (tss) {
    bodyParts.push(`~${tss} TSS`);
  }

  return {
    title: `Tomorrow: ${name}`,
    body: bodyParts.join(' · '),
  };
}
