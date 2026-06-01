/**
 * IntervalsLayer — Route Builder 2.0 workout-interval overlay.
 *
 * Recolors the route line by training zone using the cues produced from an
 * attached workout's structure. One colored segment per interval block. Falls
 * back to nothing when there's no geometry or no cues.
 *
 * Mirrors GradientLayer's Source/Layer shape; the per-feature `color` property
 * drives the line paint via ['get','color'].
 */

import { useMemo } from 'react';
import { Source, Layer } from 'react-map-gl';
import type { Coordinate } from '../../../types/geo';
import {
  buildIntervalRouteFeatureCollection,
  type WorkoutCue,
} from '../overlay/intervalOverlay';

export interface IntervalsLayerProps {
  geometry: { type: 'LineString'; coordinates: Coordinate[] } | null;
  cues: WorkoutCue[] | null;
}

export function IntervalsLayer({ geometry, cues }: IntervalsLayerProps) {
  const featureCollection = useMemo(
    () => buildIntervalRouteFeatureCollection(geometry?.coordinates ?? null, cues),
    [geometry, cues],
  );

  if (!geometry || geometry.coordinates.length < 2 || featureCollection.features.length === 0) {
    return null;
  }

  return (
    <Source id="rb2-intervals-route" type="geojson" data={featureCollection}>
      <Layer
        id="rb2-intervals-line"
        type="line"
        paint={{
          'line-color': ['get', 'color'],
          'line-width': 5,
          'line-opacity': 0.95,
        }}
        layout={{ 'line-cap': 'round', 'line-join': 'round' }}
      />
    </Source>
  );
}

export default IntervalsLayer;
