/**
 * Proprietary Metrics — Translation Layer
 *
 * Pure functions mapping metric scores to plain-language labels and colors.
 * Follows the pattern established in src/lib/fitness/translate.ts.
 */
import type { MetricTranslation } from '../fitness/types';

// ─── EFI Translation ─────────────────────────────────────────────────────────

// Cuts in lockstep with efiZones in src/utils/todayVocabulary.ts — the same
// EFI must not read "Dialed in" on one page and "On track" on another.
export function translateEFI(score: number): MetricTranslation {
  if (score >= 85) return { label: 'Dialed in', color: 'teal' };
  if (score >= 60) return { label: 'Solid execution', color: 'gold' };
  if (score >= 35) return { label: 'Drifting from plan', color: 'orange' };
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

// Cuts in lockstep with tcasZones in src/utils/todayVocabulary.ts.
export function translateTCAS(score: number): MetricTranslation {
  if (score >= 85) return { label: 'Peak efficiency', color: 'teal' };
  if (score >= 60) return { label: 'Good adaptation', color: 'gold' };
  if (score >= 30) return { label: 'Room to improve', color: 'orange' };
  return { label: 'Review training', color: 'coral' };
}

// ─── Tooltips ────────────────────────────────────────────────────────────────

// Plain language first, abbreviation as the citation (spec §6 rule 2).
export const METRICS_TOOLTIPS = {
  efi(score: number | null): string {
    if (score == null) return 'Execution fidelity (EFI) measures how closely your riding matches your training plan. Requires an active training plan.';
    if (score >= 80) return `You're executing your plan with precision — keep it up. (EFI ${score})`;
    if (score >= 60) return `Decent execution, but some sessions are drifting from the plan. (EFI ${score})`;
    if (score >= 40) return `There's a significant gap between planned and actual training — review your workout structure. (EFI ${score})`;
    return `Training is substantially different from your plan — consider adjusting the plan or your approach. (EFI ${score})`;
  },

  twl(twl: number | null, baseTSS: number | null): string {
    if (twl == null || baseTSS == null) return 'Terrain-weighted load (TWL) adjusts your ride stress for terrain — climbing, gradient changes, and altitude all add hidden stress a flat-road score misses.';
    const overage = baseTSS > 0 ? Math.round(((twl / baseTSS) - 1) * 100) : 0;
    if (overage <= 5) return `Terrain added minimal extra load — flat or smooth riding. (TWL ${twl})`;
    if (overage <= 15) return `Rolling terrain added moderate extra stress — about ${overage}% over the flat-road score. (TWL ${twl})`;
    return `Significant terrain load — about ${overage}% over the flat-road score. Recovery should account for this hidden stress. (TWL ${twl})`;
  },

  tcas(score: number | null): string {
    if (score == null) return 'Adaptation efficiency (TCAS) measures how well you turn available training hours into fitness. Requires 6 weeks of riding data.';
    if (score >= 75) return `Excellent adaptation efficiency — your training time is producing real fitness gains. (TCAS ${score})`;
    if (score >= 50) return `Moderate efficiency — there may be room to improve session quality or recovery patterns. (TCAS ${score})`;
    return `Low adaptation efficiency — consider whether training structure, intensity, or recovery need adjustment. (TCAS ${score})`;
  },
};
