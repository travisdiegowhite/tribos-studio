/**
 * SurfaceLayer — Route Builder 2.0 surface overlay.
 *
 * Renders the route geometry colored by surface type. In P1.3, surface
 * data is not yet wired through `useRouteAnalysis` — we render a flat
 * teal line as a placeholder when the toggle is on. P1.4/Phase 2 will
 * thread per-segment surface metadata in.
 */

// eslint-disable-next-line import/no-unresolved
import { Source, Layer } from 'react-map-gl';
import type { Coordinate } from '../../../routing/executor';

export interface SurfaceLayerProps {
  geometry: { type: 'LineString'; coordinates: Coordinate[] } | null;
}

export function SurfaceLayer({ geometry }: SurfaceLayerProps) {
  if (!geometry || geometry.coordinates.length < 2) return null;
  return (
    <Source id="rb2-surface-route" type="geojson" data={geometry}>
      <Layer
        id="rb2-surface-line"
        type="line"
        paint={{
          'line-color': '#C49A0A',
          'line-width': 5,
          'line-opacity': 0.9,
        }}
        layout={{ 'line-cap': 'round', 'line-join': 'round' }}
      />
    </Source>
  );
}

export default SurfaceLayer;
