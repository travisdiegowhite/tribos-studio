import { describe, it, expect } from 'vitest';
import { computeTCAS, tcasCoachInsight } from '../tcas';

const baseInputs = {
  ctlNow: 60, ctl6wAgo: 45,
  avgWeeklyHours: 8,
  yearsTraining: 5,
  efNow: 1.60, ef6wAgo: 1.50,
  paHrNow: 3.0, paHr6wAgo: 8.0,
  p20minNow: 260, p20min6wAgo: 250,
};

describe('computeTCAS', () => {
  it('produces a score in 0-100 range', () => {
    const result = computeTCAS(baseInputs);
    expect(result.tcas).toBeGreaterThanOrEqual(0);
    expect(result.tcas).toBeLessThanOrEqual(100);
  });

  it('HE reflects fitness velocity relative to hours', () => {
    // FV = (60-45)/6 = 2.5 TSS/day/week
    // Expected rate = 8 * 0.30 = 2.4
    // HE = 2.5 / 2.4 ≈ 1.04
    const result = computeTCAS(baseInputs);
    expect(result.fv).toBeCloseTo(2.5, 1);
    expect(result.he).toBeCloseTo(1.04, 1);
  });

  it('HE is capped at 2.0', () => {
    const result = computeTCAS({
      ...baseInputs,
      ctlNow: 100, ctl6wAgo: 20, // huge jump
      avgWeeklyHours: 3,           // very few hours
    });
    expect(result.he).toBe(2.0);
  });

  it('HE is 0 when CTL is declining', () => {
    const result = computeTCAS({
      ...baseInputs,
      ctlNow: 40, ctl6wAgo: 60,
    });
    expect(result.he).toBe(0);
    expect(result.fv).toBeLessThan(0);
  });

  it('ADI measures decoupling improvement', () => {
    // paHr went from 8% to 3% = -5 improvement → ADI = 5/10 = 0.5
    const result = computeTCAS(baseInputs);
    expect(result.adi).toBeCloseTo(0.5, 1);
  });

  it('ADI is capped at 1.0', () => {
    const result = computeTCAS({
      ...baseInputs,
      paHrNow: 0, paHr6wAgo: 15, // huge improvement
    });
    expect(result.adi).toBe(1.0);
  });

  it('PPD reflects 20-min power gains', () => {
    // (260-250)/250 * 100 = 4% gain → PPD = 4 * 0.10 = 0.4
    const result = computeTCAS(baseInputs);
    expect(result.ppd).toBeCloseTo(0.4, 1);
  });

  it('PPD is capped at 1.5', () => {
    const result = computeTCAS({
      ...baseInputs,
      p20minNow: 350, p20min6wAgo: 200, // 75% gain
    });
    expect(result.ppd).toBe(1.5);
  });

  it('TAA increases with training years', () => {
    const novice = computeTCAS({ ...baseInputs, yearsTraining: 0 });
    const vet = computeTCAS({ ...baseInputs, yearsTraining: 10 });
    expect(novice.taa).toBe(1.0);
    expect(vet.taa).toBe(1.5);
    expect(vet.tcas).toBeGreaterThan(novice.tcas);
  });

  it('score is 0 when all inputs show no progress', () => {
    const result = computeTCAS({
      ctlNow: 50, ctl6wAgo: 55, // declining
      avgWeeklyHours: 10,
      yearsTraining: 0,
      efNow: 1.40, ef6wAgo: 1.50, // declining EF
      paHrNow: 10, paHr6wAgo: 5,  // worsening decoupling
      p20minNow: 240, p20min6wAgo: 250, // declining power
    });
    expect(result.tcas).toBe(0);
    expect(result.he).toBe(0);
  });

  it('handles zero weekly hours gracefully', () => {
    // avgWeeklyHours = 0 would cause division by zero in HE
    const result = computeTCAS({
      ...baseInputs,
      avgWeeklyHours: 0,
    });
    // HE = fv / (0 * 0.30) = fv / 0 → Infinity, capped at 2.0
    expect(result.he).toBeLessThanOrEqual(2.0);
    expect(result.tcas).toBeGreaterThanOrEqual(0);
  });
});

describe('tcasCoachInsight', () => {
  it('returns positive message for high TCAS', () => {
    const result = computeTCAS(baseInputs);
    // With good inputs, score should be decent
    const insight = tcasCoachInsight({ ...result, tcas: 80 });
    expect(insight).toContain('excellent adaptation efficiency');
  });

  it('flags declining CTL', () => {
    const insight = tcasCoachInsight({
      tcas: 20, he: 0, aq: 0.5, taa: 1, fv: -2, eft: 0, adi: 0, ppd: 0,
    });
    expect(insight).toContain('CTL is declining');
  });

  it('flags low hours efficiency', () => {
    const insight = tcasCoachInsight({
      tcas: 30, he: 0.3, aq: 0.5, taa: 1, fv: 1, eft: 0.5, adi: 0.5, ppd: 0.5,
    });
    expect(insight).toContain('Hours Efficiency is low');
  });

  it('flags low adaptation quality', () => {
    const insight = tcasCoachInsight({
      tcas: 35, he: 0.8, aq: 0.2, taa: 1, fv: 2, eft: 0, adi: 0, ppd: 0,
    });
    expect(insight).toContain('Adaptation Quality is low');
  });
});
