/**
 * Module 6: Route Suggestion
 * Suggests a saved route that matches today's workout requirements.
 */

/**
 * Generate route suggestion content for the daily email.
 * @param {object} supabase - Supabase client (service role)
 * @param {string} userId - User ID
 * @param {string} todayStr - Today's date as YYYY-MM-DD
 * @returns {Promise<{html: string, plainText: string} | null>}
 */
export async function routeSuggestion(supabase, userId, todayStr) {
  try {
    // Check if user has saved routes
    const { data: routes, error } = await supabase
      .from('routes')
      .select('id, name, distance_km, elevation_gain_m, route_type, difficulty_rating, training_goal, estimated_duration_minutes')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error || !routes || routes.length === 0) return null;

    // Check if user has a ride scheduled today
    const { data: plan } = await supabase
      .from('training_plans')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'active')
      .limit(1)
      .maybeSingle();

    let todaysWorkout = null;
    if (plan) {
      const { data: workout } = await supabase
        .from('planned_workouts')
        .select('workout_type, target_duration, target_distance_km')
        .eq('plan_id', plan.id)
        .eq('scheduled_date', todayStr)
        .neq('workout_type', 'rest')
        .limit(1)
        .maybeSingle();

      todaysWorkout = workout;
    }

    let suggestedRoute;
    let reason;

    if (todaysWorkout && todaysWorkout.target_distance_km) {
      // Match by distance (within 20%)
      const targetDist = todaysWorkout.target_distance_km;
      const matchedRoutes = routes
        .filter(r => r.distance_km)
        .map(r => ({
          ...r,
          distanceDiff: Math.abs(r.distance_km - targetDist) / targetDist,
        }))
        .filter(r => r.distanceDiff < 0.3)
        .sort((a, b) => a.distanceDiff - b.distanceDiff);

      if (matchedRoutes.length > 0) {
        suggestedRoute = matchedRoutes[0];
        reason = `Matches your ${formatWorkoutType(todaysWorkout.workout_type)} at ${targetDist.toFixed(0)} km`;
      }
    }

    if (!suggestedRoute && todaysWorkout && todaysWorkout.target_duration) {
      // Match by duration (within 30%)
      const targetMin = todaysWorkout.target_duration;
      const matchedRoutes = routes
        .filter(r => r.estimated_duration_minutes)
        .map(r => ({
          ...r,
          durationDiff: Math.abs(r.estimated_duration_minutes - targetMin) / targetMin,
        }))
        .filter(r => r.durationDiff < 0.4)
        .sort((a, b) => a.durationDiff - b.durationDiff);

      if (matchedRoutes.length > 0) {
        suggestedRoute = matchedRoutes[0];
        reason = `Good fit for your ${formatWorkoutType(todaysWorkout.workout_type)} today`;
      }
    }

    if (!suggestedRoute && todaysWorkout) {
      // Match by training goal
      const goalMap = {
        endurance: 'endurance',
        recovery: 'recovery',
        tempo: 'intervals',
        threshold: 'intervals',
        vo2max: 'intervals',
        sweetspot: 'intervals',
      };
      const goalMatch = goalMap[todaysWorkout.workout_type];
      if (goalMatch) {
        const matched = routes.find(r => r.training_goal === goalMatch);
        if (matched) {
          suggestedRoute = matched;
          reason = `Tagged for ${goalMatch} — a good fit for today's ${formatWorkoutType(todaysWorkout.workout_type)}`;
        }
      }
    }

    // Fallback: suggest most recently created route
    if (!suggestedRoute) {
      suggestedRoute = routes[0];
      reason = 'Your most recently saved route';
    }

    return buildRouteBlock(suggestedRoute, reason);
  } catch (err) {
    console.error('[daily-email] Route suggestion failed:', err.message);
    return null;
  }
}

function buildRouteBlock(route, reason) {
  const details = [];
  if (route.distance_km) details.push(`${route.distance_km.toFixed(1)} km`);
  if (route.elevation_gain_m) details.push(`${Math.round(route.elevation_gain_m)}m gain`);
  if (route.estimated_duration_minutes) {
    const h = Math.floor(route.estimated_duration_minutes / 60);
    const m = route.estimated_duration_minutes % 60;
    details.push(h > 0 ? `~${h}h ${m}m` : `~${m}m`);
  }
  const detailLine = details.join(' · ');

  const routeUrl = `https://www.tribos.studio/routes/${route.id}`;

  const html = `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 24px;">
      <tr>
        <td style="padding: 0 0 8px 0;">
          <p style="margin: 0; font-family: 'DM Mono', 'Courier New', monospace; font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: #6B8C72;">Route Suggestion</p>
        </td>
      </tr>
      <tr>
        <td style="background-color: #FFFFFF; border: 1px solid #D4D4C8; padding: 20px;">
          <h3 style="margin: 0 0 6px 0; font-size: 17px; font-weight: 600; color: #2C2C2C;">${escapeHtml(route.name || 'Saved Route')}</h3>
          ${detailLine ? `<p style="margin: 0 0 8px 0; font-size: 14px; color: #6B6B5E;">${escapeHtml(detailLine)}</p>` : ''}
          ${reason ? `<p style="margin: 0 0 16px 0; font-size: 14px; color: #4A4A42; font-style: italic;">${escapeHtml(reason)}</p>` : ''}
          <table cellpadding="0" cellspacing="0">
            <tr>
              <td style="background-color: #6B8C72; padding: 10px 24px;">
                <a href="${routeUrl}" style="color: #FFFFFF; text-decoration: none; font-size: 14px; font-weight: 600;">View Route</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>`;

  const plainText = `ROUTE SUGGESTION\n${route.name || 'Saved Route'}\n${detailLine}\n${reason || ''}\nView: ${routeUrl}\n`;

  return { html, plainText };
}

function formatWorkoutType(type) {
  const labels = {
    rest: 'rest day',
    recovery: 'recovery ride',
    endurance: 'endurance ride',
    tempo: 'tempo workout',
    threshold: 'threshold session',
    vo2max: 'VO2max intervals',
    sweetspot: 'sweet spot session',
    sprint: 'sprint workout',
  };
  return labels[type] || type || 'workout';
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
