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
import { fetchPlannedSessions } from './utils/calendarRead.js';
import { isQualityWorkout } from './utils/qualitySession.js';
import { setupCors } from './utils/cors.js';
import { estimateTSSWithSource } from './utils/fitnessSnapshots.js';
import {
  fetchSeedState,
  recomputeTrainingLoadForUser,
} from './utils/trainingLoadRecompute.js';

// Matches PER_ACTIVITY_RSS_CAP in trainingLoadRecompute.js and every
// reader-side series.
const RSS_CAP = 500;
// Short recompute window for the training_load_daily write — exact thanks to
// fetchSeedState seeding, cheap enough per-webhook; the nightly 180-day
// rollforward reconciles backdated edits.
const REFRESH_WINDOW_DAYS = 30;

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
    // 1. Get user calibration factors
    const { data: cal } = await supabase
      .from('fatigue_calibration')
      .select('trimp_to_tss, srpe_to_tss, sample_count')
      .eq('user_id', userId)
      .single();

    const calibration = cal ?? { trimp_to_tss: 0.85, srpe_to_tss: 0.55, sample_count: 0 };

    // 2. Profile: timezone for accurate "today", FTP + adaptive tau for the
    // seed and estimator — one user_profiles read.
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('timezone, ftp, tfi_tau, afi_tau')
      .eq('id', userId)
      .maybeSingle();
    const tz = profile?.timezone || 'America/New_York';
    const today = new Date().toLocaleDateString('en-CA', { timeZone: tz });

    const tfiTau = Number(profile?.tfi_tau) > 0 ? Number(profile.tfi_tau) : 42;
    const afiTau = Number(profile?.afi_tau) > 0 ? Number(profile.afi_tau) : 7;

    // 3. Seed the projection state: last stored row strictly BEFORE today,
    // decayed across any gap to end-of-yesterday. The old latest-row-of-any-
    // date read could return today's own already-stepped row (double-count on
    // a second activity or webhook redelivery) and never decayed across gaps.
    const seed = await fetchSeedState(supabase, userId, today, tfiTau, afiTau);
    const currentState = seed
      ? { tfi: seed.tfi, afi: seed.afi, formScore: seed.tfi - seed.afi }
      : { tfi: 0, afi: 0, formScore: 0 };

    // 4. The next 14 days from the calendar.
    //
    // The active-plan lookup that used to gate this is gone with the join it
    // was there to serve: calendar_entries is keyed on the athlete, so an
    // athlete without a plan can now have a deviation analysed — which is the
    // right behaviour, since a deviation is from what was SCHEDULED, and the
    // coach schedules without a plan now.
    const upcoming = await fetchPlannedSessions(userId, { from: today, limit: 14 });

    if (upcoming.length === 0) {
      return res.status(200).json({ status: 'nothing_scheduled' });
    }

    // The deviation compares the activity against TODAY's planned workout
    // specifically — upcoming[0] may be a future day's session, and treating
    // that as "the plan for today" leaked future targets into the analysis.
    const todaysPlanned = upcoming.find((w) => w.scheduled_date === today);
    if (!todaysPlanned) {
      return res.status(200).json({ status: 'no_planned_workout_today' });
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

    // 5. Build activity data for the deviation classifier. No workout_type:
    // that's the PLAN's type, not something the ride tells us — passing it
    // both broke type_substitution detection (actual always equalled planned)
    // and let the planned intensity drive the load estimate.
    const activityData = {
      duration_seconds: activity.moving_time || activity.elapsed_time || 0,
      avg_power: activity.average_watts || undefined,
      normalized_power: activity.effective_power || undefined,
      ftp: profile?.ftp || undefined,
      avg_hr: activity.average_heartrate || undefined,
      hr_max: activity.max_heartrate || undefined,
      total_elevation_m: activity.total_elevation_gain || 0,
      distance_m: activity.distance || undefined,
    };

    // Actual load via the shared server tier estimator (sanitized device RSS,
    // terrain/MTB multipliers, 6-tier source) so deviation numbers match the
    // stored training-load numbers exactly. Shaped as a TSSEstimate; the
    // ±10% bounds only feed display.
    const serverEstimate = estimateTSSWithSource(activity, profile?.ftp ?? null);
    const actualTss = Math.min(serverEstimate.tss || 0, RSS_CAP);
    const precomputedEstimate = {
      tss: actualTss,
      tss_low: Math.round(actualTss * 0.9 * 100) / 100,
      tss_high: Math.round(actualTss * 1.1 * 100) / 100,
      confidence: serverEstimate.confidence ?? 0.4,
      source: serverEstimate.source ?? 'inferred',
      method_detail: 'estimateTSSWithSource',
      terrain_class: serverEstimate.terrain_class ?? undefined,
    };

    // 6. Build planned workout ref and schedule (canonical-first target)
    const plannedRef = {
      date: todaysPlanned.scheduled_date,
      tss: (todaysPlanned.target_rss ?? todaysPlanned.target_tss) || 0,
      type: todaysPlanned.workout_type || 'endurance',
      is_quality: isQualityWorkout(todaysPlanned),
      label: todaysPlanned.name || 'Planned workout',
    };

    const schedule = upcoming.map(w => ({
      date: w.scheduled_date,
      rss: (w.target_rss ?? w.target_tss) || 0,
      is_quality: isQualityWorkout(w),
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
      calibration,
      precomputedEstimate
    );

    if (!analysis.has_deviation) {
      // Still refresh daily load, via the recompute engine — it derives day
      // RSS by querying the day's activities, so webhook redeliveries and
      // same-day second activities are naturally idempotent (no dedupe rows
      // needed for this branch; the old hand-stepped upsert re-stepped the
      // day on every redelivery).
      await recomputeTrainingLoadForUser(supabase, userId, {
        days: REFRESH_WINDOW_DAYS,
        includeToday: true,
      });

      return res.status(200).json({ status: 'no_deviation' });
    }

    // 8. Write deviation record. Dual-write legacy + canonical columns
    // (migration 073 added the canonical twins; both coexist indefinitely
    // under the metrics-rollout freeze — see docs/METRICS_ROLLOUT_FREEZE.md).
    //
    // The activity's own estimated load — never the planned target; the old
    // `?? plannedRef.tss` fallback wrote the PLAN's RSS as actual work.
    const actualLoad = analysis.tss_estimate?.tss ?? actualTss;
    const loadDelta = actualLoad - plannedRef.tss;
    await supabase.from('plan_deviations').insert({
      user_id: userId,
      activity_id: String(activity_id),
      deviation_date: today,
      planned_tss: plannedRef.tss,
      planned_rss: plannedRef.tss,
      actual_tss: actualLoad,
      actual_rss: actualLoad,
      tss_delta: loadDelta,
      rss_delta: loadDelta,
      deviation_type: analysis.deviation_type,
      severity_score: analysis.severity_score,
      options_json: analysis.adjustment_options || null,
    });

    // 9. Refresh daily training load via the recompute engine (see the
    // no-deviation branch for why this replaces the hand-stepped upsert).
    await recomputeTrainingLoadForUser(supabase, userId, {
      days: REFRESH_WINDOW_DAYS,
      includeToday: true,
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
