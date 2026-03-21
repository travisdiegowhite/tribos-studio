/**
 * Proprietary Metrics — Compute and Store Utility
 *
 * Called from webhook handlers after activity sync.
 * Computes TWL (always) and EFI (if planned workout matched).
 * Non-blocking — metric failures never fail the webhook.
 */

// Inline computation to avoid TS import issues in serverless
// These mirror the formulas in src/lib/metrics/*.ts exactly

// ─── TWL Computation ─────────────────────────────────────────────────────────

const ALPHA = 0.10;
const BETA  = 0.03;
const GAMMA = 0.05;
const VAM_CAP = 1.5;

function computeTWLFromActivity(activity) {
  const baseTSS = activity.tss || 0;
  if (baseTSS <= 0) return null;

  const elevationGainM = activity.elevation_gain_meters || activity.total_elevation_gain || 0;
  const durationHours = (activity.duration_seconds || activity.moving_time || 0) / 3600;
  const meanElevationM = extractMeanElevation(activity);

  // GVI from streams if available
  const gvi = computeGVIFromActivity(activity);

  const vam = durationHours > 0 ? elevationGainM / durationHours : 0;
  const vamNorm = Math.min(VAM_CAP, vam / 1000);
  const altTerm = Math.max(0, (meanElevationM - 1000) / 1000);

  const alphaComponent = ALPHA * vamNorm;
  const betaComponent  = BETA  * gvi;
  const gammaComponent = GAMMA * altTerm;
  const mTerrain = 1 + alphaComponent + betaComponent + gammaComponent;
  const twl = Math.round(baseTSS * mTerrain * 10) / 10;

  return {
    base_tss: baseTSS,
    vam: Math.round(vam),
    vam_norm: Math.round(vamNorm * 1000) / 1000,
    gvi: Math.round(gvi * 1000) / 1000,
    mean_elevation: Math.round(meanElevationM),
    alt_term: Math.round(altTerm * 1000) / 1000,
    alpha_component: Math.round(alphaComponent * 10000) / 10000,
    beta_component: Math.round(betaComponent * 10000) / 10000,
    gamma_component: Math.round(gammaComponent * 10000) / 10000,
    m_terrain: Math.round(mTerrain * 10000) / 10000,
    twl,
  };
}

function extractMeanElevation(activity) {
  const streams = activity.activity_streams;
  if (streams?.elevation && Array.isArray(streams.elevation) && streams.elevation.length > 0) {
    const sum = streams.elevation.reduce((a, b) => a + b, 0);
    return sum / streams.elevation.length;
  }
  // Rough estimate from elevation gain if no stream
  const gain = activity.elevation_gain_meters || activity.total_elevation_gain || 0;
  // Default to a moderate estimate; not ideal but better than 0
  return gain > 500 ? 1200 : 500;
}

function computeGVIFromActivity(activity) {
  const streams = activity.activity_streams;
  if (!streams?.elevation || !Array.isArray(streams.elevation) || streams.elevation.length < 10) {
    // Estimate GVI from elevation gain and distance
    const gain = activity.elevation_gain_meters || activity.total_elevation_gain || 0;
    const dist = (activity.distance_meters || activity.distance || 0) / 1000; // km
    if (dist <= 0) return 0;
    const avgGradePct = (gain / (dist * 1000)) * 100;
    return Math.min(12, avgGradePct * 0.8); // rough heuristic
  }

  // 30-second rolling mean smoothing (assume 1s intervals)
  const elev = streams.elevation;
  const windowSize = 30;
  const smoothed = [];
  for (let i = 0; i < elev.length; i++) {
    const start = Math.max(0, i - Math.floor(windowSize / 2));
    const end = Math.min(elev.length, i + Math.ceil(windowSize / 2));
    let sum = 0;
    for (let j = start; j < end; j++) sum += elev[j];
    smoothed.push(sum / (end - start));
  }

  // Derive distance stream if not available
  let distStream;
  if (streams.coords && Array.isArray(streams.coords)) {
    distStream = [0];
    for (let i = 1; i < streams.coords.length; i++) {
      const [lng1, lat1] = streams.coords[i - 1];
      const [lng2, lat2] = streams.coords[i];
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLng = (lng2 - lng1) * Math.PI / 180;
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      distStream.push(distStream[i - 1] + 6371000 * c);
    }
  } else {
    // Approximate distance stream from total distance
    const totalDist = activity.distance_meters || activity.distance || 0;
    distStream = smoothed.map((_, i) => (i / smoothed.length) * totalDist);
  }

  // Compute grades
  const grades = [];
  for (let i = 1; i < smoothed.length && i < distStream.length; i++) {
    const dElev = smoothed[i] - smoothed[i - 1];
    const dDist = distStream[i] - distStream[i - 1];
    if (dDist > 0.5) {
      grades.push((dElev / dDist) * 100);
    }
  }

  if (grades.length === 0) return 0;
  const mean = grades.reduce((a, b) => a + b, 0) / grades.length;
  const variance = grades.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / grades.length;
  return Math.sqrt(variance);
}

// ─── EFI Computation ─────────────────────────────────────────────────────────

const ZONE_WEIGHTS = { Z1: 0.5, Z2: 1.5, Z3: 1.0, Z4: 1.2, Z5: 1.3 };
const IFS_MAX_DEVIATION = 2.8;

function computeEFIFromData(plannedTSS, actualTSS, plannedZones, actualZones, rollingSessions) {
  // Volume Fidelity
  const r = plannedTSS > 0 ? actualTSS / plannedTSS : 0;
  let vf;
  if (r >= 0.85 && r <= 1.10) {
    vf = 1.0;
  } else if (r < 0.85) {
    vf = r / 0.85;
  } else {
    vf = Math.max(0, 1 - (r - 1.10) / 0.45);
  }

  // Intensity Fidelity
  let D = 0;
  for (const zone of ['Z1', 'Z2', 'Z3', 'Z4', 'Z5']) {
    D += ZONE_WEIGHTS[zone] * Math.abs((plannedZones?.[zone] ?? 0) - (actualZones?.[zone] ?? 0));
  }
  const ifs = Math.max(0, 1 - D / IFS_MAX_DEVIATION);

  // Consistency Fidelity
  const N = rollingSessions.length;
  let cfSum = 0;
  for (const sess of rollingSessions) {
    const s = sess.planned > 0 ? Math.min(1.0, sess.actual / (0.85 * sess.planned)) : 0;
    cfSum += s;
  }
  const cf = N > 0 ? cfSum / N : 0;

  const efi = Math.round((0.30 * vf + 0.40 * ifs + 0.30 * cf) * 100 * 10) / 10;

  return {
    efi: Math.min(100, Math.max(0, efi)),
    vf: Math.round(vf * 10000) / 10000,
    ifs: Math.round(ifs * 10000) / 10000,
    cf: Math.round(cf * 10000) / 10000,
  };
}

// ─── Main Entry Point ────────────────────────────────────────────────────────

/**
 * Compute and store proprietary metrics for an activity.
 * Called from webhook handlers after activity sync.
 *
 * @param {object} supabase - Supabase admin client (service role)
 * @param {string} userId - User ID
 * @param {string} activityId - Activity ID
 */
export async function computeAndStoreMetrics(supabase, userId, activityId) {
  // Fetch the activity with streams
  const { data: activity, error: actErr } = await supabase
    .from('activities')
    .select('*')
    .eq('id', activityId)
    .single();

  if (actErr || !activity) {
    console.error('[metrics] Failed to fetch activity:', actErr?.message);
    return;
  }

  // --- TWL ---
  const twlData = computeTWLFromActivity(activity);
  if (twlData) {
    const { error: twlErr } = await supabase
      .from('activity_twl')
      .upsert({
        user_id: userId,
        activity_id: activityId,
        ...twlData,
        computed_at: new Date().toISOString(),
      }, { onConflict: 'activity_id' });

    if (twlErr) {
      console.error('[metrics] TWL upsert failed:', twlErr.message);
    }
  }

  // --- EFI (only if activity matched a planned workout) ---
  let workoutId = activity.matched_planned_workout_id;

  // Check reverse link: planner sets planned_workouts.activity_id but not
  // activities.matched_planned_workout_id — look it up from the workout side
  if (!workoutId) {
    const { data: linkedWorkout } = await supabase
      .from('planned_workouts')
      .select('id')
      .eq('activity_id', activityId)
      .maybeSingle();

    if (linkedWorkout) {
      workoutId = linkedWorkout.id;
      // Sync the reverse pointer so future reads don't need this lookup
      await supabase
        .from('activities')
        .update({ matched_planned_workout_id: workoutId })
        .eq('id', activityId);
      console.log(`[metrics] Synced reverse link: activity ${activityId} → workout ${workoutId}`);
    }
  }

  // Auto-match: if still no workout linked, try to find one by date + TSS proximity
  if (!workoutId && activity.tss > 0) {
    workoutId = await tryAutoMatchWorkout(supabase, userId, activity);
    if (workoutId) {
      await supabase
        .from('activities')
        .update({ matched_planned_workout_id: workoutId })
        .eq('id', activityId);
      console.log(`[metrics] Auto-matched activity ${activityId} to workout ${workoutId}`);
    }
  }

  if (workoutId) {
    try {
      await computeAndStoreEFI(supabase, userId, activityId, activity, workoutId);
    } catch (efiErr) {
      console.error('[metrics] EFI computation failed:', efiErr.message);
    }
  }
}

async function computeAndStoreEFI(supabase, userId, activityId, activity, workoutId) {
  // Fetch the planned workout
  const { data: workout, error: wErr } = await supabase
    .from('planned_workouts')
    .select('target_tss')
    .eq('id', workoutId)
    .single();

  if (wErr || !workout?.target_tss) {
    if (wErr) console.error('[metrics] EFI: failed to fetch workout:', wErr.message);
    return;
  }

  const plannedTSS = workout.target_tss;
  const actualTSS = activity.tss || 0;

  // Zone distributions — planned_workouts doesn't store zone data,
  // so use defaults based on workout type (endurance-heavy distribution)
  const plannedZones = { Z1: 0.4, Z2: 0.3, Z3: 0.1, Z4: 0.1, Z5: 0.1 };

  // Derive actual zones from ride_analytics if available
  const analytics = activity.ride_analytics;
  const actualZones = analytics?.hr_zone_distribution
    ? normalizeZoneDistribution(analytics.hr_zone_distribution)
    : { Z1: 0.3, Z2: 0.3, Z3: 0.2, Z4: 0.1, Z5: 0.1 };

  // Fetch 28-day rolling sessions for CF
  const twentyEightDaysAgo = new Date();
  twentyEightDaysAgo.setDate(twentyEightDaysAgo.getDate() - 28);

  const { data: recentWorkouts } = await supabase
    .from('planned_workouts')
    .select('id, target_tss, scheduled_date')
    .eq('plan_id', (await supabase.from('planned_workouts').select('plan_id').eq('id', workoutId).single()).data?.plan_id)
    .gte('scheduled_date', twentyEightDaysAgo.toISOString().split('T')[0])
    .order('scheduled_date', { ascending: true });

  const rollingSessions = [];
  if (recentWorkouts) {
    for (const w of recentWorkouts) {
      // Find matching activity
      const { data: matchedActivity } = await supabase
        .from('activities')
        .select('tss')
        .eq('matched_planned_workout_id', w.id)
        .eq('user_id', userId)
        .maybeSingle();

      rollingSessions.push({
        planned: w.target_tss || 0,
        actual: matchedActivity?.tss || 0,
      });
    }
  }

  const efiResult = computeEFIFromData(plannedTSS, actualTSS, plannedZones, actualZones, rollingSessions);

  // Compute 28-day rolling average
  const { data: recentEFI } = await supabase
    .from('activity_efi')
    .select('efi')
    .eq('user_id', userId)
    .gte('computed_at', twentyEightDaysAgo.toISOString())
    .order('computed_at', { ascending: false });

  const allEFIScores = [...(recentEFI || []).map(r => r.efi), efiResult.efi];
  const efi28d = allEFIScores.length > 0
    ? Math.round((allEFIScores.reduce((a, b) => a + b, 0) / allEFIScores.length) * 10) / 10
    : efiResult.efi;

  // Delete any existing EFI row for this activity, then insert fresh.
  // NOTE: activity_efi lacks a UNIQUE constraint on activity_id, so upsert
  // with onConflict would silently fail. Delete+insert is safe and idempotent.
  await supabase
    .from('activity_efi')
    .delete()
    .eq('activity_id', activityId);

  const { error: efiErr } = await supabase
    .from('activity_efi')
    .insert({
      user_id: userId,
      activity_id: activityId,
      workout_id: workoutId,
      planned_tss: plannedTSS,
      actual_tss: actualTSS,
      planned_zones: plannedZones,
      actual_zones: actualZones,
      rolling_window_sessions: rollingSessions,
      ...efiResult,
      efi_28d: efi28d,
      computed_at: new Date().toISOString(),
    });

  if (efiErr) {
    console.error('[metrics] EFI upsert failed:', efiErr.message);
  }
}

/**
 * Try to auto-match an activity to a planned workout.
 * Matches by date proximity (±1 day) and TSS similarity (within 40%).
 * Returns the workout ID if a good match is found, null otherwise.
 */
async function tryAutoMatchWorkout(supabase, userId, activity) {
  const activityDate = activity.start_date
    ? new Date(activity.start_date).toISOString().split('T')[0]
    : null;
  if (!activityDate) return null;

  // Find planned workouts within ±1 day that aren't already matched
  const dayBefore = new Date(activityDate);
  dayBefore.setDate(dayBefore.getDate() - 1);
  const dayAfter = new Date(activityDate);
  dayAfter.setDate(dayAfter.getDate() + 1);

  const { data: candidates } = await supabase
    .from('planned_workouts')
    .select('id, scheduled_date, target_tss, target_duration, workout_type')
    .eq('user_id', userId)
    .gte('scheduled_date', dayBefore.toISOString().split('T')[0])
    .lte('scheduled_date', dayAfter.toISOString().split('T')[0])
    .is('activity_id', null)
    .neq('workout_type', 'rest')
    .order('scheduled_date', { ascending: true });

  if (!candidates || candidates.length === 0) return null;

  // Score each candidate
  let bestMatch = null;
  let bestScore = 0;

  for (const workout of candidates) {
    let score = 0;

    // Date match: exact = 40pts, ±1 day = 20pts
    if (workout.scheduled_date === activityDate) {
      score += 40;
    } else {
      score += 20;
    }

    // TSS match (30pts max)
    if (workout.target_tss && activity.tss) {
      const tssDiffPct = Math.abs(activity.tss - workout.target_tss) / workout.target_tss * 100;
      if (tssDiffPct <= 15) score += 30;
      else if (tssDiffPct <= 30) score += 20;
      else if (tssDiffPct <= 40) score += 10;
    } else {
      // No TSS comparison possible — give partial credit
      score += 10;
    }

    // Duration match (30pts max)
    const actDurationMin = (activity.moving_time || activity.elapsed_time || 0) / 60;
    if (workout.target_duration && actDurationMin > 0) {
      const durDiffPct = Math.abs(actDurationMin - workout.target_duration) / workout.target_duration * 100;
      if (durDiffPct <= 15) score += 30;
      else if (durDiffPct <= 30) score += 20;
      else if (durDiffPct <= 40) score += 10;
    } else {
      score += 10;
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = workout;
    }
  }

  // Require at least 40 points for a match (same threshold as client-side matching)
  return bestScore >= 40 ? bestMatch.id : null;
}

function normalizeZoneDistribution(hrZones) {
  // Convert HR zone distribution from ride_analytics to Z1-Z5 format
  const total = Object.values(hrZones).reduce((a, b) => a + (b || 0), 0) || 1;
  return {
    Z1: (hrZones.zone1 || hrZones.Z1 || 0) / total,
    Z2: (hrZones.zone2 || hrZones.Z2 || 0) / total,
    Z3: (hrZones.zone3 || hrZones.Z3 || 0) / total,
    Z4: (hrZones.zone4 || hrZones.Z4 || 0) / total,
    Z5: (hrZones.zone5 || hrZones.Z5 || 0) / total,
  };
}

// ─── Backfill — Lazy compute on first dashboard read ─────────────────────────

/**
 * Backfill proprietary metrics for a user from existing activity data.
 * Called from the GET /api/metrics endpoint when no stored metrics exist
 * but the user has qualifying data. One-time cost per user — subsequent
 * reads will find the stored rows.
 *
 * @param {object} supabase - Supabase admin client (service role)
 * @param {string} userId - User ID
 * @returns {{ twlBackfilled: number, efiBackfilled: number, tcasBackfilled: boolean }}
 */
export async function backfillMetricsForUser(supabase, userId) {
  console.log(`[metrics:backfill] Starting backfill for user ${userId}`);
  const result = { twlBackfilled: 0, efiBackfilled: 0, tcasBackfilled: false };

  // Fetch last 10 activities with TSS > 0 (most recent first)
  const { data: activities, error: actErr } = await supabase
    .from('activities')
    .select('id, matched_planned_workout_id')
    .eq('user_id', userId)
    .or('is_hidden.eq.false,is_hidden.is.null')
    .is('duplicate_of', null)
    .gt('tss', 0)
    .order('start_date', { ascending: false })
    .limit(10);

  if (actErr || !activities?.length) {
    console.log(`[metrics:backfill] No qualifying activities found`);
    return result;
  }

  // Compute TWL and EFI for each activity
  for (const act of activities) {
    try {
      await computeAndStoreMetrics(supabase, userId, act.id);
      result.twlBackfilled++;
      if (act.matched_planned_workout_id) {
        result.efiBackfilled++;
      }
    } catch (err) {
      console.error(`[metrics:backfill] Failed for activity ${act.id}:`, err.message);
    }
  }

  // Backfill fitness snapshots from activity history before computing TCAS.
  // TCAS requires 4+ weekly snapshots which may not exist yet if the weekly
  // cron hasn't run enough times.
  try {
    const { backfillSnapshots } = await import('./fitnessSnapshots.js');
    const snapResult = await backfillSnapshots(supabase, userId, 8);
    console.log(`[metrics:backfill] Fitness snapshots: ${snapResult.snapshotsCreated} created`);
  } catch (snapErr) {
    console.error(`[metrics:backfill] Snapshot backfill failed (non-critical):`, snapErr.message);
  }

  // Compute TCAS from fitness snapshots
  try {
    const tcasComputed = await computeAndStoreTCAS(supabase, userId);
    result.tcasBackfilled = tcasComputed;
  } catch (err) {
    console.error(`[metrics:backfill] TCAS computation failed:`, err.message);
  }

  console.log(`[metrics:backfill] Done. TWL: ${result.twlBackfilled}, EFI: ${result.efiBackfilled}, TCAS: ${result.tcasBackfilled}`);
  return result;
}

// ─── TCAS — Time-Constrained Adaptation Score ────────────────────────────────

/**
 * Compute and store TCAS from fitness_snapshots data.
 * Requires at least 4 weeks of snapshot history.
 *
 * @param {object} supabase - Supabase admin client
 * @param {string} userId - User ID
 * @returns {boolean} whether TCAS was successfully computed
 */
export async function computeAndStoreTCAS(supabase, userId) {
  // Fetch last 8 weeks of fitness snapshots (need current + 6 weeks ago)
  const { data: snapshots, error: snapErr } = await supabase
    .from('fitness_snapshots')
    .select('snapshot_week, ctl, atl, weekly_tss, weekly_hours, weekly_rides')
    .eq('user_id', userId)
    .order('snapshot_week', { ascending: false })
    .limit(8);

  if (snapErr || !snapshots || snapshots.length < 4) {
    console.log(`[metrics:tcas] Insufficient snapshots (${snapshots?.length || 0}), need 4+`);
    return false;
  }

  const currentSnapshot = snapshots[0];
  const sixWeeksAgo = snapshots.length >= 7 ? snapshots[6] : snapshots[snapshots.length - 1];

  const ctlNow = currentSnapshot.ctl || 0;
  const ctl6wAgo = sixWeeksAgo.ctl || 0;

  // Average weekly hours across the window
  const avgWeeklyHours = snapshots.reduce((sum, s) => sum + (s.weekly_hours || 0), 0) / snapshots.length;

  // Fetch user profile for training years
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('years_training, experience_level')
    .eq('user_id', userId)
    .maybeSingle();

  let yearsTraining = profile?.years_training || 3;
  // Infer from experience level if years_training not set
  if (!profile?.years_training && profile?.experience_level) {
    const levelYears = { beginner: 1, intermediate: 3, advanced: 7, racer: 10 };
    yearsTraining = levelYears[profile.experience_level] || 3;
  }

  // Fetch latest activities for EF and power data
  const { data: recentActivities } = await supabase
    .from('activities')
    .select('ride_analytics, normalized_power, average_heartrate, power_curve_summary, start_date')
    .eq('user_id', userId)
    .or('is_hidden.eq.false,is_hidden.is.null')
    .is('duplicate_of', null)
    .gt('tss', 0)
    .order('start_date', { ascending: false })
    .limit(20);

  if (!recentActivities || recentActivities.length < 2) {
    console.log(`[metrics:tcas] Insufficient recent activities for AQ sub-scores`);
    return false;
  }

  // Split activities into recent (last 2 weeks) and older (4-6 weeks ago)
  const now = new Date();
  const twoWeeksAgo = new Date(now); twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
  const fourWeeksAgo = new Date(now); fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);

  const recentGroup = recentActivities.filter(a => new Date(a.start_date) >= twoWeeksAgo);
  const olderGroup = recentActivities.filter(a => {
    const d = new Date(a.start_date);
    return d < fourWeeksAgo;
  });

  // EF (Efficiency Factor) — NP / avg HR
  const efNow = avgEF(recentGroup);
  const ef6wAgo = avgEF(olderGroup);

  // Pa:Hr (aerobic decoupling) — from ride_analytics if available
  const paHrNow = avgDecoupling(recentGroup);
  const paHr6wAgo = avgDecoupling(olderGroup);

  // 20-min power — from power_curve_summary
  const p20minNow = avgPeakPower(recentGroup, 1200);
  const p20min6wAgo = avgPeakPower(olderGroup, 1200);

  // Compute TCAS using inline formula (mirrors src/lib/metrics/tcas.ts)
  const fv = (ctlNow - ctl6wAgo) / 6;
  const he = Math.min(2.0, Math.max(0, avgWeeklyHours > 0 ? fv / (avgWeeklyHours * 0.30) : 0));

  const eft = ef6wAgo > 0
    ? Math.min(2.0, (efNow - ef6wAgo) / (ef6wAgo * 0.02))
    : 0;
  const deltaDecoupling = paHrNow - paHr6wAgo;
  const adi = Math.min(1.0, -deltaDecoupling / 10);
  const deltaP20Pct = p20min6wAgo > 0
    ? ((p20minNow - p20min6wAgo) / p20min6wAgo) * 100
    : 0;
  const ppd = Math.min(1.5, Math.max(0, deltaP20Pct * 0.10));
  const aq = Math.min(1.2, Math.max(0, 0.40 * eft + 0.30 * adi + 0.30 * ppd));

  const taa = 1 + (0.05 * Math.max(0, yearsTraining));
  const raw = (0.55 * he + 0.45 * aq) * taa;
  const tcas = Math.min(100, Math.max(0, Math.round(raw * 50 * 10) / 10));

  // Store
  const weekEnding = currentSnapshot.snapshot_week;

  const { error: upsertErr } = await supabase
    .from('weekly_tcas')
    .upsert({
      user_id: userId,
      week_ending: weekEnding,
      ctl_now: ctlNow,
      ctl_6w_ago: ctl6wAgo,
      avg_weekly_hours: Math.round(avgWeeklyHours * 100) / 100,
      fv: Math.round(fv * 10000) / 10000,
      ef_now: Math.round(efNow * 10000) / 10000,
      ef_6w_ago: Math.round(ef6wAgo * 10000) / 10000,
      pa_hr_now: Math.round(paHrNow * 10000) / 10000,
      pa_hr_6w_ago: Math.round(paHr6wAgo * 10000) / 10000,
      p20min_now: Math.round(p20minNow * 100) / 100,
      p20min_6w_ago: Math.round(p20min6wAgo * 100) / 100,
      years_training: yearsTraining,
      he: Math.round(he * 10000) / 10000,
      eft: Math.round(eft * 10000) / 10000,
      adi: Math.round(adi * 10000) / 10000,
      ppd: Math.round(ppd * 10000) / 10000,
      aq: Math.round(aq * 10000) / 10000,
      taa: Math.round(taa * 10000) / 10000,
      tcas,
      computed_at: new Date().toISOString(),
    }, { onConflict: 'user_id,week_ending' });

  if (upsertErr) {
    console.error('[metrics:tcas] Upsert failed:', upsertErr.message);
    return false;
  }

  console.log(`[metrics:tcas] Stored TCAS ${tcas} for week ${weekEnding}`);
  return true;
}

// ─── TCAS helper functions ───────────────────────────────────────────────────

function avgEF(activities) {
  const efValues = activities
    .filter(a => a.normalized_power && a.average_heartrate && a.average_heartrate > 0)
    .map(a => {
      // Check ride_analytics first
      if (a.ride_analytics?.efficiency_factor) return a.ride_analytics.efficiency_factor;
      return a.normalized_power / a.average_heartrate;
    });
  return efValues.length > 0 ? efValues.reduce((a, b) => a + b, 0) / efValues.length : 1.0;
}

function avgDecoupling(activities) {
  const values = activities
    .filter(a => a.ride_analytics?.aerobic_decoupling != null)
    .map(a => a.ride_analytics.aerobic_decoupling);
  // Default to 5% if no decoupling data
  return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 5.0;
}

function avgPeakPower(activities, durationSec) {
  const values = activities
    .filter(a => {
      const curve = a.power_curve_summary;
      return curve && (curve[String(durationSec)] || curve[`${durationSec}s`]);
    })
    .map(a => {
      const curve = a.power_curve_summary;
      return curve[String(durationSec)] || curve[`${durationSec}s`] || 0;
    });
  if (values.length > 0) return values.reduce((a, b) => a + b, 0) / values.length;
  // Fallback: try 300s (5-min) power if 20-min not available
  const fallback = activities
    .filter(a => a.power_curve_summary && (a.power_curve_summary['300'] || a.power_curve_summary['300s']))
    .map(a => a.power_curve_summary['300'] || a.power_curve_summary['300s']);
  if (fallback.length > 0) return (fallback.reduce((a, b) => a + b, 0) / fallback.length) * 0.95;
  // Last resort: use normalized_power
  const npValues = activities.filter(a => a.normalized_power).map(a => a.normalized_power);
  return npValues.length > 0 ? npValues.reduce((a, b) => a + b, 0) / npValues.length : 0;
}
