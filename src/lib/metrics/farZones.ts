/**
 * FAR — Zone classification and status labels
 * Spec: docs/TRIBOS_STATS_BIBLE.md §5.4
 */
import type { FARZone } from './types';

// ─── Zone classification ──────────────────────────────────────────────────────

export function classifyFARZone(score: number): FARZone {
  if (score < 0)    return 'detraining';
  if (score < 40)   return 'maintaining';
  if (score < 100)  return 'building';
  if (score < 130)  return 'overreaching';
  return 'danger';
}

// ─── Zone colors (CSS variable names matching theme.js) ──────────────────────

export const FAR_ZONE_COLORS: Record<FARZone, string> = {
  detraining:   'var(--tribos-coral)',
  maintaining:  'var(--mantine-color-gray-5)',
  building:     'var(--tribos-teal)',
  overreaching: 'var(--tribos-orange)',
  danger:       'var(--tribos-coral)',
};

// ─── Status labels ────────────────────────────────────────────────────────────

/**
 * Return the ALL-CAPS status label for a FAR score.
 *
 * Applies spec §5.4 modifiers:
 * - building + score ≥ 95 → "BUILDING — AT SUSTAINABLE MAX"
 * - overreaching + score ≤ ceiling×100 → "OVERREACHING — WITHIN PERSONAL ENVELOPE"
 * - overreaching + score > ceiling×100 → "OVERREACHING — ABOVE PERSONAL CEILING"
 *
 * @param score    Computed FAR score
 * @param ceiling  Personal ceiling weekly rate (e.g. 1.5). Used to derive 100% point.
 * @param gapDays  Included for future caveat prefix; not used in label itself.
 */
export function getFARStatusLabel(score: number, ceiling: number, _gapDays: number): string {
  const zone = classifyFARZone(score);

  // The "100%" point is always ceiling×100/ceiling = 100. The overreaching
  // envelope modifier compares score to the ceiling-normalised threshold.
  // For Phase 1 (universal ceiling), personal_ceiling_weekly_rate=1.5, so
  // the ceiling-relative threshold is 100. This logic is ceiling-agnostic.
  const ceilingScore = 100;

  switch (zone) {
    case 'detraining':
      return 'LOSING FITNESS';
    case 'maintaining':
      return 'MAINTAINING';
    case 'building':
      if (score >= 95) return 'BUILDING — AT SUSTAINABLE MAX';
      return 'BUILDING';
    case 'overreaching':
      if (score <= ceilingScore) return 'OVERREACHING — WITHIN PERSONAL ENVELOPE';
      return 'OVERREACHING — ABOVE PERSONAL CEILING';
    case 'danger':
      return 'DANGER — BACK OFF';
  }
}
