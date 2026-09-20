/**
 * TrafficStressLayer — Route Builder 2.0 traffic-stress overlay.
 *
 * Colors the route line by Level of Traffic Stress (LTS 1–4) computed from
 * the OSM ways along the corridor (roadAttributes.ts → trafficStress.ts).
 * Two modes:
 *   - `result` supplied (the page's always-on `useRouteStress` hook): pure
 *     renderer, never fetches.
 *   - no `result`: fetches for itself, memoized by a hash of the quantized
 *     geometry, and reports up via `onStress` (standalone use / tests).
 * Gray line while nothing is available yet.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Source, Layer } from 'react-map-gl';
import type { Coordinate } from '../../../types/geo';
import {
  measureRouteStress,
  createStressRoute,
  type RouteStressResult,
} from '../../../utils/roadAttributes';
import type { TaggedWay } from '../../../utils/wayTags';
import { fnv1a32, stableJson } from '../../../utils/stableHash';
import { trackRb2 } from '../telemetry/trackRb2';

export interface TrafficStressLayerProps {
  geometry: { type: 'LineString'; coordinates: Coordinate[] } | null;
  /**
   * Precomputed analysis for this geometry. When provided the layer only
   * renders it (no fetch); `null` renders the plain gray line.
   */
  result?: RouteStressResult | null;
  /** BRouter way tags for this geometry, when the route came from BRouter. */
  taggedWays?: ReadonlyArray<TaggedWay> | null;
  /** Reports the analysis (or null when cleared/unmounted). */
  onStress?: (result: RouteStressResult | null) => void;
}

function hashGeometry(coords: Coordinate[]): string {
  if (!coords || coords.length < 2) return '';
  const quantized = coords.map(([lng, lat]) => [
    Math.round(lng * 1e5) / 1e5,
    Math.round(lat * 1e5) / 1e5,
  ]);
  return fnv1a32(stableJson(quantized));
}

export function TrafficStressLayer({
  geometry,
  result,
  taggedWays = null,
  onStress,
}: TrafficStressLayerProps) {
  const controlled = result !== undefined;
  const [fetched, setFetched] = useState<GeoJSON.FeatureCollection | null>(null);
  const setFeatureCollection = setFetched;
  const featureCollection = useMemo<GeoJSON.FeatureCollection | null>(() => {
    if (!controlled) return fetched;
    if (!geometry || !result) return null;
    return createStressRoute(geometry.coordinates, result.ltsSegments);
  }, [controlled, fetched, geometry, result]);
  const lastKeyRef = useRef<string>('');
  const onStressRef = useRef(onStress);
  onStressRef.current = onStress;
  const taggedWaysRef = useRef(taggedWays);
  taggedWaysRef.current = taggedWays;

  const key = useMemo(() => (geometry ? hashGeometry(geometry.coordinates) : ''), [geometry]);

  useEffect(() => {
    if (controlled) return;
    if (!geometry || geometry.coordinates.length < 2 || !key) {
      setFeatureCollection(null);
      lastKeyRef.current = '';
      onStressRef.current?.(null);
      return;
    }
    if (lastKeyRef.current === key) return;
    lastKeyRef.current = key;
    let cancelled = false;
    void (async () => {
      const fetchedResult = await measureRouteStress(geometry.coordinates, {
        taggedWays: taggedWaysRef.current,
      });
      if (cancelled) return;
      if (!fetchedResult) {
        setFeatureCollection(null);
        onStressRef.current?.(null);
        return;
      }
      onStressRef.current?.(fetchedResult);
      trackRb2('stress_computed', {
        quiet_pct: fetchedResult.summary.quietPct,
        lts4_km: fetchedResult.summary.lts4Km,
        unknown_pct: fetchedResult.summary.unknownPct,
        source: fetchedResult.source,
      });
      const fc = createStressRoute(geometry.coordinates, fetchedResult.ltsSegments);
      if (!cancelled) setFeatureCollection(fc);
    })();
    return () => {
      cancelled = true;
    };
  }, [controlled, geometry, key]);

  // Clear the reported result when the layer unmounts (toggled off).
  useEffect(() => {
    if (controlled) return;
    return () => {
      onStressRef.current?.(null);
    };
  }, [controlled]);

  if (!geometry || geometry.coordinates.length < 2) return null;

  const data: GeoJSON.GeoJsonObject = featureCollection ?? (geometry as GeoJSON.GeoJsonObject);

  return (
    <Source id="rb2-stress-route" type="geojson" data={data}>
      <Layer
        id="rb2-stress-line"
        type="line"
        paint={{
          'line-color': featureCollection ? ['get', 'color'] : '#9A9C90',
          'line-width': 5,
          'line-opacity': 0.9,
        }}
        layout={{ 'line-cap': 'round', 'line-join': 'round' }}
      />
    </Source>
  );
}

export default TrafficStressLayer;
