/**
 * BikeInfraLayer — Route Builder 2.0 bike infrastructure overlay.
 *
 * Fetches cycling infrastructure (cycleways, bike lanes, shared paths)
 * from OSM within the current map viewport bbox via the existing
 * `bikeInfrastructureService` (already rate-limited + cached per grid
 * cell). Renders via the legacy `BikeInfrastructureLayer` component
 * which owns the 5-tier color palette and Mapbox style expressions.
 */

import { useEffect, useRef, useState } from 'react';
import LegacyBikeInfraLayerImport from '../../../components/BikeInfrastructureLayer.jsx';
import { fetchBikeInfrastructure } from '../../../utils/bikeInfrastructureService.js';

const LegacyBikeInfraLayer = LegacyBikeInfraLayerImport as unknown as React.ComponentType<{
  data: unknown;
  visible: boolean;
  beforeId?: string;
}>;

export interface BikeInfraLayerProps {
  /** Map bounds in {north, south, east, west}. When null, layer renders nothing. */
  bbox: { north: number; south: number; east: number; west: number } | null;
  visible: boolean;
  /**
   * Called with `true` when the layer has nothing to show because its fetch
   * failed (the user toggled it on and got silence), and `false` once a
   * fetch succeeds. Pan-time refetch failures with data already on screen
   * don't fire it.
   */
  onLoadFailure?: (failed: boolean) => void;
}

const DEBOUNCE_MS = 500;

function hashBbox(b: { north: number; south: number; east: number; west: number }): string {
  return `${b.north.toFixed(3)},${b.south.toFixed(3)},${b.east.toFixed(3)},${b.west.toFixed(3)}`;
}

export function BikeInfraLayer({ bbox, visible, onLoadFailure }: BikeInfraLayerProps) {
  const [data, setData] = useState<unknown>(null);
  const lastKeyRef = useRef<string>('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasDataRef = useRef(false);
  const onLoadFailureRef = useRef(onLoadFailure);
  onLoadFailureRef.current = onLoadFailure;

  useEffect(() => {
    if (!visible || !bbox) {
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }
    const key = hashBbox(bbox);
    if (key === lastKeyRef.current) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      lastKeyRef.current = key;
      void (async () => {
        try {
          const result = await fetchBikeInfrastructure(bbox);
          setData(result);
          hasDataRef.current = result != null;
          onLoadFailureRef.current?.(false);
        } catch (e) {
          if (!(e instanceof Error && e.name === 'AbortError')) {
            console.warn('[RB2] bike infrastructure fetch failed', e);
            if (!hasDataRef.current) onLoadFailureRef.current?.(true);
          }
        }
      })();
    }, DEBOUNCE_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [bbox, visible]);

  if (!visible || !data) return null;
  return <LegacyBikeInfraLayer data={data} visible={visible} />;
}

export default BikeInfraLayer;
