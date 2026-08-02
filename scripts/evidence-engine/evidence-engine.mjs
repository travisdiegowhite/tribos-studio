/**
 * Performance Evidence Engine — Phase 1 offline prototype.
 *
 * Reads cleaned activity + segment exports (read-only; see export-queries.sql)
 * and emits one structured verdict per week: does actual performance output
 * (power-duration bests, efficiency factor, repeat segments) run ahead of,
 * consistent with, or behind what the load model (TFI/FS) implies?
 *
 * Pure functions over plain data — no DB access, no writes. The same
 * computeWeekVerdict() is designed to be lifted into a Phase 2 job unchanged.
 */

export const DEFAULT_CONFIG = {
  // ── Signal 1: power-duration movement ────────────────────────────────
  pd: {
    windowDays: 21,           // trailing best-effort window
    baselineDays: 90,         // baseline period immediately before the window
    minBaselineRides: 5,      // rides with power curves in baseline to qualify
    minWindowRides: 2,        // rides with power curves in window to qualify
    // Weights per duration. 20-min tracks aerobic/threshold fitness best;
    // 1-min is the most motivation-sensitive so it gets the least weight.
    durationWeights: { p60: 0.2, p300: 0.3, p1200: 0.5 },
    aheadPct: 0.02,           // weighted movement >= +2% → positive evidence
    behindPct: -0.06,         // weighted movement <= −6% → negative evidence
    // Attempt gating — the core asymmetry. A trailing-window best can trail
    // the baseline best simply because no hard effort happened recently.
    // A duration only participates in the movement metric if the window
    // contains a comparable ATTEMPT (window best >= attemptRatio × baseline
    // best). No attempted durations → the signal reports "no recent max
    // efforts" and scores 0 instead of manufacturing decline.
    attemptRatio: 0.90,
  },

  // ── Signal 2: efficiency factor trend ────────────────────────────────
  ef: {
    windowDays: 35,           // 5-week trend window (brief allows 4–6)
    baselineDays: 180,        // athlete's own recent historical distribution
    minWindowRides: 3,
    minBaselineRides: 6,
    viMax: 1.12,              // "steady ride" gate; proposed from VI distribution
    minDurationS: 2400,       // ≥40 min
    excludeTrainer: true,     // indoor rides read hotter/cooler on HR; rare here
    aheadPct: 0.02,           // window mean EF >= baseline mean +2% → positive
    behindPct: -0.03,         // <= −3% → negative (HR noise + confounders)
    // Season straddle flag: if window months and baseline months fall in
    // different heat regimes (May–Sep vs Oct–Apr), confidence in a NEGATIVE
    // EF signal is halved — heat suppresses EF without fitness change.
    hotMonths: [5, 6, 7, 8, 9],
  },

  // ── Signal 3: repeat segments (supporting only) ──────────────────────
  seg: {
    horizonDays: 90,          // traversals considered
    windowDays: 21,           // must include at least one recent traversal
    minTraversals: 3,         // sane traversals within horizon to qualify
    minSpeedKmh: 8,           // implied-speed sanity gate (detector emits
    maxSpeedKmh: 45,          //   partial matches with impossible speeds)
    timeTolPct: 0.02,         // "equal time" tolerance
    hrLowerBpm: 3,            // "lower HR" must be ≥3 bpm to count
    powerHigherPct: 0.03,     // "higher power" must be ≥3%
  },

  // ── Verdict combination ──────────────────────────────────────────────
  weights: { pd: 0.4, ef: 0.4, seg: 0.2 },
  aheadScore: 0.4,            // renormalized weighted score thresholds
  behindScore: -0.4,
  // Hysteresis: a direct ahead↔behind flip needs a decisive score;
  // otherwise the week lands on consistent. Prevents adjacent-week
  // flip-flopping on threshold noise.
  decisiveScore: 0.7,

  // ── Model divergence ─────────────────────────────────────────────────
  model: {
    fatiguedFs: -10,          // FS <= this → model narrative "fatigued"
    freshFs: 5,               // FS >= this → model narrative "fresh"
  },
};

const DAY = 86400000;
const dstr = (t) => new Date(t).toISOString().slice(0, 10);
const round1 = (v) => Math.round(v * 10) / 10;
const pct = (v) => Math.round(v * 1000) / 10; // fraction → %, 1 decimal

function ridesBetween(rides, fromMs, toMs) {
  return rides.filter((r) => {
    const t = Date.parse(r.start_date);
    return t >= fromMs && t < toMs;
  });
}

// ── Signal 1: power-duration ───────────────────────────────────────────

export function pdSignal(rides, weekEndMs, cfg) {
  const c = cfg.pd;
  const winFrom = weekEndMs - c.windowDays * DAY;
  const baseFrom = winFrom - c.baselineDays * DAY;
  const hasCurve = (r) => r.p60 != null || r.p300 != null || r.p1200 != null;
  const win = ridesBetween(rides, winFrom, weekEndMs).filter(hasCurve);
  const base = ridesBetween(rides, baseFrom, winFrom).filter(hasCurve);

  if (base.length < c.minBaselineRides || win.length < c.minWindowRides) {
    return { qualified: false, reason: `curves: ${base.length} baseline (need ${c.minBaselineRides}), ${win.length} window (need ${c.minWindowRides})` };
  }

  const best = (set, key) => set.reduce((m, r) => (r[key] != null && r[key] > (m?.v ?? -1) ? { v: r[key], id: r.id, date: dstr(Date.parse(r.start_date)) } : m), null);
  const movements = {};
  let wSum = 0, sSum = 0, attempted = 0;
  for (const key of ['p60', 'p300', 'p1200']) {
    const b = best(base, key);
    const w = best(win, key);
    if (!b || !w) continue;
    const mv = (w.v - b.v) / b.v;
    const isAttempt = w.v >= b.v * c.attemptRatio;
    movements[key] = { windowBest: w.v, windowDate: w.date, windowActivity: w.id, baselineBest: b.v, baselineDate: b.date, movementPct: pct(mv), attempted: isAttempt };
    if (!isAttempt) continue; // no comparable effort at this duration — not evidence
    attempted++;
    wSum += cfg.pd.durationWeights[key];
    sSum += cfg.pd.durationWeights[key] * mv;
  }
  if (Object.keys(movements).length === 0) return { qualified: false, reason: 'no common durations' };
  if (attempted === 0) {
    return { qualified: true, score: 0, noAttempts: true, movementPct: null, movements, windowRides: win.length, baselineRides: base.length };
  }
  const movement = sSum / wSum;
  const score = movement >= c.aheadPct ? 1 : movement <= c.behindPct ? -1 : 0;
  return { qualified: true, score, noAttempts: false, movementPct: pct(movement), movements, windowRides: win.length, baselineRides: base.length };
}

// ── Signal 2: efficiency factor ────────────────────────────────────────

// EF is average power ÷ average HR — ALWAYS avg power, never EP. EP would be
// variability-robust, but EP coverage is era-dependent (absent Dec 2024–Apr
// 2025), and EP ≥ avg power by construction, so mixing the two inside one
// comparison manufactures phantom EF swings of ±15-20%. Consistency beats
// robustness; the VI gate supplies the steadiness control instead.
// VI falls back to EP/avgPower where ride_analytics is missing. Rides where
// steadiness is UNKNOWN are accepted with a flag rather than discarded:
// dropping them blinds the engine through the strongest historical build.
function viOf(r) {
  if (r.vi != null) return r.vi;
  if (r.ep != null && r.avg_w) return r.ep / r.avg_w;
  return null;
}
function efValue(r) {
  return r.avg_w / r.avg_hr;
}
function efQualifies(r, c) {
  if (r.avg_w == null || r.avg_hr == null || (r.moving_time ?? 0) < c.minDurationS) return false;
  if (c.excludeTrainer && r.trainer === true) return false;
  const vi = viOf(r);
  return vi == null || vi <= c.viMax;
}

export function efSignal(rides, weekEndMs, cfg) {
  const c = cfg.ef;
  const winFrom = weekEndMs - c.windowDays * DAY;
  const baseFrom = winFrom - c.baselineDays * DAY;
  const win = ridesBetween(rides, winFrom, weekEndMs).filter((r) => efQualifies(r, c));
  const base = ridesBetween(rides, baseFrom, winFrom).filter((r) => efQualifies(r, c));

  if (win.length < c.minWindowRides || base.length < c.minBaselineRides) {
    return { qualified: false, reason: `steady rides: ${base.length} baseline (need ${c.minBaselineRides}), ${win.length} window (need ${c.minWindowRides})` };
  }

  const efOf = efValue;
  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const viUnknownShare = mean(win.map((r) => (viOf(r) == null ? 1 : 0)));
  const winEfs = win.map(efOf);
  const baseEfs = base.map(efOf);
  const winMean = mean(winEfs);
  const baseMean = mean(baseEfs);

  // All-time percentile: where the window mean sits in the athlete's entire
  // qualifying-ride EF history before the window. A trend-vs-recent-baseline
  // hides a gain once it is >6 weeks old (it enters the baseline); the
  // percentile is how "EF sits at its all-time best" stays visible.
  const allPrior = rides.filter((r) => Date.parse(r.start_date) < winFrom && efQualifies(r, c)).map(efOf);
  let allTimePct = null;
  if (allPrior.length >= 20) {
    allTimePct = allPrior.filter((v) => v < winMean).length / allPrior.length;
  }
  const sd = Math.sqrt(mean(baseEfs.map((v) => (v - baseMean) ** 2))) || 1e-9;
  const delta = (winMean - baseMean) / baseMean;
  const z = (winMean - baseMean) / sd;

  const inHot = (ms) => c.hotMonths.includes(new Date(ms).getUTCMonth() + 1);
  const winHot = mean(win.map((r) => (inHot(Date.parse(r.start_date)) ? 1 : 0)));
  const baseHot = mean(base.map((r) => (inHot(Date.parse(r.start_date)) ? 1 : 0)));
  const seasonStraddle = Math.abs(winHot - baseHot) > 0.5;

  let score = delta >= c.aheadPct ? 1 : delta <= c.behindPct ? -1 : 0;
  // Season asymmetry: an EF decline measured across a season boundary (in
  // either direction — summer heat raises HR; winter cold and indoor riding
  // shift HR response too) is confounded and demoted to neutral. An EF GAIN
  // achieved INTO the hot season is, if anything, understated — kept.
  let seasonNote = null;
  if (score === -1 && seasonStraddle) {
    score = 0;
    seasonNote = winHot > baseHot
      ? 'EF decline coincides with hot-season window vs cooler baseline; demoted to neutral'
      : 'EF decline measured across a season boundary (cool window vs warmer baseline); demoted to neutral';
  }
  const allTimeHigh = allTimePct != null && allTimePct >= 0.85;
  if (allTimeHigh && score >= 0) score = 1;
  return {
    qualified: true, score, allTimePct: allTimePct == null ? null : Math.round(allTimePct * 100) / 100, allTimeHigh,
    deltaPct: pct(delta), z: Math.round(z * 100) / 100,
    windowMean: Math.round(winMean * 1000) / 1000, baselineMean: Math.round(baseMean * 1000) / 1000,
    windowRides: win.length, baselineRides: base.length,
    windowSpan: `${dstr(winFrom)}..${dstr(weekEndMs - 1)}`,
    seasonStraddle, seasonNote,
    viUnknownShare: Math.round(viUnknownShare * 100) / 100,
    windowRideIds: win.map((r) => r.id),
  };
}

// ── Signal 3: repeat segments ──────────────────────────────────────────

function saneTraversal(t, c) {
  if (t.w == null || t.hr == null || !t.dur_s) return false;
  const kmh = (t.dist_m / t.dur_s) * 3.6;
  return kmh >= c.minSpeedKmh && kmh <= c.maxSpeedKmh;
}

export function segSignal(traversals, weekEndMs, cfg) {
  const c = cfg.seg;
  const horizonFrom = weekEndMs - c.horizonDays * DAY;
  const winFrom = weekEndMs - c.windowDays * DAY;

  const bySeg = new Map();
  for (const t of traversals) {
    const ts = Date.parse(t.ridden_at);
    if (ts < horizonFrom || ts >= weekEndMs || !saneTraversal(t, c)) continue;
    if (!bySeg.has(t.seg)) bySeg.set(t.seg, []);
    bySeg.get(t.seg).push({ ...t, ts });
  }

  const comparisons = [];
  for (const [seg, list] of bySeg) {
    if (list.length < c.minTraversals) continue;
    list.sort((a, b) => a.ts - b.ts);
    const recent = list.filter((t) => t.ts >= winFrom);
    if (recent.length === 0) continue;

    const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor((s.length - 1) / 2)]; };

    // Evaluate EVERY window traversal against the traversals before it —
    // an easy recovery pass must not mask a strong pass earlier in the
    // window. Fitness signature is a capability demonstration (any one
    // window pass showing it counts); decline requires EVERY evaluated
    // window pass to show it.
    const evals = [];
    for (const t of recent) {
      const prior = list.filter((p) => p.ts < t.ts);
      if (prior.length < 2) continue;
      const pTime = median(prior.map((p) => p.dur_s));
      const pHr = median(prior.map((p) => p.hr));
      const pW = median(prior.map((p) => p.w));

      const fasterOrEqual = t.dur_s <= pTime * (1 + c.timeTolPct);
      const lowerHr = t.hr <= pHr - c.hrLowerBpm;
      const equalOrLowerHr = t.hr <= pHr + 1;
      const higherPower = t.w >= pW * (1 + c.powerHigherPct);
      const equalPower = Math.abs(t.w - pW) / pW <= c.powerHigherPct;
      const slower = t.dur_s > pTime * (1 + c.timeTolPct);
      const higherHr = t.hr > pHr + c.hrLowerBpm;

      // The fitness signature: same-or-better output at lower cost.
      // A max-effort PR (faster AND much higher HR) proves motivation,
      // not fitness → neutral.
      let s = 0, signature = 'neutral', mode = null;
      if (fasterOrEqual && lowerHr) { s = 1; signature = 'fitness_gain'; mode = 'time'; }
      else if (higherPower && equalOrLowerHr) { s = 1; signature = 'fitness_gain'; mode = 'power'; }
      else if (equalPower && lowerHr) { s = 1; signature = 'fitness_gain'; mode = 'economy'; }
      else if (slower && higherHr) { s = -1; signature = 'decline'; }
      else if (fasterOrEqual && higherHr) { signature = 'max_effort_pr'; }

      evals.push({
        score: s, signature, mode,
        pass: { date: dstr(t.ts), dur_s: t.dur_s, w: t.w, hr: t.hr, activity_id: t.activity_id },
        priorMedian: { dur_s: pTime, w: pW, hr: pHr, n: prior.length },
      });
    }
    if (evals.length === 0) continue;
    const gain = evals.find((e) => e.signature === 'fitness_gain');
    const allDecline = evals.length >= 2 && evals.every((e) => e.signature === 'decline');
    const segScore = gain ? 1 : allDecline ? -1 : 0;
    const receipt = gain ?? evals[evals.length - 1];
    comparisons.push({ segment: seg, score: segScore, signature: receipt.signature, mode: receipt.mode, latest: receipt.pass, priorMedian: receipt.priorMedian, passesEvaluated: evals.length });
  }

  if (comparisons.length === 0) return { qualified: false, reason: 'no segment with enough sane traversals and a recent pass' };
  const score = Math.sign(comparisons.reduce((s, x) => s + x.score, 0));
  return { qualified: true, score, comparisons };
}

// ── Confidence ─────────────────────────────────────────────────────────

export function confidence(pd, ef, seg, cfg) {
  let conf = 0;
  const primary = [pd, ef].filter((s) => s.qualified);
  if (primary.length === 0) return 0;
  // A PD signal with no attempted max efforts is real but weak evidence
  // ("nothing disproves the model") — half weight in confidence.
  conf += pd.qualified ? (pd.noAttempts ? 0.175 : 0.35) : 0;
  conf += ef.qualified ? 0.35 : 0;
  if (seg.qualified) conf += 0.10;
  const scores = [pd, ef, seg].filter((s) => s.qualified).map((s) => s.score);
  const nonZero = scores.filter((s) => s !== 0);
  if (scores.length >= 2) {
    const allAgree = nonZero.length >= 2 && new Set(nonZero).size === 1;
    const disagree = new Set(nonZero).size > 1;
    if (allAgree) conf += 0.20;
    if (disagree) conf -= 0.15;
  }
  const rich = (pd.qualified && pd.windowRides >= 4) && (ef.qualified && ef.windowRides >= 4);
  if (rich) conf += 0.10;
  // Hot-season negative-EF demotion already handled in scoring; a flagged
  // straddle still slightly reduces trust in the EF component.
  if (ef.qualified && ef.seasonStraddle) conf -= 0.05;
  // Steadiness-unknown rides (no VI available) dilute the EF sample.
  if (ef.qualified && ef.viUnknownShare > 0.5) conf -= 0.10;
  return Math.max(0, Math.min(1, Math.round(conf * 100) / 100));
}

// ── Verdict ────────────────────────────────────────────────────────────
//
// The verdict is a RESIDUAL: demonstrated output direction vs the direction
// the load model implies over the same span. Output falling while TFI falls
// is consistent (detraining both agree on); output holding or rising while
// the model reads fatigued/declining is ahead; output lagging a rising,
// fresh model is behind.

// Signal direction: 'up' | 'flat' | 'down' | null (null = no usable direction)
function pdDirection(pd, cfg) {
  if (!pd.qualified || pd.noAttempts) return null;
  const mv = pd.movementPct / 100;
  return mv >= cfg.pd.aheadPct ? 'up' : mv <= cfg.pd.behindPct ? 'down' : 'flat';
}
function efDirection(ef, cfg) {
  if (!ef.qualified) return null;
  if (ef.allTimeHigh) return 'up';
  const d = ef.deltaPct / 100;
  if (d <= cfg.ef.behindPct) return ef.seasonStraddle ? null : 'down'; // straddled declines are confounded
  return d >= cfg.ef.aheadPct ? 'up' : 'flat';
}

// Model-implied output direction over a signal's own comparison span:
// TFI at window-mid vs TFI at baseline-mid.
function modelDirection(dailyTfi, weekEndMs, windowDays, baselineDays) {
  const at = (ms) => {
    for (let back = 0; back < 10; back++) {
      const d = dstr(ms - back * DAY);
      if (dailyTfi.has(d)) return Number(dailyTfi.get(d));
    }
    return null;
  };
  const now = at(weekEndMs - Math.round(windowDays / 2) * DAY);
  const then = at(weekEndMs - (windowDays + Math.round(baselineDays / 2)) * DAY);
  if (now == null || then == null) return null;
  if (now < 10 || then < 10) { // % explodes on a near-zero base; use absolute
    return now - then >= 3 ? 'up' : now - then <= -3 ? 'down' : 'flat';
  }
  const d = now / then - 1;
  return d >= 0.05 ? 'up' : d <= -0.05 ? 'down' : 'flat';
}

// Residual matrix (no fatigue): what does signal-vs-model imply?
// "Output flat while the model says the base fell" is real but partial
// evidence — half credit, so an off-season of flat EF reads as gentle
// reassurance, not months of high-scoring "ahead".
function residual(sig, mod) {
  if (sig == null) return null;
  if (mod == null) return sig === 'up' ? 1 : sig === 'down' ? -1 : 0; // no model → absolute
  if (sig === 'up') return mod === 'up' ? 0 : 1;
  if (sig === 'flat') return mod === 'down' ? 0.5 : 0;
  return mod === 'down' ? 0 : -1; // sig === 'down'
}

// Under meaningful fatigue (FS <= fatiguedFs) the model itself expects
// suppressed current output: falling output is expected (0), holding output
// is over-expectation (half credit), improving output despite fatigue is
// the strongest single observation the engine can make (+1).
function residualFatigued(sig) {
  if (sig == null) return null;
  return sig === 'down' ? 0 : sig === 'flat' ? 0.5 : 1;
}

export function computeWeekVerdict({ rides, segments, model, dailyTfi }, weekStart, cfg = DEFAULT_CONFIG, prevVerdict = null) {
  const weekStartMs = Date.parse(`${weekStart}T00:00:00Z`);
  const weekEndMs = weekStartMs + 7 * DAY;

  const pd = pdSignal(rides, weekEndMs, cfg);
  const ef = efSignal(rides, weekEndMs, cfg);
  const seg = segSignal(segments, weekEndMs, cfg);

  const m = model?.get(weekStart) ?? null;
  const fatigued = m != null && m.fs <= cfg.model.fatiguedFs;

  const pdDir = pdDirection(pd, cfg);
  const efDir = efDirection(ef, cfg);
  const pdMod = dailyTfi ? modelDirection(dailyTfi, weekEndMs, cfg.pd.windowDays, cfg.pd.baselineDays) : null;
  const efMod = dailyTfi ? modelDirection(dailyTfi, weekEndMs, cfg.ef.windowDays, cfg.ef.baselineDays) : null;

  const pdRes = fatigued ? residualFatigued(pdDir) : residual(pdDir, pdMod);
  const efRes = fatigued ? residualFatigued(efDir) : residual(efDir, efMod);
  const segRes = seg.qualified ? seg.score : null; // same-course comparison is already absolute

  const parts = [];
  if (pdRes != null) parts.push({ w: cfg.weights.pd, s: pdRes });
  if (efRes != null) parts.push({ w: cfg.weights.ef, s: efRes });
  if (segRes != null) parts.push({ w: cfg.weights.seg, s: segRes });

  // A signal that qualified but yielded no usable direction (PD no-attempts,
  // straddle-demoted EF) still counts as "observed, nothing contradicts" —
  // it participates as 0 so a lone supporting segment can never carry a
  // verdict by itself.
  if (pd.qualified && pdRes == null) parts.push({ w: cfg.weights.pd / 2, s: 0 });
  if (ef.qualified && efRes == null) parts.push({ w: cfg.weights.ef / 2, s: 0 });

  const primaryQualified = pd.qualified || ef.qualified;
  let verdictRaw, score = null;
  if (!primaryQualified) {
    verdictRaw = 'insufficient_data';
  } else {
    const wSum = parts.reduce((a, p) => a + p.w, 0);
    score = wSum === 0 ? 0 : Math.round((parts.reduce((a, p) => a + p.w * p.s, 0) / wSum) * 100) / 100;
    verdictRaw = score >= cfg.aheadScore ? 'ahead' : score <= cfg.behindScore ? 'behind' : 'consistent';
  }

  // Hysteresis: direct ahead↔behind transitions need a decisive score.
  let verdict = verdictRaw;
  if (prevVerdict && score != null) {
    const flip = (prevVerdict === 'ahead' && verdictRaw === 'behind') || (prevVerdict === 'behind' && verdictRaw === 'ahead');
    if (flip && Math.abs(score) < cfg.decisiveScore) verdict = 'consistent';
  }

  const conf = verdict === 'insufficient_data' ? 0 : confidence(pd, ef, seg, cfg);

  let modelDivergence = null;
  if (m) {
    const narrative = m.fs <= cfg.model.fatiguedFs ? 'fatigued' : m.fs >= cfg.model.freshFs ? 'fresh' : 'neutral';
    const disagrees = (verdict === 'ahead' && narrative === 'fatigued') || (verdict === 'behind' && narrative === 'fresh');
    modelDivergence = { tfi: m.tfi, fs: m.fs, modelNarrative: narrative, disagrees };
  }

  return {
    week: weekStart,
    verdict, verdictRaw, score, confidence: conf,
    directions: { pd: pdDir, ef: efDir, pdModel: pdMod, efModel: efMod, fatigued },
    signals: { power_duration: pd, efficiency_factor: ef, segments: seg },
    model_divergence: modelDivergence,
    narrative_facts: narrativeFacts(pd, ef, seg, verdict, fatigued),
  };
}

// ── Narrative facts (coach-ready receipts) ─────────────────────────────

export function narrativeFacts(pd, ef, seg, verdict, fatigued = false) {
  const facts = [];
  const label = { p60: '1-minute', p300: '5-minute', p1200: '20-minute' };

  if (pd.qualified && pd.noAttempts) {
    facts.push('No maximal efforts in the last 3 weeks to compare against your recent bests — power benchmarks are unchanged, not declined');
  }
  if (pd.qualified && !pd.noAttempts) {
    // Prefer a positive movement receipt at any duration; otherwise report the
    // most aerobic attempted duration, framed by load context when fatigued.
    const entries = ['p1200', 'p300', 'p60'].map((k) => ({ k, m: pd.movements[k] })).filter((x) => x.m && x.m.attempted);
    const positive = entries.filter((x) => x.m.movementPct >= 2).sort((a, b) => b.m.movementPct - a.m.movementPct)[0];
    const main = positive ?? entries[0];
    if (main) {
      const m = main.m;
      if (m.movementPct >= 2) {
        facts.push(`Best ${label[main.k]} power in the last 3 weeks: ${m.windowBest}W on ${m.windowDate}, up ${m.movementPct}% on your previous 90-day best (${m.baselineBest}W)`);
      } else if (m.movementPct <= -2 && fatigued) {
        facts.push(`Held ${m.windowBest}W for ${label[main.k].replace('-', ' ')}s on ${m.windowDate} in the middle of a heavy training block — ${Math.round((m.windowBest / m.baselineBest) * 100)}% of your fresh-legs best (${m.baselineBest}W, ${m.baselineDate})`);
      } else if (m.movementPct <= -2) {
        facts.push(`Best ${label[main.k]} power in the last 3 weeks: ${m.windowBest}W, down ${Math.abs(m.movementPct)}% vs the previous 90-day best (${m.baselineBest}W)`);
      }
    }
  }

  if (ef.qualified) {
    if (Math.abs(ef.deltaPct) >= 1) {
      const dir = ef.deltaPct > 0 ? 'more power per heartbeat' : 'less power per heartbeat';
      facts.push(`On steady rides the last 5 weeks you averaged ${ef.windowMean} W/bpm vs ${ef.baselineMean} over the prior 6 months — ${Math.abs(ef.deltaPct)}% ${dir}${ef.seasonNote ? ' (season change accounts for some of this)' : ''}`);
    } else if (ef.allTimePct != null && ef.allTimePct >= 0.7) {
      facts.push(`Your power-per-heartbeat on steady rides (${ef.windowMean} W/bpm) sits in the top ${Math.round((1 - ef.allTimePct) * 100)}% of every steady ride you've recorded${ef.seasonStraddle ? ' — in summer heat, which usually suppresses it' : ''}`);
    }
  }

  if (seg.qualified) {
    for (const cmp of seg.comparisons) {
      if (cmp.signature !== 'fitness_gain') continue;
      const dhr = cmp.priorMedian.hr - cmp.latest.hr;
      if (cmp.mode === 'power') {
        const dw = Math.round(((cmp.latest.w - cmp.priorMedian.w) / cmp.priorMedian.w) * 100);
        facts.push(`On "${cmp.segment}" (${cmp.latest.date}): ${dw}% more power at ${dhr} bpm lower heart rate than your typical run`);
      } else if (cmp.mode === 'economy') {
        facts.push(`On "${cmp.segment}" (${cmp.latest.date}): same power as your typical run at ${dhr} bpm lower heart rate`);
      } else {
        const dt = cmp.priorMedian.dur_s - cmp.latest.dur_s;
        facts.push(`On "${cmp.segment}" (${cmp.latest.date}): ${dt > 0 ? `${dt}s faster than` : 'same time as'} your typical run at ${dhr} bpm lower heart rate`);
      }
      break;
    }
  }

  if (facts.length === 0 && verdict !== 'insufficient_data') {
    facts.push('Recent performance output is tracking in line with your recent training — no notable movement in either direction');
  }
  return facts.slice(0, 4);
}
