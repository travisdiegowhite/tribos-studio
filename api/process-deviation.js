/**
 * Process Deviation
 *
 * Called internally after activity sync to analyze deviations from the training plan.
 * Not user-facing — called from webhook handlers or as an internal API.
 *
 * POST /api/process-deviation
 * Body: { user_id, activity_id }
 * Auth: CRON_SECRET or Bearer JWT
 */

import { getSupabaseAdmin } from './utils/supabaseAdmin.js';
import { setupCors } from './utils/cors.js';
import { estimateTSSWithSource } from './utils/fitnessSnapshots.js';
import { upsertTrainingLoadDaily } from './utils/trainingLoad.js';

const supabase = getSupabaseAdmin();

export default async function handler(req, res) {
  if (setupCors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Auth: accept either CRON_SECRET or Bearer JWT
  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;
  let userId;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);

    // Check if it's the cron secret
    if (token === cronSecret) {
      userId = req.body?.user_id;
    } else {
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);
      if (authError || !user) {
        return res.status(401).json({ error: 'unauthorized' });
      }
      userId = user.id;
    }
  } else {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const { activity_id } = req.body;
  if (!userId || !activity_id) {
    return res.status(400).json({ error: 'user_id and activity_id required' });
  }

  try {
    // 1. Get latest training load state.
    const { data: latestLoad } = await supabase
      .from('training_load_daily')
      .select('tfi, afi, form_score')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .limit(1)
      .single();

    const currentState = latestLoad
      ? { tfi: latestLoad.tfi, afi: latestLoad.afi, formScore: latestLoad.form_score }
      : { tfi: 42, afi: 42, formScore: 0 };

    // 2. Get user calibration factors
    const { data: cal } = await supabase
      .from('fatigue_calibration')
      .select('trimp_to_tss, srpe_to_tss, sample_count')
      .eq('user_id', userId)
      .single();

    const calibration = cal ?? { trimp_to_tss: 0.85, srpe_to_tss: 0.55, sample_count: 0 };

    // 3. Fetch planned workouts for next 14 days
    // Use user's timezone for accurate "today"
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('timezone')
      .eq('id', userId)
      .maybeSingle();
    const tz = profile?.timezone || 'America/New_York';
    const today = new Date().toLocaleDateString('en-CA', { timeZone: tz });

    // Get active plan IDs (planned_workouts has no user_id column)
    const { data: activePlans } = await supabase
      .from('training_plans')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'active');
    const planIds = (activePlans || []).map(p => p.id);

    if (planIds.length === 0) {
      return res.status(200).json({ status: 'no_plan' });
    }

    const { data: upcoming } = await supabase
      .from('planned_workouts')
      .select('scheduled_date, target_tss, workout_type, is_quality, session_type, name')
      .in('plan_id', planIds)
      .gte('scheduled_date', today)
      .order('scheduled_date', { ascending: true })
      .limit(14);

    if (!upcoming || upcoming.length === 0) {
      return res.status(200).json({ status: 'no_plan' });
    }

    // 4. Fetch actual activity data
    const { data: activity } = await supabase
      .from('activities')
      .select('*')
      .eq('id', activity_id)
      .single();

    if (!activity) {
      return res.status(200).json({ status: 'activity_not_found' });
    }

    // 5. Build activity data for estimator
    const activityData = {
      duration_seconds: activity.moving_time || activity.elapsed_time || 0,
      avg_power: activity.average_watts || undefined,
      normalized_power: activity.normalized_power || undefined,
      ftp: undefined, // fetched below
      avg_hr: activity.average_heartrate || undefined,
      hr_max: activity.max_heartrate || undefined,
      workout_type: upcoming[0].workout_type || 'endurance',
      total_elevation_m: activity.total_elevation_gain || 0,
      distance_m: activity.distance || undefined,
    };

    // Get user's FTP from fitness snapshots or profile
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('ftp')
      .eq('id', userId)
      .single();

    if (profile?.ftp) {
      activityData.ftp = profile.ftp;
    }

    // 6. Build planned workout ref and schedule
    const plannedRef = {
      date: upcoming[0].scheduled_date,
      tss: upcoming[0].target_tss || 0,
      type: upcoming[0].workout_type || 'endurance',
      is_quality: upcoming[0].is_quality || false,
      label: upcoming[0].name || 'Planned workout',
    };

    const schedule = upcoming.map(w => ({
      date: w.scheduled_date,
      tss: w.target_tss || 0,
      is_quality: w.is_quality || false,
      session_type: w.session_type || w.workout_type,
    }));

    // 7. Dynamically import and run deviation analysis
    // Using dynamic import since these are TS modules compiled by Vite
    const { analyzeDeviation } = await import('../src/lib/training/deviation-detection.ts');
    const analysis = analyzeDeviation(
      activityData,
      plannedRef,
      currentState,
      schedule,
      calibration
    );

    if (!analysis.has_deviation) {
      // Still update daily load. Use the shared tier estimator so
      // tss_source/confidence/fs_confidence stay consistent with the
      // deviation path below.
      const estimate = estimateTSSWithSource(activity, activityData.ftp);
      const tss = estimate.tss || activityData.duration_seconds / 3600 * 48;
      const { stepDay } = await import('../src/lib/training/tsb-projection.ts');
      const newState = stepDay(currentState, tss);

      await upsertTrainingLoadDaily(supabase, userId, today, {
        tss,
        ctl: Math.round(newState.tfi * 100) / 100,
        atl: Math.round(newState.afi * 100) / 100,
        tsb: Math.round(newState.formScore * 100) / 100,
        tss_source: estimate.source,
        confidence: estimate.confidence,
        terrain_class: estimate.terrain_class ?? null,
      });

      return res.status(200).json({ status: 'no_deviation' });
    }

    // 8. Write deviation record
    await supabase.from('plan_deviations').insert({
      user_id: userId,
      activity_id: String(activity_id),
      deviation_date: today,
      planned_tss: plannedRef.tss,
      actual_tss: analysis.tss_estimate?.tss,
      tss_delta: analysis.tss_estimate ? analysis.tss_estimate.tss - plannedRef.tss : 0,
      deviation_type: analysis.deviation_type,
      severity_score: analysis.severity_score,
      options_json: analysis.adjustment_options || null,
    });

    // 9. Update daily training load
    const estimatedTss = analysis.tss_estimate?.tss ?? plannedRef.tss;
    const { stepDay } = await import('../src/lib/training/tsb-projection.ts');
    const newState = stepDay(currentState, estimatedTss);

    await upsertTrainingLoadDaily(supabase, userId, today, {
      tss: estimatedTss,
      ctl: Math.round(newState.tfi * 100) / 100,
      atl: Math.round(newState.afi * 100) / 100,
      tsb: Math.round(newState.formScore * 100) / 100,
      tss_source: analysis.tss_estimate?.source ?? 'inferred',
      confidence: analysis.tss_estimate?.confidence ?? 0.4,
      terrain_class: analysis.tss_estimate?.terrain_class ?? null,
    });

    // 10. Update calibration if we have both power and HR
    if (activityData.normalized_power && activityData.ftp && activityData.avg_hr) {
      const { updateCalibration } = await import('../src/lib/training/fatigue-estimation.ts');
      // Use a rough TRIMP from avg HR
      const durationMinutes = activityData.duration_seconds / 60;
      const roughTrimp = durationMinutes * 3; // approximate zone 3 weight
      const updatedCal = updateCalibration(calibration, analysis.tss_estimate.tss, roughTrimp);

      await supabase.from('fatigue_calibration').upsert({
        user_id: userId,
        trimp_to_tss: updatedCal.trimp_to_tss,
        srpe_to_tss: updatedCal.srpe_to_tss,
        sample_count: updatedCal.sample_count,
        last_updated: new Date().toISOString(),
      }, { onConflict: 'user_id' });
    }

    return res.status(200).json({ status: 'deviation_recorded', analysis });
  } catch (error) {
    console.error('process-deviation error:', error);
    return res.status(500).json({ error: error.message });
  }
}
