/**
 * EFI — Execution Fidelity Index
 *
 * Measures how faithfully an athlete executed their planned workout.
 * Composite of Volume Fidelity (VF), Intensity Fidelity Score (IFS),
 * and Consistency Fidelity (CF).
 *
 * EFI = (0.30 × VF + 0.40 × IFS + 0.30 × CF) × 100
 */
import type { ZoneDistribution, EFIInputs, EFIResult } from './types';

const ZONE_WEIGHTS: ZoneDistribution = { Z1: 0.5, Z2: 1.5, Z3: 1.0, Z4: 1.2, Z5: 1.3 };
const IFS_MAX_DEVIATION = 2.8;
const ZONE_KEYS = ['Z1', 'Z2', 'Z3', 'Z4', 'Z5'] as const;

export function computeEFI(inputs: EFIInputs): EFIResult {
  const {
    plannedTSS, actualTSS, plannedZones, actualZones,
    rollingSessionsPlanned, rollingSessionsActual,
  } = inputs;

  // --- Volume Fidelity ---
  const r = plannedTSS > 0 ? actualTSS / plannedTSS : 0;
  let vf: number;
  if (r >= 0.85 && r <= 1.10) {
    vf = 1.0;
  } else if (r < 0.85) {
    vf = r / 0.85;
  } else {
    vf = Math.max(0, 1 - (r - 1.10) / 0.45);
  }

  // --- Intensity Fidelity ---
  let D = 0;
  for (const zone of ZONE_KEYS) {
    D += ZONE_WEIGHTS[zone] * Math.abs((plannedZones[zone] ?? 0) - (actualZones[zone] ?? 0));
  }
  const ifs = Math.max(0, 1 - D / IFS_MAX_DEVIATION);

  // --- Consistency Fidelity ---
  const N = rollingSessionsPlanned.length;
  let cfSum = 0;
  for (let i = 0; i < N; i++) {
    const planned = rollingSessionsPlanned[i];
    const actual = rollingSessionsActual[i] ?? 0;
    const s = planned > 0 ? Math.min(1.0, actual / (0.85 * planned)) : 0;
    cfSum += s;
  }
  const cf = N > 0 ? cfSum / N : 0;

  // --- Composite ---
  const efi = Math.round((0.30 * vf + 0.40 * ifs + 0.30 * cf) * 100 * 10) / 10;

  return {
    efi: Math.min(100, Math.max(0, efi)),
    vf, ifs, cf,
    vfDebug: { r },
    ifsDebug: { D, maxD: IFS_MAX_DEVIATION },
  };
}

/**
 * Plain-language coaching insight for the AI coach system prompt.
 */
export function efiCoachInsight(result: EFIResult): string {
  const { efi, vf, ifs, cf } = result;

  if (efi >= 80) {
    return `Athlete EFI is ${efi}/100 — strong execution across all dimensions. Training stimulus is well-matched to intent.`;
  }
  if (ifs < 0.65) {
    return `Athlete EFI is ${efi}/100. Primary drag: Intensity Fidelity (${(ifs * 100).toFixed(0)}%). Zone distribution is misaligned — likely drifting into moderate intensity when plan calls for polarized structure. Ask about perceived effort and whether workouts felt appropriate.`;
  }
  if (cf < 0.70) {
    return `Athlete EFI is ${efi}/100. Primary drag: Consistency Fidelity (${(cf * 100).toFixed(0)}%). Session completion is below target over the past 28 days. Probe for external life stressors or training load mismatch.`;
  }
  if (vf < 0.75) {
    return `Athlete EFI is ${efi}/100. Primary drag: Volume Fidelity (${(vf * 100).toFixed(0)}%). Significant gap between planned and actual TSS. Check if workouts are being cut short or if planned load is miscalibrated.`;
  }
  return `Athlete EFI is ${efi}/100. Moderate execution — all sub-scores are middling. No single dominant failure mode; review overall training adherence pattern.`;
}
