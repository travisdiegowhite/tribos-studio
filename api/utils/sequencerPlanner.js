/**
 * Event-anchored sequence planner (Phase 2).
 *
 * Given today + an A/B/C race date, compose a sequence of blocks that
 * lands on race day. Works backwards from the race:
 *
 *     race day
 *     ├── taper          (2–14 days, default by tier)
 *     ├── race_specific  (7–14 days)        — A only by default
 *     ├── vo2            (9–21 days)        — A/B
 *     ├── threshold      (14–28 days)       — A/B
 *     ├── aerobic_build  (14–28 days)       — A/B with horizon ≥ ~10 weeks
 *     └── maintenance / reactivation (fills any leading gap from today)
 *
 * The algorithm prefers default durations but compresses to hard-min when
 * the calendar is short. If even the minimum sequence won't fit, it issues
 * a `validation_status = 'warning'` with a `code = 'horizon_too_short'`
 * message and drops the lowest-priority blocks (aerobic_build first, then
 * threshold, then vo2) until what remains fits.
 *
 * Output:
 *   {
 *     blocks: [{ block_type, start_date, end_date, duration_days, ... }],
 *     validation_status: 'valid' | 'warning' | 'conflict',
 *     validation_messages: [{ level, code, message }],
 *     horizon_event: { id, date, tier, name },
 *   }
 *
 * The caller (api/sequencer-event-anchored-init.js) is responsible for
 * persisting block_instances, sequences, and pre-generating session_prescriptions.
 */

const ONE_DAY_MS = 1000 * 60 * 60 * 24;

function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(startStr, endStr) {
  const a = new Date(startStr + 'T00:00:00Z');
  const b = new Date(endStr + 'T00:00:00Z');
  return Math.round((b.getTime() - a.getTime()) / ONE_DAY_MS);
}

// Hard duration bounds — must match TS block library.
const BOUNDS = {
  taper: { min: 2, max: 14 },
  race_specific: { min: 7, max: 14 },
  vo2: { min: 9, max: 21 },
  threshold: { min: 14, max: 28 },
  aerobic_build: { min: 14, max: 28 },
  reactivation: { min: 3, max: 10 },
  recovery: { min: 3, max: 10 },
  maintenance: { min: 7, max: 84 },
};

/**
 * Default duration for each build-block by event tier and coefficients.
 * Mirrors TS default_duration() functions, but inlined and pure.
 */
function defaultDurations(tier, coefficients) {
  // Taper: A=12, B=6, C=3 (taper.ts default_duration)
  const taper = tier === 'A' ? 12 : tier === 'B' ? 6 : 3;
  // Race-specific (A only by default; the planner will skip for B/C unless
  // explicitly requested by the caller). 10 days is the rounded typical.
  const raceSpecific = 10;
  // VO2: 14 days (vo2.ts)
  const vo2 = 14;
  // Threshold: 21 days when calendar is open (threshold.ts, slack ≥ 21d)
  const threshold = 21;
  // Aerobic build: 14 days default (aerobicBuild.ts)
  const aerobicBuild = 14;

  // Conservative recovery_block_days_added effectively bumps sandwich
  // tolerances; we don't change build-block duration here, but we DO add
  // 1 day to the leading reactivation if conservative mode is set.
  const reactivationBump = coefficients?.recovery_block_days_added ?? 0;

  return {
    taper,
    race_specific: raceSpecific,
    vo2,
    threshold,
    aerobic_build: aerobicBuild,
    reactivation: 7 + reactivationBump,
  };
}

/**
 * Compose the build-blocks chain for a tier. Returns the ordered chain from
 * earliest (aerobic_build) to latest (taper).
 *
 * Tier policy:
 *   - A: aerobic_build → threshold → vo2 → race_specific → taper
 *   - B: threshold → vo2 → taper                         (skip aerobic_build, race_specific)
 *   - C: vo2 → taper                                     (compressed)
 *
 * The caller can drop the leading blocks if the horizon is short.
 */
function defaultChainForTier(tier) {
  if (tier === 'A') {
    return ['aerobic_build', 'threshold', 'vo2', 'race_specific', 'taper'];
  }
  if (tier === 'B') {
    return ['threshold', 'vo2', 'taper'];
  }
  return ['vo2', 'taper'];
}

/**
 * Build the block sequence anchored to a race date. Pure: does no I/O.
 *
 * @param {object} params
 * @param {string} params.today YYYY-MM-DD (today, inclusive)
 * @param {string} params.race_date YYYY-MM-DD
 * @param {'A'|'B'|'C'} params.tier
 * @param {object} params.coefficients MastersFactor
 * @param {string} [params.race_name] passed through to first block's notes
 * @returns {{
 *   blocks: Array<{block_type:string,start_date:string,end_date:string,duration_days:number,is_leading_filler?:boolean}>,
 *   validation_status: 'valid'|'warning'|'conflict',
 *   validation_messages: Array<{level:'info'|'warning'|'error',code:string,message:string}>,
 *   horizon_days: number,
 *   chain_used: string[]
 * }}
 */
export function buildEventAnchoredSequence({
  today,
  race_date,
  tier,
  coefficients,
}) {
  const messages = [];
  const horizonDays = daysBetween(today, race_date);

  if (horizonDays <= 0) {
    return {
      blocks: [],
      validation_status: 'conflict',
      validation_messages: [
        {
          level: 'error',
          code: 'race_in_past',
          message: 'Race date must be after today.',
        },
      ],
      horizon_days: horizonDays,
      chain_used: [],
    };
  }

  const defaults = defaultDurations(tier, coefficients);

  // Race day itself is excluded from the plan; the last day of the taper is
  // race_date - 1 (we let the user race on race day with no prescription).
  // So the available window for blocks is [today, race_date - 1] inclusive,
  // which is exactly horizonDays days.
  let availableDays = horizonDays;

  // Start with the full chain for this tier, then drop earlier blocks
  // (aerobic_build → threshold → vo2 → race_specific → taper) until the
  // chain at minimum durations fits.
  let chain = defaultChainForTier(tier);

  function chainMinDays(c) {
    return c.reduce((sum, b) => sum + BOUNDS[b].min, 0);
  }

  function chainDefaultDays(c) {
    return c.reduce((sum, b) => sum + (defaults[b] ?? BOUNDS[b].min), 0);
  }

  // Drop leading blocks until the minimum chain fits the horizon.
  while (chain.length > 1 && chainMinDays(chain) > availableDays) {
    const dropped = chain.shift();
    messages.push({
      level: 'warning',
      code: 'horizon_compressed',
      message: `Skipped ${dropped} block — race only ${horizonDays} days out.`,
    });
  }

  if (chainMinDays(chain) > availableDays) {
    // Even a single taper doesn't fit. Compress taper to whatever's left.
    const taperLen = Math.max(2, availableDays);
    return {
      blocks: [
        {
          block_type: 'taper',
          start_date: today,
          end_date: addDays(today, Math.max(0, taperLen - 1)),
          duration_days: taperLen,
        },
      ],
      validation_status: 'warning',
      validation_messages: [
        ...messages,
        {
          level: 'warning',
          code: 'horizon_too_short',
          message: `Race is only ${horizonDays} days out — running a compressed taper only.`,
        },
      ],
      horizon_days: horizonDays,
      chain_used: ['taper'],
    };
  }

  // Now allocate durations greedily: start with default, scale down if needed.
  const defaultTotal = chainDefaultDays(chain);
  let allocations;

  if (defaultTotal <= availableDays) {
    // Everything fits at default; the remaining slack becomes leading filler.
    allocations = chain.map((b) => defaults[b] ?? BOUNDS[b].min);
  } else {
    // Scale down each block proportionally toward its min but never below.
    // We compute extra = defaultTotal - availableDays, then trim proportionally
    // from blocks whose default > min, in order: aerobic_build first
    // (most expendable), then threshold, then vo2, then race_specific, then taper.
    const order = ['aerobic_build', 'threshold', 'vo2', 'race_specific', 'taper'];
    const draft = chain.map((b) => defaults[b] ?? BOUNDS[b].min);
    let extra = defaultTotal - availableDays;
    for (const target of order) {
      if (extra <= 0) break;
      const idx = chain.indexOf(target);
      if (idx === -1) continue;
      const min = BOUNDS[target].min;
      const slack = draft[idx] - min;
      const trim = Math.min(slack, extra);
      draft[idx] -= trim;
      extra -= trim;
    }
    allocations = draft;
    messages.push({
      level: 'info',
      code: 'horizon_tight',
      message: `Compressed build-block durations to fit ${horizonDays}-day horizon.`,
    });
  }

  // Lay out from race day backwards.
  // taper.end = race_date - 1
  const blocks = [];
  let cursorEnd = addDays(race_date, -1);
  for (let i = chain.length - 1; i >= 0; i--) {
    const blockType = chain[i];
    const len = allocations[i];
    const start = addDays(cursorEnd, -(len - 1));
    blocks.unshift({
      block_type: blockType,
      start_date: start,
      end_date: cursorEnd,
      duration_days: len,
    });
    cursorEnd = addDays(start, -1);
  }

  // Leading filler from today → first block's start_date - 1
  const firstStart = blocks[0].start_date;
  const fillerDays = daysBetween(today, firstStart);
  if (fillerDays > 0) {
    // <14 days: reactivation, ≥14: maintenance until reactivation pre-roll
    if (fillerDays <= 14) {
      blocks.unshift({
        block_type: 'reactivation',
        start_date: today,
        end_date: addDays(firstStart, -1),
        duration_days: fillerDays,
        is_leading_filler: true,
      });
    } else {
      // Maintenance fills the front, but leave the last `defaults.reactivation`
      // days for a reactivation block right before the build chain starts.
      const reactivationLen = Math.min(defaults.reactivation, fillerDays);
      const maintenanceLen = fillerDays - reactivationLen;
      if (maintenanceLen > 0) {
        blocks.unshift({
          block_type: 'maintenance',
          start_date: today,
          end_date: addDays(today, maintenanceLen - 1),
          duration_days: maintenanceLen,
          is_leading_filler: true,
        });
      }
      blocks.splice(maintenanceLen > 0 ? 1 : 0, 0, {
        block_type: 'reactivation',
        start_date: addDays(today, maintenanceLen),
        end_date: addDays(firstStart, -1),
        duration_days: reactivationLen,
        is_leading_filler: true,
      });
    }
  }

  const validation_status = messages.some((m) => m.level === 'warning')
    ? 'warning'
    : 'valid';

  return {
    blocks,
    validation_status,
    validation_messages: messages,
    horizon_days: horizonDays,
    chain_used: chain,
  };
}

export const __test__ = {
  defaultChainForTier,
  defaultDurations,
  daysBetween,
  addDays,
  BOUNDS,
};
