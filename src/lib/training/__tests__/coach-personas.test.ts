import { describe, it, expect } from 'vitest';
import { rankOptions } from '../coach-personas';
import type { AdjustmentProjections, RankingContext } from '../types';

const baseProjections: AdjustmentProjections = {
  planned: -5,
  no_adjust: -18,
  modify: -10,
  swap: -6,
  insert_rest: -4,
};

const baseContext: RankingContext = {
  tsbGap: 13,
  urgency: 'medium',
  daysToQuality: 2,
  swapFeasible: true,
  isNearRace: false,
};

describe('rankOptions', () => {
  it('returns ranked options with rationale for each persona', () => {
    const personas = ['hammer', 'scientist', 'encourager', 'pragmatist', 'competitor'] as const;

    for (const persona of personas) {
      const ranked = rankOptions(persona, baseProjections, baseContext);

      expect(ranked.length).toBeGreaterThan(0);
      // Should be sorted by score descending
      for (let i = 1; i < ranked.length; i++) {
        expect(ranked[i - 1].score).toBeGreaterThanOrEqual(ranked[i].score);
      }
      // Each option should have a rationale string
      for (const opt of ranked) {
        expect(opt.rationale).toBeTruthy();
        expect(typeof opt.rationale).toBe('string');
      }
    }
  });

  it('hammer prefers no_adjust for small gaps', () => {
    const smallGapContext = { ...baseContext, tsbGap: 5 };
    const ranked = rankOptions('hammer', baseProjections, smallGapContext);
    expect(ranked[0].option).toBe('no_adjust');
  });

  it('scientist picks option closest to planned TSB', () => {
    const ranked = rankOptions('scientist', baseProjections, baseContext);
    // swap (-6) and insert_rest (-4) are both 1 unit from planned (-5)
    // Both are equally close; swap wins because it's listed first in Object.entries
    expect(['swap', 'insert_rest']).toContain(ranked[0].option);
  });

  it('encourager prefers modify (athlete still trains hard)', () => {
    const ranked = rankOptions('encourager', baseProjections, baseContext);
    expect(ranked[0].option).toBe('modify');
  });

  it('pragmatist prefers swap when feasible', () => {
    const ranked = rankOptions('pragmatist', baseProjections, baseContext);
    expect(ranked[0].option).toBe('swap');
  });

  it('competitor inserts rest near race', () => {
    const nearRaceContext = { ...baseContext, isNearRace: true };
    const ranked = rankOptions('competitor', baseProjections, nearRaceContext);
    expect(ranked[0].option).toBe('insert_rest');
  });

  it('excludes swap when not feasible for pragmatist', () => {
    const noSwapContext = { ...baseContext, swapFeasible: false };
    const ranked = rankOptions('pragmatist', baseProjections, noSwapContext);
    const swapOption = ranked.find(r => r.option === 'swap');
    // swap should be scored very low (20) when not feasible
    if (swapOption) {
      expect(swapOption.score).toBeLessThanOrEqual(20);
    }
  });
});
