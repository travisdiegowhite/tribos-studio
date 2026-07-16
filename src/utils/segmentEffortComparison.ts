/**
 * Segment Effort Comparison
 *
 * Pure comparison engine for the "Familiar Segments" panel: given this ride's
 * traversal of a training segment and the rider's past traversals of the SAME
 * segment (from training_segment_rides), it compares the effort holistically —
 * not just elapsed time, but effort (power / HR), output (speed / time),
 * efficiency (power per heartbeat, speed per watt), and pacing steadiness (VI).
 *
 * The point is to answer questions like "was I riding harder but less
 * efficiently here than I usually do?" rather than a Strava-style leaderboard.
 *
 * All functions are pure; data fetching lives in
 * src/hooks/useSegmentEffortComparison.ts.
 */

// ============================================================================
// TYPES
// ============================================================================

/** Row shape from training_segment_rides (see migration 047). */
export interface SegmentTraversal {
  id: string;
  segment_id: string;
  activity_id: string;
  ridden_at: string;
  avg_power: number | null;
  normalized_power: number | null;
  max_power: number | null;
  avg_hr: number | null;
  max_hr: number | null;
  duration_seconds: number;
  avg_speed: number | null; // km/h
  avg_cadence: number | null;
  stop_count: number | null;
}

/** Subset of training_segments needed for display + verdicts. */
export interface ComparisonSegmentInfo {
  id: string;
  display_name: string | null;
  terrain_type: 'flat' | 'climb' | 'descent' | 'rolling' | string;
  distance_meters: number;
  avg_gradient: number;
  ride_count: number;
}

/** Per-traversal derived metrics used for comparison. */
export interface DerivedEffort {
  durationSeconds: number | null;
  avgSpeedKmh: number | null;
  /** NP when available, else avg power. */
  power: number | null;
  avgHr: number | null;
  /** Efficiency factor: power per heartbeat (W/bpm). Higher = more efficient. */
  efficiencyFactor: number | null;
  /** km/h produced per watt. Higher = each watt buys more speed. */
  speedPerWatt: number | null;
  /** km/h per bpm — aerobic efficiency fallback when no power. */
  speedPerBeat: number | null;
  /** NP / avg power. Lower = steadier pacing. */
  variabilityIndex: number | null;
  avgCadence: number | null;
}

export type Trend = 'up' | 'down' | 'flat';
export type EffortVerdict = 'harder' | 'easier' | 'similar' | 'unknown';
export type OutputVerdict = 'faster' | 'slower' | 'similar' | 'unknown';
export type EfficiencyVerdict = 'more_efficient' | 'less_efficient' | 'similar' | 'unknown';
export type PacingVerdict = 'steadier' | 'surgier' | 'similar' | 'unknown';

export interface MetricComparison {
  key: 'duration' | 'speed' | 'power' | 'hr' | 'ef' | 'speed_per_watt' | 'speed_per_beat' | 'vi' | 'cadence';
  label: string;
  current: number;
  /** Median of the rider's past traversals. */
  baseline: number;
  deltaPct: number;
  /**
   * How to read the delta:
   *  - 'outcome': up = objectively better (speed, EF), judged with color
   *  - 'outcome_inverse': down = better (duration, VI)
   *  - 'effort': neither good nor bad — context (power, HR, cadence)
   */
  kind: 'outcome' | 'outcome_inverse' | 'effort';
  trend: Trend;
}

export interface SegmentComparison {
  segment: ComparisonSegmentInfo;
  current: DerivedEffort;
  historyCount: number;
  metrics: MetricComparison[];
  effort: EffortVerdict;
  output: OutputVerdict;
  efficiency: EfficiencyVerdict;
  pacing: PacingVerdict;
  isFastest: boolean;
  isBestEfficiency: boolean;
  verdict: string;
}

export interface RideEffortSummary {
  comparedCount: number;
  newSegmentCount: number;
  harderCount: number;
  easierCount: number;
  moreEfficientCount: number;
  lessEfficientCount: number;
  fastestCount: number;
  headline: string;
}

export interface CompareInput {
  segment: ComparisonSegmentInfo;
  current: SegmentTraversal;
  history: SegmentTraversal[];
}

// ============================================================================
// CONFIG
// ============================================================================

/** Percent change required before a delta counts as a real difference. */
const THRESHOLD_PCT = {
  speed: 2,
  duration: 2,
  power: 4,
  hr: 3,
  ef: 4,
  speed_per_watt: 4,
  speed_per_beat: 4,
  vi: 3,
} as const;

// Sentinel guards mirroring streamChartData.ts limits.
const MAX_VALID_POWER = 2500;
const MAX_VALID_HR = 250;
const MIN_VALID_HR = 30;

// ============================================================================
// DERIVATION
// ============================================================================

function cleanPower(watts: number | null | undefined): number | null {
  if (watts == null || watts <= 0 || watts >= MAX_VALID_POWER) return null;
  return watts;
}

function cleanHr(bpm: number | null | undefined): number | null {
  if (bpm == null || bpm < MIN_VALID_HR || bpm >= MAX_VALID_HR) return null;
  return bpm;
}

/** Derive comparable effort metrics from one traversal row. */
export function deriveEffort(t: SegmentTraversal): DerivedEffort {
  const avgPower = cleanPower(t.avg_power);
  const np = cleanPower(t.normalized_power);
  const power = np ?? avgPower;
  const avgHr = cleanHr(t.avg_hr);
  const speed = t.avg_speed != null && t.avg_speed > 0 ? t.avg_speed : null;
  const duration = t.duration_seconds > 0 ? t.duration_seconds : null;
  const cadence = t.avg_cadence != null && t.avg_cadence > 0 ? t.avg_cadence : null;

  return {
    durationSeconds: duration,
    avgSpeedKmh: speed,
    power,
    avgHr,
    efficiencyFactor: power != null && avgHr != null ? power / avgHr : null,
    speedPerWatt: speed != null && power != null ? speed / power : null,
    speedPerBeat: speed != null && avgHr != null ? speed / avgHr : null,
    variabilityIndex:
      np != null && avgPower != null && avgPower > 0 ? np / avgPower : null,
    avgCadence: cadence,
  };
}

/** A traversal is comparable if it carries at least one real signal. */
export function isComparableTraversal(t: SegmentTraversal): boolean {
  const d = deriveEffort(t);
  return d.avgSpeedKmh != null || d.power != null || d.avgHr != null;
}

// ============================================================================
// MATH HELPERS
// ============================================================================

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function medianOf(history: DerivedEffort[], pick: (d: DerivedEffort) => number | null): number | null {
  return median(history.map(pick).filter((v): v is number => v != null && Number.isFinite(v)));
}

function deltaPct(current: number, baseline: number): number {
  if (baseline === 0) return 0;
  return ((current - baseline) / baseline) * 100;
}

function classify(delta: number, thresholdPct: number): Trend {
  if (delta > thresholdPct) return 'up';
  if (delta < -thresholdPct) return 'down';
  return 'flat';
}

// ============================================================================
// PER-SEGMENT COMPARISON
// ============================================================================

interface MetricSpec {
  key: MetricComparison['key'];
  label: string;
  kind: MetricComparison['kind'];
  threshold: number;
  pick: (d: DerivedEffort) => number | null;
}

const METRIC_SPECS: MetricSpec[] = [
  { key: 'duration', label: 'Time', kind: 'outcome_inverse', threshold: THRESHOLD_PCT.duration, pick: (d) => d.durationSeconds },
  { key: 'speed', label: 'Speed', kind: 'outcome', threshold: THRESHOLD_PCT.speed, pick: (d) => d.avgSpeedKmh },
  { key: 'power', label: 'Power', kind: 'effort', threshold: THRESHOLD_PCT.power, pick: (d) => d.power },
  { key: 'hr', label: 'Heart Rate', kind: 'effort', threshold: THRESHOLD_PCT.hr, pick: (d) => d.avgHr },
  { key: 'ef', label: 'Efficiency (W/bpm)', kind: 'outcome', threshold: THRESHOLD_PCT.ef, pick: (d) => d.efficiencyFactor },
  { key: 'speed_per_watt', label: 'Speed per Watt', kind: 'outcome', threshold: THRESHOLD_PCT.speed_per_watt, pick: (d) => d.speedPerWatt },
  { key: 'speed_per_beat', label: 'Speed per Beat', kind: 'outcome', threshold: THRESHOLD_PCT.speed_per_beat, pick: (d) => d.speedPerBeat },
  { key: 'vi', label: 'Pacing (VI)', kind: 'outcome_inverse', threshold: THRESHOLD_PCT.vi, pick: (d) => d.variabilityIndex },
  { key: 'cadence', label: 'Cadence', kind: 'effort', threshold: THRESHOLD_PCT.power, pick: (d) => d.avgCadence },
];

/**
 * Compare one traversal against the rider's history on the same segment.
 * Returns null when there is nothing meaningful to compare (no history, or
 * the current traversal carries no usable signal).
 */
export function compareTraversal(
  segment: ComparisonSegmentInfo,
  currentRow: SegmentTraversal,
  historyRows: SegmentTraversal[]
): SegmentComparison | null {
  const history = historyRows.filter(isComparableTraversal).map(deriveEffort);
  if (history.length === 0 || !isComparableTraversal(currentRow)) return null;

  const current = deriveEffort(currentRow);

  const metrics: MetricComparison[] = [];
  for (const spec of METRIC_SPECS) {
    const cur = spec.pick(current);
    const base = medianOf(history, spec.pick);
    if (cur == null || base == null || base === 0) continue;
    const delta = deltaPct(cur, base);
    metrics.push({
      key: spec.key,
      label: spec.label,
      current: cur,
      baseline: base,
      deltaPct: delta,
      kind: spec.kind,
      trend: classify(delta, spec.threshold),
    });
  }
  if (metrics.length === 0) return null;

  const byKey = (key: MetricComparison['key']) => metrics.find((m) => m.key === key);

  // --- Effort: power first, HR fallback ---
  let effort: EffortVerdict = 'unknown';
  const powerCmp = byKey('power');
  const hrCmp = byKey('hr');
  const effortCmp = powerCmp ?? hrCmp;
  if (effortCmp) {
    effort = effortCmp.trend === 'up' ? 'harder' : effortCmp.trend === 'down' ? 'easier' : 'similar';
  }

  // --- Output: speed first, inverse duration fallback ---
  let output: OutputVerdict = 'unknown';
  const speedCmp = byKey('speed');
  const durCmp = byKey('duration');
  if (speedCmp) {
    output = speedCmp.trend === 'up' ? 'faster' : speedCmp.trend === 'down' ? 'slower' : 'similar';
  } else if (durCmp) {
    output = durCmp.trend === 'down' ? 'faster' : durCmp.trend === 'up' ? 'slower' : 'similar';
  }

  // --- Efficiency: EF (power+HR) > speed/watt (power only) > speed/beat (HR only) ---
  let efficiency: EfficiencyVerdict = 'unknown';
  const effCmp = byKey('ef') ?? byKey('speed_per_watt') ?? byKey('speed_per_beat');
  if (effCmp) {
    efficiency = effCmp.trend === 'up' ? 'more_efficient' : effCmp.trend === 'down' ? 'less_efficient' : 'similar';
  }

  // --- Pacing: VI, lower = steadier ---
  let pacing: PacingVerdict = 'unknown';
  const viCmp = byKey('vi');
  if (viCmp) {
    pacing = viCmp.trend === 'down' ? 'steadier' : viCmp.trend === 'up' ? 'surgier' : 'similar';
  }

  // --- Personal bests across history ---
  const historyDurations = history
    .map((d) => d.durationSeconds)
    .filter((v): v is number => v != null && v > 0);
  const isFastest =
    current.durationSeconds != null &&
    historyDurations.length > 0 &&
    current.durationSeconds < Math.min(...historyDurations);

  const historyEfs = history
    .map((d) => d.efficiencyFactor)
    .filter((v): v is number => v != null && v > 0);
  const isBestEfficiency =
    current.efficiencyFactor != null &&
    historyEfs.length > 0 &&
    current.efficiencyFactor > Math.max(...historyEfs);

  return {
    segment,
    current,
    historyCount: history.length,
    metrics,
    effort,
    output,
    efficiency,
    pacing,
    isFastest,
    isBestEfficiency,
    verdict: buildVerdict({ effort, output, efficiency, pacing, isFastest }),
  };
}

// ============================================================================
// VERDICT SENTENCES
// ============================================================================

function buildVerdict(v: {
  effort: EffortVerdict;
  output: OutputVerdict;
  efficiency: EfficiencyVerdict;
  pacing: PacingVerdict;
  isFastest: boolean;
}): string {
  const { effort, output, efficiency, pacing } = v;

  // No effort signal (geometry-only history): output-only phrasing.
  if (effort === 'unknown') {
    if (output === 'faster') return 'Faster than your typical effort here.';
    if (output === 'slower') return 'Slower than your typical effort here.';
    if (output === 'similar') return 'Right in line with your typical pace here.';
    return 'Not enough data to compare this effort.';
  }

  if (effort === 'harder') {
    if (output === 'faster') {
      if (efficiency === 'less_efficient') return 'You pushed harder and went faster, but the extra effort bought less than usual — efficiency was down.';
      if (efficiency === 'more_efficient') return 'A genuinely stronger effort: more power, more speed, and better efficiency than typical.';
      return 'More effort, more speed — efficiency right at your norm.';
    }
    if (output === 'slower' || output === 'similar') {
      const slowBit = output === 'slower' ? 'and still came through slower' : 'for about the same speed';
      if (efficiency === 'less_efficient') return `You worked harder than usual ${slowBit} — efficiency dropped, so wind, fatigue, or pacing likely cost you.`;
      return `You worked harder than usual ${slowBit}.`;
    }
    return 'You worked harder than you typically do on this segment.';
  }

  if (effort === 'easier') {
    if (output === 'faster') {
      return efficiency === 'more_efficient'
        ? 'Faster on less effort with better efficiency — a strong sign of improving fitness.'
        : 'Faster on less effort than typical.';
    }
    if (output === 'similar') return 'Same speed on less effort — you got this one for cheaper than usual.';
    if (output === 'slower') return 'You took this one easier than usual.';
    return 'A lighter effort than your norm here.';
  }

  // effort === 'similar'
  if (output === 'faster') {
    return efficiency === 'more_efficient'
      ? 'Same effort, more speed — you’re getting more out of every watt here.'
      : 'Same effort as usual but faster through the segment.';
  }
  if (output === 'slower') {
    return efficiency === 'less_efficient'
      ? 'Same effort but slower than typical, with efficiency down — conditions or fatigue may have worked against you.'
      : 'Typical effort, slightly slower than your norm.';
  }
  if (pacing === 'steadier') return 'Right at your typical effort, ridden steadier than usual.';
  if (pacing === 'surgier') return 'Right at your typical effort, though pacing was punchier than usual.';
  return 'Right in line with your typical effort here.';
}

// ============================================================================
// RIDE-LEVEL SUMMARY
// ============================================================================

export function compareActivitySegments(
  inputs: CompareInput[],
  newSegmentCount = 0
): { comparisons: SegmentComparison[]; summary: RideEffortSummary } {
  const comparisons = inputs
    .map(({ segment, current, history }) => compareTraversal(segment, current, history))
    .filter((c): c is SegmentComparison => c != null);

  // Most interesting first: personal bests, then largest output swing.
  comparisons.sort((a, b) => {
    const prA = a.isFastest || a.isBestEfficiency ? 1 : 0;
    const prB = b.isFastest || b.isBestEfficiency ? 1 : 0;
    if (prA !== prB) return prB - prA;
    const swing = (c: SegmentComparison) => {
      const speed = c.metrics.find((m) => m.key === 'speed') ?? c.metrics.find((m) => m.key === 'duration');
      return speed ? Math.abs(speed.deltaPct) : 0;
    };
    return swing(b) - swing(a);
  });

  const summary = buildSummary(comparisons, newSegmentCount);
  return { comparisons, summary };
}

function buildSummary(comparisons: SegmentComparison[], newSegmentCount: number): RideEffortSummary {
  const harderCount = comparisons.filter((c) => c.effort === 'harder').length;
  const easierCount = comparisons.filter((c) => c.effort === 'easier').length;
  const moreEfficientCount = comparisons.filter((c) => c.efficiency === 'more_efficient').length;
  const lessEfficientCount = comparisons.filter((c) => c.efficiency === 'less_efficient').length;
  const fastestCount = comparisons.filter((c) => c.isFastest).length;

  const parts: string[] = [];
  const n = comparisons.length;
  if (n > 0) {
    parts.push(`Compared against your history on ${n} familiar segment${n === 1 ? '' : 's'}.`);
    const effortBits: string[] = [];
    if (harderCount > 0) effortBits.push(`harder than typical on ${harderCount}`);
    if (easierCount > 0) effortBits.push(`easier on ${easierCount}`);
    if (effortBits.length > 0) parts.push(`You rode ${effortBits.join(', ')}.`);
    const effBits: string[] = [];
    if (moreEfficientCount > 0) effBits.push(`up on ${moreEfficientCount}`);
    if (lessEfficientCount > 0) effBits.push(`down on ${lessEfficientCount}`);
    if (effBits.length > 0) parts.push(`Efficiency was ${effBits.join(' and ')}.`);
    if (fastestCount > 0) parts.push(`New fastest effort on ${fastestCount} segment${fastestCount === 1 ? '' : 's'}.`);
  }
  if (newSegmentCount > 0) {
    parts.push(`${newSegmentCount} new segment${newSegmentCount === 1 ? '' : 's'} added to your library.`);
  }

  return {
    comparedCount: n,
    newSegmentCount,
    harderCount,
    easierCount,
    moreEfficientCount,
    lessEfficientCount,
    fastestCount,
    headline: parts.join(' '),
  };
}
