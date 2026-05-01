/**
 * GET /api/today-route-suggestions
 *
 * Ranks the authenticated user's saved routes against today's planned
 * workout and returns the top 3. Used by the Today view's route picker.
 *
 * Query params:
 *   - workoutType    (optional) — overrides the fetched planned_workouts.workout_type
 *   - durationMinutes (optional) — overrides target_duration
 *   - workoutName     (optional) — used for climb-flag detection
 *   - date            (optional, YYYY-MM-DD) — defaults to today in user's TZ
 */

import { getSupabaseAdmin } from './utils/supabaseAdmin.js';
import { setupCors } from './utils/cors.js';
import { rankRoutes } from './utils/routeRanker.js';

const supabase = getSupabaseAdmin();

function localDateInTz(date, tz) {
  try {
    return date.toLocaleDateString('en-CA', { timeZone: tz });
  } catch {
    return date.toISOString().split('T')[0];
  }
}

export default async function handler(req, res) {
  if (setupCors(req, res)) return;

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing authorization header' });
    }

    const token = authHeader.substring(7);
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !authUser) {
      return res.status(401).json({ error: 'Invalid or expired authentication token' });
    }

    const userId = authUser.id;
    const {
      workoutType: workoutTypeOverride,
      durationMinutes: durationOverride,
      workoutName: workoutNameOverride,
      date: dateOverride,
    } = req.query || {};

    // Resolve the date to look up today's workout
    let date = dateOverride;
    if (!date) {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('timezone')
        .eq('id', userId)
        .single();
      date = localDateInTz(new Date(), profile?.timezone || 'America/New_York');
    }

    // Today's workout (only if the caller didn't override workout_type)
    let workout = null;
    if (!workoutTypeOverride) {
      const { data: planned } = await supabase
        .from('planned_workouts')
        .select('id, name, workout_id, workout_type, duration_minutes, target_duration, training_plans!inner(status)')
        .eq('user_id', userId)
        .eq('scheduled_date', date)
        .eq('completed', false)
        .eq('training_plans.status', 'active')
        .limit(1)
        .maybeSingle();
      workout = planned;
    } else {
      workout = {
        workout_type: workoutTypeOverride,
        name: workoutNameOverride || '',
        duration_minutes: durationOverride ? parseInt(durationOverride, 10) : null,
      };
    }

    // All saved routes for the user
    const { data: routes, error: routesErr } = await supabase
      .from('routes')
      .select('id, name, description, distance_km, elevation_gain_m, elevation_loss_m, geometry, waypoints, route_type, surface_type, training_goal, generated_by, tags, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (routesErr) throw routesErr;
    if (!routes?.length) {
      return res.status(200).json({ suggestions: [], workout });
    }

    // Recently-used route IDs (last 30 days, joined via route_context_history)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: recentHistory } = await supabase
      .from('route_context_history')
      .select('route_id')
      .eq('user_id', userId)
      .gte('ride_date', thirtyDaysAgo);
    const recentlyUsedIds = new Set((recentHistory || []).map((r) => r.route_id).filter(Boolean));

    const ranked = rankRoutes(routes, workout, recentlyUsedIds, 3);

    return res.status(200).json({
      suggestions: ranked.map(({ route, score, reasons }) => ({
        route,
        score,
        reasons,
      })),
      workout,
    });
  } catch (error) {
    console.error('today-route-suggestions error:', error);
    return res.status(500).json({ error: 'Failed to rank route suggestions' });
  }
}
