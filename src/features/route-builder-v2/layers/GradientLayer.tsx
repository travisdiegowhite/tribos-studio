/**
 * GradientLayer — Route Builder 2.0 gradient overlay.
 *
 * Fetches an elevation profile for the route, builds the
 * gradient-colored GeoJSON FeatureCollection, and renders each segment
 * with its grade band color. Falls back to a muted gray polyline while
 * elevation data is in flight.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Source, Layer } from 'react-map-gl';
import type { Coordinate } from '../../../types/geo';
import { createGradientRoute } from '../../../utils/routeGradient.js';
import { getElevationData } from '../../../utils/elevation.js';

export interface GradientLayerProps {
  geometry: { type: 'LineString'; coordinates: Coordinate[] } | null;
}

function hashGeometry(coords: Coordinate[]): string {
  if (!coords || coords.length < 2) return '';
  const first = coords[0];
  const last = coords[coords.length - 1];
  return `${coords.length}|${first[0].toFixed(5)},${first[1].toFixed(5)}|${last[0].toFixed(5)},${last[1].toFixed(5)}`;
}

export function GradientLayer({ geometry }: GradientLayerProps) {
  const [featureCollection, setFeatureCollection] = useState<GeoJSON.FeatureCollection | null>(
    null,
  );
  const lastKeyRef = useRef<string>('');

  const key = useMemo(() => (geometry ? hashGeometry(geometry.coordinates) : ''), [geometry]);

  useEffect(() => {
    if (!geometry || geometry.coordinates.length < 2 || !key) {
      setFeatureCollection(null);
      lastKeyRef.current = '';
      return;
    }
    if (lastKeyRef.current === key) return;
    lastKeyRef.current = key;
    let cancelled = false;
    void (async () => {
      const elevation = await getElevationData(geometry.coordinates);
      if (cancelled || !elevation) {
        if (!cancelled) setFeatureCollection(null);
        return;
      }
      // routeGradient expects { distance (km), elevation } points.
      const elevPoints = elevation.map((p: { distance_km?: number; distance?: number; elevation: number }) => ({
        distance: p.distance_km ?? p.distance ?? 0,
        elevation: p.elevation,
      }));
      const fc = createGradientRoute(geometry.coordinates, elevPoints);
      if (!cancelled) setFeatureCollection(fc as GeoJSON.FeatureCollection | null);
    })();
    return () => {
      cancelled = true;
    };
  }, [geometry, key]);

  if (!geometry || geometry.coordinates.length < 2) return null;

  const data: GeoJSON.GeoJsonObject = featureCollection ?? (geometry as GeoJSON.GeoJsonObject);

  return (
    <Source id="rb2-gradient-route" type="geojson" data={data}>
      <Layer
        id="rb2-gradient-line"
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

export default GradientLayer;
