/**
 * Fitness Snapshot Computation Utilities
 * Calculates weekly fitness metrics from activity data
 *
 * These snapshots enable the AI coach to:
 * - Compare current fitness to past periods
 * - Identify seasonal patterns and trends
 * - Answer questions like "How am I doing compared to last year?"
 */

/**
 * Calculate Chronic Training Load (CTL) - 42-day exponentially weighted average
 * Mirrors the calculation in src/utils/trainingPlans.ts
 */
export function calculateCTL(dailyTSS) {
  if (!dailyTSS || dailyTSS.length === 0) return 0;

  const decay = 1 / 42;
  let ctl = 0;

  dailyTSS.forEach((tss, index) => {
    const weight = Math.exp(-decay * (dailyTSS.length - index - 1));
    ctl += tss * weight;
  });

  return Math.round(ctl * decay);
}

/**
 * Calculate Acute Training Load (ATL) - 7-day exponentially weighted average
 */
export function calculateATL(dailyTSS) {
  if (!dailyTSS || dailyTSS.length === 0) return 0;

  const decay = 1 / 7;
  let atl = 0;

  dailyTSS.forEach((tss, index) => {
    const weight = Math.exp(-decay * (dailyTSS.length - index - 1));
    atl += tss * weight;
  });

  return Math.round(atl * decay);
}

/**
 * Calculate Training Stress Balance (TSB)
 */
export function calculateTSB(ctl, atl) {
  return Math.round(ctl - atl);
}

/**
 * Estimate TSS from activity data when power data isn't available
 * Matches the approach used in coachingContext
 */
export function estimateTSS(activity) {
  // Use actual TSS if available from power data
  if (activity.tss && activity.tss > 0) return activity.tss;

  // Calculate from kilojoules if available (more accurate)
  if (activity.kilojoules && activity.kilojoules > 0 && activity.moving_time) {
    // Rough TSS estimate from kJ: TSS ~= kJ / 3.6 / FTP * 100
    // Without FTP, use approximate formula
    const hours = activity.moving_time / 3600;
    if (hours > 0) {
      return Math.round(activity.kilojoules / hours / 1.2);
    }
  }

  const durationHours = (activity.moving_time || 0) / 3600;
  const elevationM = activity.total_elevation_gain || 0;

  // Base: 50 TSS/hour + elevation factor
  const baseTSS = durationHours * 50;
  const elevationFactor = (elevationM / 300) * 10;

  // Intensity adjustment based on average watts if available
  let intensityMultiplier = 1.0;
  if (activity.average_watts && activity.average_watts > 0) {
    // Higher average watts = higher intensity
    // Assume 150W is baseline endurance
    intensityMultiplier = Math.min(1.8, Math.max(0.5, activity.average_watts / 150));
  }

  return Math.round((baseTSS + elevationFactor) * intensityMultiplier);
}

/**
 * Get the Monday of a given week (ISO week start)
 */
export function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().split('T')[0];
}

/**
 * Compute load trend by comparing recent weeks to prior weeks
 */
function computeLoadTrend(tssArray) {
  if (tssArray.length < 28) return 'building';

  // Compare last 2 weeks vs prior 2 weeks
  const recent = tssArray.slice(-14).reduce((a, b) => a + b, 0) / 2;
  const prior = tssArray.slice(-28, -14).reduce((a, b) => a + b, 0) / 2;

  if (prior === 0) return 'building';
  const change = (recent - prior) / prior;

  if (change > 0.15) return 'building';
  if (change < -0.30) return 'declining';
  if (change < -0.15) return 'recovering';
  return 'maintaining';
}

/**
 * Compute fitness trend by looking at CTL progression
 */
function computeFitnessTrend(currentCTL, weeklyTSSAvg) {
  // Simple heuristic: if weekly TSS is higher than CTL, fitness is building
  if (weeklyTSSAvg > currentCTL * 1.1) return 'improving';
  if (weeklyTSSAvg < currentCTL * 0.8) return 'declining';
  return 'stable';
}

/**
 * Compute average normalized power from activities
 */
function computeAvgNP(activities) {
  const withNP = activities.filter(a => a.normalized_power && a.normalized_power > 0);
  if (withNP.length === 0) return null;
  return Math.round(
    withNP.reduce((sum, a) => sum + a.normalized_power, 0) / withNP.length
  );
}

/**
 * Find peak 20-minute power from the week's activities
 */
function findPeak20minPower(activities) {
  // This would require stream data which we don't have in summary
  // For now, estimate from average watts of shorter high-intensity activities
  const highIntensity = activities.filter(a =>
    a.average_watts &&
    a.average_watts > 0 &&
    a.moving_time &&
    a.moving_time >= 1200 && // At least 20 min
    a.moving_time <= 5400  // Less than 90 min (more likely to have higher avg)
  );

  if (highIntensity.length === 0) return null;

  // Return highest average watts as proxy for 20min power
  return Math.max(...highIntensity.map(a => a.average_watts));
}

/**
 * Compute a fitness snapshot for a specific week
 *
 * @param {Object} supabase - Supabase client with service role
 * @param {string} userId - User ID
 * @param {string} weekStart - Monday of target week (YYYY-MM-DD)
 * @returns {Object} Snapshot data ready for insert
 */
export async function computeWeeklySnapshot(supabase, userId, weekStart) {
  // Week boundaries
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const weekEndStr = weekEnd.toISOString().split('T')[0];

  // Need 90 days of history for accurate CTL calculation
  const historyStart = new Date(weekEnd);
  historyStart.setDate(historyStart.getDate() - 90);

  // Fetch activities for the analysis period
  // Use .or() to include both is_hidden=false AND is_hidden=null (default)
  const { data: activities, error } = await supabase
    .from('activities')
    .select(`
      id, start_date, moving_time, elapsed_time,
      distance, total_elevation_gain, average_watts,
      kilojoules, average_heartrate, trainer,
      tss, normalized_power, is_hidden
    `)
    .eq('user_id', userId)
    .or('is_hidden.eq.false,is_hidden.is.null')
    .gte('start_date', historyStart.toISOString())
    .lt('start_date', weekEnd.toISOString())
    .order('start_date', { ascending: true });

  if (error) throw error;

  // Build daily TSS map for CTL/ATL calculation
  const dailyTSS = {};
  const weekActivities = [];

  (activities || []).forEach(activity => {
    const actDate = activity.start_date.split('T')[0];
    const tss = estimateTSS(activity);
    dailyTSS[actDate] = (dailyTSS[actDate] || 0) + tss;

    // Track activities within target week
    if (actDate >= weekStart && actDate < weekEndStr) {
      weekActivities.push({ ...activity, estimatedTSS: tss });
    }
  });

  // Build ordered TSS array for last 90 days ending at week end
  const tssArray = [];
  for (let i = 89; i >= 0; i--) {
    const date = new Date(weekEnd);
    date.setDate(date.getDate() - i - 1);
    const dateStr = date.toISOString().split('T')[0];
    tssArray.push(dailyTSS[dateStr] || 0);
  }

  // Calculate load metrics
  const ctl = calculateCTL(tssArray);
  const atl = calculateATL(tssArray.slice(-7));
  const tsb = calculateTSB(ctl, atl);

  // Compute weekly summary
  const weeklyTSS = weekActivities.reduce((sum, a) => sum + a.estimatedTSS, 0);
  const weeklyHours = weekActivities.reduce(
    (sum, a) => sum + (a.moving_time || 0) / 3600, 0
  );
  const weeklyDistance = weekActivities.reduce(
    (sum, a) => sum + ((a.distance || 0) / 1000), 0
  );
  const weeklyElevation = weekActivities.reduce(
    (sum, a) => sum + (a.total_elevation_gain || 0), 0
  );

  // Get FTP from user preferences
  const { data: prefs } = await supabase
    .from('user_preferences')
    .select('ftp')
    .eq('user_id', userId)
    .maybeSingle();

  // Compute trends
  const loadTrend = computeLoadTrend(tssArray);
  const fitnessTrend = computeFitnessTrend(ctl, weeklyTSS / 7);

  return {
    user_id: userId,
    snapshot_week: weekStart,
    snapshot_date: new Date().toISOString(),
    ctl: Math.round(ctl),
    atl: Math.round(atl),
    tsb: Math.round(tsb),
    ftp: prefs?.ftp || null,
    ftp_source: prefs?.ftp ? 'user_preferences' : null,
    weekly_tss: Math.round(weeklyTSS),
    weekly_hours: Math.round(weeklyHours * 100) / 100,
    weekly_ride_count: weekActivities.length,
    weekly_distance_km: Math.round(weeklyDistance * 100) / 100,
    weekly_elevation_m: Math.round(weeklyElevation),
    avg_normalized_power: computeAvgNP(weekActivities),
    peak_20min_power: findPeak20minPower(weekActivities),
    load_trend: loadTrend,
    fitness_trend: fitnessTrend,
    activities_analyzed: (activities || []).length
  };
}

/**
 * Backfill historical snapshots for a user
 *
 * @param {Object} supabase - Supabase client
 * @param {string} userId - User ID
 * @param {number} weeksBack - How many weeks to backfill (default 52)
 * @returns {Object} Result with counts
 */
export async function backfillSnapshots(supabase, userId, weeksBack = 52) {
  console.log(`📊 backfillSnapshots starting for user ${userId}, weeksBack=${weeksBack}`);

  // First check total activity count for debugging
  const { count: totalCount } = await supabase
    .from('activities')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);

  console.log(`📊 Total activities for user: ${totalCount}`);

  // Get oldest activity date to know how far back we can go
  // Use .or() to include both is_hidden=false AND is_hidden=null (default)
  const { data: oldestActivity, error: oldestError } = await supabase
    .from('activities')
    .select('start_date')
    .eq('user_id', userId)
    .or('is_hidden.eq.false,is_hidden.is.null')
    .order('start_date', { ascending: true })
    .limit(1)
    .single();

  if (oldestError) {
    console.error(`📊 Error getting oldest activity:`, oldestError);
  }
  console.log(`📊 Oldest activity:`, oldestActivity);

  if (!oldestActivity) {
    console.log(`📊 No visible activities found for backfill`);
    return {
      success: true,
      message: 'No activities found',
      snapshotsCreated: 0
    };
  }

  // Calculate weeks to backfill
  const oldestDate = new Date(oldestActivity.start_date);
  const now = new Date();
  const maxWeeksAvailable = Math.floor(
    (now - oldestDate) / (7 * 24 * 60 * 60 * 1000)
  );
  const weeksToProcess = Math.min(weeksBack, maxWeeksAvailable);

  const snapshots = [];
  const errors = [];

  // Process each week (most recent first)
  for (let i = 0; i < weeksToProcess; i++) {
    const weekDate = new Date(now);
    weekDate.setDate(weekDate.getDate() - (i * 7));
    const weekStart = getWeekStart(weekDate);

    try {
      const snapshot = await computeWeeklySnapshot(supabase, userId, weekStart);

      // Upsert to handle re-runs
      const { error } = await supabase
        .from('fitness_snapshots')
        .upsert(snapshot, {
          onConflict: 'user_id,snapshot_week'
        });

      if (error) throw error;
      snapshots.push(weekStart);
    } catch (err) {
      errors.push({ week: weekStart, error: err.message });
    }
  }

  return {
    success: true,
    snapshotsCreated: snapshots.length,
    weeksProcessed: weeksToProcess,
    errors: errors.length > 0 ? errors : undefined
  };
}

/**
 * Update snapshot for a specific week (called after activity import)
 *
 * @param {Object} supabase - Supabase client
 * @param {string} userId - User ID
 * @param {string} activityDate - Date of the imported activity
 */
export async function updateSnapshotForActivity(supabase, userId, activityDate) {
  const weekStart = getWeekStart(new Date(activityDate));

  try {
    const snapshot = await computeWeeklySnapshot(supabase, userId, weekStart);

    await supabase
      .from('fitness_snapshots')
      .upsert(snapshot, {
        onConflict: 'user_id,snapshot_week'
      });

    return { success: true, weekUpdated: weekStart };
  } catch (error) {
    console.error('Snapshot update failed:', error);
    return { success: false, error: error.message };
  }
}
