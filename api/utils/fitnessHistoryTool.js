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
 * Enhanced to include power metrics for actual fitness comparison
 */
async function comparePeriods(recentSnapshots, compare_to, metrics, supabase, userId) {
  const current = recentSnapshots.slice(0, 4);
  let comparison = [];
  let comparisonLabel = '';
  let comparisonDateRange = null;

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
    comparisonDateRange = { start: startDate, end: endDate };

  } else if (compare_to === 'peak') {
    const { data: peakData } = await supabase
      .from('fitness_snapshots')
      .select('*')
      .eq('user_id', userId)
      .order('ctl', { ascending: false })
      .limit(4);

    comparison = peakData || [];
    comparisonLabel = 'peak fitness period';

    // Set date range for peak period
    if (comparison.length > 0) {
      const peakWeeks = comparison.map(s => new Date(s.snapshot_week));
      comparisonDateRange = {
        start: new Date(Math.min(...peakWeeks)),
        end: new Date(Math.max(...peakWeeks))
      };
      comparisonDateRange.end.setDate(comparisonDateRange.end.getDate() + 7);
    }
  }

  if (comparison.length === 0) {
    return {
      success: false,
      message: `No data available for ${comparisonLabel}. The athlete may not have enough history.`
    };
  }

  // Calculate power metrics for both periods
  const now = new Date();
  const fourWeeksAgo = new Date(now);
  fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);

  const currentPower = await calculatePowerMetrics(supabase, userId, fourWeeksAgo, now);
  const comparisonPower = comparisonDateRange
    ? await calculatePowerMetrics(supabase, userId, comparisonDateRange.start, comparisonDateRange.end)
    : null;

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

  // Generate fitness verdict
  let verdict = null;
  if (currentPower && comparisonPower) {
    verdict = generateFitnessVerdict(
      { ctl: currentAvg.ctl, power: currentPower },
      { ctl: comparisonAvg.ctl, power: comparisonPower }
    );
  }

  // Build enhanced summary
  let summary = `Compared to ${comparisonLabel}:\n`;
  summary += `• Training Load (CTL): ${ctlDiff >= 0 ? '+' : ''}${ctlDiff} (${Math.round(currentAvg.ctl)} vs ${Math.round(comparisonAvg.ctl)})\n`;
  summary += `• Weekly volume: ${hoursDiff >= 0 ? '+' : ''}${hoursDiff} hours (${round2(currentAvg.weekly_hours)} vs ${round2(comparisonAvg.weekly_hours)} hrs/week)\n`;

  if (currentPower && comparisonPower) {
    if (currentPower.best_power_short && comparisonPower.best_power_short) {
      const diff = currentPower.best_power_short - comparisonPower.best_power_short;
      summary += `• Best 20-60min power: ${diff >= 0 ? '+' : ''}${diff}W (${currentPower.best_power_short}W vs ${comparisonPower.best_power_short}W)\n`;
    }
    if (currentPower.best_power_medium && comparisonPower.best_power_medium) {
      const diff = currentPower.best_power_medium - comparisonPower.best_power_medium;
      summary += `• Best 1-2hr power: ${diff >= 0 ? '+' : ''}${diff}W (${currentPower.best_power_medium}W vs ${comparisonPower.best_power_medium}W)\n`;
    }
  }

  if (verdict) {
    const verdictText = {
      'fitter': 'FITTER than comparison period',
      'slightly_fitter': 'Slightly fitter than comparison period',
      'similar': 'Similar fitness to comparison period',
      'slightly_less_fit': 'Slightly less fit than comparison period',
      'less_fit': 'Lower fitness than comparison period'
    };
    summary += `\nVerdict: ${verdictText[verdict.verdict] || 'Unable to determine'}`;
  }

  return {
    success: true,
    current_period: {
      weeks: current.map(s => s.snapshot_week),
      avg_ctl: Math.round(currentAvg.ctl),
      avg_weekly_tss: Math.round(currentAvg.weekly_tss),
      avg_weekly_hours: round2(currentAvg.weekly_hours),
      avg_rides_per_week: round2(currentAvg.weekly_rides),
      power: currentPower
    },
    comparison_period: {
      label: comparisonLabel,
      weeks: comparison.map(s => s.snapshot_week),
      avg_ctl: Math.round(comparisonAvg.ctl),
      avg_weekly_tss: Math.round(comparisonAvg.weekly_tss),
      avg_weekly_hours: round2(comparisonAvg.weekly_hours),
      avg_rides_per_week: round2(comparisonAvg.weekly_rides),
      power: comparisonPower
    },
    differences: {
      ctl: ctlDiff,
      weekly_hours: hoursDiff,
      weekly_tss: Math.round(currentAvg.weekly_tss - comparisonAvg.weekly_tss)
    },
    fitness_verdict: verdict,
    summary
  };
}

/**
 * Calculate best power outputs from activities within a date range
 * Uses real power curve data from FIT files when available, falls back to estimates
 */
async function calculatePowerMetrics(supabase, userId, startDate, endDate) {
  // Query for all power-related fields including new FIT-derived metrics
  // Exclude hidden activities and duplicates
  const { data: activities } = await supabase
    .from('activities')
    .select(`
      average_watts, max_watts, normalized_power, tss, intensity_factor,
      power_curve_summary, device_watts, moving_time, kilojoules,
      total_elevation_gain, distance
    `)
    .eq('user_id', userId)
    .or('is_hidden.eq.false,is_hidden.is.null')
    .is('duplicate_of', null)
    .gte('start_date', startDate.toISOString())
    .lt('start_date', endDate.toISOString())
    .gt('average_watts', 0);

  if (!activities || activities.length === 0) {
    return null;
  }

  // Separate activities with real power data vs estimated
  const withPowerCurve = activities.filter(a => a.power_curve_summary);
  const withDeviceWatts = activities.filter(a => a.device_watts === true);
  const hasRealPowerData = withPowerCurve.length > 0 || withDeviceWatts.length > 0;

  // Extract best MMP at key durations from power curve summaries
  // This is REAL data from FIT files - much more accurate than estimates
  let best5min = null, best20min = null, best60min = null;

  for (const activity of withPowerCurve) {
    const curve = activity.power_curve_summary;
    if (curve) {
      // 5 minute power (300s)
      if (curve['300s'] && (best5min === null || curve['300s'] > best5min)) {
        best5min = curve['300s'];
      }
      // 20 minute power (1200s)
      if (curve['1200s'] && (best20min === null || curve['1200s'] > best20min)) {
        best20min = curve['1200s'];
      }
      // 60 minute power (3600s)
      if (curve['3600s'] && (best60min === null || curve['3600s'] > best60min)) {
        best60min = curve['3600s'];
      }
    }
  }

  // Duration buckets for fallback comparison (when no power curve data)
  // Short: 20-60 min (threshold/VO2max efforts)
  // Medium: 60-120 min (tempo/sweet spot rides)
  // Long: 120+ min (endurance rides)
  const shortEfforts = activities.filter(a => a.moving_time >= 1200 && a.moving_time < 3600);
  const mediumEfforts = activities.filter(a => a.moving_time >= 3600 && a.moving_time < 7200);
  const longEfforts = activities.filter(a => a.moving_time >= 7200);

  // Find best average watts for each duration bucket (fallback if no power curve)
  const bestShortFallback = shortEfforts.length > 0
    ? Math.max(...shortEfforts.map(a => a.average_watts))
    : null;
  const bestMediumFallback = mediumEfforts.length > 0
    ? Math.max(...mediumEfforts.map(a => a.average_watts))
    : null;
  const bestLongFallback = longEfforts.length > 0
    ? Math.max(...longEfforts.map(a => a.average_watts))
    : null;

  // Use real data when available, fall back to estimates
  const best_power_short = best5min || bestShortFallback;
  const best_power_medium = best20min || bestMediumFallback;
  const best_power_long = best60min || bestLongFallback;

  // Peak power - prefer max_watts from FIT files
  const peakPower = Math.max(...activities.map(a => a.max_watts || 0));

  // Best normalized power (real intensity metric)
  const bestNP = Math.max(...activities.filter(a => a.normalized_power).map(a => a.normalized_power) || [0]);

  // Training efficiency: total kJ / total hours
  const totalKj = activities.reduce((sum, a) => sum + (a.kilojoules || 0), 0);
  const totalHours = activities.reduce((sum, a) => sum + (a.moving_time || 0), 0) / 3600;
  const kjPerHour = totalHours > 0 ? Math.round(totalKj / totalHours) : null;

  // Average watts across all activities (weighted by duration)
  // Prefer normalized power when available
  const totalWattHours = activities.reduce((sum, a) => {
    const power = a.normalized_power || a.average_watts;
    return sum + (power * (a.moving_time / 3600));
  }, 0);
  const weightedAvgWatts = totalHours > 0 ? Math.round(totalWattHours / totalHours) : null;

  // Climbing efficiency: total elevation / total hours
  const totalElevation = activities.reduce((sum, a) => sum + (a.total_elevation_gain || 0), 0);
  const elevationPerHour = totalHours > 0 ? Math.round(totalElevation / totalHours) : null;

  // Total TSS if available
  const totalTSS = activities.reduce((sum, a) => sum + (a.tss || 0), 0);

  return {
    activity_count: activities.length,
    total_hours: round2(totalHours),
    total_kj: Math.round(totalKj),
    total_tss: totalTSS > 0 ? Math.round(totalTSS) : null,
    // Best efforts - REAL MMP from power curves when available
    best_power_short: best_power_short,   // Best 5-min power (or fallback)
    best_power_medium: best_power_medium, // Best 20-min power (or fallback)
    best_power_long: best_power_long,     // Best 60-min power (or fallback)
    // Peak metrics
    peak_power: peakPower > 0 ? peakPower : null,
    best_normalized_power: bestNP > 0 ? bestNP : null,
    // Efficiency metrics
    kj_per_hour: kjPerHour,
    weighted_avg_watts: weightedAvgWatts,
    elevation_per_hour: elevationPerHour,
    // Data quality indicators
    has_real_power_data: hasRealPowerData,
    activities_with_power_curve: withPowerCurve.length,
    activities_with_device_watts: withDeviceWatts.length,
    // Sample sizes for confidence
    short_effort_count: shortEfforts.length,
    medium_effort_count: mediumEfforts.length,
    long_effort_count: longEfforts.length,
    // Data source labels for UI
    power_source: hasRealPowerData ? 'power_meter' : 'estimated'
  };
}

/**
 * Generate fitness verdict based on comprehensive comparison
 */
function generateFitnessVerdict(current, previous) {
  const dominated = { better: 0, worse: 0, same: 0 };
  const insights = [];

  // Compare CTL (training load - not fitness, but context)
  if (current.ctl !== null && previous.ctl !== null) {
    const ctlDiff = current.ctl - previous.ctl;
    if (ctlDiff < -10) {
      dominated.worse++;
      insights.push(`Training load (CTL) is ${Math.abs(ctlDiff)} points lower`);
    } else if (ctlDiff > 10) {
      dominated.better++;
    }
  }

  // Compare actual power outputs (THIS IS WHAT MATTERS FOR FITNESS)
  const powerMetrics = [
    { name: 'short efforts (20-60 min)', current: current.power?.best_power_short, previous: previous.power?.best_power_short },
    { name: 'medium efforts (1-2 hr)', current: current.power?.best_power_medium, previous: previous.power?.best_power_medium },
    { name: 'long efforts (2+ hr)', current: current.power?.best_power_long, previous: previous.power?.best_power_long },
    { name: 'peak power', current: current.power?.peak_power, previous: previous.power?.peak_power }
  ];

  for (const metric of powerMetrics) {
    if (metric.current && metric.previous) {
      const diff = metric.current - metric.previous;
      const pctDiff = Math.round((diff / metric.previous) * 100);

      if (pctDiff >= 3) {
        dominated.better++;
        insights.push(`Best ${metric.name}: +${diff}W (+${pctDiff}%)`);
      } else if (pctDiff <= -3) {
        dominated.worse++;
        insights.push(`Best ${metric.name}: ${diff}W (${pctDiff}%)`);
      } else {
        dominated.same++;
      }
    }
  }

  // Compare efficiency (higher is better - more output per hour)
  if (current.power?.kj_per_hour && previous.power?.kj_per_hour) {
    const effDiff = current.power.kj_per_hour - previous.power.kj_per_hour;
    const pctDiff = Math.round((effDiff / previous.power.kj_per_hour) * 100);

    if (pctDiff >= 5) {
      dominated.better++;
      insights.push(`Training efficiency: +${pctDiff}% more kJ/hour`);
    } else if (pctDiff <= -5) {
      dominated.worse++;
      insights.push(`Training efficiency: ${pctDiff}% less kJ/hour`);
    }
  }

  // Generate verdict
  let verdict = 'similar';
  let confidence = 'low';

  const totalComparisons = dominated.better + dominated.worse + dominated.same;

  if (totalComparisons >= 3) {
    confidence = 'moderate';
    if (totalComparisons >= 5) confidence = 'high';

    if (dominated.better > dominated.worse * 2) {
      verdict = 'fitter';
    } else if (dominated.worse > dominated.better * 2) {
      verdict = 'less_fit';
    } else if (dominated.better > dominated.worse) {
      verdict = 'slightly_fitter';
    } else if (dominated.worse > dominated.better) {
      verdict = 'slightly_less_fit';
    }
  }

  // Special case: lower CTL but higher power outputs = FITTER (quality > quantity)
  const lowerCTL = current.ctl < previous.ctl;
  const higherPower = (current.power?.best_power_short > previous.power?.best_power_short) ||
                      (current.power?.best_power_medium > previous.power?.best_power_medium);

  if (lowerCTL && higherPower) {
    verdict = 'fitter';
    insights.unshift('Training volume is lower but power outputs are higher - this indicates improved fitness quality');
  }

  return { verdict, confidence, insights, comparisons: dominated };
}

/**
 * Year-over-year comparison for the same time period
 * Enhanced to include actual power metrics, not just CTL
 */
async function yearOverYearComparison(recentSnapshots, supabase, userId) {
  const currentWeek = recentSnapshots[0]?.snapshot_week;
  if (!currentWeek) {
    return { message: 'No current fitness data available' };
  }

  const currentDate = new Date(currentWeek);
  const yearComparisons = [];

  // Define comparison window: 6 weeks centered on current date
  const windowWeeks = 6;
  const currentWindowStart = new Date(currentDate);
  currentWindowStart.setDate(currentWindowStart.getDate() - (windowWeeks * 7) / 2);
  const currentWindowEnd = new Date(currentDate);
  currentWindowEnd.setDate(currentWindowEnd.getDate() + (windowWeeks * 7) / 2);

  // Get current period power metrics
  const currentPower = await calculatePowerMetrics(supabase, userId, currentWindowStart, currentWindowEnd);

  for (let yearsBack = 1; yearsBack <= 3; yearsBack++) {
    const targetDate = new Date(currentDate);
    targetDate.setFullYear(targetDate.getFullYear() - yearsBack);

    // Look for snapshots within 2 weeks of target date
    const snapshotStart = new Date(targetDate);
    snapshotStart.setDate(snapshotStart.getDate() - 7);
    const snapshotEnd = new Date(targetDate);
    snapshotEnd.setDate(snapshotEnd.getDate() + 7);

    const { data } = await supabase
      .from('fitness_snapshots')
      .select('*')
      .eq('user_id', userId)
      .gte('snapshot_week', snapshotStart.toISOString().split('T')[0])
      .lte('snapshot_week', snapshotEnd.toISOString().split('T')[0])
      .order('snapshot_week', { ascending: false })
      .limit(1);

    if (data && data.length > 0) {
      // Get power metrics for the same window last year
      const pastWindowStart = new Date(currentWindowStart);
      pastWindowStart.setFullYear(pastWindowStart.getFullYear() - yearsBack);
      const pastWindowEnd = new Date(currentWindowEnd);
      pastWindowEnd.setFullYear(pastWindowEnd.getFullYear() - yearsBack);

      const pastPower = await calculatePowerMetrics(supabase, userId, pastWindowStart, pastWindowEnd);

      yearComparisons.push({
        year: targetDate.getFullYear(),
        years_ago: yearsBack,
        snapshot: data[0],
        power: pastPower
      });
    }
  }

  const current = recentSnapshots[0];

  // Build comparison results with power data
  const previousYearsData = yearComparisons.map(yc => {
    const powerComparison = {};

    if (currentPower && yc.power) {
      // Power differences
      if (currentPower.best_power_short && yc.power.best_power_short) {
        powerComparison.best_power_short_diff = currentPower.best_power_short - yc.power.best_power_short;
      }
      if (currentPower.best_power_medium && yc.power.best_power_medium) {
        powerComparison.best_power_medium_diff = currentPower.best_power_medium - yc.power.best_power_medium;
      }
      if (currentPower.best_power_long && yc.power.best_power_long) {
        powerComparison.best_power_long_diff = currentPower.best_power_long - yc.power.best_power_long;
      }
      if (currentPower.peak_power && yc.power.peak_power) {
        powerComparison.peak_power_diff = currentPower.peak_power - yc.power.peak_power;
      }
      if (currentPower.kj_per_hour && yc.power.kj_per_hour) {
        powerComparison.efficiency_diff = currentPower.kj_per_hour - yc.power.kj_per_hour;
      }
    }

    return {
      year: yc.year,
      years_ago: yc.years_ago,
      week: yc.snapshot.snapshot_week,
      // CTL metrics (training load)
      ctl: yc.snapshot.ctl,
      weekly_hours: yc.snapshot.weekly_hours,
      weekly_tss: yc.snapshot.weekly_tss,
      ctl_difference: current.ctl - yc.snapshot.ctl,
      // Power metrics (actual fitness indicators)
      power: yc.power,
      power_comparison: powerComparison
    };
  });

  // Generate overall fitness verdict for most recent year comparison
  let verdict = null;
  if (yearComparisons.length > 0) {
    const lastYear = yearComparisons[0];
    verdict = generateFitnessVerdict(
      { ctl: current.ctl, power: currentPower },
      { ctl: lastYear.snapshot.ctl, power: lastYear.power }
    );
  }

  // Build summary that distinguishes training load from actual fitness
  let summary = '';
  if (yearComparisons.length > 0) {
    const yc = yearComparisons[0];
    const ctlDiff = current.ctl - yc.snapshot.ctl;

    summary = `Year-over-year analysis (vs ${yc.year}):\n`;
    summary += `• Training Load (CTL): ${current.ctl} vs ${yc.snapshot.ctl} (${ctlDiff >= 0 ? '+' : ''}${ctlDiff})\n`;

    if (currentPower && yc.power) {
      summary += `• Best 20-60min power: ${currentPower.best_power_short || 'N/A'}W vs ${yc.power.best_power_short || 'N/A'}W`;
      if (currentPower.best_power_short && yc.power.best_power_short) {
        const diff = currentPower.best_power_short - yc.power.best_power_short;
        summary += ` (${diff >= 0 ? '+' : ''}${diff}W)`;
      }
      summary += '\n';

      summary += `• Best 1-2hr power: ${currentPower.best_power_medium || 'N/A'}W vs ${yc.power.best_power_medium || 'N/A'}W`;
      if (currentPower.best_power_medium && yc.power.best_power_medium) {
        const diff = currentPower.best_power_medium - yc.power.best_power_medium;
        summary += ` (${diff >= 0 ? '+' : ''}${diff}W)`;
      }
      summary += '\n';

      summary += `• Training efficiency: ${currentPower.kj_per_hour || 'N/A'} kJ/hr vs ${yc.power.kj_per_hour || 'N/A'} kJ/hr\n`;
    }

    if (verdict) {
      const verdictText = {
        'fitter': 'You appear to be FITTER than this time last year',
        'slightly_fitter': 'You appear to be slightly fitter than this time last year',
        'similar': 'Your fitness appears similar to this time last year',
        'slightly_less_fit': 'You may be slightly less fit than this time last year',
        'less_fit': 'Your power outputs suggest lower fitness than this time last year'
      };
      summary += `\nVerdict: ${verdictText[verdict.verdict] || 'Unable to determine'}`;
      if (verdict.insights.length > 0) {
        summary += '\nKey insights:\n' + verdict.insights.map(i => `  - ${i}`).join('\n');
      }
    }
  } else {
    summary = 'No previous year data available for comparison.';
  }

  return {
    success: true,
    current_year: {
      year: currentDate.getFullYear(),
      week: currentWeek,
      ctl: current.ctl,
      weekly_hours: current.weekly_hours,
      weekly_tss: current.weekly_tss,
      power: currentPower
    },
    previous_years: previousYearsData,
    fitness_verdict: verdict,
    summary
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
