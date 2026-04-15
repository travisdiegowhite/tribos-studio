/**
 * Fitness Snapshot Computation Utilities
 * Calculates weekly fitness metrics from activity data
 *
 * These snapshots enable the AI coach to:
 * - Compare current fitness to past periods
 * - Identify seasonal patterns and trends
 * - Answer questions like "How am I doing compared to last year?"
 */

import {
  estimateDynamicFTP,
  calculateTrainingMonotonyStrain,
} from './advancedRideAnalytics.js';

/**
 * Calculate Chronic Training Load (CTL) - iterative EWA
 * Formula: CTL_today = CTL_yesterday + (TSS_today − CTL_yesterday) / tau
 * Defaults to tau=42 (TrainingPeaks / Intervals.icu baseline); callers
 * may pass a per-athlete tau from adaptive-tau.
 * Matches src/utils/trainingPlans.ts calculateCTL
 */
export function calculateCTL(dailyTSS, tau = 42) {
  if (!dailyTSS || dailyTSS.length === 0) return 0;
  if (!(tau > 0)) throw new Error('calculateCTL: tau must be > 0');
  let ctl = 0;
  for (const tss of dailyTSS) {
    ctl = ctl + (tss - ctl) / tau;
  }
  return Math.round(ctl);
}

/**
 * Calculate Acute Training Load (ATL) - iterative EWA
 * Formula: ATL_today = ATL_yesterday + (TSS_today − ATL_yesterday) / tau
 * Defaults to tau=7. Requires full history to converge — do NOT pass a
 * sliced array.
 * Matches src/utils/trainingPlans.ts calculateATL
 */
export function calculateATL(dailyTSS, tau = 7) {
  if (!dailyTSS || dailyTSS.length === 0) return 0;
  if (!(tau > 0)) throw new Error('calculateATL: tau must be > 0');
  let atl = 0;
  for (const tss of dailyTSS) {
    atl = atl + (tss - atl) / tau;
  }
  return Math.round(atl);
}

/**
 * Calculate Training Stress Balance (TSB)
 */
export function calculateTSB(ctl, atl) {
  return Math.round(ctl - atl);
}

// Running activity types
const RUNNING_TYPES = ['Run', 'VirtualRun', 'TrailRun'];

/**
 * Check if an activity is a running activity
 */
function isRunningActivity(activity) {
  return RUNNING_TYPES.includes(activity.type);
}

/**
 * Estimate running TSS (rTSS) from pace and duration
 * Based on the formula: rTSS = (duration_sec × NGP × IF) / (threshold_pace × 3600) × 100
 * where NGP = Normalized Graded Pace, IF = Intensity Factor
 *
 * Without a known threshold pace, we estimate using heart rate or pace heuristics:
 * - Easy run (~60-70% effort): ~40-50 rTSS/hour
 * - Moderate run (~70-80% effort): ~60-80 rTSS/hour
 * - Tempo run (~80-90% effort): ~80-100 rTSS/hour
 * - Threshold run (~90-100% effort): ~100+ rTSS/hour
 */
function estimateRunningTSS(activity) {
  const durationHours = (activity.moving_time || 0) / 3600;
  if (durationHours === 0) return 0;

  const distanceKm = (activity.distance || 0) / 1000;
  const elevationM = activity.total_elevation_gain || 0;

  // Calculate pace in min/km if we have distance
  let intensityMultiplier = 1.0;

  if (distanceKm > 0 && durationHours > 0) {
    const paceMinPerKm = (durationHours * 60) / distanceKm;

    // Estimate intensity from pace
    // ~6:00/km = easy, ~5:00/km = moderate, ~4:30/km = tempo, ~4:00/km = threshold
    // These are rough averages; actual zones depend on the runner's fitness
    if (paceMinPerKm < 3.5) {
      intensityMultiplier = 1.6; // Very fast (race pace / interval)
    } else if (paceMinPerKm < 4.0) {
      intensityMultiplier = 1.4; // Threshold-ish
    } else if (paceMinPerKm < 4.5) {
      intensityMultiplier = 1.2; // Tempo
    } else if (paceMinPerKm < 5.0) {
      intensityMultiplier = 1.05; // Moderate
    } else if (paceMinPerKm < 6.0) {
      intensityMultiplier = 0.85; // Easy
    } else if (paceMinPerKm < 7.0) {
      intensityMultiplier = 0.7; // Recovery
    } else {
      intensityMultiplier = 0.55; // Very easy / walk breaks
    }
  }

  // Heart rate adjustment (if available, override pace-based estimate)
  if (activity.average_heartrate && activity.average_heartrate > 0) {
    // Rough heuristic: 120bpm = easy, 150bpm = moderate, 170bpm = hard, 185+ = max
    const hr = activity.average_heartrate;
    if (hr >= 175) {
      intensityMultiplier = Math.max(intensityMultiplier, 1.5);
    } else if (hr >= 160) {
      intensityMultiplier = Math.max(intensityMultiplier, 1.2);
    } else if (hr >= 145) {
      intensityMultiplier = Math.max(intensityMultiplier, 1.0);
    } else if (hr >= 130) {
      intensityMultiplier = Math.max(intensityMultiplier, 0.8);
    }
  }

  // Running base: ~60 rTSS/hour (slightly higher than cycling due to impact stress)
  const baseRTSS = durationHours * 60;

  // Elevation has a bigger impact on running than cycling
  const elevationFactor = (elevationM / 200) * 10;

  // Trail running has additional stress from terrain
  const trailFactor = activity.type === 'TrailRun' ? 1.1 : 1.0;

  return Math.round((baseRTSS + elevationFactor) * intensityMultiplier * trailFactor);
}

/**
 * Classify terrain from distance + elevation gain using elevation-per-km
 * (m/km) as the ratio. Thresholds:
 *
 *   < 8   → flat
 *   < 15  → rolling
 *   < 25  → hilly
 *   >= 25 → mountainous
 *
 * Returns 'flat' when either distance or elevation is 0 or missing — we
 * can't meaningfully compute a ratio, and treating unknowns as flat
 * keeps the downstream multiplier at 1.0 (no spurious upscaling).
 *
 * @param {number} distanceM — distance in meters
 * @param {number} elevationM — elevation gain in meters
 * @returns {'flat'|'rolling'|'hilly'|'mountainous'}
 */
export function classifyTerrain(distanceM, elevationM) {
  const distanceKm = (distanceM || 0) / 1000;
  const elev = elevationM || 0;
  if (!(distanceKm > 0) || !(elev > 0)) return 'flat';
  const ratio = elev / distanceKm;
  if (ratio < 8) return 'flat';
  if (ratio < 15) return 'rolling';
  if (ratio < 25) return 'hilly';
  return 'mountainous';
}

/**
 * Terrain multiplier — spec §3.1 continuous formula.
 *
 *   gradientFactor = 1 + averageGradientPercent * 0.015
 *   steepFactor    = 1 + percentAbove6Percent  * 0.002
 *   vamFactor      = vam > 0 ? 1 + vam/10000 : 1.0
 *   multiplier     = gradientFactor * steepFactor * vamFactor
 *   capped at 1.40
 *
 * Applied only to the kilojoules and inferred TSS tiers (D4 amendment):
 * power, HR, and device tiers already reflect climbing cost through
 * their measurement, so scaling them would double-count.
 *
 * `percentAbove6Percent` requires a grade stream that most activity
 * rows don't carry; it defaults to 0 when absent (steepFactor = 1.0).
 *
 * @param {{ distance?: number, total_elevation_gain?: number,
 *           moving_time?: number,
 *           average_gradient_percent?: number,
 *           percent_above_6_percent?: number }} activity
 * @returns {number}
 */
export function terrainMultiplier(activity) {
  if (!activity) return 1.0;

  const distanceM = activity.distance || 0;
  const elevationM = activity.total_elevation_gain || 0;
  const movingSec = activity.moving_time || 0;

  // Fall back to an elevation-per-distance approximation when the
  // activity row doesn't carry a per-stream average.
  const avgGradientPct = Number.isFinite(activity.average_gradient_percent)
    ? activity.average_gradient_percent
    : distanceM > 0
      ? (elevationM / distanceM) * 100
      : 0;

  const pctAbove6 = Number.isFinite(activity.percent_above_6_percent)
    ? activity.percent_above_6_percent
    : 0;

  const vam = movingSec > 0 ? elevationM / (movingSec / 3600) : 0;

  const gradientFactor = 1 + avgGradientPct * 0.015;
  const steepFactor = 1 + pctAbove6 * 0.002;
  const vamFactor = vam > 0 ? 1 + vam / 10000 : 1.0;

  const multiplier = gradientFactor * steepFactor * vamFactor;
  return Math.min(multiplier, 1.4);
}

// Strava enum canonicalized across ingestion (garmin-auth / wahoo-auth
// both remap to these values before persisting to `activities`).
const MTB_SPORT_TYPES = new Set(['MountainBikeRide']);

/**
 * Identify mountain-bike sessions. Tribos normalizes Garmin's
 * MOUNTAIN_BIKING and Wahoo's mountain_biking to Strava's
 * MountainBikeRide at ingestion, so a single equality check suffices.
 *
 * @param {{ sport_type?: string, type?: string }} activity
 * @returns {boolean}
 */
export function isMountainBike(activity) {
  if (!activity) return false;
  return MTB_SPORT_TYPES.has(activity.sport_type)
    || MTB_SPORT_TYPES.has(activity.type);
}

/**
 * MTB multiplier — spec §3.1 "MTB sessions receive additional 1.3x
 * multiplier on top of terrain". Applies to every RSS tier, not just
 * the terrain-scaled ones: singletrack micro-surges inflate true stress
 * relative to power/HR/NP numbers regardless of how RSS was derived.
 *
 * @param {number} rss
 * @param {{ sport_type?: string, type?: string }} activity
 * @returns {number}
 */
export function applyActivityTypeMultiplier(rss, activity) {
  return isMountainBike(activity) ? rss * 1.3 : rss;
}

/**
 * EP zero-power filter — spec §3.2. When computing Effective Power from
 * a power stream, filter points where power === 0 AND GPS speed > 5 km/h
 * (coasting while moving); keep points where the rider is intentionally
 * at 0 W for recovery (power=0, speed≈0) so they still weigh the EP
 * down appropriately.
 *
 * Standalone helper — EP for most activities comes pre-computed from
 * the data provider (activity.normalized_power). This is exported for
 * future stream-based recomputation paths.
 *
 * @param {number[]} powerStream — instant power in W, one sample/sec
 * @param {number[]} [speedStreamKmh] — instant speed in km/h; optional
 * @returns {number[]} filtered power stream suitable for EP rolling avg
 */
export function filterZeroPowerPoints(powerStream, speedStreamKmh) {
  if (!Array.isArray(powerStream) || powerStream.length === 0) return [];
  if (!Array.isArray(speedStreamKmh) || speedStreamKmh.length === 0) {
    // Without a speed stream we can't tell coasting from intentional
    // rest — pass through unchanged.
    return powerStream.slice();
  }

  const out = [];
  const len = Math.min(powerStream.length, speedStreamKmh.length);
  for (let i = 0; i < len; i++) {
    const p = powerStream[i];
    const kmh = speedStreamKmh[i];
    if (p === 0 && kmh > 5) continue; // coasting — drop
    out.push(p);
  }
  return out;
}

/**
 * Estimate TSS from activity data using a 5-tier fallback, returning the
 * tier, confidence score, and terrain classification alongside the
 * estimate. Tiers & confidences mirror src/lib/training/fatigue-estimation.ts:
 *
 *   'device'     — stored TSS from the activity file (0.95)
 *   'power'      — NP + FTP (0.95)
 *   'kilojoules' — kJ + duration (+ FTP) (0.75 w/ FTP, 0.50 without)
 *   'hr'         — running HR-based estimate (0.65)
 *   'inferred'   — duration + elevation + avg watts heuristic (0.40)
 *
 * ('rpe' is reserved for fatigue-estimation.ts paths that accept an RPE
 * input; raw activity rows don't carry RPE so we don't emit it here.)
 *
 * Terrain multiplier is applied ONLY to the kilojoules and inferred
 * tiers — power/HR/device already reflect climbing cost via their
 * underlying measurement (NP, HR stream, stored TSS). Scaling them
 * would double-count. terrain_class is returned on every tier so
 * downstream writers can persist it uniformly.
 *
 * @returns {{ tss: number, source: string, confidence: number,
 *             terrain_class: 'flat'|'rolling'|'hilly'|'mountainous' }}
 */
export function estimateTSSWithSource(activity, ftp) {
  const terrain_class = classifyTerrain(
    activity.distance,
    activity.total_elevation_gain,
  );

  // Tier 1: stored TSS from device.
  if (activity.tss && activity.tss > 0) {
    const rss = applyActivityTypeMultiplier(activity.tss, activity);
    return { tss: rss, source: 'device', confidence: 0.95, terrain_class };
  }

  // Tier 2: running-specific estimation (HR-based under the hood).
  // estimateRunningTSS already applies its own elevation + trail factors;
  // don't stack the terrain multiplier on top. MTB check is pointless
  // on a Run activity but harmless — MTB_SPORT_TYPES never matches.
  if (isRunningActivity(activity)) {
    const rss = applyActivityTypeMultiplier(estimateRunningTSS(activity), activity);
    return { tss: rss, source: 'hr', confidence: 0.65, terrain_class };
  }

  // Tier 3: normalized power + FTP → standard TSS formula.
  // NP already reflects grade-induced load; no terrain scaling (D4).
  if (activity.normalized_power && activity.normalized_power > 0 && ftp && ftp > 0 && activity.moving_time) {
    const hours = activity.moving_time / 3600;
    const intensityFactor = activity.normalized_power / ftp;
    const base = hours * intensityFactor * intensityFactor * 100;
    return {
      tss: Math.round(applyActivityTypeMultiplier(base, activity)),
      source: 'power',
      confidence: 0.95,
      terrain_class,
    };
  }

  // Tier 4: kilojoules + duration → derive avg power, then TSS.
  // kJ is work-only (no intensity signal) — apply terrain multiplier (D4).
  if (activity.kilojoules && activity.kilojoules > 0 && activity.moving_time) {
    const hours = activity.moving_time / 3600;
    if (hours > 0) {
      const mult = terrainMultiplier(activity);
      const avgPower = (activity.kilojoules * 1000) / activity.moving_time;
      if (ftp && ftp > 0) {
        const intensityFactor = avgPower / ftp;
        const base = hours * intensityFactor * intensityFactor * 100 * mult;
        return {
          tss: Math.round(applyActivityTypeMultiplier(base, activity)),
          source: 'kilojoules',
          confidence: 0.75,
          terrain_class,
        };
      }
      // No FTP: assume FTP=200 as rough baseline; penalize confidence.
      const intensityFactor = avgPower / 200;
      const base = hours * intensityFactor * intensityFactor * 100 * mult;
      return {
        tss: Math.round(applyActivityTypeMultiplier(base, activity)),
        source: 'kilojoules',
        confidence: 0.50,
        terrain_class,
      };
    }
  }

  // Tier 5: duration + elevation + avg watts heuristic.
  // Flat elevation bonus under-counts grade cost — apply terrain multiplier (D4).
  const durationHours = (activity.moving_time || 0) / 3600;
  const elevationM = activity.total_elevation_gain || 0;

  const baseTSS = durationHours * 50;
  const elevationFactor = (elevationM / 300) * 10;

  let intensityMultiplier = 1.0;
  if (activity.average_watts && activity.average_watts > 0) {
    intensityMultiplier = Math.min(1.8, Math.max(0.5, activity.average_watts / 150));
  }

  const terrainMult = terrainMultiplier(activity);
  const base = (baseTSS + elevationFactor) * intensityMultiplier * terrainMult;
  return {
    tss: Math.round(applyActivityTypeMultiplier(base, activity)),
    source: 'inferred',
    confidence: 0.40,
    terrain_class,
  };
}

/**
 * Backwards-compatible wrapper — returns just the numeric TSS. Prefer
 * estimateTSSWithSource() for new callers that want to persist tier/confidence.
 */
export function estimateTSS(activity, ftp) {
  return estimateTSSWithSource(activity, ftp).tss;
}

/**
 * Compute the 7-day weighted Form Score confidence from an array of daily
 * TSS confidences (oldest → newest). More recent days weigh slightly more
 * — linear weights [1, 2, 3, 4, 5, 6, 7] normalized by their sum.
 *
 * Input normalization:
 *   - arrays longer than 7 are truncated to the most recent 7
 *   - arrays shorter than 7 are padded with 0 at the oldest slots
 *   - null/undefined entries are treated as 0
 *
 * Output: clamped to [0, 1], rounded to 3 decimals.
 */
export function calculateFormScoreConfidence(last7DaysConfidence = []) {
  if (!Array.isArray(last7DaysConfidence) || last7DaysConfidence.length === 0) {
    return 0;
  }
  // Spec §3.6 weights (oldest → newest to match our array convention).
  // The spec lists them newest-first as [0.30, 0.20, 0.15, 0.12, 0.10,
  // 0.08, 0.05] — same values, reversed so index 6 (newest) carries 0.30.
  const WEIGHTS = [0.05, 0.08, 0.1, 0.12, 0.15, 0.2, 0.3];
  const recent = last7DaysConfidence.slice(-7);
  const padded = Array(7 - recent.length)
    .fill(0)
    .concat(recent.map((v) => (v == null || !Number.isFinite(Number(v)) ? 0 : Number(v))));

  let num = 0;
  let denom = 0;
  for (let i = 0; i < 7; i++) {
    num += WEIGHTS[i] * padded[i];
    denom += WEIGHTS[i];
  }
  const raw = denom > 0 ? num / denom : 0;
  const clamped = Math.max(0, Math.min(1, raw));
  return Math.round(clamped * 1000) / 1000;
}

/**
 * Compute TFI composition — spec §3.6.
 *
 * Splits recent RSS into aerobic (Z1-Z3), threshold (Z4), and high
 * intensity (Z5+) fractions so the coach can characterize the type
 * of fitness an athlete is building, not just the amount.
 *
 * @param {Array<{ rss: number,
 *                 aerobic_seconds: number,
 *                 threshold_seconds: number,
 *                 high_intensity_seconds: number }>} dailyEntries
 * @returns {{ aerobic_fraction: number,
 *             threshold_fraction: number,
 *             high_intensity_fraction: number } | null}
 */
export function computeTFIComposition(dailyEntries) {
  if (!Array.isArray(dailyEntries) || dailyEntries.length === 0) return null;

  let aerobic = 0;
  let threshold = 0;
  let highIntensity = 0;

  for (const entry of dailyEntries) {
    if (!entry || !Number.isFinite(entry.rss) || entry.rss <= 0) continue;
    const totalSec =
      (entry.aerobic_seconds || 0)
      + (entry.threshold_seconds || 0)
      + (entry.high_intensity_seconds || 0);
    if (totalSec <= 0) continue;
    const rss = entry.rss;
    aerobic += rss * ((entry.aerobic_seconds || 0) / totalSec);
    threshold += rss * ((entry.threshold_seconds || 0) / totalSec);
    highIntensity += rss * ((entry.high_intensity_seconds || 0) / totalSec);
  }

  const total = aerobic + threshold + highIntensity;
  if (total <= 0) return null;

  const round3 = (n) => Math.round((n / total) * 1000) / 1000;
  return {
    aerobic_fraction: round3(aerobic),
    threshold_fraction: round3(threshold),
    high_intensity_fraction: round3(highIntensity),
  };
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
  // Exclude hidden activities and duplicates (duplicate_of IS NULL means primary activity)
  const { data: activities, error } = await supabase
    .from('activities')
    .select(`
      id, type, sport_type, start_date, moving_time, elapsed_time,
      distance, total_elevation_gain, average_watts,
      kilojoules, average_heartrate, trainer, is_hidden, duplicate_of,
      normalized_power, tss, intensity_factor, power_curve_summary,
      ride_analytics, execution_score
    `)
    .eq('user_id', userId)
    .or('is_hidden.eq.false,is_hidden.is.null')
    .is('duplicate_of', null)
    .gte('start_date', historyStart.toISOString())
    .lt('start_date', weekEnd.toISOString())
    .order('start_date', { ascending: true });

  if (error) throw error;

  // Get FTP from user preferences (needed for TSS estimation)
  const { data: prefs } = await supabase
    .from('user_preferences')
    .select('ftp')
    .eq('user_id', userId)
    .maybeSingle();

  const userFtp = prefs?.ftp || null;

  // Get per-athlete adaptive tau from profile. NULL falls back to the
  // 42 / 7 defaults, preserving pre-adaptive behavior for any user who
  // has not entered their age in Settings. Columns renamed in B1/B4
  // (tfi_tau / afi_tau per spec §3.4 / §3.5).
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('tfi_tau, afi_tau')
    .eq('id', userId)
    .maybeSingle();

  const longTau = profile?.tfi_tau ?? 42;
  const shortTau = profile?.afi_tau ?? 7;

  // Build daily TSS map for CTL/ATL calculation
  const dailyTSS = {};
  const weekActivities = [];

  (activities || []).forEach(activity => {
    const actDate = activity.start_date.split('T')[0];
    const tss = estimateTSS(activity, userFtp);
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

  // Calculate load metrics using iterative EWA (matches client-side formulas).
  // Per-athlete tau from user_profiles; defaults (42/7) kick in when the
  // user has not entered metrics_age yet.
  const ctl = calculateCTL(tssArray, longTau);
  const atl = calculateATL(tssArray, shortTau);
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

  // Compute trends
  const loadTrend = computeLoadTrend(tssArray);
  const fitnessTrend = computeFitnessTrend(ctl, weeklyTSS / 7);

  // Split counts by sport type
  const cyclingActivities = weekActivities.filter(a => !RUNNING_TYPES.includes(a.type));
  const runningActivitiesThisWeek = weekActivities.filter(a => RUNNING_TYPES.includes(a.type));
  const weeklyRunDistance = runningActivitiesThisWeek.reduce(
    (sum, a) => sum + ((a.distance || 0) / 1000), 0
  );

  // ─── Advanced Longitudinal Analytics ─────────────────────────────────

  // Training monotony & strain (Banister model)
  const monotonyStrain = calculateTrainingMonotonyStrain(tssArray.slice(-14));

  // Dynamic FTP estimation from recent activities with power curves
  const activitiesWithPower = (activities || []).filter(a => a.power_curve_summary);
  const ftpEstimate = estimateDynamicFTP(activitiesWithPower, prefs?.ftp);

  // Best efforts across 90-day window
  const bestEfforts = {};
  const durationKeys = ['5s', '60s', '300s', '600s', '1200s', '3600s'];
  for (const activity of activitiesWithPower) {
    const curve = activity.power_curve_summary;
    if (!curve) continue;
    for (const key of durationKeys) {
      if (curve[key] && (!bestEfforts[key] || curve[key] > bestEfforts[key])) {
        bestEfforts[key] = curve[key];
      }
    }
  }

  // Average efficiency factor and variability index from this week's rides
  const weekRideAnalytics = weekActivities
    .map(a => a.ride_analytics)
    .filter(Boolean);
  const efValues = weekRideAnalytics
    .map(ra => ra.efficiency_factor)
    .filter(v => v && v > 0);
  const viValues = weekRideAnalytics
    .map(ra => ra.variability_index)
    .filter(v => v && v > 0);

  const avgEF = efValues.length > 0
    ? Math.round((efValues.reduce((a, b) => a + b, 0) / efValues.length) * 100) / 100
    : null;
  const avgVI = viValues.length > 0
    ? Math.round((viValues.reduce((a, b) => a + b, 0) / viValues.length) * 100) / 100
    : null;

  // Average execution score
  const execScores = weekActivities
    .map(a => a.execution_score)
    .filter(v => v != null);
  const avgExecScore = execScores.length > 0
    ? Math.round(execScores.reduce((a, b) => a + b, 0) / execScores.length)
    : null;

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
    weekly_ride_count: cyclingActivities.length,
    weekly_run_count: runningActivitiesThisWeek.length,
    weekly_distance_km: Math.round(weeklyDistance * 100) / 100,
    weekly_run_distance_km: Math.round(weeklyRunDistance * 100) / 100,
    weekly_elevation_m: Math.round(weeklyElevation),
    avg_normalized_power: computeAvgNP(cyclingActivities),
    peak_20min_power: findPeak20minPower(cyclingActivities),
    load_trend: loadTrend,
    fitness_trend: fitnessTrend,
    activities_analyzed: (activities || []).length,
    // New longitudinal analytics
    training_monotony: monotonyStrain?.monotony || null,
    training_strain: monotonyStrain?.strain || null,
    overtraining_risk: monotonyStrain?.risk || null,
    estimated_ftp: ftpEstimate?.estimated_ftp || null,
    ftp_estimation_method: ftpEstimate?.method || null,
    ftp_estimation_confidence: ftpEstimate?.confidence || null,
    best_efforts: Object.keys(bestEfforts).length > 0 ? bestEfforts : null,
    avg_efficiency_factor: avgEF,
    avg_variability_index: avgVI,
    avg_execution_score: avgExecScore,
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
  // Exclude hidden activities and duplicates
  const { data: oldestActivity, error: oldestError } = await supabase
    .from('activities')
    .select('start_date')
    .eq('user_id', userId)
    .or('is_hidden.eq.false,is_hidden.is.null')
    .is('duplicate_of', null)
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
    // Debounce: skip recomputation if snapshot was updated in the last 5 minutes.
    // This avoids expensive 90-day queries when multiple activities from the same
    // user arrive in quick succession (common with Garmin batch imports).
    const { data: existing } = await supabase
      .from('fitness_snapshots')
      .select('snapshot_date')
      .eq('user_id', userId)
      .eq('snapshot_week', weekStart)
      .maybeSingle();

    if (existing?.snapshot_date) {
      const lastUpdated = new Date(existing.snapshot_date);
      if (Date.now() - lastUpdated.getTime() < 5 * 60 * 1000) {
        return { success: true, weekUpdated: weekStart, skipped: true };
      }
    }

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
