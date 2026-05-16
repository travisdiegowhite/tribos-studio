/**
 * FamiliarSegmentsLayer — Route Builder 2.0 familiar-segments overlay.
 *
 * Renders Strava-history-derived familiar roads along the current route.
 * In P1.3 there is no familiarity data source wired in; the toggle UI
 * displays a "Connect Strava" tooltip when no segments are available
 * and this component renders nothing until data is provided in a
 * later phase.
 */

// eslint-disable-next-line import/no-unresolved
import { Source, Layer } from 'react-map-gl';
import type { Coordinate } from '../../../routing/executor';

export interface FamiliarSegment {
  geometry: { type: 'LineString'; coordinates: Coordinate[] };
  familiarity_score: number;
}

export interface FamiliarSegmentsLayerProps {
  segments: FamiliarSegment[] | null;
}

export function FamiliarSegmentsLayer({ segments }: FamiliarSegmentsLayerProps) {
  if (!segments || segments.length === 0) return null;
  const data = {
    type: 'FeatureCollection' as const,
    features: segments.map((s) => ({
      type: 'Feature' as const,
      geometry: s.geometry,
      properties: { familiarity: s.familiarity_score },
    })),
  };
  return (
    <Source id="rb2-familiar-segments" type="geojson" data={data}>
      <Layer
        id="rb2-familiar-segments-line"
        type="line"
        paint={{
          'line-color': '#2A8C82',
          'line-width': 3,
          'line-opacity': 0.6,
          'line-dasharray': [1, 1],
        }}
        layout={{ 'line-cap': 'round', 'line-join': 'round' }}
      />
    </Source>
  );
}

export default FamiliarSegmentsLayer;
