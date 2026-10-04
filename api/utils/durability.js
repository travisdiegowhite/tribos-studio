/**
 * Durability — Coaching Bible Phase 4 (docs/coaching-bible/IMPLEMENTATION-BRIEF.md).
 *
 * Two halves, both pure:
 *
 *  - Per ride, at FIT ingestion (fitParser.js → ride_analytics.durability):
 *    the best 5-minute power for each 100 kJ band of work done BEFORE the
 *    effort started, and the efficiency drift of a long steady ride. Stored
 *    in kJ, not kJ/kg, so a later weight change re-bins the same ride
 *    correctly.
 *
 *  - Per athlete, in toRiderState: the two RiderState fields the DUR rules
 *    read, from 90 days of those per-ride blocks.
 *
 * The same rule governs this file as toRiderState.js: a number we cannot
 * stand behind is null. Two guards follow from it.
 *
 *  - A "fatigued" 5-minute best only counts if the athlete was actually
 *    trying. Best-vs-best over 90 days otherwise reads every long easy ride
 *    as a 30% fade, and DUR-1 would tell a rider who never pushed late that
 *    they fall apart late. Trying is read from heart rate: the late window's
 *    mean HR must reach EFFORT_HR_RATIO of the fresh best's. No HR on either
 *    side → no verdict. That costs power-only riders the field; a wrong
 *    verdict would cost more.
 *
 *  - Decoupling only comes from a ride whose power held steady between the
 *    first and last third. A ride with its hard work at the end raises power
 *    and heart rate together and would read as no drift at all.
 */

export const BUCKET_KJ = 100;
export const EFFORT_S = 300;
export const FRESH_MAX_KJ_PER_KG = 10;
export const FATIGUED_MIN_KJ_PER_KG = 20;
export const EFFORT_HR_RATIO = 0.9;

export const LONG_RIDE_MIN_S = 2 * 3600;
export const WARMUP_SKIP_S = 600;
export const STEADY_POWER_TOLERANCE = 0.1;
export const MIN_HR_COVERAGE = 0.9;
export const DECOUPLING_LOOKBACK_DAYS = 42;

/** A gap longer than this between samples is a pause, not riding. */
const MAX_GAP_S = 10;
const MAX_SERIES_S = 12 * 3600;
const DAY_MS = 86400000;

const round = (v, dp) => Math.round(v * 10 ** dp) / 10 ** dp;

/**
 * Resample FIT data points to one value per second of moving time. Smart
 * recording writes a sample every 1–5 s; each sample stands for the seconds
 * until the next one. Pauses collapse to one second so a café stop neither
 * adds work nor splits a 5-minute window.
 *
 * @param {Array<{timestamp: string, power: number|null, heartRate: number|null}>} points
 * @returns {{ power: number[], hr: (number|null)[] }}
 */
export function toOneHz(points) {
  const power = [];
  const hr = [];
  let prevT = null;
  for (let i = 0; i < (points?.length || 0); i++) {
    const p = points[i];
    const t = Date.parse(p?.timestamp);
    if (Number.isNaN(t)) continue;
    const next = points[i + 1] ? Date.parse(points[i + 1].timestamp) : NaN;
    if (prevT !== null && t <= prevT) continue;
    prevT = t;
    let dt = Number.isNaN(next) ? 1 : Math.round((next - t) / 1000);
    if (dt < 1 || dt > MAX_GAP_S) dt = 1;
    for (let k = 0; k < dt && power.length < MAX_SERIES_S; k++) {
      power.push(p.power > 0 ? p.power : 0);
      hr.push(p.heartRate > 0 ? p.heartRate : null);
    }
  }
  return { power, hr };
}

/** Best 5-minute power per band of prior work: [[bandStartKj, watts, meanHr|null], …]. */
function bestEffortsByPriorWork(power, hr) {
  const n = power.length;
  if (n < EFFORT_S) return null;
  const P = new Float64Array(n + 1);
  const H = new Float64Array(n + 1);
  const C = new Uint32Array(n + 1);
  for (let i = 0; i < n; i++) {
    P[i + 1] = P[i] + power[i];
    H[i + 1] = H[i] + (hr[i] ?? 0);
    C[i + 1] = C[i] + (hr[i] != null ? 1 : 0);
  }
  if (P[n] === 0) return null;

  const best = new Map();
  for (let s = 0; s + EFFORT_S <= n; s++) {
    const e = s + EFFORT_S;
    const watts = (P[e] - P[s]) / EFFORT_S;
    const band = Math.floor(P[s] / 1000 / BUCKET_KJ) * BUCKET_KJ;
    const cur = best.get(band);
    if (cur && cur.watts >= watts) continue;
    const hrCount = C[e] - C[s];
    best.set(band, { watts, hr: hrCount >= EFFORT_S * 0.8 ? (H[e] - H[s]) / hrCount : null });
  }
  return [...best.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([band, b]) => [band, Math.round(b.watts), b.hr == null ? null : Math.round(b.hr)]);
}

/** Efficiency (power ÷ heart rate) over pedalling seconds with HR. */
function efficiency(power, hr, from, to) {
  let p = 0;
  let h = 0;
  let c = 0;
  for (let i = from; i < to; i++) {
    if (power[i] > 0 && hr[i] != null) {
      p += power[i];
      h += hr[i];
      c++;
    }
  }
  return c < (to - from) * 0.5 ? null : { watts: p / c, ef: p / h };
}

/** First-third vs last-third efficiency drop on a long steady ride, or null. */
function longRideDecoupling(power, hr) {
  const n = power.length;
  if (n < LONG_RIDE_MIN_S) return null;
  if (hr.filter((v) => v != null).length < n * MIN_HR_COVERAGE) return null;
  const third = Math.floor((n - WARMUP_SKIP_S) / 3);
  const first = efficiency(power, hr, WARMUP_SKIP_S, WARMUP_SKIP_S + third);
  const last = efficiency(power, hr, n - third, n);
  if (!first || !last) return null;
  if (Math.abs(last.watts / first.watts - 1) > STEADY_POWER_TOLERANCE) return null;
  return {
    decoupling: round((first.ef - last.ef) / first.ef, 3),
    ef_first: round(first.ef, 3),
    ef_last: round(last.ef, 3),
    duration_s: n,
  };
}

/**
 * The per-ride block stored at ride_analytics.durability, or null when the
 * ride has no power.
 */
export function computeRideDurability(points) {
  const { power, hr } = toOneHz(points);
  const efforts = bestEffortsByPriorWork(power, hr);
  if (!efforts) return null;
  return {
    version: 1,
    bucket_kj: BUCKET_KJ,
    total_kj: Math.round(power.reduce((s, w) => s + w, 0) / 1000),
    p300_by_prior_kj: efforts,
    decoupling: longRideDecoupling(power, hr),
  };
}

// ─── Per athlete ─────────────────────────────────────────────────────────────

/**
 * RiderState.freshVsFatiguedDrop5min: 1 − (best 5-min after ≥20 kJ/kg) ÷
 * (best 5-min before 10 kJ/kg), over the rides passed in (the caller's
 * 90-day window). A band counts as fresh only if it ends below the line,
 * and as fatigued only if it starts above it, so a band straddling either
 * line is left out rather than guessed into one side.
 *
 * @param {Array<{durability: object|null}>} rides
 * @param {number|null} weightKg
 */
export function freshVsFatiguedDrop(rides, weightKg) {
  if (!(weightKg > 30 && weightKg < 200)) return null;
  const freshLimit = FRESH_MAX_KJ_PER_KG * weightKg;
  const fatiguedFrom = FATIGUED_MIN_KJ_PER_KG * weightKg;

  const entries = [];
  for (const r of rides || []) {
    const d = r?.durability;
    if (d?.version !== 1 || !Array.isArray(d.p300_by_prior_kj)) continue;
    for (const [kj, watts, hr] of d.p300_by_prior_kj) entries.push({ kj, watts, hr, size: d.bucket_kj });
  }

  const fresh = entries
    .filter((e) => e.kj + e.size <= freshLimit)
    .reduce((b, e) => (!b || e.watts > b.watts ? e : b), null);
  if (!fresh || fresh.hr == null || !(fresh.watts > 0)) return null;

  const fatigued = entries
    .filter((e) => e.kj >= fatiguedFrom && e.hr != null && e.hr >= fresh.hr * EFFORT_HR_RATIO)
    .reduce((b, e) => (!b || e.watts > b.watts ? e : b), null);
  if (!fatigued) return null;

  return round(Math.max(0, 1 - fatigued.watts / fresh.watts), 3);
}

/**
 * RiderState.longRideDecoupling: the drift on the most recent long steady
 * ride in the last six weeks. "The last long ride" is what DUR-2 talks
 * about; an older one says nothing about today's base.
 *
 * @param {Array<{start_date: string, durability: object|null}>} rides
 * @param {string} todayStr YYYY-MM-DD
 */
export function latestDecoupling(rides, todayStr) {
  const today = Date.parse(`${todayStr}T23:59:59Z`);
  const latest = (rides || [])
    .filter((r) => r?.durability?.decoupling?.decoupling != null)
    .filter((r) => {
      const t = Date.parse(r.start_date);
      return !Number.isNaN(t) && t <= today && today - t <= DECOUPLING_LOOKBACK_DAYS * DAY_MS;
    })
    .sort((a, b) => Date.parse(b.start_date) - Date.parse(a.start_date))[0];
  return latest ? latest.durability.decoupling.decoupling : null;
}
