/**
 * SurfaceLayer — Route Builder 2.0 surface overlay.
 *
 * Colors the route line by surface (paved / gravel / unpaved / unknown).
 * Two modes:
 *   - `result` supplied (the page's always-on `useRouteSurface` hook): pure
 *     renderer, never fetches. Stretches whose surface was INFERRED from
 *     tracktype / highway class rather than read from a `surface` tag are
 *     drawn dashed, so "why is this gravel?" is answered on the map.
 *   - no `result`: fetches for itself via `measureRouteSurface`, memoized by
 *     a hash of the quantized geometry, and reports up via `onSegments`
 *     (standalone use / tests).
 * Gray line while nothing is available yet.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Source, Layer } from 'react-map-gl';
import type { Coordinate } from '../../../types/geo';
import { createSurfaceRoute } from '../../../utils/surfaceOverlay.js';
import { measureRouteSurface, type RouteSurfaceResult } from '../../../utils/roadAttributes';
import { geometryKey } from '../../../utils/wayTags';

export interface SurfaceLayerProps {
  geometry: { type: 'LineString'; coordinates: Coordinate[] } | null;
  /**
   * Precomputed analysis for this geometry. When provided the layer only
   * renders it (no fetch); `null` renders the plain gray line.
   */
  result?: RouteSurfaceResult | null;
  /**
   * Reports the per-segment surface categories as they're fetched (and
   * `null` when cleared/unmounted). Uncontrolled mode only.
   */
  onSegments?: (segments: string[] | null) => void;
}

function toFeatureCollection(
  geometry: { coordinates: Coordinate[] },
  result: RouteSurfaceResult,
): GeoJSON.FeatureCollection | null {
  return createSurfaceRoute(
    geometry.coordinates,
    result.segments,
    result.inferences,
  ) as GeoJSON.FeatureCollection | null;
}

export function SurfaceLayer({ geometry, result, onSegments }: SurfaceLayerProps) {
  const controlled = result !== undefined;
  const [fetched, setFetched] = useState<GeoJSON.FeatureCollection | null>(null);
  const featureCollection = useMemo<GeoJSON.FeatureCollection | null>(() => {
    if (!controlled) return fetched;
    if (!geometry || !result) return null;
    return toFeatureCollection(geometry, result);
  }, [controlled, fetched, geometry, result]);
  const lastKeyRef = useRef<string>('');
  const onSegmentsRef = useRef(onSegments);
  onSegmentsRef.current = onSegments;

  const key = useMemo(
    () => (geometry && geometry.coordinates.length >= 2 ? geometryKey(geometry.coordinates) : ''),
    [geometry],
  );

  useEffect(() => {
    if (controlled) return;
    if (!geometry || !key) {
      setFetched(null);
      lastKeyRef.current = '';
      onSegmentsRef.current?.(null);
      return;
    }
    if (lastKeyRef.current === key) return;
    lastKeyRef.current = key;
    let cancelled = false;
    void (async () => {
      const measured = await measureRouteSurface(geometry.coordinates);
      if (cancelled) return;
      if (!measured) {
        setFetched(null);
        onSegmentsRef.current?.(null);
        return;
      }
      onSegmentsRef.current?.(measured.segments);
      setFetched(toFeatureCollection(geometry, measured));
    })();
    return () => {
      cancelled = true;
    };
  }, [controlled, geometry, key]);

  // Clear the reported segments when the layer unmounts (toggled off).
  useEffect(() => {
    if (controlled) return;
    return () => {
      onSegmentsRef.current?.(null);
    };
  }, [controlled]);

  if (!geometry || geometry.coordinates.length < 2) return null;

  // While surface data loads, render the raw route in muted gray so the
  // user still sees their route. After data arrives, swap to the
  // segmented colored version.
  const data: GeoJSON.GeoJsonObject = featureCollection ?? (geometry as GeoJSON.GeoJsonObject);

  return (
    <Source id="rb2-surface-route" type="geojson" data={data}>
      <Layer
        id="rb2-surface-line"
        type="line"
        filter={featureCollection ? ['!=', ['get', 'inferred'], true] : ['literal', true]}
        paint={{
          'line-color': featureCollection ? ['get', 'color'] : '#9A9C90',
          'line-width': 5,
          'line-opacity': 0.9,
        }}
        layout={{ 'line-cap': 'round', 'line-join': 'round' }}
      />
      {featureCollection && (
        <Layer
          id="rb2-surface-line-inferred"
          type="line"
          filter={['==', ['get', 'inferred'], true]}
          paint={{
            'line-color': ['get', 'color'],
            'line-width': 5,
            'line-opacity': 0.9,
            'line-dasharray': [2, 1.5],
          }}
          layout={{ 'line-cap': 'butt', 'line-join': 'round' }}
        />
      )}
    </Source>
  );
}

export default SurfaceLayer;
