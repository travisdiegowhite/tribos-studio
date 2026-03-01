/**
 * Module 3: Training Status
 * Shows yesterday's ride summary, weekly volume, fitness snapshot, and plan adherence.
 */

/**
 * Generate training status content for the daily email.
 * @param {object} supabase - Supabase client (service role)
 * @param {string} userId - User ID
 * @param {string} todayStr - Today's date as YYYY-MM-DD
 * @returns {Promise<{html: string, plainText: string} | null>}
 */
export async function trainingStatus(supabase, userId, todayStr) {
  const today = new Date(todayStr + 'T00:00:00Z');
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  // Get start of current week (Monday)
  const weekStart = getWeekStart(today);

  // Get user preferences for units
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('preferred_units')
    .eq('id', userId)
    .maybeSingle();

  const useImperial = profile?.preferred_units === 'imperial';

  // Fetch yesterday's activities
  const { data: yesterdayActivities } = await supabase
    .from('activities')
    .select('name, distance_meters, duration_seconds, elevation_gain_meters, average_power_watts, average_heart_rate, tss, type, sport_type')
    .eq('user_id', userId)
    .gte('start_date', yesterdayStr + 'T00:00:00Z')
    .lt('start_date', todayStr + 'T00:00:00Z')
    .order('start_date', { ascending: false });

  // Fetch this week's activities
  const { data: weekActivities } = await supabase
    .from('activities')
    .select('distance_meters, duration_seconds, elevation_gain_meters, tss')
    .eq('user_id', userId)
    .gte('start_date', weekStart + 'T00:00:00Z')
    .lt('start_date', todayStr + 'T24:00:00Z');

  // Fetch latest fitness snapshot
  const { data: snapshot } = await supabase
    .from('fitness_snapshots')
    .select('ctl, atl, tsb, fitness_trend, load_trend')
    .eq('user_id', userId)
    .order('snapshot_week', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Fetch plan adherence this week
  const planAdherence = await getPlanAdherence(supabase, userId, weekStart, todayStr);

  // Build sections
  const sections = [];
  const textParts = [];

  // Yesterday's ride
  if (yesterdayActivities && yesterdayActivities.length > 0) {
    const ride = yesterdayActivities[0];
    const dist = formatDistance(ride.distance_meters, useImperial);
    const dur = formatDuration(ride.duration_seconds);
    const elev = formatElevation(ride.elevation_gain_meters, useImperial);

    let metrics = `${dist} · ${dur}`;
    if (ride.elevation_gain_meters > 0) metrics += ` · ${elev} gain`;
    if (ride.average_power_watts) metrics += ` · ${Math.round(ride.average_power_watts)}W avg`;
    if (ride.average_heart_rate) metrics += ` · ${Math.round(ride.average_heart_rate)} bpm`;

    sections.push(`
      <tr>
        <td style="padding-bottom: 16px;">
          <p style="margin: 0 0 4px 0; font-size: 15px; font-weight: 600; color: #2C2C2C;">Yesterday: ${escapeHtml(ride.name || 'Ride')}</p>
          <p style="margin: 0; font-size: 14px; color: #6B6B5E;">${escapeHtml(metrics)}</p>
        </td>
      </tr>`);
    textParts.push(`Yesterday: ${ride.name || 'Ride'} — ${metrics}`);
  }

  // Weekly volume
  if (weekActivities && weekActivities.length > 0) {
    const totalHours = weekActivities.reduce((sum, a) => sum + (a.duration_seconds || 0), 0) / 3600;
    const totalDist = weekActivities.reduce((sum, a) => sum + (a.distance_meters || 0), 0);
    const totalElev = weekActivities.reduce((sum, a) => sum + (a.elevation_gain_meters || 0), 0);
    const rideCount = weekActivities.length;

    const distStr = formatDistance(totalDist, useImperial);
    const elevStr = formatElevation(totalElev, useImperial);

    sections.push(`
      <tr>
        <td style="padding-bottom: 16px;">
          <p style="margin: 0 0 4px 0; font-size: 15px; font-weight: 600; color: #2C2C2C;">This Week</p>
          <p style="margin: 0; font-size: 14px; color: #6B6B5E;">${rideCount} ride${rideCount !== 1 ? 's' : ''} · ${totalHours.toFixed(1)}h · ${distStr} · ${elevStr} gain</p>
        </td>
      </tr>`);
    textParts.push(`This Week: ${rideCount} rides · ${totalHours.toFixed(1)}h · ${distStr} · ${elevStr} gain`);
  }

  // Fitness snapshot
  if (snapshot) {
    const tsbLabel = getTSBLabel(snapshot.tsb);
    const trendIcon = snapshot.fitness_trend === 'improving' ? '↑' : snapshot.fitness_trend === 'declining' ? '↓' : '→';

    sections.push(`
      <tr>
        <td style="padding-bottom: 16px;">
          <p style="margin: 0 0 4px 0; font-size: 15px; font-weight: 600; color: #2C2C2C;">Fitness</p>
          <p style="margin: 0; font-size: 14px; color: #6B6B5E;">CTL ${snapshot.ctl} ${trendIcon} · ATL ${snapshot.atl} · TSB ${snapshot.tsb > 0 ? '+' : ''}${snapshot.tsb} (${tsbLabel})</p>
        </td>
      </tr>`);
    textParts.push(`Fitness: CTL ${snapshot.ctl} ${trendIcon} · ATL ${snapshot.atl} · TSB ${snapshot.tsb > 0 ? '+' : ''}${snapshot.tsb} (${tsbLabel})`);
  }

  // Plan adherence
  if (planAdherence) {
    sections.push(`
      <tr>
        <td>
          <p style="margin: 0 0 4px 0; font-size: 15px; font-weight: 600; color: #2C2C2C;">Plan Adherence</p>
          <p style="margin: 0; font-size: 14px; color: #6B6B5E;">${planAdherence.completed} of ${planAdherence.total} workouts completed this week</p>
        </td>
      </tr>`);
    textParts.push(`Plan: ${planAdherence.completed}/${planAdherence.total} workouts this week`);
  }

  if (sections.length === 0) return null;

  const html = `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 24px;">
      <tr>
        <td style="padding: 0 0 8px 0;">
          <p style="margin: 0; font-family: 'DM Mono', 'Courier New', monospace; font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: #6B8C72;">Training Status</p>
        </td>
      </tr>
      <tr>
        <td style="background-color: #FFFFFF; border: 1px solid #D4D4C8; padding: 20px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            ${sections.join('')}
          </table>
        </td>
      </tr>
    </table>`;

  const plainText = `TRAINING STATUS\n${textParts.join('\n')}\n`;

  return { html, plainText };
}

async function getPlanAdherence(supabase, userId, weekStart, todayStr) {
  const { data: plan } = await supabase
    .from('training_plans')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();

  if (!plan) return null;

  // Get week end (Sunday)
  const weekEnd = new Date(weekStart + 'T00:00:00Z');
  weekEnd.setDate(weekEnd.getDate() + 7);
  const weekEndStr = weekEnd.toISOString().split('T')[0];

  const { data: workouts } = await supabase
    .from('planned_workouts')
    .select('completed, workout_type')
    .eq('plan_id', plan.id)
    .gte('scheduled_date', weekStart)
    .lt('scheduled_date', weekEndStr)
    .neq('workout_type', 'rest');

  if (!workouts || workouts.length === 0) return null;

  return {
    completed: workouts.filter(w => w.completed).length,
    total: workouts.length,
  };
}

function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getUTCDay();
  const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1);
  d.setUTCDate(diff);
  return d.toISOString().split('T')[0];
}

function getTSBLabel(tsb) {
  if (tsb > 15) return 'Fresh';
  if (tsb > 5) return 'Rested';
  if (tsb >= -10) return 'Neutral';
  if (tsb >= -25) return 'Tired';
  return 'Very fatigued';
}

function formatDistance(meters, useImperial) {
  if (!meters) return useImperial ? '0 mi' : '0 km';
  if (useImperial) {
    return `${(meters / 1609.34).toFixed(1)} mi`;
  }
  return `${(meters / 1000).toFixed(1)} km`;
}

function formatElevation(meters, useImperial) {
  if (!meters) return useImperial ? '0 ft' : '0m';
  if (useImperial) {
    return `${Math.round(meters * 3.28084)} ft`;
  }
  return `${Math.round(meters)}m`;
}

function formatDuration(seconds) {
  if (!seconds) return '0m';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
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
