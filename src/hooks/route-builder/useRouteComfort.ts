/**
 * useRouteComfort — check the active route against the rider's Comfort 1–5.
 *
 * Reads the route's ways from the same corridor fetch as the stress and
 * surface layers (roadAttributes.fetchCorridorWays, cached), then runs the
 * comfort validator (comfortValidator.ts). Debounced and sequence-guarded
 * like useRouteStress. A null validation means "not enough road data" and
 * is shown as such, never as a pass.
 *
 * Changing the level re-validates without refetching (the ways are cached).
 */
import { useEffect, useRef, useState } from 'react';
import type { Coordinate } from '../../types/geo';
import { fetchCorridorWays } from '../../utils/roadAttributes';
import { validateComfortRoute, type ComfortValidation } from '../../utils/comfortValidator';
import type { ComfortLevel } from '../../utils/comfortLevels';
import type { TaggedWay } from '../../utils/wayTags';
import { fnv1a32, stableJson } from '../../utils/stableHash';
import { trackRb2 } from '../../features/route-builder-v2/telemetry/trackRb2';

export const COMFORT_DEBOUNCE_MS = 900;

export interface UseRouteComfortReturn {
  validation: ComfortValidation | null;
  loading: boolean;
}

function hashGeometry(coords: ReadonlyArray<Coordinate>): string {
  if (!coords || coords.length < 2) return '';
  return fnv1a32(stableJson(coords.map(([lng, lat]) => [Math.round(lng * 1e5), Math.round(lat * 1e5)])));
}

export function useRouteComfort(
  geometry: { coordinates: Coordinate[] } | null,
  level: ComfortLevel,
  taggedWays: ReadonlyArray<TaggedWay> | null = null,
): UseRouteComfortReturn {
  const [validation, setValidation] = useState<ComfortValidation | null>(null);
  const [loading, setLoading] = useState(false);
  const seqRef = useRef(0);
  const taggedWaysRef = useRef(taggedWays);
  taggedWaysRef.current = taggedWays;

  const geoKey = geometry ? hashGeometry(geometry.coordinates) : '';

  useEffect(() => {
    const seq = ++seqRef.current;
    if (!geometry || !geoKey) {
      setValidation(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const coords = geometry.coordinates;
    const timer = setTimeout(() => {
      void (async () => {
        let next: ComfortValidation | null = null;
        try {
          const corridor = await fetchCorridorWays(coords, { taggedWays: taggedWaysRef.current ?? undefined });
          next = corridor && corridor.ways.length > 0
            ? validateComfortRoute(coords, corridor.ways, { level })
            : null;
        } catch {
          next = null;
        }
        if (seq !== seqRef.current) return;
        setValidation(next);
        setLoading(false);
        trackRb2('comfort_checked', next
          ? {
              level,
              within_pct: Math.round(next.withinPct),
              flagged: next.flaggedStretches.length,
              unknown_pct: Math.round(next.unknownPct),
              passes: next.passes,
            }
          : { level, unavailable: true });
      })();
    }, COMFORT_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // geometry is represented by geoKey
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geoKey, level]);

  return { validation, loading };
}

export default useRouteComfort;
