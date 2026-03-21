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
  const workoutId = activity.matched_planned_workout_id;
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
  const { data: workout } = await supabase
    .from('planned_workouts')
    .select('target_tss, zone_distribution')
    .eq('id', workoutId)
    .single();

  if (!workout?.target_tss) return;

  const plannedTSS = workout.target_tss;
  const actualTSS = activity.tss || 0;

  // Zone distributions
  const plannedZones = workout.zone_distribution || { Z1: 0.4, Z2: 0.3, Z3: 0.1, Z4: 0.1, Z5: 0.1 };

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

  const { error: efiErr } = await supabase
    .from('activity_efi')
    .upsert({
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
    }, { onConflict: 'activity_id' });

  if (efiErr) {
    console.error('[metrics] EFI upsert failed:', efiErr.message);
  }
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
