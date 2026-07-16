import { describe, it, expect } from 'vitest';
import {
  compareTraversal,
  compareActivitySegments,
  deriveEffort,
  isComparableTraversal,
  median,
  type SegmentTraversal,
  type ComparisonSegmentInfo,
} from '../segmentEffortComparison';

// ============================================================================
// FIXTURES
// ============================================================================

const SEGMENT: ComparisonSegmentInfo = {
  id: 'seg-1',
  display_name: 'Spine Rd Climb',
  terrain_type: 'climb',
  distance_meters: 3200,
  avg_gradient: 5.2,
  ride_count: 6,
};

let idCounter = 0;
function traversal(overrides: Partial<SegmentTraversal> = {}): SegmentTraversal {
  idCounter += 1;
  return {
    id: `ride-${idCounter}`,
    segment_id: 'seg-1',
    activity_id: `act-${idCounter}`,
    ridden_at: '2026-07-01T10:00:00Z',
    avg_power: 220,
    normalized_power: 230,
    max_power: 450,
    avg_hr: 150,
    max_hr: 172,
    duration_seconds: 600,
    avg_speed: 19.2,
    avg_cadence: 88,
    stop_count: 0,
    ...overrides,
  };
}

/** History of three near-identical baseline efforts. */
function baselineHistory(): SegmentTraversal[] {
  return [
    traversal({ duration_seconds: 600, avg_power: 220, normalized_power: 230, avg_hr: 150, avg_speed: 19.2 }),
    traversal({ duration_seconds: 605, avg_power: 218, normalized_power: 228, avg_hr: 149, avg_speed: 19.0 }),
    traversal({ duration_seconds: 595, avg_power: 222, normalized_power: 232, avg_hr: 151, avg_speed: 19.4 }),
  ];
}

// ============================================================================
// HELPERS
// ============================================================================

describe('median', () => {
  it('returns null for empty input', () => {
    expect(median([])).toBeNull();
  });

  it('handles odd and even counts', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });
});

describe('deriveEffort', () => {
  it('computes efficiency metrics from power + HR + speed', () => {
    const d = deriveEffort(traversal());
    expect(d.power).toBe(230); // NP preferred over avg
    expect(d.efficiencyFactor).toBeCloseTo(230 / 150, 5);
    expect(d.speedPerWatt).toBeCloseTo(19.2 / 230, 5);
    expect(d.speedPerBeat).toBeCloseTo(19.2 / 150, 5);
    expect(d.variabilityIndex).toBeCloseTo(230 / 220, 5);
  });

  it('nulls out sentinel and missing values', () => {
    const d = deriveEffort(
      traversal({ avg_power: 65535, normalized_power: null, avg_hr: 10, avg_speed: 0 })
    );
    expect(d.power).toBeNull();
    expect(d.avgHr).toBeNull();
    expect(d.avgSpeedKmh).toBeNull();
    expect(d.efficiencyFactor).toBeNull();
    expect(d.speedPerWatt).toBeNull();
  });
});

describe('isComparableTraversal', () => {
  it('accepts speed-only traversals', () => {
    expect(
      isComparableTraversal(
        traversal({ avg_power: null, normalized_power: null, avg_hr: null, avg_speed: 20 })
      )
    ).toBe(true);
  });

  it('rejects traversals with no signal', () => {
    expect(
      isComparableTraversal(
        traversal({ avg_power: null, normalized_power: null, avg_hr: null, avg_speed: null })
      )
    ).toBe(false);
  });
});

// ============================================================================
// PER-SEGMENT COMPARISON
// ============================================================================

describe('compareTraversal', () => {
  it('returns null with no history', () => {
    expect(compareTraversal(SEGMENT, traversal(), [])).toBeNull();
  });

  it('returns null when current traversal has no signal', () => {
    const current = traversal({
      avg_power: null,
      normalized_power: null,
      avg_hr: null,
      avg_speed: null,
    });
    expect(compareTraversal(SEGMENT, current, baselineHistory())).toBeNull();
  });

  it('classifies "harder but less efficient" (more power, higher HR cost)', () => {
    // +10% power but HR up 15% → EF down; speed only marginally up.
    const current = traversal({
      avg_power: 242,
      normalized_power: 253,
      avg_hr: 175,
      avg_speed: 19.3,
      duration_seconds: 598,
    });
    const cmp = compareTraversal(SEGMENT, current, baselineHistory());
    expect(cmp).not.toBeNull();
    expect(cmp!.effort).toBe('harder');
    expect(cmp!.output).toBe('similar');
    expect(cmp!.efficiency).toBe('less_efficient');
    expect(cmp!.verdict).toMatch(/harder/i);
  });

  it('classifies "same effort, more efficient" (same power, lower HR, faster)', () => {
    const current = traversal({
      avg_power: 221,
      normalized_power: 231,
      avg_hr: 138,
      avg_speed: 20.4,
      duration_seconds: 565,
    });
    const cmp = compareTraversal(SEGMENT, current, baselineHistory());
    expect(cmp!.effort).toBe('similar');
    expect(cmp!.output).toBe('faster');
    expect(cmp!.efficiency).toBe('more_efficient');
  });

  it('flags a fastest-ever traversal', () => {
    const current = traversal({ duration_seconds: 540, avg_speed: 21.3 });
    const cmp = compareTraversal(SEGMENT, current, baselineHistory());
    expect(cmp!.isFastest).toBe(true);
  });

  it('does not flag fastest when slower than the best past effort', () => {
    const current = traversal({ duration_seconds: 599, avg_speed: 19.25 });
    const cmp = compareTraversal(SEGMENT, current, baselineHistory());
    expect(cmp!.isFastest).toBe(false);
  });

  it('flags best-ever efficiency', () => {
    const current = traversal({ avg_power: 230, normalized_power: 240, avg_hr: 135 });
    const cmp = compareTraversal(SEGMENT, current, baselineHistory());
    expect(cmp!.isBestEfficiency).toBe(true);
  });

  it('falls back to HR for effort when no power on either side', () => {
    const noPower = (over: Partial<SegmentTraversal>) =>
      traversal({ avg_power: null, normalized_power: null, max_power: null, ...over });
    const history = [
      noPower({ avg_hr: 150, avg_speed: 19.0 }),
      noPower({ avg_hr: 148, avg_speed: 19.2 }),
    ];
    const current = noPower({ avg_hr: 162, avg_speed: 19.1 });
    const cmp = compareTraversal(SEGMENT, current, history);
    expect(cmp!.effort).toBe('harder');
    // Efficiency comes from speed-per-beat (HR-only tier).
    expect(cmp!.efficiency).toBe('less_efficient');
  });

  it('handles speed-only history (geometry tier) with output-only verdict', () => {
    const speedOnly = (over: Partial<SegmentTraversal>) =>
      traversal({
        avg_power: null,
        normalized_power: null,
        max_power: null,
        avg_hr: null,
        avg_cadence: null,
        ...over,
      });
    const history = [speedOnly({ avg_speed: 19.0 }), speedOnly({ avg_speed: 19.4 })];
    const current = speedOnly({ avg_speed: 21.0 });
    const cmp = compareTraversal(SEGMENT, current, history);
    expect(cmp!.effort).toBe('unknown');
    expect(cmp!.output).toBe('faster');
    expect(cmp!.verdict).toMatch(/faster/i);
  });

  it('classifies steadier pacing via VI', () => {
    // History VI = 230/220 ≈ 1.045; current VI = 1.0 → steadier.
    const current = traversal({ avg_power: 220, normalized_power: 220 });
    const cmp = compareTraversal(SEGMENT, current, baselineHistory());
    expect(cmp!.pacing).toBe('steadier');
  });

  it('compares against the MEDIAN of history, robust to one outlier', () => {
    const history = [
      ...baselineHistory(),
      traversal({ avg_power: 120, normalized_power: 125, avg_speed: 12.0, duration_seconds: 960 }), // recovery-day outlier
    ];
    const current = traversal(); // identical to the baseline efforts
    const cmp = compareTraversal(SEGMENT, current, history);
    expect(cmp!.effort).toBe('similar');
    expect(cmp!.output).toBe('similar');
  });
});

// ============================================================================
// RIDE-LEVEL SUMMARY
// ============================================================================

describe('compareActivitySegments', () => {
  it('aggregates counts and builds a headline', () => {
    const harder = {
      segment: SEGMENT,
      current: traversal({ avg_power: 250, normalized_power: 262, avg_hr: 172, avg_speed: 19.3 }),
      history: baselineHistory(),
    };
    const easier = {
      segment: { ...SEGMENT, id: 'seg-2', display_name: 'River Flat' },
      current: traversal({ segment_id: 'seg-2', avg_power: 190, normalized_power: 198, avg_hr: 138, avg_speed: 18.9 }),
      history: baselineHistory().map((t) => ({ ...t, segment_id: 'seg-2' })),
    };

    const { comparisons, summary } = compareActivitySegments([harder, easier], 2);
    expect(comparisons).toHaveLength(2);
    expect(summary.comparedCount).toBe(2);
    expect(summary.harderCount).toBe(1);
    expect(summary.easierCount).toBe(1);
    expect(summary.newSegmentCount).toBe(2);
    expect(summary.headline).toContain('2 familiar segments');
    expect(summary.headline).toContain('2 new segments');
  });

  it('drops segments with no comparable history', () => {
    const noHistory = { segment: SEGMENT, current: traversal(), history: [] as SegmentTraversal[] };
    const { comparisons, summary } = compareActivitySegments([noHistory]);
    expect(comparisons).toHaveLength(0);
    expect(summary.comparedCount).toBe(0);
    expect(summary.headline).toBe('');
  });

  it('sorts personal bests first', () => {
    const ordinary = {
      segment: { ...SEGMENT, id: 'seg-a', display_name: 'Ordinary' },
      current: traversal(),
      history: baselineHistory(),
    };
    const pr = {
      segment: { ...SEGMENT, id: 'seg-b', display_name: 'PR Segment' },
      current: traversal({ duration_seconds: 500, avg_speed: 23.0 }),
      history: baselineHistory(),
    };
    const { comparisons } = compareActivitySegments([ordinary, pr]);
    expect(comparisons[0].segment.display_name).toBe('PR Segment');
    expect(comparisons[0].isFastest).toBe(true);
  });
});
