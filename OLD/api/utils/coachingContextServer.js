/**
 * Server-side Coaching Context Builder (Vercel API Route compatible)
 * Adapted from src/services/coachingContext.js to work in Vercel serverless environment
 */

import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client for server-side use
const getSupabaseClient = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase credentials');
  }

  return createClient(supabaseUrl, supabaseKey);
};

// Ride classification thresholds
const RIDE_INTENSITY_THRESHOLDS = {
  EASY: 0.55,
  ENDURANCE: 0.75,
  TEMPO: 0.87,
  THRESHOLD: 0.95,
  VO2MAX: 1.05
};

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

function estimateTSS(ride) {
  if (ride.training_stress_score && ride.training_stress_score > 0) return ride.training_stress_score;
  if (ride.tss && ride.tss > 0) return ride.tss;

  const elevationM = ride.elevation_gain_m || ride.elevation_gain || 0;
  const durationSeconds = ride.duration_seconds || ride.duration || 3600;
  const baseTSS = (durationSeconds / 3600) * 50;
  const elevationFactor = (elevationM / 300) * 10;

  return Math.round(baseTSS + elevationFactor);
}

async function getWeeklySummaries(supabase, userId, weeksCount = 6) {
  const { data: rides } = await supabase
    .from('routes')
    .select('*')
    .eq('user_id', userId)
    .gte('recorded_at', new Date(Date.now() - weeksCount * 7 * 24 * 60 * 60 * 1000).toISOString())
    .order('recorded_at', { ascending: false });

  const weeklyData = {};
  const now = new Date();

  (rides || []).forEach(ride => {
    const rideDate = new Date(ride.recorded_at);
    const weekOffset = Math.floor((now - rideDate) / (7 * 24 * 60 * 60 * 1000));

    if (weekOffset < weeksCount) {
      if (!weeklyData[weekOffset]) {
        weeklyData[weekOffset] = { tss: 0, hours: 0, rideCount: 0, totalNP: 0, npCount: 0 };
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

// Simple ATL calculation (7-day average)
async function calculateATL(supabase, userId) {
  const { data: rides } = await supabase
    .from('routes')
    .select('*')
    .eq('user_id', userId)
    .gte('recorded_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

  if (!rides || rides.length === 0) return 0;
  const totalTSS = rides.reduce((sum, ride) => sum + estimateTSS(ride), 0);
  return Math.round(totalTSS / 7);
}

// Simple CTL calculation (42-day weighted average)
async function calculateCTL(supabase, userId) {
  const { data: rides } = await supabase
    .from('routes')
    .select('*')
    .eq('user_id', userId)
    .gte('recorded_at', new Date(Date.now() - 42 * 24 * 60 * 60 * 1000).toISOString());

  if (!rides || rides.length === 0) return 0;
  const totalTSS = rides.reduce((sum, ride) => sum + estimateTSS(ride), 0);
  return Math.round(totalTSS / 42);
}

async function getRecentRides(supabase, userId, limit = 5, ftp = null) {
  const { data: rides } = await supabase
    .from('routes')
    .select('*')
    .eq('user_id', userId)
    .order('recorded_at', { ascending: false })
    .limit(limit);

  return (rides || []).map(ride => ({
    date: ride.recorded_at.split('T')[0],
    duration: Math.round((ride.duration_seconds || ride.duration || 0) / 60),
    tss: estimateTSS(ride),
    type: classifyRideType(ride.normalized_power, ride.average_power, ftp),
    title: ride.route_name || ride.name || undefined
  }));
}

async function getPreferredDays(supabase, userId) {
  const { data: rides } = await supabase
    .from('routes')
    .select('recorded_at')
    .eq('user_id', userId)
    .gte('recorded_at', new Date(Date.now() - 84 * 24 * 60 * 60 * 1000).toISOString());

  if (!rides || rides.length === 0) return [];

  const dayCounts = {};
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  rides.forEach(ride => {
    const date = new Date(ride.recorded_at);
    const dayName = dayNames[date.getDay()];
    dayCounts[dayName] = (dayCounts[dayName] || 0) + 1;
  });

  return Object.entries(dayCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([day]) => day);
}

async function getBest20MinPower(supabase, userId, weeks = 6) {
  const { data: rides } = await supabase
    .from('routes')
    .select('normalized_power, average_power')
    .eq('user_id', userId)
    .gte('recorded_at', new Date(Date.now() - weeks * 7 * 24 * 60 * 60 * 1000).toISOString())
    .gte('duration_seconds', 1200);

  if (!rides || rides.length === 0) return null;

  const maxNP = Math.max(...rides.map(r => r.normalized_power || r.average_power || 0));
  return maxNP > 0 ? Math.round(maxNP) : null;
}

function computeLoadTrend(weeklySummaries) {
  if (weeklySummaries.length < 3) return 'maintaining';

  const recent = (weeklySummaries[0].total_tss + weeklySummaries[1].total_tss) / 2;
  const prior = (weeklySummaries[2].total_tss + (weeklySummaries[3]?.total_tss || 0)) / 2;

  if (prior === 0) return 'building';

  const change = (recent - prior) / prior;
  if (change > 0.15) return 'building';
  if (change < -0.30) return 'declining';
  if (change < -0.15) return 'recovering';
  return 'maintaining';
}

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

function computeConsistency(weeklySummaries, targetHoursPerWeek) {
  if (!targetHoursPerWeek || weeklySummaries.length === 0) return 50;

  let totalScore = 0;
  let weekCount = 0;

  weeklySummaries.forEach(week => {
    if (week.hours > 0) {
      const ratio = Math.min(week.hours / targetHoursPerWeek, 1.5);
      const weekScore = ratio > 1 ? (2 - ratio) * 100 : ratio * 100;
      totalScore += Math.max(0, Math.min(100, weekScore));
      weekCount++;
    }
  });

  return weekCount > 0 ? Math.round(totalScore / weekCount) : 50;
}

function computeDaysSince(dateString) {
  if (!dateString) return 999;
  return Math.floor((Date.now() - new Date(dateString)) / (24 * 60 * 60 * 1000));
}

function computeDaysSinceRest(recentRides) {
  if (recentRides.length === 0) return 0;

  const rideDates = new Set(recentRides.map(r => r.date));
  let daysCount = 0;

  for (let i = 0; i < 14; i++) {
    const checkDate = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const dateStr = checkDate.toISOString().split('T')[0];
    if (!rideDates.has(dateStr)) return daysCount;
    daysCount++;
  }

  return daysCount;
}

/**
 * Build compact coaching context (server-side)
 */
export async function buildCoachingContext(userId, options = {}) {
  const { includeRecentRides = 5, weeksBack = 6 } = options;

  const supabase = getSupabaseClient();

  // Fetch profile and plan
  const { data: profile } = await supabase
    .from('user_preferences_complete')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  const { data: activePlan } = await supabase
    .from('training_plans')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle();

  const ftp = activePlan?.ftp || profile?.ftp || 250;
  const weeklyHoursTarget = activePlan?.hours_per_week || profile?.weekly_hours_target || 8;
  const goals = activePlan?.goal_type || profile?.primary_goal || null;

  // Fetch all data in parallel
  const [weeklySummaries, atl, ctl, recentRides, preferredDays, best20min] = await Promise.all([
    getWeeklySummaries(supabase, userId, weeksBack),
    calculateATL(supabase, userId),
    calculateCTL(supabase, userId),
    getRecentRides(supabase, userId, includeRecentRides, ftp),
    getPreferredDays(supabase, userId),
    getBest20MinPower(supabase, userId, weeksBack)
  ]);

  const tsb = ctl - atl;

  // Compute trends and patterns
  const loadTrend = computeLoadTrend(weeklySummaries);
  const powerTrend = computePowerTrend(weeklySummaries);
  const consistencyScore = computeConsistency(weeklySummaries, weeklyHoursTarget);

  const avgRidesPerWeek = weeklySummaries.filter(w => w.ride_count > 0).length > 0
    ? weeklySummaries.reduce((sum, w) => sum + w.ride_count, 0) / weeklySummaries.filter(w => w.ride_count > 0).length
    : 0;

  const avgRideDuration = recentRides.length > 0
    ? Math.round(recentRides.reduce((sum, r) => sum + r.duration, 0) / recentRides.length)
    : 0;

  const daysSinceLastRide = recentRides.length > 0 ? computeDaysSince(recentRides[0].date) : 999;
  const daysSinceRestDay = computeDaysSinceRest(recentRides);

  const recentNP = weeklySummaries.slice(0, 4)
    .filter(w => w.avg_np)
    .reduce((sum, w, idx, arr) => sum + w.avg_np / arr.length, 0);

  const today = new Date();
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  return {
    profile: {
      ftp,
      restingHR: activePlan?.resting_hr || profile?.resting_hr || null,
      maxHR: activePlan?.max_heart_rate || profile?.max_hr || null,
      weeklyHoursTarget,
      goals
    },
    load: {
      weeklyTSS: weeklySummaries.map(w => w.total_tss),
      weeklyHours: weeklySummaries.map(w => w.hours),
      ctl,
      atl,
      tsb,
      loadTrend
    },
    performance: {
      avgWeightedPower: recentNP > 0 ? Math.round(recentNP) : null,
      best20minPower: best20min,
      powerTrend
    },
    patterns: {
      avgRidesPerWeek: Math.round(avgRidesPerWeek * 10) / 10,
      avgRideDuration,
      preferredDays,
      daysSinceLastRide,
      daysSinceRestDay,
      consistencyScore
    },
    recentRides,
    today: today.toISOString().split('T')[0],
    dayOfWeek: dayNames[today.getDay()]
  };
}
