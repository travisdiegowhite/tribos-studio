/**
 * sessionDesigner — turn "a hard day of this type, this long, this heavy"
 * into the intervals the athlete rides, from the athlete's own numbers.
 *
 * WHY
 * ---
 * The coach decides what kind of day it is; it is bad at sizing sets and
 * choosing targets, and until now nothing else did it either. This module
 * is the deterministic half of the split: same athlete, same request, same
 * session, with a rule id and a plain sentence behind every choice.
 *
 * PURE. No I/O, no model call, no clock unless one is passed in. The inputs
 * come from `athleteDesignInputs.js` (server) and the output is stored via
 * `prescription.js` as `calendar_entries.details.prescription`.
 *
 * HOW (docs/coaching-bible — SES rule families, Phase C)
 * -------------------------------------------------------
 *   1. Choose the format          SES-VO2 / SES-THR / SES-END …
 *   2. Calibrate the targets      SES-CAL   (FTP age, bests, W′)
 *   3. Size the dose to the load  SES-DOSE
 *   4. Apply readiness            RDY-3, GATE-FS, GATE-AFI
 *   5. Fit to the planned length  bookends absorb the difference
 *   6. Return the reasons
 *
 * Every constant below is a placeholder for a bible rule until Phase C
 * replaces it with a cited one; the rule ids are already the bible's.
 */

import { buildPrescription } from './prescription.js';

// ─── Constants the bible will own ────────────────────────────────────────────

/**
 * SES-CAL-1. An FTP older than this is stale and the power bests calibrate
 * the targets instead. Founder's call: 30–45 days for an athlete who has been
 * training consistently. Consistency is measured (rides per week over the
 * last four), never assumed, and the window widens with gaps.
 */
export const FTP_STALE_DAYS = {
  high: 30, // ≥ 4 rides/week
  consistent: 45, // ≥ 2 rides/week
  sparse: 90, // fewer, or unknown
};
/** Bests only override a stale FTP when they disagree with it by more than this. */
export const FTP_OVERRIDE_MIN_DELTA = 0.03;
/** SES-CAL-2. One VO2 effort may spend at most this share of W′. */
export const WPRIME_MAX_SHARE = 0.85;
/** SES-DOSE. A design lands within this many RSS of the budget, or says why not. */
export const LOAD_TOLERANCE_RSS = 5;
/** GATE-FS (sequencer rule). No quality work at or below this form score. */
export const FORM_SCORE_NO_QUALITY = -15;
/** GATE-AFI (sequencer rule). Trim the dose by this when fatigue grew past the ceiling. */
export const AFI_TRIM_FACTOR = 0.75;
/** RDY-3-modify. First block only: about half the sets, keep the intensity. */
export const MODIFY_SET_FACTOR = 0.5;

const WARMUP_PCT = 65;
const COOLDOWN_PCT = 50;
const RECOVERY_PCT = 50;
const MIN_WARMUP_MIN = 8;
const MIN_COOLDOWN_MIN = 5;

/** Session types with a steady shape: no intervals to design. */
const STEADY_TYPES = new Set(['endurance', 'long_ride', 'recovery', 'z1', 'z2', 'easy', 'foundation']);
const REST_TYPES = new Set(['rest']);
const OFF_BIKE_TYPES = new Set(['strength', 'core', 'flexibility']);

// ─── Format menu ─────────────────────────────────────────────────────────────

/**
 * One row = one way to ride a session type. `repeats` is [min, max]; the dose
 * step picks within it. `sets` > 1 nests the repeats with a longer recovery
 * between sets (30/15s are ridden as 3 × 13). `vo2Role` tells the calibrator
 * which fraction of the 5-minute best an effort of this length is ridden at.
 */
const FORMATS = {
  vo2_30_15: {
    id: 'vo2_30_15', rule: 'SES-VO2-1', label: '30/15s',
    sets: 3, repeats: [10, 13], work: 0.5, pct: [115, 125], recovery: 0.25, setRecovery: 3,
    vo2Role: 'micro', notes: 'Rønnestad 30/15s: hold the 30s, spin the 15s.',
  },
  vo2_40_20: {
    id: 'vo2_40_20', rule: 'SES-VO2-1', label: '40/20s',
    sets: 3, repeats: [8, 10], work: 0.667, pct: [115, 125], recovery: 0.333, setRecovery: 4,
    vo2Role: 'micro', notes: '40/20s: steady output across the set, no sprinting the first one.',
  },
  vo2_4x4: {
    id: 'vo2_4x4', rule: 'SES-VO2-2', label: '4×4min',
    sets: 1, repeats: [3, 5], work: 4, pct: [110, 118], recovery: 3, setRecovery: 0,
    vo2Role: 'medium', notes: '4-min efforts: even pace, the last one should feel like the first.',
  },
  vo2_5x4: {
    id: 'vo2_5x4', rule: 'SES-VO2-2', label: '5×4min',
    sets: 1, repeats: [4, 6], work: 4, pct: [108, 115], recovery: 4, setRecovery: 0,
    vo2Role: 'medium', notes: '4-min efforts with full recovery between.',
  },
  vo2_5x3: {
    id: 'vo2_5x3', rule: 'SES-VO2-2', label: '5×3min',
    sets: 1, repeats: [4, 6], work: 3, pct: [112, 120], recovery: 3, setRecovery: 0,
    vo2Role: 'short', notes: '3-min efforts, hard from the start.',
  },
  vo2_4x8: {
    id: 'vo2_4x8', rule: 'SES-VO2-3', label: '4×8min',
    sets: 1, repeats: [3, 5], work: 8, pct: [105, 112], recovery: 4, setRecovery: 0,
    vo2Role: 'long', notes: 'Seiler 4×8: slightly below all-out, sustainable across four.',
  },
  thr_2x20: {
    id: 'thr_2x20', rule: 'SES-THR-1', label: '2×20min',
    sets: 1, repeats: [2, 3], work: 20, pct: [95, 100], recovery: 5, setRecovery: 0,
    notes: 'Threshold: steady, seated, breathing hard but controlled.',
  },
  thr_3x12: {
    id: 'thr_3x12', rule: 'SES-THR-1', label: '3×12min',
    sets: 1, repeats: [3, 4], work: 12, pct: [96, 102], recovery: 5, setRecovery: 0,
    notes: 'Threshold: upper end, hold the last two minutes of each.',
  },
  thr_4x10: {
    id: 'thr_4x10', rule: 'SES-THR-1', label: '4×10min',
    sets: 1, repeats: [3, 5], work: 10, pct: [98, 103], recovery: 5, setRecovery: 0,
    notes: 'True threshold: at or just over FTP.',
  },
  thr_3x8: {
    id: 'thr_3x8', rule: 'SES-THR-1', label: '3×8min',
    sets: 1, repeats: [3, 4], work: 8, pct: [98, 104], recovery: 4, setRecovery: 0,
    notes: 'Short threshold for a short day.',
  },
  thr_3x20: {
    id: 'thr_3x20', rule: 'SES-THR-1', label: '3×20min',
    sets: 1, repeats: [2, 3], work: 20, pct: [93, 99], recovery: 6, setRecovery: 0,
    notes: 'Long threshold: sustained, a shade under FTP.',
  },
  sst_2x20: {
    id: 'sst_2x20', rule: 'SES-THR-2', label: '2×20min sweet spot',
    sets: 1, repeats: [2, 3], work: 20, pct: [88, 92], recovery: 5, setRecovery: 0,
    notes: 'Sweet spot: firm but repeatable.',
  },
  sst_3x15: {
    id: 'sst_3x15', rule: 'SES-THR-2', label: '3×15min sweet spot',
    sets: 1, repeats: [3, 4], work: 15, pct: [88, 93], recovery: 5, setRecovery: 0,
    notes: 'Upper sweet spot.',
  },
  sst_4x12: {
    id: 'sst_4x12', rule: 'SES-THR-2', label: '4×12min sweet spot',
    sets: 1, repeats: [3, 5], work: 12, pct: [89, 94], recovery: 4, setRecovery: 0,
    notes: 'Sweet spot, pushing toward threshold.',
  },
  sst_3x20: {
    id: 'sst_3x20', rule: 'SES-THR-2', label: '3×20min sweet spot',
    sets: 1, repeats: [2, 3], work: 20, pct: [88, 92], recovery: 5, setRecovery: 0,
    notes: 'Long sweet spot for a long day.',
  },
  tempo_2x20: {
    id: 'tempo_2x20', rule: 'SES-THR-3', label: '2×20min tempo',
    sets: 1, repeats: [2, 3], work: 20, pct: [80, 87], recovery: 5, setRecovery: 0,
    notes: 'Tempo: comfortably hard, conversation in short sentences.',
  },
  tempo_1x40: {
    id: 'tempo_1x40', rule: 'SES-THR-3', label: '40min tempo',
    sets: 1, repeats: [1, 2], work: 40, pct: [78, 85], recovery: 8, setRecovery: 0,
    notes: 'One long tempo block.',
  },
  ana_8x1: {
    id: 'ana_8x1', rule: 'SES-ANA-1', label: '8×1min',
    sets: 1, repeats: [6, 10], work: 1, pct: [140, 160], recovery: 4, setRecovery: 0,
    vo2Role: 'micro', notes: 'Anaerobic: all-out for the minute, full recovery.',
  },
  ana_6x2: {
    id: 'ana_6x2', rule: 'SES-ANA-1', label: '6×2min',
    sets: 1, repeats: [4, 8], work: 2, pct: [125, 135], recovery: 4, setRecovery: 0,
    vo2Role: 'short', notes: '2-min efforts above VO2 pace.',
  },
  spr_10x30s: {
    id: 'spr_10x30s', rule: 'SES-ANA-2', label: '10×30s sprints',
    sets: 1, repeats: [6, 12], work: 0.5, pct: [170, 220], recovery: 4.5, setRecovery: 0,
    notes: 'Sprints: full recovery, quality over quantity.',
  },
  race_sim: {
    id: 'race_sim', rule: 'SES-RACE-1', label: 'race simulation',
    multi: [
      { sets: 1, repeats: [2, 3], work: 10, pct: [95, 102], recovery: 5, setRecovery: 0, notes: 'Threshold block' },
      { sets: 1, repeats: [4, 6], work: 0.5, pct: [150, 170], recovery: 2, setRecovery: 0, notes: 'Attacks on tired legs' },
    ],
    notes: 'Race simulation: sustained threshold, then attacks on tired legs.',
  },
  openers: {
    id: 'openers', rule: 'SES-RACE-2', label: 'openers',
    sets: 1, repeats: [3, 4], work: 1, pct: [100, 110], recovery: 3, setRecovery: 0,
    notes: 'Openers: wake the legs up, nothing that needs recovering from.',
  },
};

export { FORMATS };

// ─── Format selection (SES-VO2 / SES-THR …) ──────────────────────────────────

function norm(type) {
  return String(type || '').toLowerCase().trim();
}

/** The library category a session type belongs to, in the designer's vocabulary. */
export function designFamily(type) {
  const t = norm(type);
  if (['vo2max', 'vo2'].includes(t)) return 'vo2max';
  if (['threshold', 'intervals', 'climbing', 'hill_repeats', 'ftp'].includes(t)) return 'threshold';
  if (['sweet_spot', 'sweetspot', 'sst'].includes(t)) return 'sweet_spot';
  if (t === 'tempo') return 'tempo';
  if (t === 'anaerobic') return 'anaerobic';
  if (t === 'sprint') return 'sprint';
  if (['racing', 'race_sim', 'race'].includes(t)) return 'racing';
  if (['opener', 'openers'].includes(t)) return 'openers';
  if (STEADY_TYPES.has(t)) return 'steady';
  if (REST_TYPES.has(t)) return 'rest';
  if (OFF_BIKE_TYPES.has(t)) return 'off_bike';
  return null;
}

/**
 * Pick the format for a family from the week in block, the day's length, the
 * athlete's short-power trend and their recovery mode. Returns the format and
 * the reason.
 */
export function chooseFormat(family, { weekInBlock = 0, durationMin = 75, pdShortTrend = null, recoveryMode = 'standard', goalDurationMin = null } = {}) {
  const conservative = recoveryMode === 'conservative';
  const short = durationMin < 55;
  const long = durationMin >= 100;

  if (family === 'vo2max') {
    if (short) return { format: FORMATS.vo2_4x4, why: `${durationMin} minutes is a short day, so 4-minute efforts fit with a real warmup.` };
    if (pdShortTrend === 'behind') {
      return { format: FORMATS.vo2_30_15, why: 'Short power is behind its recent best, and 30/15s spend the most time at VO2 for the least fatigue.' };
    }
    if (weekInBlock <= 0) return { format: FORMATS.vo2_30_15, why: 'First week of the block: short intervals build the dose without a fortnight of fatigue.' };
    if (weekInBlock === 1) {
      return conservative
        ? { format: FORMATS.vo2_4x4, why: 'Second week; conservative recovery mode keeps efforts at 4 minutes.' }
        : { format: FORMATS.vo2_5x4, why: 'Second week: 4-minute efforts raise the time at intensity.' };
    }
    if (goalDurationMin && goalDurationMin >= 240) {
      return { format: FORMATS.vo2_4x8, why: 'Later in the block with a long event ahead: 8-minute efforts train the top end the way a long day asks for it.' };
    }
    return conservative
      ? { format: FORMATS.vo2_5x4, why: 'Later in the block; conservative recovery mode stays with 4-minute efforts.' }
      : { format: FORMATS.vo2_4x8, why: 'Later in the block: 4×8 is the format the research favours once the athlete can hold it.' };
  }

  if (family === 'threshold') {
    if (short) return { format: FORMATS.thr_3x8, why: `${durationMin} minutes is a short day, so shorter threshold blocks.` };
    if (long) return { format: FORMATS.thr_3x20, why: 'A long day carries long threshold blocks a shade under FTP.' };
    if (weekInBlock <= 0) return { format: FORMATS.thr_2x20, why: 'First week: two long blocks anchor threshold before it is split finer.' };
    if (weekInBlock === 1) return { format: FORMATS.thr_3x12, why: 'Second week: three blocks, a touch higher.' };
    return { format: FORMATS.thr_4x10, why: 'Later in the block: four blocks at or just over FTP.' };
  }

  if (family === 'sweet_spot') {
    if (long) return { format: FORMATS.sst_3x20, why: 'A long day carries three long sweet-spot blocks.' };
    if (weekInBlock <= 0) return { format: FORMATS.sst_2x20, why: 'First week: two blocks establish the dose.' };
    if (weekInBlock === 1) return { format: FORMATS.sst_3x15, why: 'Second week: three blocks, upper sweet spot.' };
    return { format: FORMATS.sst_4x12, why: 'Later in the block: four blocks pushing toward threshold.' };
  }

  if (family === 'tempo') {
    return long
      ? { format: FORMATS.tempo_1x40, why: 'A long day carries one long tempo block.' }
      : { format: FORMATS.tempo_2x20, why: 'Tempo in two blocks.' };
  }

  if (family === 'anaerobic') {
    return weekInBlock >= 2
      ? { format: FORMATS.ana_6x2, why: 'Later in the block: longer anaerobic efforts.' }
      : { format: FORMATS.ana_8x1, why: 'One-minute efforts with full recovery.' };
  }
  if (family === 'sprint') return { format: FORMATS.spr_10x30s, why: 'Sprints with full recovery.' };
  if (family === 'racing') return { format: FORMATS.race_sim, why: 'Race simulation: sustained work, then attacks.' };
  if (family === 'openers') return { format: FORMATS.openers, why: 'Openers before an event.' };
  return null;
}

// ─── Calibration (SES-CAL) ───────────────────────────────────────────────────

/** Rides per week → the window an FTP stays fresh for. */
export function ftpStaleWindowDays(ridesPerWeek) {
  if (ridesPerWeek == null) return FTP_STALE_DAYS.sparse;
  if (ridesPerWeek >= 4) return FTP_STALE_DAYS.high;
  if (ridesPerWeek >= 2) return FTP_STALE_DAYS.consistent;
  return FTP_STALE_DAYS.sparse;
}

/** FTP implied by the 90-day bests, the same way fitness snapshots estimate it. */
export function ftpFromBests(bests) {
  if (!bests) return null;
  if (bests.p1200 > 0) return { ftp: Math.round(bests.p1200 * 0.95), basis: '95% of the 20-minute best' };
  if (bests.p300 > 0) return { ftp: Math.round(bests.p300 * 0.75), basis: '75% of the 5-minute best' };
  return null;
}

/**
 * Decide which FTP the targets are computed from, and which one they are
 * STORED against. Stored %FTP stays relative to the profile FTP, because that
 * is the number on the athlete's head unit; a fresher estimate changes the
 * watts we aim for, not the scale the device reads.
 */
export function calibrateFtp(athlete) {
  const profileFtp = athlete?.ftp > 0 ? Math.round(athlete.ftp) : null;
  const windowDays = ftpStaleWindowDays(athlete?.ridesPerWeek4wk);
  const ageDays = athlete?.ftpAgeDays ?? null;
  const fresh = profileFtp != null && ageDays != null && ageDays <= windowDays;
  const est = ftpFromBests(athlete?.bests);

  if (profileFtp == null) {
    if (est) {
      return {
        ftpUsed: est.ftp, storedAgainst: est.ftp, source: 'bests', profileFtp: null, ageDays, windowDays,
        rationale: `SES-CAL-1: no FTP on the profile; targets come from ${est.basis} (${est.ftp} W). Set your FTP to ${est.ftp} W so your device matches.`,
      };
    }
    return { ftpUsed: null, storedAgainst: null, source: 'none', profileFtp: null, ageDays, windowDays,
      rationale: 'SES-CAL-1: no FTP and no power bests; targets are relative and the notes say to ride by feel.' };
  }

  if (!fresh && est && Math.abs(est.ftp - profileFtp) / profileFtp > FTP_OVERRIDE_MIN_DELTA) {
    const ageText = ageDays == null ? 'of unknown age' : `${ageDays} days old`;
    return {
      ftpUsed: est.ftp, storedAgainst: profileFtp, source: 'bests', profileFtp, ageDays, windowDays,
      rationale: `SES-CAL-1: FTP ${profileFtp} W is ${ageText} against a ${windowDays}-day window, and ${est.basis} says ${est.ftp} W; targets use ${est.ftp} W.`,
    };
  }

  return {
    ftpUsed: profileFtp, storedAgainst: profileFtp, source: 'profile', profileFtp, ageDays, windowDays,
    rationale: fresh
      ? `SES-CAL-1: FTP ${profileFtp} W is ${ageDays} days old, inside the ${windowDays}-day window.`
      : `SES-CAL-1: FTP ${profileFtp} W; the power bests agree with it, so it stands.`,
  };
}

/** Fraction of the 5-minute best a VO2 effort of a given role is ridden at. */
const VO2_FROM_P300 = {
  micro: [1.0, 1.08],
  short: [0.95, 1.02],
  medium: [0.9, 0.97],
  long: [0.85, 0.91],
};

/**
 * The %FTP band to store for one format, after calibration:
 *   - VO2-family efforts come from the 5-minute best when there is one;
 *   - everything else is the format's band on the FTP in use;
 *   - both are re-expressed against the FTP the device holds;
 *   - a W′ cap lowers a band the athlete could not complete.
 */
export function calibrateBand(format, cal, athlete, rationale) {
  let lo = format.pct[0];
  let hi = format.pct[1];
  let wattsLo = null;
  let wattsHi = null;

  if (cal.ftpUsed) {
    wattsLo = (lo / 100) * cal.ftpUsed;
    wattsHi = (hi / 100) * cal.ftpUsed;
  }

  const p300 = athlete?.bests?.p300;
  if (format.vo2Role && p300 > 0 && cal.ftpUsed) {
    const [fLo, fHi] = VO2_FROM_P300[format.vo2Role];
    wattsLo = p300 * fLo;
    wattsHi = p300 * fHi;
    rationale.push(`SES-CAL-3: ${format.label} efforts set from the 5-minute best (${p300} W): ${Math.round(wattsLo)}–${Math.round(wattsHi)} W.`);
  }

  // W′ cap: an effort above CP spends (P − CP) × t of W′; keep one effort
  // under the share the bible allows so the last repeat is still rideable.
  const cp = athlete?.cp;
  const wPrime = athlete?.wPrime;
  if (wattsHi != null && cp > 0 && wPrime > 0 && wattsHi > cp) {
    const seconds = format.work * 60;
    const maxWatts = cp + (WPRIME_MAX_SHARE * wPrime) / seconds;
    if (wattsHi > maxWatts) {
      const cappedHi = Math.max(maxWatts, cp * 1.02);
      const cappedLo = Math.min(wattsLo, cappedHi * 0.96);
      rationale.push(`SES-CAL-2: ${Math.round(wattsHi)} W for ${format.work} min would spend more than ${Math.round(WPRIME_MAX_SHARE * 100)}% of W′ (${Math.round(wPrime / 1000)} kJ over CP ${cp} W); capped at ${Math.round(cappedHi)} W.`);
      wattsHi = cappedHi;
      wattsLo = cappedLo;
    }
  }

  if (wattsLo != null && cal.storedAgainst) {
    lo = Math.round((wattsLo / cal.storedAgainst) * 100);
    hi = Math.round((wattsHi / cal.storedAgainst) * 100);
    if (hi < lo) hi = lo;
  }
  return { pctMin: lo, pctMax: hi, wattsMin: wattsLo == null ? null : Math.round(wattsLo), wattsMax: wattsHi == null ? null : Math.round(wattsHi) };
}

// ─── Load arithmetic (SES-DOSE) ──────────────────────────────────────────────

/** RSS of riding `minutes` at `pct` of FTP: (pct/100)² × h × 100. */
export function segmentLoad(pct, minutes) {
  return ((pct / 100) ** 2) * (minutes / 60) * 100;
}

function setMinutes(block) {
  const oneSet = block.repeats * block.work + Math.max(0, block.repeats - 1) * block.recovery;
  return block.sets * oneSet + Math.max(0, block.sets - 1) * block.setRecovery;
}

function setLoad(block) {
  const mid = (block.pctMin + block.pctMax) / 2;
  const work = segmentLoad(mid, block.work) * block.repeats * block.sets;
  const rec = segmentLoad(RECOVERY_PCT, block.recovery) * Math.max(0, block.repeats - 1) * block.sets
    + segmentLoad(RECOVERY_PCT, block.setRecovery) * Math.max(0, block.sets - 1);
  return work + rec;
}

function bookendsFor(durationMin) {
  const warmup = Math.min(20, Math.max(MIN_WARMUP_MIN, Math.round(durationMin * 0.15)));
  const cooldown = Math.min(15, Math.max(MIN_COOLDOWN_MIN, Math.round(durationMin * 0.1)));
  return { warmup, cooldown };
}

function bookendLoad(warmup, cooldown) {
  return segmentLoad(WARMUP_PCT, warmup) + segmentLoad(COOLDOWN_PCT, cooldown);
}

/** Predicted RSS of a whole design. */
export function predictLoad(blocks, warmup, cooldown) {
  return Math.round(blocks.reduce((s, b) => s + setLoad(b), 0) + bookendLoad(warmup, cooldown));
}

/**
 * Pick the repeat count for each block so the predicted load lands on the
 * budget without running past the planned length. Duration wins over load:
 * a session that does not fit the day is not a session.
 */
export function sizeDose(blocks, { targetLoad, durationMin }, rationale) {
  const { warmup, cooldown } = bookendsFor(durationMin);
  const minBookends = MIN_WARMUP_MIN + MIN_COOLDOWN_MIN;

  // Start every block at its minimum — or, with no budget to size to, at the
  // middle of its range, which is the format as the bible describes it.
  const sized = blocks.map((b) => ({
    ...b,
    repeats: targetLoad == null ? Math.round((b.range[0] + b.range[1]) / 2) : b.range[0],
  }));
  const fits = () => sized.reduce((s, b) => s + setMinutes(b), 0) + minBookends <= durationMin;
  const load = () => predictLoad(sized, warmup, cooldown);

  if (!fits()) {
    // Too long for the day: shed repeats to the minimum, then sets.
    for (const b of sized) {
      while (b.repeats > b.range[0] && !fits()) b.repeats -= 1;
    }
    for (const b of sized) {
      while (b.sets > 1 && !fits()) b.sets -= 1;
    }
    if (!fits()) {
      rationale.push(`SES-DOSE-2: ${durationMin} minutes cannot hold the smallest version of this format; trimmed to fit.`);
    }
  }

  // Grow the biggest-contributing block first while under budget and in time.
  let guard = 0;
  while (targetLoad != null && load() < targetLoad - LOAD_TOLERANCE_RSS && guard++ < 50) {
    const candidates = sized.filter((b) => b.repeats < b.range[1]);
    if (candidates.length === 0) break;
    const b = candidates[0];
    b.repeats += 1;
    if (!fits()) { b.repeats -= 1; break; }
    if (load() > targetLoad + LOAD_TOLERANCE_RSS) {
      // Overshot: keep the closer of the two.
      const over = load() - targetLoad;
      b.repeats -= 1;
      const under = targetLoad - load();
      if (over < under) b.repeats += 1;
      break;
    }
  }

  const predicted = load();
  if (targetLoad != null && Math.abs(predicted - targetLoad) > LOAD_TOLERANCE_RSS) {
    const why = predicted < targetLoad
      ? 'the format\'s maximum set count and the day\'s length cap it'
      : 'the format\'s minimum set already exceeds it';
    rationale.push(`SES-DOSE-1: predicted ${predicted} RSS against a ${targetLoad} RSS budget; ${why}.`);
  } else if (targetLoad != null) {
    rationale.push(`SES-DOSE-1: ${sized.map((b) => (b.sets > 1 ? `${b.sets}×` : '') + `${b.repeats}×${fmtMin(b.work)}`).join(' + ')} lands on ${predicted} RSS for a ${targetLoad} RSS budget.`);
  }

  // Bookends absorb whatever the day has left, 60/40, floors respected.
  const used = sized.reduce((s, b) => s + setMinutes(b), 0);
  const spare = Math.max(minBookends, durationMin - used);
  const warm = Math.max(MIN_WARMUP_MIN, Math.round(spare * 0.6));
  const cool = Math.max(MIN_COOLDOWN_MIN, spare - warm);
  return { blocks: sized, warmup: warm, cooldown: cool, predicted: predictLoad(sized, warm, cool) };
}

function fmtMin(min) {
  return min < 1 ? `${Math.round(min * 60)}s` : `${Math.round(min * 10) / 10}min`;
}

// ─── Gating (readiness rules already in the bible / sequencer) ───────────────

/**
 * What readiness does to the request before design. Mirrors the sequencer's
 * evaluateGating so the arc and the coach ease a day the same way.
 */
export function applyGates(request, athlete, rationale) {
  const out = { ...request, gate: null };
  const call = athlete?.readinessCall ?? null;
  const fs = athlete?.formScore ?? null;
  const growth = athlete?.afiGrowth4d ?? null;
  const ceiling = athlete?.afiGrowthCeiling ?? 0.25;

  if (call === 'skip') {
    rationale.push('RDY-3-skip: today is a skip, not a modify.');
    return { ...out, gate: 'skip', family: 'rest' };
  }
  if (fs != null && fs <= FORM_SCORE_NO_QUALITY) {
    rationale.push(`GATE-FS: form score ${Math.round(fs)} is at or below ${FORM_SCORE_NO_QUALITY}; no quality work today, endurance instead.`);
    return { ...out, gate: 'endurance', family: 'steady', targetLoad: Math.min(out.targetLoad ?? 55, 55) };
  }
  if (growth != null && growth > ceiling) {
    const trimmed = out.targetLoad != null ? Math.round(out.targetLoad * AFI_TRIM_FACTOR) : null;
    rationale.push(`GATE-AFI: fatigue grew ${Math.round(growth * 100)}% in four days, past the ${Math.round(ceiling * 100)}% ceiling; dose trimmed by a quarter${trimmed != null ? ` to ${trimmed} RSS` : ''}.`);
    out.targetLoad = trimmed;
    out.gate = 'trim';
  }
  if (call === 'modify') {
    rationale.push('RDY-3-modify: shorter version today — first block only, keep the intensity.');
    out.modify = true;
    out.gate = out.gate ? `${out.gate}+modify` : 'modify';
  }
  return out;
}

// ─── The designer ────────────────────────────────────────────────────────────

/**
 * @param {object} args
 * @param {object} args.session   { type, durationMin, targetLoad, weekInBlock, title }
 * @param {object} args.athlete   from athleteDesignInputs.js; every field optional
 * @param {Date|string} [args.now]
 * @returns {object} see module header; `prescription` is null for steady / rest / off-bike days
 */
export function designSession({ session, athlete = {}, now = null } = {}) {
  const rationale = [];
  const type = norm(session?.type);
  const familyRaw = designFamily(type);
  const durationMin = Number(session?.durationMin) > 0 ? Math.round(Number(session.durationMin)) : 60;
  const targetLoad = Number(session?.targetLoad) > 0 ? Math.round(Number(session.targetLoad)) : null;

  if (familyRaw == null) {
    return { ok: false, reason: 'unknown_type', sessionType: type, durationMin, targetLoad, prescription: null, rationale: [] };
  }
  if (familyRaw === 'rest' || familyRaw === 'off_bike') {
    return { ok: false, reason: familyRaw, sessionType: type, durationMin, targetLoad, prescription: null, rationale: [] };
  }

  const gated = applyGates({ family: familyRaw, durationMin, targetLoad }, athlete, rationale);
  if (gated.family === 'rest') {
    return { ok: false, reason: 'rest', sessionType: 'rest', durationMin: 0, targetLoad: 0, prescription: null, gate: gated.gate, rationale };
  }
  if (gated.family === 'steady') {
    const eased = familyRaw !== 'steady';
    return {
      ok: false, reason: 'steady', sessionType: eased ? 'endurance' : type,
      durationMin: eased ? Math.min(durationMin, 75) : durationMin,
      targetLoad: gated.targetLoad ?? targetLoad, prescription: null, gate: gated.gate, rationale,
    };
  }

  const picked = chooseFormat(gated.family, {
    weekInBlock: session?.weekInBlock ?? 0,
    durationMin,
    pdShortTrend: athlete?.pdShortTrend ?? null,
    recoveryMode: athlete?.recoveryMode ?? 'standard',
    goalDurationMin: athlete?.goalDurationMin ?? null,
  });
  if (!picked) {
    return { ok: false, reason: 'unknown_type', sessionType: type, durationMin, targetLoad, prescription: null, rationale };
  }
  const { format, why } = picked;
  rationale.push(`${format.rule}: ${format.label} — ${why}`);

  const cal = calibrateFtp(athlete);
  rationale.push(cal.rationale);

  const parts = format.multi ?? [format];
  const blocks = parts.map((part) => {
    const band = calibrateBand({ ...format, ...part }, cal, athlete, rationale);
    return {
      sets: part.sets, range: part.repeats, work: part.work, recovery: part.recovery, setRecovery: part.setRecovery,
      pctMin: band.pctMin, pctMax: band.pctMax, wattsMin: band.wattsMin, wattsMax: band.wattsMax,
      notes: part.notes ?? format.notes,
    };
  });

  let sessionMin = durationMin;
  let budget = gated.targetLoad ?? targetLoad;
  if (gated.modify) {
    sessionMin = Math.max(30, Math.round(durationMin * 0.6));
    budget = budget != null ? Math.round(budget * MODIFY_SET_FACTOR) : null;
    for (const b of blocks) b.range = [b.range[0], Math.max(b.range[0], Math.ceil(b.range[1] * MODIFY_SET_FACTOR))];
  }

  const sized = sizeDose(blocks, { targetLoad: budget, durationMin: sessionMin }, rationale);

  const intervals = sized.blocks.map((b) => {
    const out = {
      repeats: b.repeats,
      duration_min: Math.round(b.work * 100) / 100,
      target_pct_ftp_min: b.pctMin,
      target_pct_ftp_max: b.pctMax,
      recovery_min: Math.round(b.recovery * 100) / 100,
      notes: b.notes,
    };
    if (b.sets > 1) {
      out.sets = b.sets;
      out.set_recovery_min = b.setRecovery;
    }
    if (b.wattsMin != null) {
      out.target_watts_min = b.wattsMin;
      out.target_watts_max = b.wattsMax;
    }
    return out;
  });

  if (cal.source === 'none') {
    intervals[0].notes = `${intervals[0].notes} No power on file: ride these by feel — hard enough that the last one is a question.`;
  }

  const prescription = buildPrescription(intervals, 'designer', {
    warmupMin: sized.warmup,
    cooldownMin: sized.cooldown,
    rationale,
  });
  if (prescription) {
    prescription.format = format.id;
    prescription.predicted_load = sized.predicted;
    prescription.calibration = {
      ftp_used: cal.ftpUsed, stored_against: cal.storedAgainst, source: cal.source,
      ftp_age_days: cal.ageDays, window_days: cal.windowDays,
    };
    if (now) prescription.created_at = new Date(now).toISOString();
  }

  return {
    ok: true,
    sessionType: type,
    family: gated.family,
    format: { id: format.id, label: format.label, rule: format.rule },
    durationMin: sessionMin,
    targetLoad: budget,
    predictedLoad: sized.predicted,
    gate: gated.gate,
    prescription,
    rationale,
  };
}

export default designSession;
