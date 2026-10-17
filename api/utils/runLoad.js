/**
 * Run load from the athlete's own thresholds (multisport phase 1).
 *
 * Pure: no Supabase, no I/O, importable from src/. Used by
 * estimateTSSWithSource (api/utils/fitnessSnapshots.js) when a caller passes a
 * resolved run profile; callers that don't keep the old fixed-band heuristic.
 *
 * Two measures, ordered per run by estimateRunLoad (after a stored device
 * RSS, which always wins):
 *   rTSS  — hours × IF² × 100, IF = threshold pace / graded pace.
 *           rss_source 'power' (D5: threshold-normalised intensity).
 *   hrTSS — exponential TRIMP on average HR, normalised so an hour at
 *           LTHR = 100. rss_source 'hr'.
 * When neither applies it returns null and the caller falls back to the
 * fixed-band heuristic ('inferred').
 *
 * Thresholds come from the profile when the athlete entered them, else from
 * VDOT, else from their run history (estimateRunThresholds). Confidence is
 * lower for estimated anchors. Paces are seconds per km throughout.
 */

/** Metres of flat running one metre of climb costs, for summary graded pace. */
export const K_CLIMB = 8;

/** Fallback resting HR when the athlete has not entered one. */
export const DEFAULT_RESTING_HR = 60;

/** LTHR as a share of max HR (Friel's running ratio). */
export const LTHR_FROM_MAX = 0.89;

export const CONFIDENCE = Object.freeze({
  rtssProfilePace: 0.75,
  rtssEstimatedPace: 0.65,
  hrProfileLthr: 0.65,
  hrEstimatedLthr: 0.55,
});

const key = (v) => String(v || '').toUpperCase().replace(/[^A-Z]/g, '');
const activityKeys = (a) => `${key(a?.sport_type)}|${key(a?.type)}`;

/** Indoor runs: no meaningful GPS distance or climb. */
export function isIndoorRun(a) {
  const k = activityKeys(a);
  return k.includes('TREADMILL') || k.includes('VIRTUAL') || k.includes('INDOOR');
}

export function isTrailRun(a) {
  return activityKeys(a).includes('TRAIL');
}

/**
 * Graded pace from summary fields: climb is converted to equivalent flat
 * distance. Indoor runs use plain pace (their climb is fiction or absent).
 * Returns null without distance and time.
 */
export function gradedPaceSecPerKm(a) {
  const distance = Number(a?.distance) || 0;
  const time = Number(a?.moving_time) || 0;
  if (distance <= 0 || time <= 0) return null;
  const climb = isIndoorRun(a) ? 0 : Math.max(0, Number(a?.total_elevation_gain) || 0);
  return time / ((distance + K_CLIMB * climb) / 1000);
}

/** Percentile (0–1) by linear interpolation over a numeric array. */
function percentile(values, p) {
  const s = [...values].sort((x, y) => x - y);
  if (s.length === 0) return null;
  const idx = (s.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return s[lo] + (s[hi] - s[lo]) * (idx - lo);
}

/**
 * Estimate max HR and threshold pace from a runner's history.
 *
 * Max HR: 98th percentile of per-run max_heartrate (100–225 only), needing at
 * least 5 such runs and a result of at least 150 — below that the data is
 * more likely a walker or a broken strap than a real ceiling.
 *
 * Threshold pace: runs of 20–70 min that were genuinely hard (average HR at
 * least 86% of max), each graded pace normalised to a 60-minute effort with
 * Riegel's exponent. With three or more candidates the SECOND fastest is
 * taken, so one GPS glitch cannot set an athlete's threshold.
 *
 * @param {Array<object>} runs  activity rows already known to be runs
 * @returns {{ maxHr: number|null, thresholdPaceSec: number|null, candidates: number }}
 */
export function estimateRunThresholds(runs) {
  const maxes = (runs || [])
    .map((r) => Number(r.max_heartrate))
    .filter((v) => v >= 100 && v <= 225);
  let maxHr = maxes.length >= 5 ? Math.round(percentile(maxes, 0.98)) : null;
  if (maxHr != null && maxHr < 150) maxHr = null;

  let thresholdPaceSec = null;
  let candidates = 0;
  if (maxHr != null) {
    const paces = [];
    for (const r of runs || []) {
      const t = Number(r.moving_time) || 0;
      if (t < 1200 || t > 4200) continue;
      if (!(Number(r.average_heartrate) >= 0.86 * maxHr)) continue;
      const gp = gradedPaceSecPerKm(r);
      if (gp == null || gp < 150 || gp > 600) continue;
      paces.push(gp * Math.pow(3600 / t, 0.06));
    }
    candidates = paces.length;
    if (paces.length >= 3) {
      paces.sort((x, y) => x - y);
      thresholdPaceSec = Math.round(paces[1]);
    }
  }
  return { maxHr, thresholdPaceSec, candidates };
}

/** Threshold pace (sec/km) from VDOT — same fit as src/utils/paceZones.ts. */
function thresholdPaceFromVdot(vdot) {
  const v = Number(vdot);
  if (!(v > 0)) return null;
  return Math.round((10.77 - 0.119 * v) * 60);
}

const positive = (v) => (Number(v) > 0 ? Number(v) : null);

/**
 * The anchors run load is computed against: entered values first, then
 * estimates. `paceFrom` / `hrFrom` say which, so confidence can reflect it.
 *
 * @param {{threshold_pace_sec?, vdot?, lthr?, max_hr?, resting_hr?}|null} profile
 * @param {Array<object>} runs  the athlete's recent runs
 */
export function resolveRunProfile(profile, runs) {
  const est = estimateRunThresholds(runs);

  let thresholdPaceSec = positive(profile?.threshold_pace_sec);
  let paceFrom = thresholdPaceSec ? 'profile' : null;
  if (!thresholdPaceSec) {
    thresholdPaceSec = thresholdPaceFromVdot(profile?.vdot);
    if (thresholdPaceSec) paceFrom = 'vdot';
  }
  if (!thresholdPaceSec && est.thresholdPaceSec) {
    thresholdPaceSec = est.thresholdPaceSec;
    paceFrom = 'estimated';
  }

  const maxHr = positive(profile?.max_hr) ?? est.maxHr;
  let lthr = positive(profile?.lthr);
  let hrFrom = lthr ? 'profile' : null;
  if (!lthr && maxHr) {
    lthr = Math.round(maxHr * LTHR_FROM_MAX);
    hrFrom = positive(profile?.max_hr) ? 'profile_max' : 'estimated';
  }

  return {
    thresholdPaceSec,
    paceFrom,
    lthr,
    maxHr,
    restingHr: positive(profile?.resting_hr) ?? DEFAULT_RESTING_HR,
    hrFrom,
    // The history estimate on its own, whatever the athlete entered — stored
    // on the profile (storeRunEstimates) so Settings can offer it.
    estimated: {
      thresholdPaceSec: est.thresholdPaceSec,
      lthr: est.maxHr ? Math.round(est.maxHr * LTHR_FROM_MAX) : null,
    },
  };
}

/** Exponential TRIMP weighting for one minute at heart-rate reserve `hrr`. */
const trimpPerMinute = (hrr) => hrr * 0.64 * Math.exp(1.92 * hrr);

/**
 * hrTSS: TRIMP on average HR, scaled so an hour at LTHR scores 100. Null when
 * the anchors or the HR are missing or inconsistent. Used for runs and for
 * other sports with HR.
 */
export function hrTss(activity, runProfile) {
  const avg = Number(activity?.average_heartrate) || 0;
  const minutes = (Number(activity?.moving_time) || 0) / 60;
  const { lthr, restingHr } = runProfile || {};
  const maxHr = runProfile?.maxHr ?? (lthr ? lthr / LTHR_FROM_MAX : null);
  if (!(avg > 0) || !(minutes > 0) || !lthr || !maxHr || !(maxHr > restingHr)) return null;
  const hrr = Math.min(1, Math.max(0, (avg - restingHr) / (maxHr - restingHr)));
  const hrrLthr = (lthr - restingHr) / (maxHr - restingHr);
  if (!(hrrLthr > 0)) return null;
  return (minutes * trimpPerMinute(hrr)) / (60 * trimpPerMinute(hrrLthr)) * 100;
}

/**
 * True when average HR is usable: present, and at least half of max HR. Below
 * that it is a slipped strap or a walk logged as a run (25 such runs in the
 * 2026-10 production sample), and TRIMP would score it near zero.
 */
export function hasUsableHr(activity, runProfile) {
  const avg = Number(activity?.average_heartrate) || 0;
  if (!(avg > 0)) return false;
  const maxHr = runProfile?.maxHr ?? (runProfile?.lthr ? runProfile.lthr / LTHR_FROM_MAX : null);
  return !maxHr || avg >= 0.5 * maxHr;
}

function rtss(activity, runProfile, hours) {
  const gp = gradedPaceSecPerKm(activity);
  if (!gp || !runProfile.thresholdPaceSec) return null;
  const intensity = Math.min(1.5, Math.max(0.3, runProfile.thresholdPaceSec / gp));
  return {
    tss: Math.round(hours * intensity * intensity * 100),
    source: 'power',
    confidence:
      runProfile.paceFrom === 'estimated' ? CONFIDENCE.rtssEstimatedPace : CONFIDENCE.rtssProfilePace,
  };
}

/**
 * Run load against the athlete's thresholds, or null to fall back to the
 * heuristic. Order:
 *
 *   1. rTSS from a pace the ATHLETE gave (threshold pace or VDOT) — except on
 *      trail runs with usable HR, where terrain makes pace a poor signal.
 *   2. hrTSS when average HR is usable.
 *   3. rTSS from an ESTIMATED pace, for runs without usable HR.
 *
 * An estimated pace ranks below HR on purpose: on the 2026-10 production
 * sample the history estimate ran slow for athletes whose hard runs are tempo
 * rather than threshold, inflating easy-run load by up to ~70%, while HR-first
 * scoring kept the population's load per hour unchanged (58 → 58) and
 * redistributed it by each run's intensity (p10–p90 ratio 0.65–1.36).
 *
 * @returns {{ tss: number, source: 'power'|'hr', confidence: number }|null}
 */
export function estimateRunLoad(activity, runProfile) {
  if (!runProfile) return null;
  const hours = (Number(activity?.moving_time) || 0) / 3600;
  if (!(hours > 0)) return null;

  const usableHr = hasUsableHr(activity, runProfile) && runProfile.lthr;
  const enteredPace = runProfile.paceFrom === 'profile' || runProfile.paceFrom === 'vdot';

  if (enteredPace && !(isTrailRun(activity) && usableHr)) {
    const r = rtss(activity, runProfile, hours);
    if (r) return r;
  }

  if (usableHr) {
    const hr = hrTss(activity, runProfile);
    if (hr != null) {
      return {
        tss: Math.round(hr),
        source: 'hr',
        confidence: runProfile.hrFrom === 'profile' ? CONFIDENCE.hrProfileLthr : CONFIDENCE.hrEstimatedLthr,
      };
    }
  }

  if (runProfile.paceFrom === 'estimated') return rtss(activity, runProfile, hours);
  return null;
}
