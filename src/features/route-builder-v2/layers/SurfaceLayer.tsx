/**
 * SurfaceLayer — Route Builder 2.0 surface overlay.
 *
 * Fetches per-segment surface data from OSM (Overpass) for the route
 * geometry, then renders each segment with its surface color band.
 * Memoized by geometry-coordinate-count + first/last vertex so we don't
 * refetch on every render. The Overpass call is debounced inside the
 * effect.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Source, Layer } from 'react-map-gl';
import type { Coordinate } from '../../../types/geo';
import {
  fetchRouteSurfaceData,
  createSurfaceRoute,
} from '../../../utils/surfaceOverlay.js';

export interface SurfaceLayerProps {
  geometry: { type: 'LineString'; coordinates: Coordinate[] } | null;
  /**
   * Reports the per-segment surface categories as they're fetched (and
   * `null` when cleared/unmounted) so a sibling summary bar can reuse the
   * data without a second Overpass request.
   */
  onSegments?: (segments: string[] | null) => void;
}

function hashGeometry(coords: Coordinate[]): string {
  if (!coords || coords.length < 2) return '';
  const first = coords[0];
  const last = coords[coords.length - 1];
  return `${coords.length}|${first[0].toFixed(5)},${first[1].toFixed(5)}|${last[0].toFixed(5)},${last[1].toFixed(5)}`;
}

export function SurfaceLayer({ geometry, onSegments }: SurfaceLayerProps) {
  const [featureCollection, setFeatureCollection] = useState<GeoJSON.FeatureCollection | null>(
    null,
  );
  const lastKeyRef = useRef<string>('');
  // Keep the latest callback in a ref so it isn't an effect dependency
  // (the page passes a fresh setter each render).
  const onSegmentsRef = useRef(onSegments);
  onSegmentsRef.current = onSegments;

  const key = useMemo(() => (geometry ? hashGeometry(geometry.coordinates) : ''), [geometry]);

  useEffect(() => {
    if (!geometry || geometry.coordinates.length < 2 || !key) {
      setFeatureCollection(null);
      lastKeyRef.current = '';
      onSegmentsRef.current?.(null);
      return;
    }
    if (lastKeyRef.current === key) return;
    lastKeyRef.current = key;
    let cancelled = false;
    void (async () => {
      const segments = await fetchRouteSurfaceData(geometry.coordinates);
      if (cancelled) return;
      if (!segments) {
        setFeatureCollection(null);
        onSegmentsRef.current?.(null);
        return;
      }
      onSegmentsRef.current?.(segments as string[]);
      const fc = createSurfaceRoute(geometry.coordinates, segments);
      if (!cancelled) setFeatureCollection(fc as GeoJSON.FeatureCollection | null);
    })();
    return () => {
      cancelled = true;
    };
  }, [geometry, key]);

  // Clear the reported segments when the layer unmounts (toggled off).
  useEffect(() => {
    return () => {
      onSegmentsRef.current?.(null);
    };
  }, []);

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
        paint={{
          'line-color': featureCollection
            ? ['get', 'color']
            : '#9A9C90',
          'line-width': 5,
          'line-opacity': 0.9,
        }}
        layout={{ 'line-cap': 'round', 'line-join': 'round' }}
      />
    </Source>
  );
}

export default SurfaceLayer;
