/**
 * Fitness History Tool Handler
 * Processes query_fitness_history tool calls from the AI coach
 *
 * This enables the AI coach to answer questions like:
 * - "How does my fitness compare to this time last year?"
 * - "When was I at my peak fitness?"
 * - "Am I building or losing fitness?"
 */

import { createClient } from '@supabase/supabase-js';
import { backfillSnapshots } from './fitnessSnapshots.js';

/**
 * Handle fitness history query from AI coach
 *
 * @param {string} userId - The user's ID
 * @param {Object} params - Tool parameters from Claude
 * @returns {Object} Query results for the AI to interpret
 */
export async function handleFitnessHistoryQuery(userId, params) {
  console.log(`📊 Fitness history query for user ${userId}:`, JSON.stringify(params));

  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );

  const {
    query_type,
    weeks_back = 12,
    compare_to,
    metrics = ['ctl', 'weekly_tss', 'weekly_hours']
  } = params;

  try {
    // Fetch recent snapshots based on weeks_back
    const weeksAgo = new Date();
    weeksAgo.setDate(weeksAgo.getDate() - (Math.min(weeks_back, 104) * 7));

    let { data: snapshots, error } = await supabase
      .from('fitness_snapshots')
      .select('*')
      .eq('user_id', userId)
      .gte('snapshot_week', weeksAgo.toISOString().split('T')[0])
      .order('snapshot_week', { ascending: false });

    if (error) throw error;

    console.log(`📊 Found ${snapshots?.length || 0} existing snapshots`);

    // Auto-backfill if no snapshots exist
    if (!snapshots || snapshots.length === 0) {
      console.log(`📊 No fitness snapshots found for user ${userId}, triggering auto-backfill...`);

      const backfillResult = await backfillSnapshots(supabase, userId, 104); // Up to 2 years
      console.log(`📊 Backfill result:`, JSON.stringify(backfillResult));

      if (backfillResult.snapshotsCreated > 0) {
        console.log(`📊 Auto-backfill complete: ${backfillResult.snapshotsCreated} snapshots created`);

        // Re-query after backfill
        const refetch = await supabase
          .from('fitness_snapshots')
          .select('*')
          .eq('user_id', userId)
          .gte('snapshot_week', weeksAgo.toISOString().split('T')[0])
          .order('snapshot_week', { ascending: false });

        snapshots = refetch.data;
        console.log(`📊 After backfill, found ${snapshots?.length || 0} snapshots`);
      }

      // If still no data after backfill, user has no activities
      if (!snapshots || snapshots.length === 0) {
        return {
          success: false,
          message: 'No activity history found. The athlete needs to sync their activities from Strava or another provider first.',
          suggestion: 'Connect Strava or import activities to build fitness history.'
        };
      }
    }

    switch (query_type) {
      case 'recent_trend':
        return analyzeRecentTrend(snapshots, metrics);

      case 'peak_fitness':
        return findPeakFitness(snapshots, supabase, userId);

      case 'compare_periods':
        return comparePeriods(snapshots, compare_to, metrics, supabase, userId);

      case 'year_over_year':
        return yearOverYearComparison(snapshots, supabase, userId);

      case 'seasonal_pattern':
        return analyzeSeasonalPattern(supabase, userId);

      case 'training_response':
        return analyzeTrainingResponse(snapshots);

      default:
        return analyzeRecentTrend(snapshots, metrics);
    }
  } catch (error) {
    console.error('Fitness history query error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Analyze recent training trend (last 4-8 weeks)
 */
function analyzeRecentTrend(snapshots, metrics) {
  const recent = snapshots.slice(0, 4);
  const prior = snapshots.slice(4, 8);

  if (recent.length === 0) {
    return { message: 'Insufficient recent data for trend analysis' };
  }

  const currentWeek = recent[0];

  // Calculate averages
  const recentAvg = {
    ctl: avg(recent.map(s => s.ctl)),
    atl: avg(recent.map(s => s.atl)),
    weekly_tss: avg(recent.map(s => s.weekly_tss)),
    weekly_hours: avg(recent.map(s => s.weekly_hours))
  };

  const priorAvg = prior.length > 0 ? {
    ctl: avg(prior.map(s => s.ctl)),
    atl: avg(prior.map(s => s.atl)),
    weekly_tss: avg(prior.map(s => s.weekly_tss)),
    weekly_hours: avg(prior.map(s => s.weekly_hours))
  } : recentAvg;

  // Calculate changes
  const ctlChange = priorAvg.ctl > 0
    ? Math.round(((recentAvg.ctl - priorAvg.ctl) / priorAvg.ctl) * 100)
    : 0;

  const volumeChange = priorAvg.weekly_hours > 0
    ? Math.round(((recentAvg.weekly_hours - priorAvg.weekly_hours) / priorAvg.weekly_hours) * 100)
    : 0;

  const direction = ctlChange > 5 ? 'improving' :
                    ctlChange < -5 ? 'declining' : 'stable';

  return {
    success: true,
    current: {
      week: currentWeek.snapshot_week,
      ctl: currentWeek.ctl,
      atl: currentWeek.atl,
      tsb: currentWeek.tsb,
      weekly_tss: currentWeek.weekly_tss,
      weekly_hours: currentWeek.weekly_hours,
      weekly_rides: currentWeek.weekly_ride_count,
      load_trend: currentWeek.load_trend,
      ftp: currentWeek.ftp
    },
    trend: {
      direction,
      ctl_change_percent: ctlChange,
      volume_change_percent: volumeChange,
      recent_avg_ctl: Math.round(recentAvg.ctl),
      prior_avg_ctl: Math.round(priorAvg.ctl),
      recent_avg_hours: round2(recentAvg.weekly_hours),
      prior_avg_hours: round2(priorAvg.weekly_hours)
    },
    weeks_analyzed: snapshots.length,
    summary: `Fitness is ${direction}. CTL ${ctlChange >= 0 ? '+' : ''}${ctlChange}% over last 4 weeks. ` +
             `Currently at CTL ${currentWeek.ctl}, TSB ${currentWeek.tsb} (${currentWeek.tsb > 5 ? 'fresh' : currentWeek.tsb > -10 ? 'balanced' : 'fatigued'}).`
  };
}

/**
 * Find peak fitness period (highest CTL)
 */
async function findPeakFitness(recentSnapshots, supabase, userId) {
  // Get all-time snapshots for peak finding
  const { data: allSnapshots } = await supabase
    .from('fitness_snapshots')
    .select('snapshot_week, ctl, weekly_tss, weekly_hours, ftp, weekly_ride_count')
    .eq('user_id', userId)
    .order('ctl', { ascending: false })
    .limit(10);

  if (!allSnapshots || allSnapshots.length === 0) {
    return { message: 'No fitness history available for peak analysis' };
  }

  const peak = allSnapshots[0];
  const current = recentSnapshots[0];

  const peakDate = new Date(peak.snapshot_week);
  const currentDate = new Date(current.snapshot_week);
  const weeksAgo = Math.floor((currentDate - peakDate) / (7 * 24 * 60 * 60 * 1000));

  const percentOfPeak = peak.ctl > 0 ? Math.round((current.ctl / peak.ctl) * 100) : 100;

  return {
    success: true,
    peak: {
      week: peak.snapshot_week,
      ctl: peak.ctl,
      weekly_tss: peak.weekly_tss,
      weekly_hours: peak.weekly_hours,
      weekly_rides: peak.weekly_ride_count,
      weeks_ago: weeksAgo
    },
    current: {
      ctl: current.ctl,
      percent_of_peak: percentOfPeak
    },
    top_fitness_weeks: allSnapshots.slice(0, 5).map(s => ({
      week: s.snapshot_week,
      ctl: s.ctl,
      hours: s.weekly_hours
    })),
    summary: `Peak fitness (CTL ${peak.ctl}) was ${weeksAgo > 0 ? weeksAgo + ' weeks ago' : 'this week'} during the week of ${peak.snapshot_week}. ` +
             `Current fitness is ${percentOfPeak}% of peak (CTL ${current.ctl}).`
  };
}

/**
 * Compare current period to a specified past period
 */
async function comparePeriods(recentSnapshots, compare_to, metrics, supabase, userId) {
  const current = recentSnapshots.slice(0, 4);
  let comparison = [];
  let comparisonLabel = '';

  if (compare_to === 'last_year' || compare_to === 'same_time_last_year') {
    // Get snapshots from same weeks last year
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const startDate = new Date(oneYearAgo);
    startDate.setDate(startDate.getDate() - 14);
    const endDate = new Date(oneYearAgo);
    endDate.setDate(endDate.getDate() + 14);

    const { data: lastYearSnapshots } = await supabase
      .from('fitness_snapshots')
      .select('*')
      .eq('user_id', userId)
      .gte('snapshot_week', startDate.toISOString().split('T')[0])
      .lte('snapshot_week', endDate.toISOString().split('T')[0])
      .order('snapshot_week', { ascending: false });

    comparison = lastYearSnapshots || [];
    comparisonLabel = 'same time last year';

  } else if (compare_to === 'peak') {
    const { data: peakData } = await supabase
      .from('fitness_snapshots')
      .select('*')
      .eq('user_id', userId)
      .order('ctl', { ascending: false })
      .limit(4);

    comparison = peakData || [];
    comparisonLabel = 'peak fitness period';
  }

  if (comparison.length === 0) {
    return {
      success: false,
      message: `No data available for ${comparisonLabel}. The athlete may not have enough history.`
    };
  }

  const currentAvg = {
    ctl: avg(current.map(s => s.ctl)),
    weekly_tss: avg(current.map(s => s.weekly_tss)),
    weekly_hours: avg(current.map(s => s.weekly_hours)),
    weekly_rides: avg(current.map(s => s.weekly_ride_count))
  };

  const comparisonAvg = {
    ctl: avg(comparison.map(s => s.ctl)),
    weekly_tss: avg(comparison.map(s => s.weekly_tss)),
    weekly_hours: avg(comparison.map(s => s.weekly_hours)),
    weekly_rides: avg(comparison.map(s => s.weekly_ride_count))
  };

  const ctlDiff = Math.round(currentAvg.ctl - comparisonAvg.ctl);
  const hoursDiff = round2(currentAvg.weekly_hours - comparisonAvg.weekly_hours);

  return {
    success: true,
    current_period: {
      weeks: current.map(s => s.snapshot_week),
      avg_ctl: Math.round(currentAvg.ctl),
      avg_weekly_tss: Math.round(currentAvg.weekly_tss),
      avg_weekly_hours: round2(currentAvg.weekly_hours),
      avg_rides_per_week: round2(currentAvg.weekly_rides)
    },
    comparison_period: {
      label: comparisonLabel,
      weeks: comparison.map(s => s.snapshot_week),
      avg_ctl: Math.round(comparisonAvg.ctl),
      avg_weekly_tss: Math.round(comparisonAvg.weekly_tss),
      avg_weekly_hours: round2(comparisonAvg.weekly_hours),
      avg_rides_per_week: round2(comparisonAvg.weekly_rides)
    },
    differences: {
      ctl: ctlDiff,
      weekly_hours: hoursDiff,
      weekly_tss: Math.round(currentAvg.weekly_tss - comparisonAvg.weekly_tss)
    },
    summary: `Compared to ${comparisonLabel}: CTL is ${ctlDiff >= 0 ? '+' : ''}${ctlDiff} (${Math.round(currentAvg.ctl)} vs ${Math.round(comparisonAvg.ctl)}). ` +
             `Weekly volume is ${hoursDiff >= 0 ? '+' : ''}${hoursDiff} hours (${round2(currentAvg.weekly_hours)} vs ${round2(comparisonAvg.weekly_hours)} hrs/week).`
  };
}

/**
 * Year-over-year comparison for the same time period
 */
async function yearOverYearComparison(recentSnapshots, supabase, userId) {
  const currentWeek = recentSnapshots[0]?.snapshot_week;
  if (!currentWeek) {
    return { message: 'No current fitness data available' };
  }

  // Get data for same week in previous years
  const currentDate = new Date(currentWeek);
  const yearComparisons = [];

  for (let yearsBack = 1; yearsBack <= 3; yearsBack++) {
    const targetDate = new Date(currentDate);
    targetDate.setFullYear(targetDate.getFullYear() - yearsBack);

    // Look for snapshots within 2 weeks of target date
    const startDate = new Date(targetDate);
    startDate.setDate(startDate.getDate() - 7);
    const endDate = new Date(targetDate);
    endDate.setDate(endDate.getDate() + 7);

    const { data } = await supabase
      .from('fitness_snapshots')
      .select('*')
      .eq('user_id', userId)
      .gte('snapshot_week', startDate.toISOString().split('T')[0])
      .lte('snapshot_week', endDate.toISOString().split('T')[0])
      .order('snapshot_week', { ascending: false })
      .limit(1);

    if (data && data.length > 0) {
      yearComparisons.push({
        year: targetDate.getFullYear(),
        years_ago: yearsBack,
        snapshot: data[0]
      });
    }
  }

  const current = recentSnapshots[0];

  return {
    success: true,
    current_year: {
      year: currentDate.getFullYear(),
      week: currentWeek,
      ctl: current.ctl,
      weekly_hours: current.weekly_hours,
      weekly_tss: current.weekly_tss
    },
    previous_years: yearComparisons.map(yc => ({
      year: yc.year,
      years_ago: yc.years_ago,
      week: yc.snapshot.snapshot_week,
      ctl: yc.snapshot.ctl,
      weekly_hours: yc.snapshot.weekly_hours,
      weekly_tss: yc.snapshot.weekly_tss,
      ctl_difference: current.ctl - yc.snapshot.ctl
    })),
    summary: yearComparisons.length > 0
      ? `Year-over-year: Current CTL ${current.ctl}. ` +
        yearComparisons.map(yc =>
          `${yc.year}: CTL ${yc.snapshot.ctl} (${current.ctl - yc.snapshot.ctl >= 0 ? '+' : ''}${current.ctl - yc.snapshot.ctl} difference)`
        ).join('. ')
      : 'No previous year data available for comparison.'
  };
}

/**
 * Analyze seasonal patterns across all available data
 */
async function analyzeSeasonalPattern(supabase, userId) {
  const { data: allSnapshots } = await supabase
    .from('fitness_snapshots')
    .select('snapshot_week, ctl, weekly_tss, weekly_hours')
    .eq('user_id', userId)
    .order('snapshot_week', { ascending: true });

  if (!allSnapshots || allSnapshots.length < 12) {
    return {
      success: false,
      message: 'Need at least 12 weeks of data for seasonal pattern analysis'
    };
  }

  // Group by month
  const monthlyData = {};
  allSnapshots.forEach(s => {
    const month = new Date(s.snapshot_week).getMonth();
    if (!monthlyData[month]) {
      monthlyData[month] = { ctl: [], hours: [], tss: [] };
    }
    monthlyData[month].ctl.push(s.ctl);
    monthlyData[month].hours.push(s.weekly_hours);
    monthlyData[month].tss.push(s.weekly_tss);
  });

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthlyAverages = Object.entries(monthlyData).map(([month, data]) => ({
    month: monthNames[parseInt(month)],
    month_num: parseInt(month),
    avg_ctl: Math.round(avg(data.ctl)),
    avg_hours: round2(avg(data.hours)),
    samples: data.ctl.length
  })).sort((a, b) => a.month_num - b.month_num);

  // Find peak and low months
  const peakMonth = monthlyAverages.reduce((a, b) => a.avg_ctl > b.avg_ctl ? a : b);
  const lowMonth = monthlyAverages.reduce((a, b) => a.avg_ctl < b.avg_ctl ? a : b);

  return {
    success: true,
    monthly_averages: monthlyAverages,
    peak_month: {
      month: peakMonth.month,
      avg_ctl: peakMonth.avg_ctl,
      avg_hours: peakMonth.avg_hours
    },
    low_month: {
      month: lowMonth.month,
      avg_ctl: lowMonth.avg_ctl,
      avg_hours: lowMonth.avg_hours
    },
    total_weeks_analyzed: allSnapshots.length,
    summary: `Seasonal pattern: Peak fitness typically in ${peakMonth.month} (avg CTL ${peakMonth.avg_ctl}), ` +
             `lowest in ${lowMonth.month} (avg CTL ${lowMonth.avg_ctl}). Based on ${allSnapshots.length} weeks of data.`
  };
}

/**
 * Analyze how fitness responds to training load changes
 */
function analyzeTrainingResponse(snapshots) {
  if (snapshots.length < 8) {
    return { message: 'Need at least 8 weeks of data for training response analysis' };
  }

  // Look for periods of load increase and measure CTL response
  const responses = [];
  for (let i = 4; i < snapshots.length - 4; i++) {
    const before = snapshots.slice(i + 1, i + 5);
    const after = snapshots.slice(Math.max(0, i - 3), i + 1);

    const loadBefore = avg(before.map(s => s.weekly_tss));
    const loadAfter = avg(after.map(s => s.weekly_tss));
    const ctlBefore = avg(before.map(s => s.ctl));
    const ctlAfter = avg(after.map(s => s.ctl));

    const loadChange = loadBefore > 0 ? ((loadAfter - loadBefore) / loadBefore) * 100 : 0;
    const ctlChange = ctlBefore > 0 ? ((ctlAfter - ctlBefore) / ctlBefore) * 100 : 0;

    if (Math.abs(loadChange) > 15) {
      responses.push({
        period: snapshots[i].snapshot_week,
        load_change_percent: Math.round(loadChange),
        ctl_response_percent: Math.round(ctlChange),
        type: loadChange > 0 ? 'increase' : 'decrease'
      });
    }
  }

  const increases = responses.filter(r => r.type === 'increase');
  const decreases = responses.filter(r => r.type === 'decrease');

  const avgResponseToIncrease = increases.length > 0
    ? Math.round(avg(increases.map(r => r.ctl_response_percent)))
    : null;

  return {
    success: true,
    training_blocks_analyzed: responses.length,
    load_increases: increases.length,
    load_decreases: decreases.length,
    avg_ctl_response_to_load_increase: avgResponseToIncrease,
    recent_responses: responses.slice(0, 5),
    summary: increases.length > 0
      ? `Training response: When load increases by ~20%, CTL typically responds with +${avgResponseToIncrease}% over 4 weeks. ` +
        `Found ${responses.length} significant load changes in the history.`
      : 'Not enough significant load changes to analyze training response patterns.'
  };
}

// Utility functions
function avg(arr) {
  if (!arr || arr.length === 0) return 0;
  return arr.reduce((a, b) => a + (b || 0), 0) / arr.length;
}

function round2(num) {
  return Math.round(num * 100) / 100;
}
