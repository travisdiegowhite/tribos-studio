/**
 * TrafficStressLayer — Route Builder 2.0 traffic-stress overlay.
 *
 * Colors the route line by Level of Traffic Stress (LTS 1–4) computed from
 * the OSM ways along the corridor (roadAttributes.ts → trafficStress.ts).
 * Same shape as SurfaceLayer: memoized by a hash of the quantized geometry,
 * gray line while loading, results reported up via `onStress` so the legend
 * and stats card reuse them without a second fetch.
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

export function TrafficStressLayer({ geometry, taggedWays = null, onStress }: TrafficStressLayerProps) {
  const [featureCollection, setFeatureCollection] = useState<GeoJSON.FeatureCollection | null>(
    null,
  );
  const lastKeyRef = useRef<string>('');
  const onStressRef = useRef(onStress);
  onStressRef.current = onStress;
  const taggedWaysRef = useRef(taggedWays);
  taggedWaysRef.current = taggedWays;

  const key = useMemo(() => (geometry ? hashGeometry(geometry.coordinates) : ''), [geometry]);

  useEffect(() => {
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
      const result = await measureRouteStress(geometry.coordinates, {
        taggedWays: taggedWaysRef.current,
      });
      if (cancelled) return;
      if (!result) {
        setFeatureCollection(null);
        onStressRef.current?.(null);
        return;
      }
      onStressRef.current?.(result);
      trackRb2('stress_computed', {
        quiet_pct: result.summary.quietPct,
        lts4_km: result.summary.lts4Km,
        unknown_pct: result.summary.unknownPct,
        source: result.source,
      });
      const fc = createStressRoute(geometry.coordinates, result.ltsSegments);
      if (!cancelled) setFeatureCollection(fc);
    })();
    return () => {
      cancelled = true;
    };
  }, [geometry, key]);

  // Clear the reported result when the layer unmounts (toggled off).
  useEffect(() => {
    return () => {
      onStressRef.current?.(null);
    };
  }, []);

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
