/**
 * TCAS — Time-Constrained Adaptation Score
 *
 * Measures fitness gain efficiency per available training hour.
 * TCAS = clamp( (w_HE × HE + w_AQ × AQ) × TAA × 50, 0, 100 )
 */
import type { TCASSixWeekWindow, TCASResult } from './types';

export function computeTCAS(inputs: TCASSixWeekWindow): TCASResult {
  const {
    ctlNow, ctl6wAgo, avgWeeklyHours, yearsTraining,
    efNow, ef6wAgo, paHrNow, paHr6wAgo, p20minNow, p20min6wAgo,
  } = inputs;

  // --- Hours Efficiency ---
  const fv = (ctlNow - ctl6wAgo) / 6;
  const he = Math.min(2.0, Math.max(0, fv / (avgWeeklyHours * 0.30)));

  // --- Adaptation Quality ---

  // EFT — Efficiency Factor Trend
  const eft = ef6wAgo > 0
    ? Math.min(2.0, (efNow - ef6wAgo) / (ef6wAgo * 0.02))
    : 0;

  // ADI — Aerobic Decoupling Improvement
  const deltaDecoupling = paHrNow - paHr6wAgo; // negative = improved
  const adi = Math.min(1.0, -deltaDecoupling / 10);

  // PPD — Peak Power Development
  const deltaP20Pct = p20min6wAgo > 0
    ? ((p20minNow - p20min6wAgo) / p20min6wAgo) * 100
    : 0;
  const ppd = Math.min(1.5, Math.max(0, deltaP20Pct * 0.10));

  const aq = Math.min(1.2, Math.max(0, 0.40 * eft + 0.30 * adi + 0.30 * ppd));

  // --- Training Age Adjustment ---
  const taa = 1 + (0.05 * Math.max(0, yearsTraining));

  // --- Composite ---
  const raw = (0.55 * he + 0.45 * aq) * taa;
  const tcas = Math.min(100, Math.max(0, Math.round(raw * 50 * 10) / 10));

  return { tcas, he, aq, taa, fv, eft, adi, ppd };
}

/**
 * Plain-language coaching insight for the AI coach system prompt.
 */
export function tcasCoachInsight(result: TCASResult): string {
  const { tcas, he, aq, fv } = result;

  if (tcas >= 75) {
    return `TCAS ${tcas}/100 — excellent adaptation efficiency for available hours. Quality signals confirm gains are real.`;
  }
  if (fv < 0) {
    return `TCAS ${tcas}/100. CTL is declining (FV = ${fv.toFixed(2)}). If this is intentional recovery, expected. If not, load or recovery alignment needs review.`;
  }
  if (he < 0.5) {
    return `TCAS ${tcas}/100. Hours Efficiency is low — fitness is not moving in proportion to training investment. Review session quality and structure.`;
  }
  if (aq < 0.4) {
    return `TCAS ${tcas}/100. Adaptation Quality is low — CTL may be rising but physiological markers (EF, decoupling, peak power) aren't confirming real adaptation. Risk of junk miles.`;
  }
  return `TCAS ${tcas}/100. Moderate adaptation efficiency. Both HE and AQ have room to improve. Focus on session quality over raw volume.`;
}
