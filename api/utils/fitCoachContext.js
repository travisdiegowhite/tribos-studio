/**
 * FIT Coach Context Builder
 *
 * Pure functions that produce the time-series slice and derived metrics the
 * deep AI ride analysis endpoint feeds to Claude. Complements the existing
 * advancedRideAnalytics module (which already handles pacing, match burning,
 * fatigue decay, HR zones, etc.) — do not duplicate what lives there.
 *
 * Inputs: the 1 Hz `allDataPoints` array produced by fitParser + the athlete's
 * FTP, max HR, power zones, and HR zones.
 *
 * Output: a compact JSON-serializable object stored on
 * `activities.fit_coach_context` at ingestion time and consumed lazily by
 * /api/coach-ride-analysis.
 */

// ─── Interval Selection ─────────────────────────────────────────────────────

/**
 * Pick a resampling interval in seconds based on ride duration.
 * Target: keep the resulting time series under ~1500 records so the final
 * Claude prompt stays well under ~2.5k tokens for the series portion.
 *
 * @param {number} durationSeconds
 * @returns {5|10|30|60}
 */
export function pickSamplingInterval(durationSeconds) {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return 5;
  if (durationSeconds < 90 * 60) return 5;    // < 90 min  → 5s  (≤ 1080 samples)
  if (durationSeconds < 150 * 60) return 10;  // < 2.5 hr  → 10s (≤ 900 samples)
  if (durationSeconds < 240 * 60) return 30;  // < 4 hr    → 30s (≤ 480 samples)
  return 60;                                   // ≥ 4 hr    → 60s
}

// ─── Resampling ─────────────────────────────────────────────────────────────

/**
 * Resample irregular 1 Hz FIT records into a uniform-time array.
 *
 * Unlike fitParser.extractPowerStream, this deliberately PRESERVES power=0
 * samples so downstream dropout detection works. Bucketing is time-window
 * based (not index based) because FIT records are nominally 1 Hz but can
 * have gaps.
 *
 * @param {Array<{timestamp:string|Date, power:number|null, heartRate:number|null, cadence:number|null}>} allDataPoints
 * @param {number} intervalSeconds
 * @returns {Array<{t:number, power:number, hr:number, cadence:number}>}
 */
export function resampleDataPoints(allDataPoints, intervalSeconds) {
  if (!Array.isArray(allDataPoints) || allDataPoints.length === 0) return [];
  if (!Number.isFinite(intervalSeconds) || intervalSeconds <= 0) return [];

  // Normalize timestamps to ms
  const points = [];
  for (const p of allDataPoints) {
    const ts = p?.timestamp instanceof Date
      ? p.timestamp.getTime()
      : typeof p?.timestamp === 'string'
        ? Date.parse(p.timestamp)
        : Number.isFinite(p?.timestamp) ? p.timestamp : NaN;
    if (!Number.isFinite(ts)) continue;
    points.push({
      ts,
      power: p.power ?? null,
      hr: p.heartRate ?? null,
      cadence: p.cadence ?? null,
    });
  }
  if (points.length === 0) return [];

  points.sort((a, b) => a.ts - b.ts);

  const startMs = points[0].ts;
  const endMs = points[points.length - 1].ts;
  const intervalMs = intervalSeconds * 1000;
  const bucketCount = Math.floor((endMs - startMs) / intervalMs) + 1;
  if (bucketCount <= 0) return [];

  // Running sums per bucket. null values are excluded from their respective
  // field's average so a dropped HR sample doesn't pull the average to 0.
  const buckets = new Array(bucketCount);
  for (let i = 0; i < bucketCount; i++) {
    buckets[i] = {
      powerSum: 0, powerN: 0,
      hrSum: 0, hrN: 0,
      cadSum: 0, cadN: 0,
    };
  }

  for (const p of points) {
    const idx = Math.floor((p.ts - startMs) / intervalMs);
    if (idx < 0 || idx >= bucketCount) continue;
    const b = buckets[idx];
    // Power: preserve zeros (coasting / dropout) so we can classify them.
    if (p.power !== null && p.power !== undefined && Number.isFinite(p.power)) {
      b.powerSum += p.power;
      b.powerN += 1;
    }
    if (p.hr !== null && p.hr !== undefined && Number.isFinite(p.hr) && p.hr > 0) {
      b.hrSum += p.hr;
      b.hrN += 1;
    }
    if (p.cadence !== null && p.cadence !== undefined && Number.isFinite(p.cadence)) {
      b.cadSum += p.cadence;
      b.cadN += 1;
    }
  }

  const resampled = [];
  for (let i = 0; i < bucketCount; i++) {
    const b = buckets[i];
    // Skip buckets that had no samples of any kind (long gap in the FIT file)
    if (b.powerN === 0 && b.hrN === 0 && b.cadN === 0) continue;
    resampled.push({
      t: i * intervalSeconds,
      power: b.powerN > 0 ? Math.round(b.powerSum / b.powerN) : 0,
      hr: b.hrN > 0 ? Math.round(b.hrSum / b.hrN) : 0,
      cadence: b.cadN > 0 ? Math.round(b.cadSum / b.cadN) : 0,
    });
  }

  return resampled;
}

// ─── Power Zone Distribution ────────────────────────────────────────────────

/**
 * Compute percentage of pedaling time in each power zone (Z1-Z7).
 * Samples with power=0 are excluded from the denominator — they represent
 * coasting (or dropouts) and don't belong in an intensity distribution.
 *
 * powerZones is expected to be the shape stored on user_profiles.power_zones
 * by the calculate_power_zones() Postgres function:
 *   { z1: {min, max}, z2: {min, max}, ..., z7: {min, max|null} }
 *
 * @param {Array<{power:number}>} resampled
 * @param {Object|null} powerZones
 * @returns {Object|null}
 */
export function computePowerZoneDistribution(resampled, powerZones) {
  if (!Array.isArray(resampled) || resampled.length === 0) return null;
  if (!powerZones || typeof powerZones !== 'object') return null;

  const zoneKeys = ['z1', 'z2', 'z3', 'z4', 'z5', 'z6', 'z7'];
  const bounds = {};
  for (const k of zoneKeys) {
    const z = powerZones[k];
    if (!z || typeof z !== 'object') return null;
    const min = Number.isFinite(z.min) ? z.min : 0;
    const max = Number.isFinite(z.max) ? z.max : Number.POSITIVE_INFINITY;
    bounds[k] = { min, max };
  }

  const counts = { z1: 0, z2: 0, z3: 0, z4: 0, z5: 0, z6: 0, z7: 0 };
  let pedalingSamples = 0;

  for (const r of resampled) {
    const p = r.power;
    if (!(p > 0)) continue;
    pedalingSamples++;
    // Zones are contiguous; first match wins.
    if (p < bounds.z2.min) counts.z1++;
    else if (p < bounds.z3.min) counts.z2++;
    else if (p < bounds.z4.min) counts.z3++;
    else if (p < bounds.z5.min) counts.z4++;
    else if (p < bounds.z6.min) counts.z5++;
    else if (p < bounds.z7.min) counts.z6++;
    else counts.z7++;
  }

  if (pedalingSamples === 0) return null;

  const pct = (n) => Math.round((n / pedalingSamples) * 100);
  return {
    z1: pct(counts.z1),
    z2: pct(counts.z2),
    z3: pct(counts.z3),
    z4: pct(counts.z4),
    z5: pct(counts.z5),
    z6: pct(counts.z6),
    z7: pct(counts.z7),
    pedaling_samples: pedalingSamples,
  };
}

// ─── Aerobic Decoupling ─────────────────────────────────────────────────────

/**
 * Compute aerobic decoupling as the drop in Pa:HR (power / heart rate) from
 * the first half of the ride to the second half.
 *
 * Distinct from ride_analytics.fatigue_resistance.cardiac_drift, which uses
 * quarter splits. The guide prescribes halves plus specific interpretation
 * bands (<3% = well-coupled, <7% = mild, ≥7% = significant drift).
 *
 * Requires at least 120 valid samples (both power>0 and hr>0) to avoid noise
 * dominating short rides.
 *
 * @param {Array<{power:number, hr:number}>} resampled
 * @returns {{first_half_pa_hr:number, second_half_pa_hr:number, decoupling_pct:number, interpretation:'well-coupled'|'mild-drift'|'significant-drift'}|null}
 */
export function computeAerobicDecoupling(resampled) {
  if (!Array.isArray(resampled)) return null;
  const valid = resampled.filter((r) => r.power > 0 && r.hr > 0);
  if (valid.length < 120) return null;

  const mid = Math.floor(valid.length / 2);
  const first = valid.slice(0, mid);
  const second = valid.slice(mid);
  if (first.length === 0 || second.length === 0) return null;

  const paHr = (arr) => {
    const avgP = arr.reduce((s, r) => s + r.power, 0) / arr.length;
    const avgH = arr.reduce((s, r) => s + r.hr, 0) / arr.length;
    return avgH > 0 ? avgP / avgH : 0;
  };

  const firstRatio = paHr(first);
  const secondRatio = paHr(second);
  if (!(firstRatio > 0)) return null;

  const decouplingPct = ((firstRatio - secondRatio) / firstRatio) * 100;

  let interpretation;
  if (decouplingPct < 3) interpretation = 'well-coupled';
  else if (decouplingPct < 7) interpretation = 'mild-drift';
  else interpretation = 'significant-drift';

  return {
    first_half_pa_hr: round2(firstRatio),
    second_half_pa_hr: round2(secondRatio),
    decoupling_pct: round1(decouplingPct),
    interpretation,
  };
}

// ─── Power Dropout Detection ────────────────────────────────────────────────

/**
 * Flag samples where power reads 0 but cadence is still turning over.
 * That's the classic signature of a power-meter dropout (battery, magnet,
 * BLE pairing glitch) and it should make the coach discount affected
 * intervals rather than narrate them as "you stopped pedaling".
 *
 * @param {Array<{power:number, cadence:number}>} resampled
 * @param {number} intervalSeconds
 * @returns {{total_dropouts:number, dropout_seconds:number, dropout_pct:number, suspected_sensor_failure:boolean}|null}
 */
export function detectPowerDropouts(resampled, intervalSeconds) {
  if (!Array.isArray(resampled) || resampled.length === 0) return null;
  if (!Number.isFinite(intervalSeconds) || intervalSeconds <= 0) return null;

  // Only count as dropout if we saw meaningful pedaling (cadence >= 30 rpm)
  // while power read zero. Below 30 rpm it's more likely the rider actually
  // stopped pedaling (e.g. walking up a steep pitch, stopped at a light).
  const dropouts = resampled.filter((r) => r.power === 0 && r.cadence >= 30);
  const dropoutSeconds = dropouts.length * intervalSeconds;
  const dropoutPct = (dropouts.length / resampled.length) * 100;

  return {
    total_dropouts: dropouts.length,
    dropout_seconds: dropoutSeconds,
    dropout_pct: round1(dropoutPct),
    suspected_sensor_failure: dropouts.length > 3,
  };
}

// ─── Cadence Bands ──────────────────────────────────────────────────────────

/**
 * Split cadence into the guide's four coaching bands. Distinct from
 * ride_analytics.cadence_analysis.distribution which uses different edges.
 *
 * @param {Array<{cadence:number}>} resampled
 * @returns {{below_70:number, band_70_84:number, band_85_94:number, band_95_plus:number, avg:number}|null}
 */
export function computeCadenceBandsForCoach(resampled) {
  if (!Array.isArray(resampled) || resampled.length === 0) return null;
  const pedaling = resampled.filter((r) => r.cadence > 0);
  const total = pedaling.length;
  if (total === 0) return null;

  const pct = (n) => Math.round((n / total) * 100);
  const avg = Math.round(pedaling.reduce((s, r) => s + r.cadence, 0) / total);

  return {
    below_70: pct(pedaling.filter((r) => r.cadence < 70).length),
    band_70_84: pct(pedaling.filter((r) => r.cadence >= 70 && r.cadence <= 84).length),
    band_85_94: pct(pedaling.filter((r) => r.cadence >= 85 && r.cadence <= 94).length),
    band_95_plus: pct(pedaling.filter((r) => r.cadence >= 95).length),
    avg,
  };
}

// ─── Top-Level Builder ──────────────────────────────────────────────────────

/**
 * Build the full coach context object for a single ride.
 *
 * Safe to call with missing athlete fields — degraded output is still useful
 * (e.g. cadence bands and decoupling don't need FTP).
 *
 * @param {Object} params
 * @param {Array} params.allDataPoints - 1 Hz records from fitParser
 * @param {number} [params.ftp]
 * @param {number} [params.maxHR]
 * @param {Object} [params.powerZones] - user_profiles.power_zones shape
 * @returns {Object|null}
 */
export function buildFitCoachContext({ allDataPoints, ftp, maxHR, powerZones } = {}) {
  if (!Array.isArray(allDataPoints) || allDataPoints.length < 60) return null;

  // Derive duration from first/last timestamp
  const firstTs = parseTimestamp(allDataPoints[0]?.timestamp);
  const lastTs = parseTimestamp(allDataPoints[allDataPoints.length - 1]?.timestamp);
  if (!Number.isFinite(firstTs) || !Number.isFinite(lastTs) || lastTs <= firstTs) {
    return null;
  }
  const durationSeconds = Math.floor((lastTs - firstTs) / 1000);
  if (durationSeconds < 60) return null;

  const intervalSeconds = pickSamplingInterval(durationSeconds);
  const timeSeries = resampleDataPoints(allDataPoints, intervalSeconds);
  if (timeSeries.length === 0) return null;

  const powerZoneDistribution = computePowerZoneDistribution(timeSeries, powerZones);
  const cadenceBands = computeCadenceBandsForCoach(timeSeries);
  const aerobicDecoupling = computeAerobicDecoupling(timeSeries);
  const powerDropouts = detectPowerDropouts(timeSeries, intervalSeconds);

  return {
    schema_version: 1,
    duration_seconds: durationSeconds,
    interval_seconds: intervalSeconds,
    sample_count: timeSeries.length,
    athlete: {
      ftp: Number.isFinite(ftp) ? ftp : null,
      max_hr: Number.isFinite(maxHR) ? maxHR : null,
    },
    time_series: timeSeries,
    power_zone_distribution: powerZoneDistribution,
    cadence_bands: cadenceBands,
    aerobic_decoupling: aerobicDecoupling,
    power_dropouts: powerDropouts,
  };
}

// ─── Internal Utilities ─────────────────────────────────────────────────────

function parseTimestamp(ts) {
  if (ts instanceof Date) return ts.getTime();
  if (typeof ts === 'string') return Date.parse(ts);
  if (Number.isFinite(ts)) return ts;
  return NaN;
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

export default {
  pickSamplingInterval,
  resampleDataPoints,
  computePowerZoneDistribution,
  computeAerobicDecoupling,
  detectPowerDropouts,
  computeCadenceBandsForCoach,
  buildFitCoachContext,
};
