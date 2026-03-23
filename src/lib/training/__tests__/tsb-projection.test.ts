import { describe, it, expect } from 'vitest';
import {
  stepDay,
  projectSchedule,
  classifyTSB,
  projectAdjustmentOptions,
  assessDeviationImpact,
} from '../tsb-projection';
import type { DailyLoad, ProjectionState } from '../types';

describe('stepDay', () => {
  it('moves CTL toward TSS with 42-day time constant', () => {
    const state: ProjectionState = { ctl: 0, atl: 0, tsb: 0 };
    const next = stepDay(state, 100);

    // CTL should move from 0 toward 100 by 1/42
    expect(next.ctl).toBeCloseTo(100 / 42, 4);
  });

  it('moves ATL toward TSS with 7-day time constant', () => {
    const state: ProjectionState = { ctl: 0, atl: 0, tsb: 0 };
    const next = stepDay(state, 100);

    // ATL should move from 0 toward 100 by 1/7
    expect(next.atl).toBeCloseTo(100 / 7, 4);
  });

  it('maintains TSB = CTL - ATL', () => {
    const state: ProjectionState = { ctl: 50, atl: 60, tsb: -10 };
    const next = stepDay(state, 80);

    expect(next.tsb).toBeCloseTo(next.ctl - next.atl, 10);
  });

  it('converges CTL to ~100 after 42 days of TSS=100', () => {
    let state: ProjectionState = { ctl: 0, atl: 0, tsb: 0 };
    for (let i = 0; i < 42; i++) {
      state = stepDay(state, 100);
    }
    // After one time constant, should reach ~63.2% of target (1 - 1/e)
    expect(state.ctl).toBeGreaterThan(60);
    expect(state.ctl).toBeLessThan(70);
  });

  it('converges ATL to ~100 after 7 days of TSS=100', () => {
    let state: ProjectionState = { ctl: 0, atl: 0, tsb: 0 };
    for (let i = 0; i < 7; i++) {
      state = stepDay(state, 100);
    }
    // After one time constant, should reach ~63.2%
    expect(state.atl).toBeGreaterThan(60);
    expect(state.atl).toBeLessThan(70);
  });

  it('zero TSS makes CTL and ATL decay toward 0', () => {
    const state: ProjectionState = { ctl: 100, atl: 100, tsb: 0 };
    const next = stepDay(state, 0);

    expect(next.ctl).toBeLessThan(100);
    expect(next.atl).toBeLessThan(100);
  });
});

describe('classifyTSB', () => {
  it('classifies race_ready for TSB >= 5', () => {
    expect(classifyTSB(10)).toBe('race_ready');
    expect(classifyTSB(5)).toBe('race_ready');
  });

  it('classifies building for TSB >= -10', () => {
    expect(classifyTSB(0)).toBe('building');
    expect(classifyTSB(-10)).toBe('building');
  });

  it('classifies heavy_load for TSB >= -25', () => {
    expect(classifyTSB(-15)).toBe('heavy_load');
    expect(classifyTSB(-25)).toBe('heavy_load');
  });

  it('classifies overreached for TSB < -25', () => {
    expect(classifyTSB(-30)).toBe('overreached');
    expect(classifyTSB(-50)).toBe('overreached');
  });
});

describe('projectSchedule', () => {
  it('projects forward through a schedule', () => {
    const initial: ProjectionState = { ctl: 50, atl: 50, tsb: 0 };
    const schedule: DailyLoad[] = [
      { date: '2026-03-23', tss: 80, is_quality: false },
      { date: '2026-03-24', tss: 40, is_quality: false },
      { date: '2026-03-25', tss: 100, is_quality: true },
    ];

    const results = projectSchedule(initial, schedule);

    expect(results).toHaveLength(3);
    expect(results[0].day).toBe('2026-03-23');
    expect(results[2].is_quality).toBe(true);
    // After a high TSS day, ATL should spike, making TSB negative
    expect(results[0].state.tsb).toBeLessThan(0);
  });

  it('returns empty array for empty schedule', () => {
    const initial: ProjectionState = { ctl: 50, atl: 50, tsb: 0 };
    const results = projectSchedule(initial, []);
    expect(results).toHaveLength(0);
  });
});

describe('projectAdjustmentOptions', () => {
  const initial: ProjectionState = { ctl: 50, atl: 50, tsb: 0 };
  const schedule: DailyLoad[] = [
    { date: '2026-03-23', tss: 40, is_quality: false },  // today (deviation day)
    { date: '2026-03-24', tss: 35, is_quality: false },  // easy day
    { date: '2026-03-25', tss: 90, is_quality: true },   // quality session
    { date: '2026-03-26', tss: 35, is_quality: false },
    { date: '2026-03-27', tss: 40, is_quality: false },
  ];

  it('returns all five projection scenarios', () => {
    const result = projectAdjustmentOptions(initial, schedule, 120, 2);

    expect(result).toHaveProperty('planned');
    expect(result).toHaveProperty('no_adjust');
    expect(result).toHaveProperty('modify');
    expect(result).toHaveProperty('swap');
    expect(result).toHaveProperty('insert_rest');
  });

  it('no_adjust has worse TSB than planned when deviation is higher', () => {
    const result = projectAdjustmentOptions(initial, schedule, 120, 2);

    // Higher TSS today → higher ATL → lower TSB
    expect(result.no_adjust).toBeLessThan(result.planned);
  });

  it('modify recovers TSB toward planned', () => {
    const result = projectAdjustmentOptions(initial, schedule, 120, 2);

    // Trimming the quality session should bring TSB closer to planned
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

  it('recommends intervention when TSB breaches threshold', () => {
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
