/**
 * useRouteStress — always-on traffic-stress analysis for the active route.
 *
 * Runs `measureRouteStress` (roadAttributes.ts: BRouter tags when present,
 * else a cached Overpass corridor query) for whatever geometry is on the
 * map, debounced so a drag-snap burst costs one fetch, and guarded by a
 * sequence number so a slow early answer can never overwrite a newer one.
 * The result feeds the route card's QUIET ROADS stat, the toolbar chip, the
 * legend and the map overlay, so the rider sees the number without opening
 * any layer panel.
 */

import { useEffect, useRef, useState } from 'react';
import type { Coordinate } from '../../types/geo';
import { measureRouteStress, type RouteStressResult } from '../../utils/roadAttributes';
import type { TaggedWay } from '../../utils/wayTags';
import { fnv1a32, stableJson } from '../../utils/stableHash';
import { trackRb2 } from '../../features/route-builder-v2/telemetry/trackRb2';

export type RouteStressStatus = 'idle' | 'loading' | 'ready' | 'unavailable';

export interface UseRouteStressReturn {
  result: RouteStressResult | null;
  status: RouteStressStatus;
}

export const STRESS_DEBOUNCE_MS = 800;
/** One automatic retry after a null result (mirror hiccup) before giving up. */
export const STRESS_RETRY_MS = 4000;

function hashGeometry(coords: ReadonlyArray<Coordinate>): string {
  if (!coords || coords.length < 2) return '';
  const quantized = coords.map(([lng, lat]) => [
    Math.round(lng * 1e5) / 1e5,
    Math.round(lat * 1e5) / 1e5,
  ]);
  return fnv1a32(stableJson(quantized));
}

export function useRouteStress(
  geometry: { coordinates: Coordinate[] } | null,
  taggedWays: ReadonlyArray<TaggedWay> | null = null,
): UseRouteStressReturn {
  const [result, setResult] = useState<RouteStressResult | null>(null);
  const [status, setStatus] = useState<RouteStressStatus>('idle');
  const seqRef = useRef(0);
  const lastKeyRef = useRef('');
  const taggedWaysRef = useRef(taggedWays);
  taggedWaysRef.current = taggedWays;

  const key = geometry ? hashGeometry(geometry.coordinates) : '';

  useEffect(() => {
    if (!geometry || !key) {
      seqRef.current += 1;
      lastKeyRef.current = '';
      setResult(null);
      setStatus('idle');
      return;
    }
    if (lastKeyRef.current === key) return;
    lastKeyRef.current = key;

    const seq = ++seqRef.current;
    setStatus('loading');
    const coords = geometry.coordinates;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const attempt = async (retriesLeft: number) => {
      let next: RouteStressResult | null = null;
      try {
        next = await measureRouteStress(coords, { taggedWays: taggedWaysRef.current });
      } catch {
        next = null;
      }
      if (seq !== seqRef.current) return;
      if (!next && retriesLeft > 0) {
        retryTimer = setTimeout(() => void attempt(retriesLeft - 1), STRESS_RETRY_MS);
        return;
      }
      setResult(next);
      setStatus(next ? 'ready' : 'unavailable');
      if (next) {
        trackRb2('stress_computed', {
          quiet_pct: next.summary.quietPct,
          lts4_km: next.summary.lts4Km,
          unknown_pct: next.summary.unknownPct,
          facility_pct: next.facility?.facilityPct ?? null,
          source: next.source,
        });
      }
    };

    const timer = setTimeout(() => void attempt(1), STRESS_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [geometry, key]);

  return { result, status };
}

export default useRouteStress;
