import { describe, it, expect } from 'vitest';
import { computeEFI, efiCoachInsight } from '../efi';

describe('computeEFI', () => {
  it('returns 100 for perfect execution', () => {
    const result = computeEFI({
      plannedTSS: 100, actualTSS: 100,
      plannedZones: { Z1: 0.5, Z2: 0.0, Z3: 0.0, Z4: 0.0, Z5: 0.5 },
      actualZones:  { Z1: 0.5, Z2: 0.0, Z3: 0.0, Z4: 0.0, Z5: 0.5 },
      rollingSessionsPlanned: [100, 100, 100, 100],
      rollingSessionsActual:  [100, 100, 100, 100],
    });
    expect(result.efi).toBe(100);
    expect(result.vf).toBe(1.0);
    expect(result.ifs).toBe(1.0);
    expect(result.cf).toBe(1.0);
  });

  it('penalizes zone drift correctly (moderate intensity trap)', () => {
    // Plan: polarized (50% Z1, 50% Z5). Actual: all Z2
    const result = computeEFI({
      plannedTSS: 100, actualTSS: 100,
      plannedZones: { Z1: 0.5, Z2: 0.0, Z3: 0.0, Z4: 0.0, Z5: 0.5 },
      actualZones:  { Z1: 0.0, Z2: 1.0, Z3: 0.0, Z4: 0.0, Z5: 0.0 },
      rollingSessionsPlanned: [100],
      rollingSessionsActual:  [100],
    });
    expect(result.ifs).toBeLessThan(0.4);
    // VF=1.0 (TSS on target), CF=1.0 (single session completed), IFS low
    // EFI = (0.30*1 + 0.40*IFS + 0.30*1)*100 — only IFS drags it down
    expect(result.efi).toBeLessThan(70);
  });

  it('applies asymmetric volume penalty — overreach above 1.55 → VF = 0', () => {
    const over = computeEFI({
      plannedTSS: 100, actualTSS: 160,
      plannedZones: { Z1: 0.5, Z2: 0, Z3: 0, Z4: 0, Z5: 0.5 },
      actualZones:  { Z1: 0.5, Z2: 0, Z3: 0, Z4: 0, Z5: 0.5 },
      rollingSessionsPlanned: [100], rollingSessionsActual: [160],
    });
    expect(over.vf).toBe(0);
  });

  it('VF = 1.0 within acceptable window (85%-110%)', () => {
    for (const actual of [85, 90, 100, 110]) {
      const result = computeEFI({
        plannedTSS: 100, actualTSS: actual,
        plannedZones: { Z1: 1, Z2: 0, Z3: 0, Z4: 0, Z5: 0 },
        actualZones:  { Z1: 1, Z2: 0, Z3: 0, Z4: 0, Z5: 0 },
        rollingSessionsPlanned: [100], rollingSessionsActual: [actual],
      });
      expect(result.vf).toBe(1.0);
    }
  });

  it('under-training penalty is linear below 0.85', () => {
    const result = computeEFI({
      plannedTSS: 100, actualTSS: 42.5, // r = 0.425, VF = 0.425/0.85 = 0.5
      plannedZones: { Z1: 1, Z2: 0, Z3: 0, Z4: 0, Z5: 0 },
      actualZones:  { Z1: 1, Z2: 0, Z3: 0, Z4: 0, Z5: 0 },
      rollingSessionsPlanned: [100], rollingSessionsActual: [42.5],
    });
    expect(result.vf).toBeCloseTo(0.5, 2);
  });

  it('CF gives partial credit for sessions above 85% threshold', () => {
    // Session with 80% of planned TSS → credit = 80 / (0.85 * 100) ≈ 0.94
    const result = computeEFI({
      plannedTSS: 100, actualTSS: 100,
      plannedZones: { Z1: 1, Z2: 0, Z3: 0, Z4: 0, Z5: 0 },
      actualZones:  { Z1: 1, Z2: 0, Z3: 0, Z4: 0, Z5: 0 },
      rollingSessionsPlanned: [100, 100],
      rollingSessionsActual:  [80, 100],
    });
    // First session: 80/(0.85*100) ≈ 0.941, second: 1.0, avg ≈ 0.97
    expect(result.cf).toBeGreaterThan(0.9);
    expect(result.cf).toBeLessThan(1.0);
  });

  it('CF = 0 when all sessions are missed', () => {
    const result = computeEFI({
      plannedTSS: 100, actualTSS: 100,
      plannedZones: { Z1: 1, Z2: 0, Z3: 0, Z4: 0, Z5: 0 },
      actualZones:  { Z1: 1, Z2: 0, Z3: 0, Z4: 0, Z5: 0 },
      rollingSessionsPlanned: [100, 100, 100],
      rollingSessionsActual:  [0, 0, 0],
    });
    expect(result.cf).toBe(0);
  });

  it('handles zero planned TSS gracefully', () => {
    const result = computeEFI({
      plannedTSS: 0, actualTSS: 50,
      plannedZones: { Z1: 0, Z2: 0, Z3: 0, Z4: 0, Z5: 0 },
      actualZones:  { Z1: 1, Z2: 0, Z3: 0, Z4: 0, Z5: 0 },
      rollingSessionsPlanned: [], rollingSessionsActual: [],
    });
    expect(result.vf).toBe(0);
    expect(result.cf).toBe(0);
    expect(result.efi).toBeGreaterThanOrEqual(0);
  });

  it('EFI is clamped to [0, 100]', () => {
    const result = computeEFI({
      plannedTSS: 100, actualTSS: 100,
      plannedZones: { Z1: 0.5, Z2: 0, Z3: 0, Z4: 0, Z5: 0.5 },
      actualZones:  { Z1: 0.5, Z2: 0, Z3: 0, Z4: 0, Z5: 0.5 },
      rollingSessionsPlanned: [100, 100, 100, 100],
      rollingSessionsActual:  [100, 100, 100, 100],
    });
    expect(result.efi).toBeLessThanOrEqual(100);
    expect(result.efi).toBeGreaterThanOrEqual(0);
  });
});

describe('efiCoachInsight', () => {
  it('returns positive message for high EFI', () => {
    const insight = efiCoachInsight({ efi: 85, vf: 0.9, ifs: 0.9, cf: 0.9, vfDebug: { r: 1 }, ifsDebug: { D: 0, maxD: 2.8 } });
    expect(insight).toContain('strong execution');
  });

  it('flags intensity fidelity as primary drag', () => {
    const insight = efiCoachInsight({ efi: 50, vf: 0.9, ifs: 0.4, cf: 0.9, vfDebug: { r: 1 }, ifsDebug: { D: 1.5, maxD: 2.8 } });
    expect(insight).toContain('Intensity Fidelity');
  });

  it('flags consistency as primary drag', () => {
    const insight = efiCoachInsight({ efi: 50, vf: 0.9, ifs: 0.8, cf: 0.5, vfDebug: { r: 1 }, ifsDebug: { D: 0.5, maxD: 2.8 } });
    expect(insight).toContain('Consistency Fidelity');
  });
});
