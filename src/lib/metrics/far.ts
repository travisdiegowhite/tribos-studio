/**
 * FAR — Fitness Acquisition Rate
 *
 * Measures how fast TFI is rising relative to a personal sustainable ceiling.
 * Spec: docs/TRIBOS_STATS_BIBLE.md §5.4
 *
 * Phase 1: universal ceiling (1.5 TFI/week). Personal ceiling (Phase 3) uses
 * the same computeFAR function with a caller-supplied ceiling value.
 */
import type {
  FARGapAssessment,
  FARMomentumFlag,
  FARResult,
  FARZone,
  TrainingLoadDailyRow,
} from './types';
import { classifyFARZone, getFARStatusLabel } from './farZones';

// ─── Primary formula ──────────────────────────────────────────────────────────

/**
 * Compute 28-day primary FAR score.
 * FAR = (ΔTFI_28d / 4) / ceiling × 100
 */
export function computeFAR(
  tfiToday: number,
  tfi28dAgo: number,
  ceiling: number,
): number {
  const weeklyRate = (tfiToday - tfi28dAgo) / 4;
  return (weeklyRate / ceiling) * 100;
}

/**
 * Compute 7-day momentum FAR score.
 * FAR_7d = ΔTFI_7d / ceiling × 100
 */
export function computeFARMomentum(
  tfiToday: number,
  tfi7dAgo: number,
  ceiling: number,
): number {
  const delta7d = tfiToday - tfi7dAgo;
  return (delta7d / ceiling) * 100;
}

/**
 * Derive momentum flag by comparing 7-day rate to 28-day rate.
 * Accelerating: 7d > 28d by >15%; Decelerating: 7d < 28d by >15%.
 */
export function computeMomentumFlag(far28d: number, far7d: number): FARMomentumFlag {
  // When both are near zero, treat as steady to avoid noisy flags
  if (Math.abs(far28d) < 5 && Math.abs(far7d) < 5) return 'steady';
  const threshold = Math.abs(far28d) * 0.15;
  if (far7d > far28d + threshold) return 'accelerating';
  if (far7d < far28d - threshold) return 'decelerating';
  return 'steady';
}

// ─── Gap detection ────────────────────────────────────────────────────────────

/**
 * Assess sync gaps in a 28-day TFI series.
 *
 * Sync gap: rss_source IS NULL (device not synced — no data).
 * Rest day: rss_source IS NOT NULL, rss may be 0 (legitimate rest — NOT a gap).
 *
 * The distinction matters: a 10-day training break should surface as negative
 * FAR (correct); a 10-day sync outage should suppress FAR (also correct).
 */
export function assessFARGaps(loadDaily: TrainingLoadDailyRow[]): FARGapAssessment {
  const gapDays = loadDaily.filter(d => d.rss_source === null).length;

  // Boundary gaps make the delta math unreliable — always suppress.
  // loadDaily is expected sorted newest-first (index 0 = today, last = today−28).
  const boundaryGap = (
    loadDaily[0]?.rss_source === null ||
    loadDaily[loadDaily.length - 1]?.rss_source === null
  );

  if (boundaryGap) {
    return { gapDays, treatment: 'suppress', confidence: 0, boundaryGap: true };
  }

  if (gapDays >= 14) return { gapDays, treatment: 'suppress', confidence: 0,   boundaryGap: false };
  if (gapDays >= 6)  return { gapDays, treatment: 'warning',  confidence: 0.5, boundaryGap: false };
  if (gapDays >= 3)  return { gapDays, treatment: 'caveat',   confidence: 0.7, boundaryGap: false };
  return              { gapDays, treatment: 'normal',   confidence: 1.0, boundaryGap: false };
}

// ─── Full computation pipeline ────────────────────────────────────────────────

/**
 * Run the full FAR computation pipeline from a 28-day TFI series.
 *
 * @param loadDaily  Array of ≥29 rows from training_load_daily, sorted newest-first.
 *                   Fewer than 29 rows → null score (cold start — need today + 28 prior days).
 * @param ceiling    Personal ceiling in TFI/week (Phase 1: always 1.5).
 */
export function computeFARFromSeries(
  loadDaily: TrainingLoadDailyRow[],
  ceiling: number,
): FARResult {
  const suppress: FARResult = {
    score: null,
    score_7d: null,
    tfi_delta_28d: null,
    weekly_rate: null,
    zone: null,
    zone_label: '',
    momentum_flag: 'steady',
    personal_ceiling_weekly_rate: ceiling,
    gap_days_in_window: 0,
    confidence: 0,
    treatment: 'suppress',
  };

  // Cold start — not enough history (need indices 0, 7, 28 → min 29 rows)
  if (loadDaily.length < 29) return suppress;

  const gap = assessFARGaps(loadDaily);
  if (gap.treatment === 'suppress') {
    return { ...suppress, gap_days_in_window: gap.gapDays };
  }

  // Use the first row (today) and rows at index 7 and 28
  const tfiToday  = loadDaily[0].tfi;
  const tfi28dAgo = loadDaily[28].tfi;
  const tfi7dAgo  = loadDaily[7].tfi;

  // Null TFI in key positions → canonical column not yet populated; suppress
  if (tfiToday == null || tfi28dAgo == null || tfi7dAgo == null) {
    return { ...suppress, gap_days_in_window: gap.gapDays };
  }

  const score    = computeFAR(tfiToday, tfi28dAgo, ceiling);
  const score_7d = computeFARMomentum(tfiToday, tfi7dAgo, ceiling);
  const delta    = tfiToday - tfi28dAgo;
  const zone: FARZone = classifyFARZone(score);

  return {
    score,
    score_7d,
    tfi_delta_28d: delta,
    weekly_rate: delta / 4,
    zone,
    zone_label: getFARStatusLabel(score, ceiling, gap.gapDays),
    momentum_flag: computeMomentumFlag(score, score_7d),
    personal_ceiling_weekly_rate: ceiling,
    gap_days_in_window: gap.gapDays,
    confidence: gap.confidence,
    treatment: gap.treatment,
  };
}
