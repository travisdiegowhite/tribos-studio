/**
 * Advanced Ride Analytics Engine
 *
 * Cutting-edge per-ride and longitudinal analytics that bring tribos.studio
 * to parity with WKO5, Intervals.icu, and TrainingPeaks.
 *
 * Per-ride analytics (computed from activity_streams / FIT data):
 * - Pacing analysis (positive/negative splits, power fade)
 * - Match burning (high-intensity surges above CP/FTP)
 * - Fatigue resistance (power decay over ride duration)
 * - HR zone distribution per ride
 * - Cadence analysis (distribution, optimal zones)
 * - Variability Index tracking
 * - Efficiency Factor (NP:HR ratio)
 *
 * Longitudinal analytics (computed from activity history):
 * - Dynamic FTP estimation from recent best efforts
 * - MMP progression over rolling time windows
 * - Training monotony and strain (Banister model)
 * - Workout execution scoring (planned vs actual)
 */

// ─── Per-Ride Analytics ─────────────────────────────────────────────────────

/**
 * Analyze pacing strategy from a power stream.
 * Splits the ride into quarters and compares power output.
 *
 * @param {number[]} powerStream - Per-second power values
 * @param {number} [ftp] - Functional Threshold Power (optional, for context)
 * @returns {Object} Pacing analysis
 */
export function analyzePacing(powerStream, ftp) {
  if (!powerStream || powerStream.length < 120) return null;

  const quarterLen = Math.floor(powerStream.length / 4);
  const quarters = [
    powerStream.slice(0, quarterLen),
    powerStream.slice(quarterLen, quarterLen * 2),
    powerStream.slice(quarterLen * 2, quarterLen * 3),
    powerStream.slice(quarterLen * 3),
  ];

  const quarterAvgs = quarters.map(q => avgNonZero(q));

  // First half vs second half
  const firstHalf = avgNonZero(powerStream.slice(0, Math.floor(powerStream.length / 2)));
  const secondHalf = avgNonZero(powerStream.slice(Math.floor(powerStream.length / 2)));

  const splitRatio = firstHalf > 0 ? secondHalf / firstHalf : 1;

  // Power fade: compare last 25% to first 25%
  const powerFade = quarterAvgs[0] > 0
    ? Math.round(((quarterAvgs[3] - quarterAvgs[0]) / quarterAvgs[0]) * 100)
    : 0;

  // Classify pacing strategy
  let strategy;
  if (splitRatio > 1.03) {
    strategy = 'negative_split'; // Got stronger — optimal for racing
  } else if (splitRatio < 0.92) {
    strategy = 'positive_split_heavy'; // Blew up badly
  } else if (splitRatio < 0.97) {
    strategy = 'positive_split'; // Faded
  } else {
    strategy = 'even_split'; // Well-paced
  }

  // Normalized power per quarter for intensity tracking
  const quarterNP = quarters.map(q => calculateNP(q));

  return {
    strategy,
    split_ratio: Math.round(splitRatio * 100) / 100,
    power_fade_percent: powerFade,
    quarter_avg_watts: quarterAvgs.map(Math.round),
    quarter_np: quarterNP,
    first_half_avg: Math.round(firstHalf),
    second_half_avg: Math.round(secondHalf),
    ...(ftp && {
      quarter_if: quarterNP.map(np => np ? Math.round((np / ftp) * 100) / 100 : null),
    }),
  };
}

/**
 * Detect "match burns" — high-intensity surges above Critical Power or FTP.
 * Each match is a contiguous period above the threshold.
 *
 * @param {number[]} powerStream - Per-second power values
 * @param {number} threshold - CP or FTP value
 * @param {number} [minDuration=10] - Minimum seconds above threshold to count
 * @returns {Object} Match burning analysis
 */
export function analyzeMatchBurning(powerStream, threshold, minDuration = 10) {
  if (!powerStream || powerStream.length < 60 || !threshold) return null;

  const matches = [];
  let currentMatch = null;

  for (let i = 0; i < powerStream.length; i++) {
    if (powerStream[i] > threshold) {
      if (!currentMatch) {
        currentMatch = { start: i, peakPower: powerStream[i], totalWork: 0 };
      }
      currentMatch.peakPower = Math.max(currentMatch.peakPower, powerStream[i]);
      currentMatch.totalWork += (powerStream[i] - threshold); // Work above threshold (J)
    } else if (currentMatch) {
      const duration = i - currentMatch.start;
      if (duration >= minDuration) {
        matches.push({
          start_sec: currentMatch.start,
          duration_sec: duration,
          peak_watts: Math.round(currentMatch.peakPower),
          avg_watts: Math.round(avgNonZero(powerStream.slice(currentMatch.start, i))),
          work_above_threshold_kj: Math.round(currentMatch.totalWork / 1000 * 10) / 10,
        });
      }
      currentMatch = null;
    }
  }
  // Close trailing match
  if (currentMatch) {
    const duration = powerStream.length - currentMatch.start;
    if (duration >= minDuration) {
      matches.push({
        start_sec: currentMatch.start,
        duration_sec: duration,
        peak_watts: Math.round(currentMatch.peakPower),
        avg_watts: Math.round(avgNonZero(powerStream.slice(currentMatch.start))),
        work_above_threshold_kj: Math.round(currentMatch.totalWork / 1000 * 10) / 10,
      });
    }
  }

  const totalWorkAboveThreshold = matches.reduce((sum, m) => sum + m.work_above_threshold_kj, 0);
  const totalTimeAbove = matches.reduce((sum, m) => sum + m.duration_sec, 0);

  return {
    match_count: matches.length,
    total_time_above_threshold_sec: totalTimeAbove,
    total_work_above_threshold_kj: Math.round(totalWorkAboveThreshold * 10) / 10,
    avg_match_duration_sec: matches.length > 0 ? Math.round(totalTimeAbove / matches.length) : 0,
    peak_match_watts: matches.length > 0 ? Math.max(...matches.map(m => m.peak_watts)) : 0,
    matches: matches.slice(0, 20), // Cap at 20 to keep payload reasonable
  };
}

/**
 * Analyze fatigue resistance: how well power is maintained throughout a ride.
 * Compares first 25% to last 25%, and tracks the decay curve.
 *
 * @param {number[]} powerStream - Per-second power values
 * @param {number[]} [hrStream] - Optional per-second heart rate values
 * @returns {Object} Fatigue resistance metrics
 */
export function analyzeFatigueResistance(powerStream, hrStream) {
  if (!powerStream || powerStream.length < 600) return null; // Need at least 10 min

  const len = powerStream.length;
  const q1 = powerStream.slice(0, Math.floor(len * 0.25));
  const q4 = powerStream.slice(Math.floor(len * 0.75));

  const q1Avg = avgNonZero(q1);
  const q4Avg = avgNonZero(q4);

  // Fatigue resistance index: 1.0 = no fade, <1.0 = faded, >1.0 = got stronger
  const fatigueResistanceIndex = q1Avg > 0 ? Math.round((q4Avg / q1Avg) * 100) / 100 : 1;

  // Decile analysis: power in 10% chunks
  const decileLen = Math.floor(len / 10);
  const deciles = [];
  for (let i = 0; i < 10; i++) {
    const start = i * decileLen;
    const end = i === 9 ? len : (i + 1) * decileLen;
    deciles.push(Math.round(avgNonZero(powerStream.slice(start, end))));
  }

  // Cardiac drift: if HR rises while power stays flat/drops, that's fatigue
  let cardiacDrift = null;
  if (hrStream && hrStream.length >= len * 0.9) {
    const hrQ1 = avgNonZero(hrStream.slice(0, Math.floor(hrStream.length * 0.25)));
    const hrQ4 = avgNonZero(hrStream.slice(Math.floor(hrStream.length * 0.75)));
    const pwHrQ1 = hrQ1 > 0 ? q1Avg / hrQ1 : null;
    const pwHrQ4 = hrQ4 > 0 ? q4Avg / hrQ4 : null;

    if (pwHrQ1 && pwHrQ4) {
      cardiacDrift = {
        pw_hr_ratio_first_quarter: Math.round(pwHrQ1 * 100) / 100,
        pw_hr_ratio_last_quarter: Math.round(pwHrQ4 * 100) / 100,
        drift_percent: Math.round(((pwHrQ1 - pwHrQ4) / pwHrQ1) * 100),
      };
    }
  }

  // Rating
  let rating;
  if (fatigueResistanceIndex >= 0.98) rating = 'excellent';
  else if (fatigueResistanceIndex >= 0.93) rating = 'good';
  else if (fatigueResistanceIndex >= 0.85) rating = 'moderate';
  else rating = 'poor';

  return {
    fatigue_resistance_index: fatigueResistanceIndex,
    rating,
    first_quarter_avg_watts: Math.round(q1Avg),
    last_quarter_avg_watts: Math.round(q4Avg),
    power_deciles: deciles,
    cardiac_drift: cardiacDrift,
  };
}

/**
 * Calculate time-in-zone distribution for heart rate.
 *
 * @param {number[]} hrStream - Per-second HR values
 * @param {number} maxHR - Maximum heart rate
 * @param {number} restHR - Resting heart rate (optional, defaults to 50)
 * @returns {Object} HR zone distribution
 */
export function analyzeHRZones(hrStream, maxHR, restHR = 50) {
  if (!hrStream || hrStream.length < 60 || !maxHR) return null;

  // 5-zone model based on % of max HR (Coggan-style)
  const zones = [
    { name: 'Zone 1 - Recovery', min: 0, max: 0.60, seconds: 0 },
    { name: 'Zone 2 - Endurance', min: 0.60, max: 0.70, seconds: 0 },
    { name: 'Zone 3 - Tempo', min: 0.70, max: 0.80, seconds: 0 },
    { name: 'Zone 4 - Threshold', min: 0.80, max: 0.90, seconds: 0 },
    { name: 'Zone 5 - VO2max+', min: 0.90, max: 1.10, seconds: 0 },
  ];

  let validSamples = 0;

  for (const hr of hrStream) {
    if (!hr || hr < 40 || hr > 250) continue;
    validSamples++;
    const pctMax = hr / maxHR;

    for (const zone of zones) {
      if (pctMax >= zone.min && pctMax < zone.max) {
        zone.seconds++;
        break;
      }
    }
  }

  if (validSamples === 0) return null;

  // Average and peak HR
  const validHR = hrStream.filter(hr => hr && hr >= 40 && hr < 250);
  const avgHR = Math.round(validHR.reduce((a, b) => a + b, 0) / validHR.length);
  const peakHR = Math.max(...validHR);

  // Heart Rate Reserve (HRR) distribution
  const hrrAvg = maxHR > restHR ? Math.round(((avgHR - restHR) / (maxHR - restHR)) * 100) : null;

  return {
    zones: zones.map(z => ({
      name: z.name,
      seconds: z.seconds,
      percent: Math.round((z.seconds / validSamples) * 100),
    })),
    avg_hr: avgHR,
    peak_hr: peakHR,
    hrr_percent: hrrAvg,
    total_valid_seconds: validSamples,
  };
}

/**
 * Analyze cadence distribution and efficiency.
 *
 * @param {number[]} cadenceStream - Per-second cadence values
 * @param {number[]} [powerStream] - Optional power stream for cadence-power correlation
 * @returns {Object} Cadence analysis
 */
export function analyzeCadence(cadenceStream, powerStream) {
  if (!cadenceStream || cadenceStream.length < 60) return null;

  // Filter valid cadence (>0 means pedaling)
  const pedalingCadence = cadenceStream.filter(c => c && c > 0 && c < 250);
  if (pedalingCadence.length < 30) return null;

  const avgCadence = Math.round(pedalingCadence.reduce((a, b) => a + b, 0) / pedalingCadence.length);
  const peakCadence = Math.max(...pedalingCadence);
  const coastingSeconds = cadenceStream.filter(c => !c || c === 0).length;

  // Cadence distribution buckets
  const buckets = [
    { label: '<60 rpm (grinding)', min: 1, max: 60, seconds: 0 },
    { label: '60-70 rpm (low)', min: 60, max: 70, seconds: 0 },
    { label: '70-80 rpm (moderate)', min: 70, max: 80, seconds: 0 },
    { label: '80-90 rpm (optimal)', min: 80, max: 90, seconds: 0 },
    { label: '90-100 rpm (high)', min: 90, max: 100, seconds: 0 },
    { label: '100+ rpm (spinning)', min: 100, max: 300, seconds: 0 },
  ];

  for (const c of pedalingCadence) {
    for (const b of buckets) {
      if (c >= b.min && c < b.max) {
        b.seconds++;
        break;
      }
    }
  }

  // Cadence variability (coefficient of variation)
  const mean = avgCadence;
  const variance = pedalingCadence.reduce((sum, c) => sum + Math.pow(c - mean, 2), 0) / pedalingCadence.length;
  const stdDev = Math.sqrt(variance);
  const cv = mean > 0 ? Math.round((stdDev / mean) * 100) : 0;

  // Cadence-power correlation (if power available)
  let cadencePowerCorrelation = null;
  if (powerStream && powerStream.length >= cadenceStream.length * 0.9) {
    // Group by cadence ranges and find average power per range
    const ranges = {};
    for (let i = 0; i < Math.min(cadenceStream.length, powerStream.length); i++) {
      const c = cadenceStream[i];
      const p = powerStream[i];
      if (c > 0 && c < 250 && p > 0 && p < 2500) {
        const bucket = Math.floor(c / 10) * 10;
        if (!ranges[bucket]) ranges[bucket] = [];
        ranges[bucket].push(p);
      }
    }

    cadencePowerCorrelation = Object.entries(ranges)
      .filter(([, powers]) => powers.length >= 10) // Min sample size
      .map(([cadenceRange, powers]) => ({
        cadence_range: `${cadenceRange}-${parseInt(cadenceRange) + 10}`,
        avg_power: Math.round(powers.reduce((a, b) => a + b, 0) / powers.length),
        sample_count: powers.length,
      }))
      .sort((a, b) => parseInt(a.cadence_range) - parseInt(b.cadence_range));
  }

  return {
    avg_cadence: avgCadence,
    peak_cadence: peakCadence,
    coasting_seconds: coastingSeconds,
    coasting_percent: Math.round((coastingSeconds / cadenceStream.length) * 100),
    variability_cv: cv,
    distribution: buckets.map(b => ({
      label: b.label,
      seconds: b.seconds,
      percent: Math.round((b.seconds / pedalingCadence.length) * 100),
    })),
    cadence_power_correlation: cadencePowerCorrelation,
  };
}

/**
 * Compute comprehensive per-ride analytics from activity streams.
 * This is the main entry point called after FIT file processing.
 *
 * @param {Object} params
 * @param {number[]} params.powerStream - Per-second power data
 * @param {number[]} [params.hrStream] - Per-second heart rate data
 * @param {number[]} [params.cadenceStream] - Per-second cadence data
 * @param {number} [params.ftp] - Functional Threshold Power
 * @param {number} [params.cp] - Critical Power
 * @param {number} [params.maxHR] - Maximum heart rate
 * @param {number} [params.restHR] - Resting heart rate
 * @returns {Object} Comprehensive per-ride analytics
 */
export function computePerRideAnalytics({
  powerStream,
  hrStream,
  cadenceStream,
  ftp,
  cp,
  maxHR,
  restHR,
}) {
  const result = {};

  // Use CP for match threshold, fall back to FTP
  const matchThreshold = cp || ftp;

  if (powerStream && powerStream.length >= 120) {
    result.pacing = analyzePacing(powerStream, ftp);
    result.fatigue_resistance = analyzeFatigueResistance(powerStream, hrStream);

    if (matchThreshold) {
      result.match_burning = analyzeMatchBurning(powerStream, matchThreshold);
    }

    // Variability Index = NP / Avg Power (>1.05 = variable, <1.02 = steady)
    const np = calculateNP(powerStream);
    const avgP = avgNonZero(powerStream);
    if (np && avgP > 0) {
      result.variability_index = Math.round((np / avgP) * 100) / 100;
    }
  }

  if (hrStream && maxHR) {
    result.hr_zones = analyzeHRZones(hrStream, maxHR, restHR);

    // Efficiency Factor: NP / avgHR (higher = more efficient)
    if (powerStream && powerStream.length >= 120) {
      const np = calculateNP(powerStream);
      const validHR = hrStream.filter(hr => hr && hr >= 40 && hr < 250);
      const avgHR = validHR.length > 0 ? validHR.reduce((a, b) => a + b, 0) / validHR.length : null;
      if (np && avgHR) {
        result.efficiency_factor = Math.round((np / avgHR) * 100) / 100;
      }
    }
  }

  if (cadenceStream) {
    result.cadence_analysis = analyzeCadence(cadenceStream, powerStream);
  }

  return Object.keys(result).length > 0 ? result : null;
}


// ─── Longitudinal Analytics ─────────────────────────────────────────────────

/**
 * Estimate FTP dynamically from recent best power efforts.
 * Uses the standard 95% of best 20-min power, or models from shorter efforts.
 *
 * @param {Object[]} recentActivities - Activities with power_curve_summary
 * @param {number} [currentFTP] - User's current manually-set FTP
 * @returns {Object|null} FTP estimation with confidence
 */
export function estimateDynamicFTP(recentActivities, currentFTP) {
  if (!recentActivities || recentActivities.length === 0) return null;

  // Collect best MMP at key durations from all recent activities
  const best = { 300: 0, 600: 0, 1200: 0, 1800: 0, 3600: 0 };
  const bestDates = {};

  for (const activity of recentActivities) {
    const curve = activity.power_curve_summary;
    if (!curve) continue;

    const durations = { 300: '300s', 600: '600s', 1200: '1200s', 1800: '1800s', 3600: '3600s' };
    for (const [sec, key] of Object.entries(durations)) {
      if (curve[key] && curve[key] > best[sec]) {
        best[sec] = curve[key];
        bestDates[sec] = activity.start_date;
      }
    }
  }

  let estimatedFTP = null;
  let method = null;
  let confidence = 'low';

  // Method 1: 95% of best 20-min power (gold standard)
  if (best[1200] > 0) {
    estimatedFTP = Math.round(best[1200] * 0.95);
    method = '95% of best 20-min power';
    confidence = 'high';
  }

  // Method 2: 75% of best 5-min power (if no 20-min effort available)
  if (!estimatedFTP && best[300] > 0) {
    estimatedFTP = Math.round(best[300] * 0.75);
    method = '75% of best 5-min power';
    confidence = 'moderate';
  }

  // Method 3: Use 60-min best directly as FTP
  if (best[3600] > 0) {
    const ftp60 = best[3600];
    // If we have both 20-min and 60-min, use weighted average
    if (estimatedFTP) {
      // Weight 60-min more heavily — it's a better predictor
      estimatedFTP = Math.round((estimatedFTP * 0.4 + ftp60 * 0.6));
      method = 'weighted 20-min + 60-min';
      confidence = 'very_high';
    } else {
      estimatedFTP = ftp60;
      method = 'best 60-min power';
      confidence = 'very_high';
    }
  }

  if (!estimatedFTP) return null;

  // Compare to manual FTP
  let ftpDelta = null;
  let recommendation = null;
  if (currentFTP) {
    ftpDelta = estimatedFTP - currentFTP;
    const pctDelta = Math.round((ftpDelta / currentFTP) * 100);

    if (pctDelta > 5) {
      recommendation = `Your recent efforts suggest your FTP may be ${pctDelta}% higher than your current setting. Consider updating to ${estimatedFTP}W.`;
    } else if (pctDelta < -10) {
      recommendation = `Your recent efforts are below your current FTP setting by ${Math.abs(pctDelta)}%. Your FTP may have decreased, or you haven't done a hard effort recently.`;
    }
  }

  return {
    estimated_ftp: estimatedFTP,
    method,
    confidence,
    delta_from_current: ftpDelta,
    recommendation,
    best_efforts: {
      '5min': best[300] || null,
      '10min': best[600] || null,
      '20min': best[1200] || null,
      '30min': best[1800] || null,
      '60min': best[3600] || null,
    },
    best_effort_dates: bestDates,
  };
}

/**
 * Track MMP (Mean Maximal Power) progression over time.
 * Returns best power at key durations for each rolling time window.
 *
 * @param {Object[]} activities - Activities sorted by date, with power_curve_summary
 * @param {number} [windowDays=90] - Rolling window size in days
 * @returns {Object[]} MMP progression data points
 */
export function trackMMPProgression(activities, windowDays = 90) {
  if (!activities || activities.length === 0) return [];

  const withCurves = activities
    .filter(a => a.power_curve_summary && a.start_date)
    .sort((a, b) => new Date(a.start_date) - new Date(b.start_date));

  if (withCurves.length < 3) return [];

  const durations = ['5s', '60s', '300s', '1200s', '3600s'];
  const progression = [];
  const windowMs = windowDays * 24 * 60 * 60 * 1000;

  // Sample at monthly intervals
  const firstDate = new Date(withCurves[0].start_date);
  const lastDate = new Date(withCurves[withCurves.length - 1].start_date);

  for (let d = new Date(firstDate); d <= lastDate; d.setDate(d.getDate() + 30)) {
    const windowEnd = new Date(d);
    const windowStart = new Date(d.getTime() - windowMs);

    const windowActivities = withCurves.filter(a => {
      const date = new Date(a.start_date);
      return date >= windowStart && date <= windowEnd;
    });

    if (windowActivities.length === 0) continue;

    const point = { date: windowEnd.toISOString().split('T')[0], activity_count: windowActivities.length };

    for (const dur of durations) {
      const values = windowActivities
        .map(a => a.power_curve_summary[dur])
        .filter(v => v && v > 0);
      point[`best_${dur}`] = values.length > 0 ? Math.max(...values) : null;
    }

    progression.push(point);
  }

  // Calculate trends for most recent period
  if (progression.length >= 2) {
    const recent = progression[progression.length - 1];
    const prior = progression[Math.max(0, progression.length - 4)]; // ~3 months ago

    const trends = {};
    for (const dur of durations) {
      const key = `best_${dur}`;
      if (recent[key] && prior[key]) {
        trends[dur] = {
          current: recent[key],
          prior: prior[key],
          change: recent[key] - prior[key],
          change_percent: Math.round(((recent[key] - prior[key]) / prior[key]) * 100),
        };
      }
    }

    return { progression, trends, durations };
  }

  return { progression, trends: {}, durations };
}

/**
 * Calculate training monotony and strain (Banister model).
 * High monotony + high strain = overtraining risk.
 *
 * Monotony = mean(dailyTSS) / stdev(dailyTSS) over 7 days
 * Strain = weeklyTSS × monotony
 *
 * @param {number[]} dailyTSS - Array of daily TSS values (at least 7 days)
 * @returns {Object|null} Monotony and strain metrics
 */
export function calculateTrainingMonotonyStrain(dailyTSS) {
  if (!dailyTSS || dailyTSS.length < 7) return null;

  const recent7 = dailyTSS.slice(-7);
  const mean = recent7.reduce((a, b) => a + b, 0) / 7;
  const variance = recent7.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / 7;
  const stdDev = Math.sqrt(variance);

  const monotony = stdDev > 0 ? Math.round((mean / stdDev) * 100) / 100 : 0;
  const weeklyTSS = recent7.reduce((a, b) => a + b, 0);
  const strain = Math.round(weeklyTSS * monotony);

  // Risk assessment
  // Monotony > 2.0 + high strain = overtraining risk
  // Monotony > 1.5 = watch carefully
  let risk;
  if (monotony > 2.0 && strain > 5000) {
    risk = 'high'; // Overtraining territory
  } else if (monotony > 2.0 || strain > 4000) {
    risk = 'moderate';
  } else if (monotony > 1.5) {
    risk = 'watch';
  } else {
    risk = 'low';
  }

  // Also calculate for last 14 days in 2 weekly blocks for trend
  let trend = null;
  if (dailyTSS.length >= 14) {
    const priorWeek = dailyTSS.slice(-14, -7);
    const priorMean = priorWeek.reduce((a, b) => a + b, 0) / 7;
    const priorVariance = priorWeek.reduce((sum, v) => sum + Math.pow(v - priorMean, 2), 0) / 7;
    const priorStdDev = Math.sqrt(priorVariance);
    const priorMonotony = priorStdDev > 0 ? priorMean / priorStdDev : 0;
    const priorStrain = priorWeek.reduce((a, b) => a + b, 0) * priorMonotony;

    trend = {
      monotony_change: Math.round((monotony - priorMonotony) * 100) / 100,
      strain_change: Math.round(strain - priorStrain),
      direction: strain > priorStrain * 1.1 ? 'increasing' :
                 strain < priorStrain * 0.9 ? 'decreasing' : 'stable',
    };
  }

  return {
    monotony,
    strain: Math.round(strain),
    weekly_tss: Math.round(weeklyTSS),
    daily_mean_tss: Math.round(mean),
    daily_stddev_tss: Math.round(stdDev),
    risk,
    trend,
  };
}

/**
 * Score workout execution: how well did the actual ride match the planned workout.
 *
 * @param {Object} planned - Planned workout details
 * @param {Object} actual - Actual activity data
 * @returns {Object} Execution score (0-100) with breakdown
 */
export function scoreWorkoutExecution(planned, actual) {
  if (!planned || !actual) return null;

  const scores = {};
  let totalWeight = 0;
  let weightedScore = 0;

  // Duration adherence (weight: 3)
  if (planned.target_duration_minutes && actual.moving_time) {
    const plannedSec = planned.target_duration_minutes * 60;
    const actualSec = actual.moving_time;
    const durationRatio = Math.min(actualSec, plannedSec) / Math.max(actualSec, plannedSec);
    scores.duration = Math.round(durationRatio * 100);
    totalWeight += 3;
    weightedScore += scores.duration * 3;
  }

  // TSS adherence (weight: 3)
  if (planned.target_tss && actual.tss) {
    const tssRatio = Math.min(actual.tss, planned.target_tss) / Math.max(actual.tss, planned.target_tss);
    scores.tss = Math.round(tssRatio * 100);
    totalWeight += 3;
    weightedScore += scores.tss * 3;
  }

  // Intensity adherence — IF match (weight: 2)
  if (planned.target_intensity_factor && actual.intensity_factor) {
    const ifRatio = Math.min(actual.intensity_factor, planned.target_intensity_factor) /
                    Math.max(actual.intensity_factor, planned.target_intensity_factor);
    scores.intensity = Math.round(ifRatio * 100);
    totalWeight += 2;
    weightedScore += scores.intensity * 2;
  }

  // Distance adherence (weight: 1)
  if (planned.target_distance_km && actual.distance) {
    const actualKm = actual.distance / 1000;
    const distRatio = Math.min(actualKm, planned.target_distance_km) / Math.max(actualKm, planned.target_distance_km);
    scores.distance = Math.round(distRatio * 100);
    totalWeight += 1;
    weightedScore += scores.distance * 1;
  }

  // Completion check — was the workout done at all?
  const wasCompleted = Object.keys(scores).length > 0;

  const overallScore = totalWeight > 0 ? Math.round(weightedScore / totalWeight) : 0;

  // Rating
  let rating;
  if (overallScore >= 90) rating = 'nailed_it';
  else if (overallScore >= 75) rating = 'good';
  else if (overallScore >= 60) rating = 'acceptable';
  else if (overallScore >= 40) rating = 'deviated';
  else rating = 'missed';

  return {
    overall_score: overallScore,
    rating,
    was_completed: wasCompleted,
    breakdown: scores,
    planned_summary: {
      duration_min: planned.target_duration_minutes,
      tss: planned.target_tss,
      intensity: planned.target_intensity_factor,
    },
    actual_summary: {
      duration_min: actual.moving_time ? Math.round(actual.moving_time / 60) : null,
      tss: actual.tss,
      intensity: actual.intensity_factor,
    },
  };
}


// ─── Utility Functions ──────────────────────────────────────────────────────

/**
 * Average of non-zero values in an array
 */
function avgNonZero(arr) {
  if (!arr || arr.length === 0) return 0;
  const nonZero = arr.filter(v => v && v > 0);
  if (nonZero.length === 0) return 0;
  return nonZero.reduce((a, b) => a + b, 0) / nonZero.length;
}

/**
 * Calculate Normalized Power from a power stream
 * NP = 4th root of mean of (30s rolling avg)^4
 */
function calculateNP(powerValues) {
  if (!powerValues || powerValues.length < 30) return null;

  const rollingAvgs = [];
  for (let i = 29; i < powerValues.length; i++) {
    let sum = 0;
    for (let j = i - 29; j <= i; j++) {
      sum += powerValues[j] || 0;
    }
    rollingAvgs.push(sum / 30);
  }

  if (rollingAvgs.length === 0) return null;

  const avgFourthPower = rollingAvgs.reduce((sum, v) => sum + Math.pow(v, 4), 0) / rollingAvgs.length;
  return Math.round(Math.pow(avgFourthPower, 0.25));
}
