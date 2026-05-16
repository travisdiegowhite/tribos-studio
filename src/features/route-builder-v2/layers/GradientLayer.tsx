/**
 * GradientLayer — Route Builder 2.0 gradient overlay.
 *
 * Colors the route by grade percent. In P1.3, gradient data from
 * `useRouteAnalysis.gradientData` is consumed, but we render a single
 * flat-color line as a placeholder since the v1 gradient renderer
 * requires per-coordinate grade interpolation that isn't yet exposed
 * in `useRouteAnalysis`. Phase 2 wires per-segment color stops.
 */

// eslint-disable-next-line import/no-unresolved
import { Source, Layer } from 'react-map-gl';
import type { Coordinate } from '../../../routing/executor';

export interface GradientLayerProps {
  geometry: { type: 'LineString'; coordinates: Coordinate[] } | null;
}

export function GradientLayer({ geometry }: GradientLayerProps) {
  if (!geometry || geometry.coordinates.length < 2) return null;
  return (
    <Source id="rb2-gradient-route" type="geojson" data={geometry}>
      <Layer
        id="rb2-gradient-line"
        type="line"
        paint={{
          'line-color': '#D4600A',
          'line-width': 5,
          'line-opacity': 0.9,
        }}
        layout={{ 'line-cap': 'round', 'line-join': 'round' }}
      />
    </Source>
  );
}

export default GradientLayer;
