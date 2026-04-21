/**
 * Proprietary Metrics — Translation Layer
 *
 * Pure functions mapping metric scores to plain-language labels and colors.
 * Follows the pattern established in src/lib/fitness/translate.ts.
 */
import type { MetricTranslation } from '../fitness/types';

// ─── EFI Translation ─────────────────────────────────────────────────────────

export function translateEFI(score: number): MetricTranslation {
  if (score >= 80) return { label: 'Dialed in', color: 'teal' };
  if (score >= 60) return { label: 'Solid execution', color: 'gold' };
  if (score >= 40) return { label: 'Drifting from plan', color: 'orange' };
  return { label: 'Plan mismatch', color: 'coral' };
}

// ─── TWL Translation (based on overage %) ────────────────────────────────────

export function translateTWL(overagePercent: number): MetricTranslation {
  if (overagePercent <= 5)  return { label: 'Flat terrain', color: 'teal' };
  if (overagePercent <= 15) return { label: 'Rolling terrain', color: 'gold' };
  if (overagePercent <= 30) return { label: 'Mountain terrain', color: 'orange' };
  return { label: 'Extreme terrain', color: 'coral' };
}

// ─── TCAS Translation ────────────────────────────────────────────────────────

export function translateTCAS(score: number): MetricTranslation {
  if (score >= 80) return { label: 'Peak efficiency', color: 'teal' };
  if (score >= 60) return { label: 'Good adaptation', color: 'gold' };
  if (score >= 40) return { label: 'Room to improve', color: 'orange' };
  return { label: 'Review training', color: 'coral' };
}

// ─── FAR Translation ─────────────────────────────────────────────────────────

export function translateFAR(score: number): MetricTranslation {
  if (score >= 130) return { label: 'Danger — back off',     color: 'coral' };
  if (score >= 100) return { label: 'Overreaching — monitor', color: 'orange' };
  if (score >= 40)  return { label: 'Building fitness',       color: 'teal' };
  if (score >= 0)   return { label: 'Maintaining',            color: 'muted' };
  return                   { label: 'Losing fitness',         color: 'coral' };
}

// ─── Tooltips ────────────────────────────────────────────────────────────────

export const METRICS_TOOLTIPS = {
  efi(score: number | null): string {
    if (score == null) return 'EFI measures how closely your riding matches your training plan. Requires an active training plan.';
    if (score >= 80) return `EFI ${score} — You're executing your plan with precision. Keep it up.`;
    if (score >= 60) return `EFI ${score} — Decent execution but some sessions are drifting from the plan.`;
    if (score >= 40) return `EFI ${score} — Significant gap between planned and actual training. Review your workout structure.`;
    return `EFI ${score} — Training is substantially different from your plan. Consider adjusting the plan or your approach.`;
  },

  twl(twl: number | null, baseTSS: number | null): string {
    if (twl == null || baseTSS == null) return 'TWL adjusts your training load for terrain — climbing, gradient changes, and altitude all add hidden stress that TSS misses.';
    const overage = baseTSS > 0 ? Math.round(((twl / baseTSS) - 1) * 100) : 0;
    if (overage <= 5) return `TWL ${twl} — Terrain added minimal extra load. Flat or smooth terrain.`;
    if (overage <= 15) return `TWL ${twl} (+${overage}% over TSS) — Rolling terrain added moderate extra stress.`;
    return `TWL ${twl} (+${overage}% over TSS) — Significant terrain load. Recovery should account for this hidden stress.`;
  },

  tcas(score: number | null): string {
    if (score == null) return 'TCAS measures how efficiently you turn available training hours into fitness. Requires 6 weeks of riding data.';
    if (score >= 75) return `TCAS ${score} — Excellent adaptation efficiency. Your training time is producing real fitness gains.`;
    if (score >= 50) return `TCAS ${score} — Moderate efficiency. There may be opportunities to improve session quality or recovery patterns.`;
    return `TCAS ${score} — Low adaptation efficiency. Consider whether training structure, intensity, or recovery need adjustment.`;
  },

  far(score: number | null): string {
    if (score == null) return 'Fitness Acquisition Rate — how fast you\'re building fitness, relative to a sustainable pace. Requires 28 days of training data.';
    if (score >= 130) return `FAR ${Math.round(score)} — Unsustainable build rate. Injury or illness risk is elevated — back off now.`;
    if (score >= 100) return `FAR ${Math.round(score)} — You\'re building faster than your sustainable ceiling. Monitor recovery closely.`;
    if (score >= 40)  return `FAR ${Math.round(score)} — You\'re building fitness at a healthy pace.`;
    if (score >= 0)   return `FAR ${Math.round(score)} — Fitness is holding steady. Add a bit more load to start building.`;
    return                  `FAR ${Math.round(score)} — Fitness is declining. Consistent training will reverse this.`;
  },
};
