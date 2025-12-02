/**
 * Coaching Context Builder
 * Generates compact, token-efficient training context for AI coach
 * Based on the data aggregation design to minimize token usage
 */

import { supabase } from '../supabase';
import { calculateCTL, calculateATL, calculateTSB } from '../utils/trainingPlans';

/**
 * Classification thresholds for ride intensity
 */
const RIDE_INTENSITY_THRESHOLDS = {
  EASY: 0.55,
  ENDURANCE: 0.75,
  TEMPO: 0.87,
  THRESHOLD: 0.95,
  VO2MAX: 1.05
};

/**
 * Classify ride type based on intensity
 */
function classifyRideType(normalizedPower, avgPower, ftp) {
  if (!ftp || ftp === 0) return 'endurance';

  const power = normalizedPower || avgPower || 0;
  const intensity = power / ftp;

  if (intensity < RIDE_INTENSITY_THRESHOLDS.EASY) return 'easy';
  if (intensity < RIDE_INTENSITY_THRESHOLDS.ENDURANCE) return 'endurance';
  if (intensity < RIDE_INTENSITY_THRESHOLDS.TEMPO) return 'tempo';
  if (intensity < RIDE_INTENSITY_THRESHOLDS.THRESHOLD) return 'threshold';
  if (intensity < RIDE_INTENSITY_THRESHOLDS.VO2MAX) return 'vo2max';
  return 'race';
}

/**
 * Estimate TSS from ride data (matches TrainingDashboard calculation)
 */
function estimateTSS(ride) {
  // Use actual TSS if available
  if (ride.training_stress_score && ride.training_stress_score > 0) {
    return ride.training_stress_score;
  }
  if (ride.tss && ride.tss > 0) {
    return ride.tss;
  }

  // Estimate from ride metrics
  const distanceKm = ride.distance_km || ride.distance || 0;
  const elevationM = ride.elevation_gain_m || ride.elevation_gain || 0;
  const durationSeconds = ride.duration_seconds || ride.duration || 3600;

  // Base: 50 TSS/hour + elevation factor
  const baseTSS = (durationSeconds / 3600) * 50;
  const elevationFactor = (elevationM / 300) * 10;

  return Math.round(baseTSS + elevationFactor);
}

/**
 * Get weekly training summaries (last N weeks)
 */
async function getWeeklySummaries(userId, weeksCount = 6) {
  const { data: rides, error } = await supabase
    .from('routes')
    .select('*')
    .eq('user_id', userId)
    .gte('recorded_at', new Date(Date.now() - weeksCount * 7 * 24 * 60 * 60 * 1000).toISOString())
    .order('recorded_at', { ascending: false });

  if (error) throw error;

  // Group rides by week
  const weeklyData = {};
  const now = new Date();

  rides.forEach(ride => {
    const rideDate = new Date(ride.recorded_at);
    // Calculate week number (0 = current week, 1 = last week, etc.)
    const weekOffset = Math.floor((now - rideDate) / (7 * 24 * 60 * 60 * 1000));

    if (weekOffset < weeksCount) {
      if (!weeklyData[weekOffset]) {
        weeklyData[weekOffset] = {
          tss: 0,
          hours: 0,
          rideCount: 0,
          totalNP: 0,
          npCount: 0
        };
      }

      const tss = estimateTSS(ride);
      const hours = (ride.duration_seconds || ride.duration || 0) / 3600;
      const np = ride.normalized_power || ride.average_power || 0;

      weeklyData[weekOffset].tss += tss;
      weeklyData[weekOffset].hours += hours;
      weeklyData[weekOffset].rideCount += 1;

      if (np > 0) {
        weeklyData[weekOffset].totalNP += np;
        weeklyData[weekOffset].npCount += 1;
      }
    }
  });

  // Convert to array format (newest first)
  const summaries = [];
  for (let i = 0; i < weeksCount; i++) {
    const week = weeklyData[i] || { tss: 0, hours: 0, rideCount: 0, totalNP: 0, npCount: 0 };
    summaries.push({
      weekOffset: i,
      total_tss: Math.round(week.tss),
      hours: Math.round(week.hours * 10) / 10,
      ride_count: week.rideCount,
      avg_np: week.npCount > 0 ? Math.round(week.totalNP / week.npCount) : null
    });
  }

  return summaries;
}

/**
 * Calculate ATL (Acute Training Load) - 7-day exponentially weighted average
 */
async function calculateATL_FromRides(userId) {
  const { data: rides } = await supabase
    .from('routes')
    .select('recorded_at, training_stress_score, tss, duration_seconds, duration, distance_km, distance, elevation_gain_m, elevation_gain')
    .eq('user_id', userId)
    .gte('recorded_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

  if (!rides || rides.length === 0) return 0;

  const totalTSS = rides.reduce((sum, ride) => sum + estimateTSS(ride), 0);
  return Math.round(totalTSS / 7);
}

/**
 * Calculate CTL (Chronic Training Load) - 42-day exponentially weighted average
 */
async function calculateCTL_FromRides(userId) {
  const { data: rides } = await supabase
    .from('routes')
    .select('recorded_at, training_stress_score, tss, duration_seconds, duration, distance_km, distance, elevation_gain_m, elevation_gain')
    .eq('user_id', userId)
    .gte('recorded_at', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString())
    .order('recorded_at', { ascending: true });

  if (!rides || rides.length === 0) return 0;

  // Create daily TSS array (last 90 days)
  const dailyTSS = {};
  rides.forEach(ride => {
    const date = ride.recorded_at.split('T')[0];
    dailyTSS[date] = (dailyTSS[date] || 0) + estimateTSS(ride);
  });

  const tssValues = [];
  for (let i = 89; i >= 0; i--) {
    const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const dateStr = date.toISOString().split('T')[0];
    tssValues.push(dailyTSS[dateStr] || 0);
  }

  return Math.round(calculateCTL(tssValues));
}

/**
 * Get recent rides (limited to N most recent)
 */
async function getRecentRides(userId, limit = 5, ftp = null) {
  const { data: rides, error } = await supabase
    .from('routes')
    .select('*')
    .eq('user_id', userId)
    .order('recorded_at', { ascending: false })
    .limit(limit);

  if (error) throw error;

  return rides.map(ride => ({
    date: ride.recorded_at.split('T')[0],
    duration: Math.round((ride.duration_seconds || ride.duration || 0) / 60),
    tss: estimateTSS(ride),
    type: classifyRideType(ride.normalized_power, ride.average_power, ftp),
    title: ride.route_name || ride.name || undefined
  }));
}

/**
 * Get preferred riding days
 */
async function getPreferredDays(userId) {
  const { data: rides } = await supabase
    .from('routes')
    .select('recorded_at')
    .eq('user_id', userId)
    .gte('recorded_at', new Date(Date.now() - 84 * 24 * 60 * 60 * 1000).toISOString()); // 12 weeks

  if (!rides || rides.length === 0) return [];

  const dayCounts = {};
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  rides.forEach(ride => {
    const date = new Date(ride.recorded_at);
    const dayName = dayNames[date.getDay()];
    dayCounts[dayName] = (dayCounts[dayName] || 0) + 1;
  });

  // Sort by count and return top 2
  return Object.entries(dayCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([day]) => day);
}

/**
 * Get best 20-minute power in last N weeks
 */
async function getBest20MinPower(userId, weeks = 6) {
  const { data: rides } = await supabase
    .from('routes')
    .select('normalized_power, average_power, duration_seconds, duration')
    .eq('user_id', userId)
    .gte('recorded_at', new Date(Date.now() - weeks * 7 * 24 * 60 * 60 * 1000).toISOString())
    .gte('duration_seconds', 1200); // At least 20 minutes

  if (!rides || rides.length === 0) return null;

  // Simple approximation: highest normalized power on rides >= 20min
  const maxNP = Math.max(...rides.map(r => r.normalized_power || r.average_power || 0));
  return maxNP > 0 ? Math.round(maxNP) : null;
}

/**
 * Compute load trend from weekly summaries
 */
function computeLoadTrend(weeklySummaries) {
  if (weeklySummaries.length < 3) return 'maintaining';

  const recent = (weeklySummaries[0].total_tss + weeklySummaries[1].total_tss) / 2;
  const prior = (weeklySummaries[2].total_tss + weeklySummaries[3]?.total_tss || 0) / 2;

  if (prior === 0) return 'building';

  const change = (recent - prior) / prior;

  if (change > 0.15) return 'building';
  if (change < -0.30) return 'declining';
  if (change < -0.15) return 'recovering';
  return 'maintaining';
}

/**
 * Compute power trend from weekly summaries
 */
function computePowerTrend(weeklySummaries) {
  const recentWeeks = weeklySummaries.slice(0, 2).filter(w => w.avg_np);
  const priorWeeks = weeklySummaries.slice(2, 4).filter(w => w.avg_np);

  if (recentWeeks.length === 0 || priorWeeks.length === 0) return 'stable';

  const recentAvg = recentWeeks.reduce((sum, w) => sum + w.avg_np, 0) / recentWeeks.length;
  const priorAvg = priorWeeks.reduce((sum, w) => sum + w.avg_np, 0) / priorWeeks.length;

  const change = (recentAvg - priorAvg) / priorAvg;

  if (change > 0.05) return 'improving';
  if (change < -0.05) return 'declining';
  return 'stable';
}

/**
 * Compute consistency score (0-100)
 */
function computeConsistency(weeklySummaries, targetHoursPerWeek) {
  if (!targetHoursPerWeek || weeklySummaries.length === 0) return 50;

  // Score based on how close actual hours are to target
  let totalScore = 0;
  let weekCount = 0;

  weeklySummaries.forEach(week => {
    if (week.hours > 0) {
      const ratio = Math.min(week.hours / targetHoursPerWeek, 1.5); // Cap at 150%
      const weekScore = ratio > 1 ? (2 - ratio) * 100 : ratio * 100;
      totalScore += Math.max(0, Math.min(100, weekScore));
      weekCount++;
    }
  });

  return weekCount > 0 ? Math.round(totalScore / weekCount) : 50;
}

/**
 * Calculate days since last ride
 */
function computeDaysSince(lastRideDate) {
  if (!lastRideDate) return 999;
  const daysDiff = (Date.now() - new Date(lastRideDate)) / (24 * 60 * 60 * 1000);
  return Math.floor(daysDiff);
}

/**
 * Calculate days since last rest day (2+ consecutive days without rides)
 */
function computeDaysSinceRest(recentRides) {
  if (recentRides.length === 0) return 0;

  const today = new Date().toISOString().split('T')[0];
  const rideDates = new Set(recentRides.map(r => r.date));

  let daysCount = 0;
  for (let i = 0; i < 14; i++) {
    const checkDate = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const dateStr = checkDate.toISOString().split('T')[0];

    if (!rideDates.has(dateStr)) {
      // Found a rest day
      return daysCount;
    }
    daysCount++;
  }

  return daysCount; // No rest day found in last 14 days
}

/**
 * Compute average rides per week
 */
function computeAvgRidesPerWeek(weeklySummaries) {
  const validWeeks = weeklySummaries.filter(w => w.ride_count > 0);
  if (validWeeks.length === 0) return 0;

  const totalRides = validWeeks.reduce((sum, w) => sum + w.ride_count, 0);
  return Math.round((totalRides / validWeeks.length) * 10) / 10;
}

/**
 * Compute average ride duration
 */
function computeAvgDuration(recentRides) {
  if (recentRides.length === 0) return 0;

  const totalDuration = recentRides.reduce((sum, r) => sum + r.duration, 0);
  return Math.round(totalDuration / recentRides.length);
}

/**
 * Main function: Build compact coaching context
 *
 * Returns a token-efficient JSON object (~250-350 tokens when serialized)
 *
 * @param {string} userId - User ID
 * @param {Object} options - Options (includeRecentRides, weeksBack)
 * @returns {Promise<CoachingContext>} Compact coaching context
 */
export async function buildCoachingContext(userId, options = {}) {
  const {
    includeRecentRides = 5,
    weeksBack = 6
  } = options;

  console.log('🏗️ Building compact coaching context for user:', userId);

  try {
    // Get user profile
    const { data: profile } = await supabase
      .from('user_preferences_complete')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    // Get active training plan
    const { data: activePlan } = await supabase
      .from('training_plans')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active')
      .maybeSingle();

    const ftp = activePlan?.ftp || profile?.ftp || 250;
    const weeklyHoursTarget = activePlan?.hours_per_week || profile?.weekly_hours_target || 8;
    const goals = activePlan?.goal_type || profile?.primary_goal || null;

    // Fetch all data in parallel for performance
    const [
      weeklySummaries,
      atl,
      ctl,
      recentRides,
      preferredDays,
      best20min
    ] = await Promise.all([
      getWeeklySummaries(userId, weeksBack),
      calculateATL_FromRides(userId),
      calculateCTL_FromRides(userId),
      getRecentRides(userId, includeRecentRides, ftp),
      getPreferredDays(userId),
      getBest20MinPower(userId, weeksBack)
    ]);

    const tsb = ctl - atl;

    // Compute trends
    const loadTrend = computeLoadTrend(weeklySummaries);
    const powerTrend = computePowerTrend(weeklySummaries);
    const consistencyScore = computeConsistency(weeklySummaries, weeklyHoursTarget);

    // Compute patterns
    const avgRidesPerWeek = computeAvgRidesPerWeek(weeklySummaries);
    const avgRideDuration = computeAvgDuration(recentRides);
    const daysSinceLastRide = recentRides.length > 0 ? computeDaysSince(recentRides[0].date) : 999;
    const daysSinceRestDay = computeDaysSinceRest(recentRides);

    // Get recent average weighted power (last 4 weeks)
    const recentNP = weeklySummaries.slice(0, 4)
      .filter(w => w.avg_np)
      .reduce((sum, w, idx, arr) => sum + w.avg_np / arr.length, 0);

    const today = new Date();
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    const context = {
      profile: {
        ftp: ftp,
        restingHR: activePlan?.resting_hr || profile?.resting_hr || null,
        maxHR: activePlan?.max_heart_rate || profile?.max_hr || null,
        weeklyHoursTarget: weeklyHoursTarget,
        goals: goals
      },
      load: {
        weeklyTSS: weeklySummaries.map(w => w.total_tss),
        weeklyHours: weeklySummaries.map(w => w.hours),
        ctl: ctl,
        atl: atl,
        tsb: tsb,
        loadTrend: loadTrend
      },
      performance: {
        avgWeightedPower: recentNP > 0 ? Math.round(recentNP) : null,
        best20minPower: best20min,
        powerTrend: powerTrend
      },
      patterns: {
        avgRidesPerWeek: avgRidesPerWeek,
        avgRideDuration: avgRideDuration,
        preferredDays: preferredDays,
        daysSinceLastRide: daysSinceLastRide,
        daysSinceRestDay: daysSinceRestDay,
        consistencyScore: consistencyScore
      },
      recentRides: recentRides,
      today: today.toISOString().split('T')[0],
      dayOfWeek: dayNames[today.getDay()]
    };

    console.log('✅ Compact coaching context built:', {
      ctl: context.load.ctl,
      atl: context.load.atl,
      tsb: context.load.tsb,
      loadTrend: context.load.loadTrend,
      recentRides: context.recentRides.length,
      estimatedTokens: JSON.stringify(context).length / 3.5 // Rough estimate
    });

    return context;

  } catch (error) {
    console.error('❌ Error building coaching context:', error);
    throw error;
  }
}

/**
 * Format coaching context as a concise text summary for the prompt
 * Much shorter than the old formatContextForPrompt
 */
export function formatCompactContext(context) {
  return `## Training Context
${JSON.stringify(context, null, 2)}`;
}

export default {
  buildCoachingContext,
  formatCompactContext
};
