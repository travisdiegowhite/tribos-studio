import { describe, it, expect } from 'vitest';
import {
  stepDay,
  projectSchedule,
  classifyFS,
  projectAdjustmentOptions,
  assessDeviationImpact,
} from '../tsb-projection';
import type { DailyLoad, ProjectionState } from '../types';

describe('stepDay', () => {
  it('moves TFI toward RSS with 42-day time constant', () => {
    const state: ProjectionState = { tfi: 0, afi: 0, formScore: 0 };
    const next = stepDay(state, 100);

    // TFI should move from 0 toward 100 by 1/42
    expect(next.tfi).toBeCloseTo(100 / 42, 4);
  });

  it('moves AFI toward RSS with 7-day time constant', () => {
    const state: ProjectionState = { tfi: 0, afi: 0, formScore: 0 };
    const next = stepDay(state, 100);

    // AFI should move from 0 toward 100 by 1/7
    expect(next.afi).toBeCloseTo(100 / 7, 4);
  });

  it('maintains formScore = TFI - AFI', () => {
    const state: ProjectionState = { tfi: 50, afi: 60, formScore: -10 };
    const next = stepDay(state, 80);

    expect(next.formScore).toBeCloseTo(next.tfi - next.afi, 10);
  });

  it('converges TFI to ~100 after 42 days of RSS=100', () => {
    let state: ProjectionState = { tfi: 0, afi: 0, formScore: 0 };
    for (let i = 0; i < 42; i++) {
      state = stepDay(state, 100);
    }
    // After one time constant, should reach ~63.2% of target (1 - 1/e)
    expect(state.tfi).toBeGreaterThan(60);
    expect(state.tfi).toBeLessThan(70);
  });

  it('converges AFI to ~100 after 7 days of RSS=100', () => {
    let state: ProjectionState = { tfi: 0, afi: 0, formScore: 0 };
    for (let i = 0; i < 7; i++) {
      state = stepDay(state, 100);
    }
    // After one time constant, should reach ~63.2%
    expect(state.afi).toBeGreaterThan(60);
    expect(state.afi).toBeLessThan(70);
  });

  it('zero RSS makes TFI and AFI decay toward 0', () => {
    const state: ProjectionState = { tfi: 100, afi: 100, formScore: 0 };
    const next = stepDay(state, 0);

    expect(next.tfi).toBeLessThan(100);
    expect(next.afi).toBeLessThan(100);
  });
});

describe('classifyFS', () => {
  it('classifies race_ready for FS >= 5', () => {
    expect(classifyFS(10)).toBe('race_ready');
    expect(classifyFS(5)).toBe('race_ready');
  });

  it('classifies building for FS >= -10', () => {
    expect(classifyFS(0)).toBe('building');
    expect(classifyFS(-10)).toBe('building');
  });

  it('classifies heavy_load for FS >= -25', () => {
    expect(classifyFS(-15)).toBe('heavy_load');
    expect(classifyFS(-25)).toBe('heavy_load');
  });

  it('classifies overreached for FS < -25', () => {
    expect(classifyFS(-30)).toBe('overreached');
    expect(classifyFS(-50)).toBe('overreached');
  });
});

describe('projectSchedule', () => {
  it('projects forward through a schedule', () => {
    const initial: ProjectionState = { tfi: 50, afi: 50, formScore: 0 };
    const schedule: DailyLoad[] = [
      { date: '2026-03-23', rss: 80, is_quality: false },
      { date: '2026-03-24', rss: 40, is_quality: false },
      { date: '2026-03-25', rss: 100, is_quality: true },
    ];

    const results = projectSchedule(initial, schedule);

    expect(results).toHaveLength(3);
    expect(results[0].day).toBe('2026-03-23');
    expect(results[2].is_quality).toBe(true);
    // After a high RSS day, AFI should spike, making FS negative
    expect(results[0].state.formScore).toBeLessThan(0);
  });

  it('returns empty array for empty schedule', () => {
    const initial: ProjectionState = { tfi: 50, afi: 50, formScore: 0 };
    const results = projectSchedule(initial, []);
    expect(results).toHaveLength(0);
  });
});

describe('projectAdjustmentOptions', () => {
  const initial: ProjectionState = { tfi: 50, afi: 50, formScore: 0 };
  const schedule: DailyLoad[] = [
    { date: '2026-03-23', rss: 40, is_quality: false },  // today (deviation day)
    { date: '2026-03-24', rss: 35, is_quality: false },  // easy day
    { date: '2026-03-25', rss: 90, is_quality: true },   // quality session
    { date: '2026-03-26', rss: 35, is_quality: false },
    { date: '2026-03-27', rss: 40, is_quality: false },
  ];

  it('returns all five projection scenarios', () => {
    const result = projectAdjustmentOptions(initial, schedule, 120, 2);

    expect(result).toHaveProperty('planned');
    expect(result).toHaveProperty('no_adjust');
    expect(result).toHaveProperty('modify');
    expect(result).toHaveProperty('swap');
    expect(result).toHaveProperty('insert_rest');
  });

  it('no_adjust has worse FS than planned when deviation is higher', () => {
    const result = projectAdjustmentOptions(initial, schedule, 120, 2);

    // Higher RSS today → higher AFI → lower FS
    expect(result.no_adjust).toBeLessThan(result.planned);
  });

  it('modify recovers FS toward planned', () => {
    const result = projectAdjustmentOptions(initial, schedule, 120, 2);

    // Trimming the quality session should bring FS closer to planned
    const noAdjustGap = Math.abs(result.no_adjust - result.planned);
    const modifyGap = Math.abs(result.modify - result.planned);
    expect(modifyGap).toBeLessThan(noAdjustGap);
  });
});

describe('assessDeviationImpact', () => {
  it('returns no intervention for small gap', () => {
    const projections = {
      planned: -5,
      no_adjust: -8,
      modify: -6,
      swap: -5,
      insert_rest: -4,
    };
    const result = assessDeviationImpact(projections, {
      swapFeasible: true,
      qualitySessionImportance: 'B',
    });

    expect(result.intervention_needed).toBe(false);
    expect(result.recommended_option).toBe('no_adjust');
  });

  it('recommends intervention when FS breaches threshold', () => {
    const projections = {
      planned: -5,
      no_adjust: -20,  // below -15 threshold
      modify: -10,
      swap: -6,
      insert_rest: -4,
    };
    const result = assessDeviationImpact(projections, {
      swapFeasible: true,
      qualitySessionImportance: 'B',
    });

    expect(result.intervention_needed).toBe(true);
    expect(result.urgency).toBe('medium');
  });

  it('returns high urgency for A-priority session breach', () => {
    const projections = {
      planned: -5,
      no_adjust: -20,
      modify: -10,
      swap: -6,
      insert_rest: -4,
    };
    const result = assessDeviationImpact(projections, {
      swapFeasible: true,
      qualitySessionImportance: 'A',
    });

    expect(result.urgency).toBe('high');
  });
});
