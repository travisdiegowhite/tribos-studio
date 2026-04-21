import { describe, it, expect } from 'vitest';
import {
  computeFAR,
  computeFARMomentum,
  computeMomentumFlag,
  assessFARGaps,
  computeFARFromSeries,
} from '../far';
import { classifyFARZone, getFARStatusLabel } from '../farZones';
import type { TrainingLoadDailyRow } from '../types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build a minimal 29-row series (newest-first). */
function makeSeries(opts: {
  tfiToday: number;
  tfi28dAgo: number;
  tfi7dAgo?: number;
  gapIndices?: number[];   // indices (0=today) that have null rss_source (sync gaps)
  restIndices?: number[];  // indices that have rss_source set but rss=0 (rest days)
}): TrainingLoadDailyRow[] {
  const { tfiToday, tfi28dAgo, tfi7dAgo, gapIndices = [], restIndices = [] } = opts;

  return Array.from({ length: 29 }, (_, i) => {
    let tfi: number | null;
    if (i === 0) tfi = tfiToday;
    else if (i === 28) tfi = tfi28dAgo;
    else if (i === 7 && tfi7dAgo !== undefined) tfi = tfi7dAgo;
    else tfi = tfi28dAgo + ((tfiToday - tfi28dAgo) * (28 - i) / 28); // linear interp

    const isGap  = gapIndices.includes(i);
    const isRest = restIndices.includes(i);

    return {
      date: `2026-03-${String(24 - i).padStart(2, '0')}`,
      tfi,
      rss_source: isGap ? null : (isRest ? 'inferred' : 'device'),
    };
  });
}

const CEILING = 1.5;

// ─── computeFAR ───────────────────────────────────────────────────────────────

describe('computeFAR', () => {
  it('returns 100 when weekly rate exactly equals ceiling', () => {
    // ceiling = 1.5 TFI/week → delta28d = 6.0 (1.5 × 4 weeks)
    expect(computeFAR(106, 100, 1.5)).toBeCloseTo(100, 1);
  });

  it('returns 0 for flat TFI', () => {
    expect(computeFAR(50, 50, 1.5)).toBe(0);
  });

  it('returns negative for detraining', () => {
    expect(computeFAR(48, 50, 1.5)).toBeLessThan(0);
  });

  it('returns > 100 for overreaching', () => {
    // +7.2 delta28d → weeklyRate = 1.8 → FAR = 120
    expect(computeFAR(107.2, 100, 1.5)).toBeCloseTo(120, 1);
  });

  it('returns ~67 for building at 2/3 ceiling', () => {
    // +4.0 delta28d → weeklyRate = 1.0 → FAR ≈ 66.7
    expect(computeFAR(104, 100, 1.5)).toBeCloseTo(66.7, 1);
  });

  it('formula is linear with ceiling', () => {
    // With ceiling=2.0, same delta → lower FAR
    expect(computeFAR(106, 100, 2.0)).toBeCloseTo(75, 1);
  });
});

// ─── computeFARMomentum ───────────────────────────────────────────────────────

describe('computeFARMomentum', () => {
  it('equals ceiling*100 when delta7d equals ceiling', () => {
    expect(computeFARMomentum(101.5, 100, 1.5)).toBeCloseTo(100, 1);
  });

  it('returns 0 for no 7-day change', () => {
    expect(computeFARMomentum(50, 50, 1.5)).toBe(0);
  });

  it('returns negative for 7-day decline', () => {
    expect(computeFARMomentum(48, 50, 1.5)).toBeLessThan(0);
  });
});

// ─── computeMomentumFlag ─────────────────────────────────────────────────────

describe('computeMomentumFlag', () => {
  it('returns steady when both near zero', () => {
    expect(computeMomentumFlag(2, 3)).toBe('steady');
    expect(computeMomentumFlag(0, 0)).toBe('steady');
  });

  it('returns accelerating when 7d > 28d by >15%', () => {
    // 28d=80, threshold=12, 7d=93 → accelerating
    expect(computeMomentumFlag(80, 93)).toBe('accelerating');
  });

  it('returns decelerating when 7d < 28d by >15%', () => {
    expect(computeMomentumFlag(80, 66)).toBe('decelerating');
  });

  it('returns steady when difference is within 15%', () => {
    expect(computeMomentumFlag(80, 86)).toBe('steady');  // +7.5%, within 15%
    expect(computeMomentumFlag(80, 75)).toBe('steady');  // −6.25%, within 15%
  });
});

// ─── assessFARGaps ────────────────────────────────────────────────────────────

describe('assessFARGaps', () => {
  it('returns normal for 0 gap days', () => {
    const series = makeSeries({ tfiToday: 55, tfi28dAgo: 50 });
    const result = assessFARGaps(series);
    expect(result.treatment).toBe('normal');
    expect(result.confidence).toBe(1.0);
    expect(result.boundaryGap).toBe(false);
  });

  it('returns normal for 2 gap days (within threshold)', () => {
    const series = makeSeries({ tfiToday: 55, tfi28dAgo: 50, gapIndices: [5, 10] });
    const result = assessFARGaps(series);
    expect(result.treatment).toBe('normal');
    expect(result.gapDays).toBe(2);
  });

  it('returns caveat for 3–5 gap days', () => {
    const series = makeSeries({ tfiToday: 55, tfi28dAgo: 50, gapIndices: [5, 10, 15] });
    const result = assessFARGaps(series);
    expect(result.treatment).toBe('caveat');
    expect(result.confidence).toBe(0.7);
  });

  it('returns warning for 6–13 gap days', () => {
    const series = makeSeries({ tfiToday: 55, tfi28dAgo: 50, gapIndices: [3, 5, 7, 10, 12, 15] });
    const result = assessFARGaps(series);
    expect(result.treatment).toBe('warning');
    expect(result.confidence).toBe(0.5);
  });

  it('returns suppress for 14+ gap days', () => {
    const indices = [3, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17]; // 14 gaps
    const series = makeSeries({ tfiToday: 55, tfi28dAgo: 50, gapIndices: indices });
    const result = assessFARGaps(series);
    expect(result.treatment).toBe('suppress');
    expect(result.confidence).toBe(0);
  });

  it('returns suppress for boundary gap at index 0 (today)', () => {
    const series = makeSeries({ tfiToday: 55, tfi28dAgo: 50, gapIndices: [0] });
    const result = assessFARGaps(series);
    expect(result.treatment).toBe('suppress');
    expect(result.boundaryGap).toBe(true);
  });

  it('returns suppress for boundary gap at index 28 (today−28)', () => {
    const series = makeSeries({ tfiToday: 55, tfi28dAgo: 50, gapIndices: [28] });
    const result = assessFARGaps(series);
    expect(result.treatment).toBe('suppress');
    expect(result.boundaryGap).toBe(true);
  });

  it('does NOT count rest days (rss_source set, rss=0) as gaps', () => {
    // 6 rest days with rss_source set — should still be 'normal'
    const series = makeSeries({ tfiToday: 55, tfi28dAgo: 50, restIndices: [3, 5, 8, 12, 16, 20] });
    const result = assessFARGaps(series);
    expect(result.treatment).toBe('normal');
    expect(result.gapDays).toBe(0);
  });

  it('correctly separates rest days from sync gaps in mixed series', () => {
    // 3 sync gaps + 5 rest days → caveat (only 3 sync gaps count)
    const series = makeSeries({
      tfiToday: 55, tfi28dAgo: 50,
      gapIndices: [5, 10, 15],
      restIndices: [3, 6, 9, 12, 18],
    });
    const result = assessFARGaps(series);
    expect(result.treatment).toBe('caveat');
    expect(result.gapDays).toBe(3);
  });
});

// ─── classifyFARZone ─────────────────────────────────────────────────────────

describe('classifyFARZone', () => {
  it('classifies boundary values correctly', () => {
    expect(classifyFARZone(-0.1)).toBe('detraining');
    expect(classifyFARZone(0)).toBe('maintaining');
    expect(classifyFARZone(39.9)).toBe('maintaining');
    expect(classifyFARZone(40)).toBe('building');
    expect(classifyFARZone(99.9)).toBe('building');
    expect(classifyFARZone(100)).toBe('overreaching');
    expect(classifyFARZone(129.9)).toBe('overreaching');
    expect(classifyFARZone(130)).toBe('danger');
  });

  it('classifies test user archetypes correctly', () => {
    expect(classifyFARZone(67)).toBe('building');    // far_test_building_baseline
    expect(classifyFARZone(100)).toBe('overreaching'); // far_test_building_max (100 is ≥100)
    expect(classifyFARZone(120)).toBe('overreaching'); // far_test_overreaching
    expect(classifyFARZone(147)).toBe('danger');    // far_test_danger
    expect(classifyFARZone(-33)).toBe('detraining'); // far_test_detraining
    expect(classifyFARZone(0)).toBe('maintaining'); // far_test_maintaining
  });
});

// ─── getFARStatusLabel ────────────────────────────────────────────────────────

describe('getFARStatusLabel', () => {
  it('returns correct label for each zone', () => {
    expect(getFARStatusLabel(-10, 1.5, 0)).toBe('LOSING FITNESS');
    expect(getFARStatusLabel(20, 1.5, 0)).toBe('MAINTAINING');
    expect(getFARStatusLabel(70, 1.5, 0)).toBe('BUILDING');
    expect(getFARStatusLabel(120, 1.5, 0)).toBe('OVERREACHING — ABOVE PERSONAL CEILING');
    expect(getFARStatusLabel(140, 1.5, 0)).toBe('DANGER — BACK OFF');
  });

  it('returns BUILDING — AT SUSTAINABLE MAX at score >= 95', () => {
    expect(getFARStatusLabel(95, 1.5, 0)).toBe('BUILDING — AT SUSTAINABLE MAX');
    expect(getFARStatusLabel(99, 1.5, 0)).toBe('BUILDING — AT SUSTAINABLE MAX');
    expect(getFARStatusLabel(94, 1.5, 0)).toBe('BUILDING');
  });

  it('returns OVERREACHING — WITHIN PERSONAL ENVELOPE when score <= 100', () => {
    // For universal ceiling (1.5), score=100 means exactly at ceiling
    expect(getFARStatusLabel(100, 1.5, 0)).toBe('OVERREACHING — WITHIN PERSONAL ENVELOPE');
    expect(getFARStatusLabel(110, 1.5, 0)).toBe('OVERREACHING — ABOVE PERSONAL CEILING');
  });
});

// ─── computeFARFromSeries ─────────────────────────────────────────────────────

describe('computeFARFromSeries', () => {
  it('returns suppressed result for cold start (< 29 rows)', () => {
    const shortSeries: TrainingLoadDailyRow[] = Array.from({ length: 20 }, (_, i) => ({
      date: `2026-03-${i + 1}`,
      tfi: 50 + i * 0.1,
      rss_source: 'device',
    }));
    const result = computeFARFromSeries(shortSeries, CEILING);
    expect(result.score).toBeNull();
    expect(result.treatment).toBe('suppress');
  });

  it('returns correct score for building scenario', () => {
    // delta28d = 4.2 → weeklyRate = 1.05 → FAR = 70
    const series = makeSeries({ tfiToday: 54.2, tfi28dAgo: 50 });
    const result = computeFARFromSeries(series, CEILING);
    expect(result.score).not.toBeNull();
    expect(result.score!).toBeCloseTo(70, 1);
    expect(result.zone).toBe('building');
    expect(result.treatment).toBe('normal');
    expect(result.confidence).toBe(1.0);
  });

  it('returns negative score for detraining', () => {
    const series = makeSeries({ tfiToday: 48, tfi28dAgo: 50 });
    const result = computeFARFromSeries(series, CEILING);
    expect(result.score).toBeLessThan(0);
    expect(result.zone).toBe('detraining');
  });

  it('returns null score for suppressed gap series', () => {
    // Boundary gap at today
    const series = makeSeries({ tfiToday: 55, tfi28dAgo: 50, gapIndices: [0] });
    const result = computeFARFromSeries(series, CEILING);
    expect(result.score).toBeNull();
    expect(result.treatment).toBe('suppress');
  });

  it('returns score with caveat treatment for 3-5 day gap', () => {
    const series = makeSeries({ tfiToday: 55, tfi28dAgo: 50, gapIndices: [5, 10, 15] });
    const result = computeFARFromSeries(series, CEILING);
    expect(result.score).not.toBeNull();
    expect(result.treatment).toBe('caveat');
    expect(result.confidence).toBe(0.7);
  });

  it('returns null score when tfi is null at key positions', () => {
    const series = makeSeries({ tfiToday: 55, tfi28dAgo: 50 });
    // Null out today's TFI
    series[0] = { ...series[0], tfi: null };
    const result = computeFARFromSeries(series, CEILING);
    expect(result.score).toBeNull();
  });

  it('does not count rest days as gaps (rss_source set, rss=0)', () => {
    const series = makeSeries({
      tfiToday: 55, tfi28dAgo: 50,
      restIndices: [3, 5, 8, 12, 16, 20, 22],  // 7 rest days
    });
    const result = computeFARFromSeries(series, CEILING);
    expect(result.score).not.toBeNull();
    expect(result.treatment).toBe('normal');  // rest days don't count as gaps
    expect(result.gap_days_in_window).toBe(0);
  });

  it('computes momentum flag correctly', () => {
    // 28d FAR ~70, 7d FAR ~130 (accelerating)
    const series = makeSeries({ tfiToday: 55, tfi28dAgo: 50, tfi7dAgo: 53 });
    const result = computeFARFromSeries(series, CEILING);
    expect(result.momentum_flag).toBe('accelerating');
  });

  // Test user matrix equivalents (spec §checklist)
  it('far_test_building_baseline: +1.0 TFI/wk → ~67', () => {
    // +1.0/wk × 4 weeks = +4.0 delta28d
    const series = makeSeries({ tfiToday: 54.0, tfi28dAgo: 50 });
    const result = computeFARFromSeries(series, CEILING);
    expect(result.score!).toBeCloseTo(66.7, 1);
    expect(result.zone).toBe('building');
  });

  it('far_test_building_max: +1.5 TFI/wk → 100', () => {
    const series = makeSeries({ tfiToday: 56.0, tfi28dAgo: 50 });
    const result = computeFARFromSeries(series, CEILING);
    expect(result.score!).toBeCloseTo(100, 1);
  });

  it('far_test_overreaching: +1.8 TFI/wk → 120', () => {
    const series = makeSeries({ tfiToday: 57.2, tfi28dAgo: 50 });
    const result = computeFARFromSeries(series, CEILING);
    expect(result.score!).toBeCloseTo(120, 1);
    expect(result.zone).toBe('overreaching');
  });

  it('far_test_danger: +2.2 TFI/wk → ~147', () => {
    const series = makeSeries({ tfiToday: 58.8, tfi28dAgo: 50 });
    const result = computeFARFromSeries(series, CEILING);
    expect(result.score!).toBeCloseTo(146.7, 1);
    expect(result.zone).toBe('danger');
  });

  it('far_test_detraining: −0.5 TFI/wk → ~−33', () => {
    const series = makeSeries({ tfiToday: 48, tfi28dAgo: 50 });
    const result = computeFARFromSeries(series, CEILING);
    expect(result.score!).toBeCloseTo(-33.3, 1);
    expect(result.zone).toBe('detraining');
  });

  it('far_test_maintaining: flat → ~0', () => {
    const series = makeSeries({ tfiToday: 50, tfi28dAgo: 50 });
    const result = computeFARFromSeries(series, CEILING);
    expect(result.score!).toBe(0);
    expect(result.zone).toBe('maintaining');
  });
});
