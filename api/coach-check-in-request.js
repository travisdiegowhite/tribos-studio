/**
 * Coach Check-In Manual Request
 *
 * User-authenticated endpoint that lets users manually trigger a coaching
 * check-in based on their most recent synced activity.
 *
 * POST /api/coach-check-in-request
 * Auth: Bearer <JWT>
 */

import { createClient } from '@supabase/supabase-js';
import { setupCors } from './utils/cors.js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function getUserFromAuthHeader(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.substring(7);
  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    return null;
  }

  return user;
}

export default async function handler(req, res) {
  if (setupCors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await getUserFromAuthHeader(req);
  if (!user) {
    return res.status(401).json({ error: 'unauthorized', message: 'Please sign in again.' });
  }

  const userId = user.id;

  try {
    // Guard: active training plan
    const { data: plan } = await supabase
      .from('training_plans')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'active')
      .maybeSingle();

    if (!plan) {
      return res.status(400).json({
        error: 'no_active_plan',
        message: 'You need an active training plan to get coaching check-ins.',
      });
    }

    // Guard: persona set
    const { data: settings } = await supabase
      .from('user_coach_settings')
      .select('coaching_persona')
      .eq('user_id', userId)
      .maybeSingle();

    if (!settings?.coaching_persona || settings.coaching_persona === 'pending') {
      return res.status(400).json({
        error: 'no_persona',
        message: 'Complete the coaching intake interview first.',
      });
    }

    // Rate limit: no check-in created in last 10 minutes
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data: recentCheckIn } = await supabase
      .from('coach_check_ins')
      .select('id, created_at')
      .eq('user_id', userId)
      .gt('created_at', tenMinutesAgo)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (recentCheckIn) {
      return res.status(429).json({
        error: 'rate_limited',
        message: 'You recently requested a check-in. Try again in a few minutes.',
      });
    }

    // Find latest activity without an existing check-in
    const { data: recentActivities } = await supabase
      .from('activities')
      .select('id')
      .eq('user_id', userId)
      .order('start_date', { ascending: false })
      .limit(5);

    if (!recentActivities?.length) {
      return res.status(400).json({
        error: 'no_eligible_activity',
        message: 'No synced activities found. Complete a ride first.',
      });
    }

    // Find first activity without a check-in
    let eligibleActivityId = null;
    for (const activity of recentActivities) {
      const { data: existing } = await supabase
        .from('coach_check_ins')
        .select('id')
        .eq('activity_id', activity.id)
        .maybeSingle();

      if (!existing) {
        eligibleActivityId = activity.id;
        break;
      }
    }

    if (!eligibleActivityId) {
      return res.status(400).json({
        error: 'no_eligible_activity',
        message: 'Your latest activities all have check-ins already. Go ride!',
      });
    }

    // Insert pending check-in
    const { data: checkIn, error: insertError } = await supabase
      .from('coach_check_ins')
      .insert({
        user_id: userId,
        activity_id: eligibleActivityId,
        persona_id: settings.coaching_persona,
        status: 'pending',
      })
      .select('id')
      .single();

    if (insertError) {
      console.error('Failed to insert check-in:', insertError.message, insertError.details, insertError.hint);
      return res.status(500).json({
        error: 'insert_failed',
        message: `Failed to create check-in: ${insertError.message}`,
      });
    }

    // Fire-and-forget: trigger generation
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'https://www.tribos.studio';

    fetch(`${baseUrl}/api/coach-check-in-generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-cron-secret': process.env.CRON_SECRET,
      },
      body: JSON.stringify({ checkInId: checkIn.id }),
    }).catch(() => {});

    return res.status(200).json({
      checkInId: checkIn.id,
      activityId: eligibleActivityId,
      status: 'pending',
    });
  } catch (error) {
    console.error('Coach check-in request error:', error);
    return res.status(500).json({ error: 'internal_error', message: 'Something went wrong.' });
  }
}
