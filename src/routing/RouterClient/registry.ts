/**
 * Provider registry — maps `profile → ordered provider list`.
 *
 * Replaces the hardcoded if/else fallback in
 * `src/utils/smartCyclingRouter.js` (lines 39–146).
 *
 * Ordering preserved from legacy:
 * - gravel / mtb:   BRouter first (specialist for unpaved), then Stadia, then Mapbox
 * - road / commute: Stadia first (best paved cycling infrastructure), then BRouter, then Mapbox
 *
 * See `docs/legacy-routing-notes.md` §1 for the legacy table this mirrors.
 */

import type { ProviderConfig, ProviderName, RoutingProfile } from './types';

export const PROVIDER_REGISTRY: readonly ProviderConfig[] = Object.freeze([
  { profile: 'gravel', providers: ['brouter', 'stadia', 'mapbox'] },
  { profile: 'mtb', providers: ['brouter', 'stadia', 'mapbox'] },
  { profile: 'road', providers: ['stadia', 'brouter', 'mapbox'] },
  { profile: 'commute', providers: ['stadia', 'brouter', 'mapbox'] },
]);

/**
 * Default fallback used when a profile somehow misses the registry
 * (defensive — should never trigger with the type-narrowed
 * RoutingProfile union, but covers future profile additions).
 */
const SAFE_DEFAULT: readonly ProviderName[] = Object.freeze([
  'stadia',
  'mapbox',
]);

export function getProvidersForProfile(
  profile: RoutingProfile,
  registry: readonly ProviderConfig[] = PROVIDER_REGISTRY,
): readonly ProviderName[] {
  const config = registry.find((c) => c.profile === profile);
  return config?.providers ?? SAFE_DEFAULT;
}

/**
 * Profile alias normalisation. Legacy modules use `'mountain'` and
 * `'commuting'`; spec uses `'mtb'` and `'commute'`. Accept either,
 * normalise to spec form on entry.
 */
export function normalizeProfile(profile: string): RoutingProfile {
  switch (profile) {
    case 'mountain':
      return 'mtb';
    case 'commuting':
      return 'commute';
    case 'road':
    case 'gravel':
    case 'mtb':
    case 'commute':
      return profile;
    default:
      return 'road';
  }
}
