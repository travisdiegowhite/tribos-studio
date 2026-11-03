import { describe, it, expect } from 'vitest';
import type { Coordinate } from '../../types/geo';
import { comfortClassForTags, type ComfortClassResult } from '../comfortClass';
import { validateMatchedSegments, validateComfortRoute, toneRuns } from '../comfortValidator';
import { haversineMeters } from '../distanceUnits';
import type { TaggedWay } from '../wayTags';

const LAT = 40;
const STEP_DEG = 100 / (111_320 * Math.cos((LAT * Math.PI) / 180)); // ~100 m east per segment

function line(n: number): Coordinate[] {
  return Array.from({ length: n + 1 }, (_, i) => [-105 + i * STEP_DEG, LAT] as Coordinate);
}

const C = {
  quiet: comfortClassForTags({ highway: 'residential' }), // 1
  lane: comfortClassForTags({ highway: 'secondary', maxspeed: '35 mph', cycleway: 'lane' }), // 2
  busy: comfortClassForTags({ highway: 'tertiary', maxspeed: '35 mph' }), // 3
  shoulder55: comfortClassForTags({ highway: 'secondary', maxspeed: '55 mph', shoulder: 'yes' }), // 4
  fast: comfortClassForTags({ highway: 'secondary', maxspeed: '50 mph' }), // 5
  closed: comfortClassForTags({ highway: 'motorway' }), // X
  unmapped: comfortClassForTags({ highway: 'unclassified', surface: 'asphalt' }), // unknown, worst 5
};

/** `spec` like [['quiet', 40], ['busy', 3]] → per-segment classes. */
function segs(spec: Array<[keyof typeof C | 'none', number]>): Array<ComfortClassResult | null> {
  return spec.flatMap(([k, n]) => Array.from({ length: n }, () => (k === 'none' ? null : C[k])));
}

function run(spec: Array<[keyof typeof C | 'none', number]>, level: 1 | 2 | 3 | 4 | 5) {
  const classes = segs(spec);
  return validateMatchedSegments(line(classes.length), classes, level);
}

describe('fixtures', () => {
  it('have the classes the tests assume', () => {
    expect([C.quiet, C.lane, C.busy, C.shoulder55, C.fast, C.closed].map((r) => r!.cls)).toEqual([1, 2, 3, 4, 5, 'X']);
    expect(C.unmapped!.confidence).toBe('unknown');
    expect(haversineMeters(LAT, -105, LAT, -105 + STEP_DEG)).toBeCloseTo(100, 0);
  });
});

describe('§3 rules', () => {
  it('a route entirely within comfort passes at 100%', () => {
    const v = run([['quiet', 50], ['lane', 50]], 2);
    expect(v.passes).toBe(true);
    expect(v.withinPct).toBe(100);
    expect(v.headsUps).toEqual([]);
  });

  it('a short flagged stretch passes with one heads-up', () => {
    const v = run([['quiet', 50], ['busy', 4], ['quiet', 50]], 2);
    expect(v.passes).toBe(true);
    expect(v.flaggedStretches).toHaveLength(1);
    expect(v.headsUps).toHaveLength(1);
    expect(v.headsUps[0]).toMatchObject({ kind: 'flagged', title: 'One level above your comfort', levelsAbove: 1 });
    expect(Math.abs(v.headsUps[0].start_m - 5000)).toBeLessThan(20);
    expect(v.headsUps[0].reasons).toContain('35 mph');
    expect(v.withinPct).toBeCloseTo(96.2, 0);
  });

  it('fails a single stretch over 0.5 mi', () => {
    const v = run([['quiet', 50], ['busy', 9], ['quiet', 50]], 2);
    expect(v.passes).toBe(false);
    expect(v.failures.map((f) => f.kind)).toEqual(['stretch_too_long']);
  });

  it('counts adjacent L+1 and L+2 as one stretch', () => {
    const v = run([['quiet', 50], ['busy', 4], ['shoulder55', 5], ['quiet', 50]], 2);
    expect(v.flaggedStretches).toHaveLength(1);
    expect(v.flaggedStretches[0].maxCls).toBe(4);
    expect(v.headsUps[0].title).toBe('Two levels above your comfort');
    expect(v.passes).toBe(false); // 900 m > 805 m
  });

  it('bridges a short within-comfort gap so a driveway cannot split a stretch', () => {
    // 6 + 6 flagged with a 40 m gap would be two 600 m stretches; merged it is 1240 m.
    const classes = [...segs([['quiet', 20], ['busy', 6]]), C.quiet, ...segs([['busy', 6], ['quiet', 20]])];
    const coords = line(classes.length);
    // Shorten the gap segment to ~40 m.
    const gapIdx = 26;
    coords[gapIdx + 1] = [coords[gapIdx][0] + STEP_DEG * 0.4, LAT];
    for (let i = gapIdx + 2; i < coords.length; i++) coords[i] = [coords[i - 1][0] + STEP_DEG, LAT];
    const v = validateMatchedSegments(coords, classes, 2);
    expect(v.flaggedStretches).toHaveLength(1);
    expect(v.passes).toBe(false);
  });

  it('does not bridge a long gap', () => {
    const v = run([['quiet', 20], ['busy', 6], ['quiet', 3], ['busy', 6], ['quiet', 200]], 2);
    expect(v.flaggedStretches).toHaveLength(2);
    expect(v.passes).toBe(true);
  });

  it('fails when flagged distance exceeds 10% of the route', () => {
    // 4 stretches × 400 m = 1.6 km of a 10 km route = 16%.
    const v = run(
      [['quiet', 20], ['busy', 4], ['quiet', 20], ['busy', 4], ['quiet', 20], ['busy', 4], ['quiet', 20], ['busy', 4], ['quiet', 4]],
      2,
    );
    expect(v.failures.map((f) => f.kind)).toEqual(['too_much_flagged']);
  });

  it('blocks class ≥ L+3 at any length', () => {
    const v = run([['quiet', 100], ['fast', 1], ['quiet', 100]], 2);
    expect(v.passes).toBe(false);
    expect(v.failures[0]).toMatchObject({ kind: 'blocked', stretches: 1 });
    expect(v.blocked_m).toBeCloseTo(100, 0);
  });

  it('blocks X at every level', () => {
    for (const level of [1, 2, 3, 4, 5] as const) {
      expect(run([['quiet', 50], ['closed', 1], ['quiet', 50]], level).failures[0].kind).toBe('blocked');
    }
  });

  it('class 5 is a flag at level 3 and free at level 5', () => {
    expect(run([['quiet', 50], ['fast', 3], ['quiet', 50]], 3).passes).toBe(true);
    const v5 = run([['quiet', 50], ['fast', 30], ['quiet', 50]], 5);
    expect(v5.passes).toBe(true);
    expect(v5.withinPct).toBe(100);
  });
});

describe('unknowns', () => {
  it('unmapped-speed roads are flagged as unknown, not counted against the limits', () => {
    const v = run([['quiet', 40], ['unmapped', 30], ['quiet', 40]], 2);
    expect(v.passes).toBe(true);
    expect(v.unknownPct).toBeCloseTo(27.3, 0);
    expect(v.withinPct).toBeCloseTo(72.7, 0);
    expect(v.headsUps).toEqual([
      expect.objectContaining({ kind: 'unknown', title: 'Speed limit not mapped', reasons: ['speed limit not mapped'] }),
    ]);
  });

  it('an unmapped road whose worst case fits the level counts as within', () => {
    const v = run([['quiet', 40], ['unmapped', 30], ['quiet', 40]], 5);
    expect(v.unknownPct).toBe(0);
    expect(v.withinPct).toBe(100);
  });

  it('segments no way matched are unknown — the trace-fidelity check', () => {
    const v = run([['quiet', 40], ['none', 10], ['quiet', 40]], 2);
    expect(v.unknown_m).toBeCloseTo(1000, -1);
    expect(v.headsUps[0]).toMatchObject({ kind: 'unknown', title: 'Road not confirmed' });
  });
});

describe('tones', () => {
  it('within / at / flagged / unknown runs for the strip and map', () => {
    const v = run([['quiet', 2], ['lane', 2], ['busy', 2], ['none', 2]], 2);
    expect(toneRuns(v).map((r) => r.tone)).toEqual(['within', 'at', 'flagged', 'unknown']);
  });
});

describe('validateComfortRoute', () => {
  it('matches ways onto the line and validates', () => {
    const coords = line(20);
    const ways: TaggedWay[] = [
      { id: -1, geometry: coords.slice(0, 11), tags: { highway: 'residential' } },
      { id: -2, geometry: coords.slice(10), tags: { highway: 'secondary', maxspeed: '50 mph' } },
    ];
    const v = validateComfortRoute(coords, ways, { level: 2 })!;
    expect(v.passes).toBe(false);
    expect(v.blocked_m).toBeCloseTo(1000, -1);
    const v5 = validateComfortRoute(coords, ways, { level: 5 })!;
    expect(v5.passes).toBe(true);
  });

  it('returns null without data rather than passing', () => {
    expect(validateComfortRoute(line(5), [], { level: 2 })).toBeNull();
  });
});
