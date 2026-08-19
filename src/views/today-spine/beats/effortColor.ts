/**
 * Effort → color, shared by every beats glyph so the same ride is the same
 * color wherever it appears (trace, rhythm strip). Tiers are the RSS bands
 * from buildBeats.effortTier; colors are the locked Today palette.
 */

import { C } from '../tokens';
import type { EffortTier } from './types';

export const TIER_COLOR: Record<EffortTier, string> = {
  easy: 'rgba(42, 140, 130, 0.55)', // C.teal, held back so easy reads as easy
  steady: C.teal,
  brisk: C.gold,
  hard: C.orange,
};

export function tierColor(tier: EffortTier | null): string {
  return tier ? TIER_COLOR[tier] : C.border;
}
