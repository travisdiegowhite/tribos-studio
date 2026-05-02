/**
 * Today View vocabulary mappers.
 *
 * Pure functions. Each maps a numeric metric to a `{ word, token }` pair where
 * `token` selects one of the brand semantic colors. Bands match the Today view
 * spec exactly — keep this file in sync with the spec, not the other way
 * around.
 *
 * Null/undefined inputs always return `{ word: 'Building baseline', token: 'gray' }`
 * so unfetched cells render an empty bar consistently.
 */

export type ColorToken = 'teal' | 'gold' | 'orange' | 'coral' | 'gray';

export interface VocabResult {
  word: string;
  token: ColorToken;
}

const BUILDING_BASELINE: VocabResult = { word: 'Building baseline', token: 'gray' };

const isNum = (n: number | null | undefined): n is number =>
  typeof n === 'number' && Number.isFinite(n);

export function formWordFromScore(formScore: number | null | undefined): VocabResult {
  if (!isNum(formScore)) return BUILDING_BASELINE;
  if (formScore < -20) return { word: 'Drained', token: 'coral' };
  if (formScore < -10) return { word: 'Loaded', token: 'orange' };
  if (formScore <= 5) return { word: 'Sweet spot', token: 'teal' };
  if (formScore <= 15) return { word: 'Sharp', token: 'gold' };
  return { word: 'Stale', token: 'gray' };
}

export function fitnessWord(trendDeltaPct: number | null | undefined): VocabResult {
  if (!isNum(trendDeltaPct)) return BUILDING_BASELINE;
  if (trendDeltaPct > 2) return { word: 'Building', token: 'teal' };
  if (trendDeltaPct < -2) return { word: 'Detraining', token: 'orange' };
  return { word: 'Holding', token: 'gold' };
}

export function fatigueWordFromAFI(
  afi: number | null | undefined,
  afi28dMax: number | null | undefined
): VocabResult {
  if (!isNum(afi) || !isNum(afi28dMax) || afi28dMax <= 0) return BUILDING_BASELINE;
  const ratio = afi / afi28dMax;
  if (ratio < 0.25) return { word: 'Low', token: 'gray' };
  if (ratio <= 0.7) return { word: 'Productive', token: 'teal' };
  if (ratio <= 0.88) return { word: 'High', token: 'orange' };
  return { word: 'Overload', token: 'coral' };
}

export function trendWord(trendDeltaPct: number | null | undefined): VocabResult {
  if (!isNum(trendDeltaPct)) return BUILDING_BASELINE;
  if (trendDeltaPct > 2) return { word: 'Building', token: 'teal' };
  if (trendDeltaPct < -2) return { word: 'Declining', token: 'orange' };
  return { word: 'Holding', token: 'gold' };
}

export function efiWord(efi28d: number | null | undefined): VocabResult {
  if (!isNum(efi28d)) return BUILDING_BASELINE;
  if (efi28d < 35) return { word: 'Off plan', token: 'coral' };
  if (efi28d < 60) return { word: 'Drifting', token: 'orange' };
  if (efi28d < 85) return { word: 'On track', token: 'gold' };
  return { word: 'Locked in', token: 'teal' };
}

export function tcasWord(tcas: number | null | undefined): VocabResult {
  if (!isNum(tcas)) return BUILDING_BASELINE;
  if (tcas < 30) return { word: 'Review', token: 'coral' };
  if (tcas < 60) return { word: 'Building', token: 'orange' };
  if (tcas < 85) return { word: 'Strong', token: 'gold' };
  return { word: 'Peak', token: 'teal' };
}

/**
 * Resolve a `ColorToken` to its CSS variable. Components use this when they
 * need an inline `color` value derived from vocabulary output.
 */
export function colorVar(token: ColorToken): string {
  switch (token) {
    case 'teal':
      return 'var(--color-teal)';
    case 'orange':
      return 'var(--color-orange)';
    case 'gold':
      return 'var(--color-gold)';
    case 'coral':
      return 'var(--color-coral)';
    case 'gray':
    default:
      return 'var(--tribos-neutral-gray)';
  }
}
