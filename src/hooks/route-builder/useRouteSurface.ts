/**
 * useRouteSurface — always-on surface analysis for the active route.
 *
 * Twin of useRouteStress: runs `measureRouteSurface` (roadAttributes.ts,
 * which shares its corridor-ways cache with the traffic-stress analysis, so
 * one BRouter re-ride serves both) for whatever geometry is on the map,
 * debounced and sequence-guarded. Feeds the Surface overlay, the summary
 * bar with its provenance line, the stats card and the personalised ETA.
 */

import { useEffect, useRef, useState } from 'react';
import type { Coordinate } from '../../types/geo';
import { measureRouteSurface, type RouteSurfaceResult } from '../../utils/roadAttributes';
import type { TaggedWay } from '../../utils/wayTags';
import { geometryKey } from '../../utils/wayTags';
import { trackRb2 } from '../../features/route-builder-v2/telemetry/trackRb2';

export type RouteSurfaceStatus = 'idle' | 'loading' | 'ready' | 'unavailable';

export interface UseRouteSurfaceReturn {
  result: RouteSurfaceResult | null;
  status: RouteSurfaceStatus;
}

export const SURFACE_DEBOUNCE_MS = 800;
export const SURFACE_RETRY_MS = 4000;

export function useRouteSurface(
  geometry: { coordinates: Coordinate[] } | null,
  taggedWays: ReadonlyArray<TaggedWay> | null = null,
): UseRouteSurfaceReturn {
  const [result, setResult] = useState<RouteSurfaceResult | null>(null);
  const [status, setStatus] = useState<RouteSurfaceStatus>('idle');
  const seqRef = useRef(0);
  const lastKeyRef = useRef('');
  const taggedWaysRef = useRef(taggedWays);
  taggedWaysRef.current = taggedWays;

  const key = geometry && geometry.coordinates.length >= 2 ? geometryKey(geometry.coordinates) : '';

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
      let next: RouteSurfaceResult | null = null;
      try {
        next = await measureRouteSurface(coords, { taggedWays: taggedWaysRef.current });
      } catch {
        next = null;
      }
      if (seq !== seqRef.current) return;
      if (!next && retriesLeft > 0) {
        retryTimer = setTimeout(() => void attempt(retriesLeft - 1), SURFACE_RETRY_MS);
        return;
      }
      setResult(next);
      setStatus(next ? 'ready' : 'unavailable');
      if (next) {
        trackRb2('surface_computed', {
          gravel_pct: next.summary.gravelPct,
          inferred_pct: next.summary.inferredPct,
          unknown_pct: next.summary.unknownPct,
          source: next.source,
        });
      }
    };

    const timer = setTimeout(() => void attempt(1), SURFACE_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [geometry, key]);

  return { result, status };
}

export default useRouteSurface;
