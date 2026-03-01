/**
 * Module 1: Today's Workout
 * Shows the user's scheduled workout for today from their active training plan.
 */

/**
 * Generate today's workout content for the daily email.
 * @param {object} supabase - Supabase client (service role)
 * @param {string} userId - User ID
 * @param {string} todayStr - Today's date as YYYY-MM-DD
 * @returns {Promise<{html: string, plainText: string} | null>}
 */
export async function todaysWorkout(supabase, userId, todayStr) {
  // Check for active training plan
  const { data: plan } = await supabase
    .from('training_plans')
    .select('id, name, sport_type')
    .eq('user_id', userId)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();

  if (plan) {
    // Find today's scheduled workout
    const { data: workout } = await supabase
      .from('planned_workouts')
      .select('id, workout_type, title, description, target_duration, target_tss, target_distance_km, completed')
      .eq('plan_id', plan.id)
      .eq('scheduled_date', todayStr)
      .limit(1)
      .maybeSingle();

    if (workout && workout.completed) {
      return buildAlreadyCompletedBlock(workout, plan);
    }

    if (workout && workout.workout_type === 'rest') {
      return buildRestDayBlock(plan);
    }

    if (workout) {
      return buildWorkoutBlock(workout, plan);
    }

    // Plan exists but no workout scheduled today
    return buildNoPlanWorkoutBlock(plan);
  }

  // No active plan — suggest AI Coach
  return buildNoPlanBlock();
}

function buildWorkoutBlock(workout, plan) {
  const duration = workout.target_duration
    ? formatDuration(workout.target_duration)
    : null;
  const typeLabel = formatWorkoutType(workout.workout_type);
  const title = workout.title || typeLabel;

  const detailParts = [];
  if (typeLabel) detailParts.push(typeLabel);
  if (duration) detailParts.push(duration);
  if (workout.target_tss) detailParts.push(`${Math.round(workout.target_tss)} TSS`);
  if (workout.target_distance_km) detailParts.push(`${workout.target_distance_km} km`);
  const detailLine = detailParts.join(' · ');

  const html = `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 24px;">
      <tr>
        <td style="padding: 0 0 8px 0;">
          <p style="margin: 0; font-family: 'DM Mono', 'Courier New', monospace; font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: #6B8C72;">Today's Workout</p>
        </td>
      </tr>
      <tr>
        <td style="background-color: #FFFFFF; border: 1px solid #D4D4C8; padding: 20px;">
          <h3 style="margin: 0 0 8px 0; font-size: 18px; font-weight: 600; color: #2C2C2C;">${escapeHtml(title)}</h3>
          ${detailLine ? `<p style="margin: 0 0 12px 0; font-size: 14px; color: #6B6B5E;">${escapeHtml(detailLine)}</p>` : ''}
          ${workout.description ? `<p style="margin: 0 0 16px 0; font-size: 14px; line-height: 1.5; color: #4A4A42;">${escapeHtml(workout.description)}</p>` : ''}
          <table cellpadding="0" cellspacing="0">
            <tr>
              <td style="background-color: #6B8C72; padding: 10px 24px;">
                <a href="https://www.tribos.studio/training" style="color: #FFFFFF; text-decoration: none; font-size: 14px; font-weight: 600;">View Workout</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>`;

  const plainText = `TODAY'S WORKOUT\n${title}\n${detailLine}\n${workout.description || ''}\nView: https://www.tribos.studio/training\n`;

  return { html, plainText };
}

function buildRestDayBlock(plan) {
  const html = `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 24px;">
      <tr>
        <td style="padding: 0 0 8px 0;">
          <p style="margin: 0; font-family: 'DM Mono', 'Courier New', monospace; font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: #6B8C72;">Today's Workout</p>
        </td>
      </tr>
      <tr>
        <td style="background-color: #FFFFFF; border: 1px solid #D4D4C8; padding: 20px;">
          <h3 style="margin: 0 0 8px 0; font-size: 18px; font-weight: 600; color: #2C2C2C;">Rest Day</h3>
          <p style="margin: 0 0 16px 0; font-size: 14px; line-height: 1.5; color: #4A4A42;">Recovery is training too. Let your body adapt to the work you've put in.</p>
          <table cellpadding="0" cellspacing="0">
            <tr>
              <td style="background-color: #6B8C72; padding: 10px 24px;">
                <a href="https://www.tribos.studio/training" style="color: #FFFFFF; text-decoration: none; font-size: 14px; font-weight: 600;">View Your Plan</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>`;

  const plainText = `TODAY'S WORKOUT\nRest Day — Recovery is training too.\nView: https://www.tribos.studio/training\n`;

  return { html, plainText };
}

function buildAlreadyCompletedBlock(workout, plan) {
  const title = workout.title || formatWorkoutType(workout.workout_type);
  const html = `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 24px;">
      <tr>
        <td style="padding: 0 0 8px 0;">
          <p style="margin: 0; font-family: 'DM Mono', 'Courier New', monospace; font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: #6B8C72;">Today's Workout</p>
        </td>
      </tr>
      <tr>
        <td style="background-color: #FFFFFF; border: 1px solid #D4D4C8; padding: 20px;">
          <h3 style="margin: 0 0 8px 0; font-size: 18px; font-weight: 600; color: #2C2C2C;">${escapeHtml(title)} — Done!</h3>
          <p style="margin: 0; font-size: 14px; line-height: 1.5; color: #4A4A42;">You've already completed today's workout. Nice work.</p>
        </td>
      </tr>
    </table>`;

  const plainText = `TODAY'S WORKOUT\n${title} — Done!\n`;

  return { html, plainText };
}

function buildNoPlanWorkoutBlock(plan) {
  const html = `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 24px;">
      <tr>
        <td style="padding: 0 0 8px 0;">
          <p style="margin: 0; font-family: 'DM Mono', 'Courier New', monospace; font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: #6B8C72;">Today's Workout</p>
        </td>
      </tr>
      <tr>
        <td style="background-color: #FFFFFF; border: 1px solid #D4D4C8; padding: 20px;">
          <h3 style="margin: 0 0 8px 0; font-size: 18px; font-weight: 600; color: #2C2C2C;">No workout scheduled today</h3>
          <p style="margin: 0 0 16px 0; font-size: 14px; line-height: 1.5; color: #4A4A42;">Your ${escapeHtml(plan.name)} plan doesn't have a workout for today. Check your training dashboard for the week ahead.</p>
          <table cellpadding="0" cellspacing="0">
            <tr>
              <td style="background-color: #6B8C72; padding: 10px 24px;">
                <a href="https://www.tribos.studio/training" style="color: #FFFFFF; text-decoration: none; font-size: 14px; font-weight: 600;">View Training</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>`;

  const plainText = `TODAY'S WORKOUT\nNo workout scheduled. Check your training dashboard.\nView: https://www.tribos.studio/training\n`;

  return { html, plainText };
}

function buildNoPlanBlock() {
  const html = `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 24px;">
      <tr>
        <td style="padding: 0 0 8px 0;">
          <p style="margin: 0; font-family: 'DM Mono', 'Courier New', monospace; font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: #6B8C72;">Today's Workout</p>
        </td>
      </tr>
      <tr>
        <td style="background-color: #FFFFFF; border: 1px solid #D4D4C8; padding: 20px;">
          <h3 style="margin: 0 0 8px 0; font-size: 18px; font-weight: 600; color: #2C2C2C;">No training plan yet</h3>
          <p style="margin: 0 0 16px 0; font-size: 14px; line-height: 1.5; color: #4A4A42;">Your AI Coach can build a personalized plan based on your recent rides and goals.</p>
          <table cellpadding="0" cellspacing="0">
            <tr>
              <td style="background-color: #6B8C72; padding: 10px 24px;">
                <a href="https://www.tribos.studio/dashboard" style="color: #FFFFFF; text-decoration: none; font-size: 14px; font-weight: 600;">Talk to AI Coach</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>`;

  const plainText = `TODAY'S WORKOUT\nNo training plan yet. Your AI Coach can build one.\nVisit: https://www.tribos.studio/dashboard\n`;

  return { html, plainText };
}

function formatWorkoutType(type) {
  const labels = {
    rest: 'Rest',
    recovery: 'Recovery Ride',
    endurance: 'Endurance',
    tempo: 'Tempo',
    threshold: 'Threshold',
    vo2max: 'VO2max Intervals',
    sweetspot: 'Sweet Spot',
    sprint: 'Sprint',
    race: 'Race Day',
  };
  return labels[type] || type || 'Workout';
}

function formatDuration(minutes) {
  if (!minutes) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
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
