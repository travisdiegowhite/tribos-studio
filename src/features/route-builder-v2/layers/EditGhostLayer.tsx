/**
 * EditGhostLayer — dashed grey "previous route" line shown on the map
 * while a chat edit awaits its Keep/Revert decision. Neutral grey (not a
 * preview color) so it reads as "before", with the live route on top.
 * Style mirrors the line-drag rubber-band ghost in Map.tsx.
 */
import { Source, Layer } from 'react-map-gl';
import { RB2 } from '../components/brand';
import type { Coordinate } from '../../../types/geo';

export interface EditGhostLayerProps {
  geometry: { type: 'LineString'; coordinates: Coordinate[] } | null;
}

export function EditGhostLayer({ geometry }: EditGhostLayerProps) {
  if (!geometry || geometry.coordinates.length < 2) return null;
  return (
    <Source
      id="rb2-edit-ghost"
      type="geojson"
      data={{
        type: 'Feature',
        properties: {},
        geometry: geometry as unknown as GeoJSON.LineString,
      }}
    >
      <Layer
        id="rb2-edit-ghost-line"
        type="line"
        layout={{ 'line-cap': 'round', 'line-join': 'round' }}
        paint={{
          'line-color': RB2.textTertiary,
          'line-width': 3,
          'line-opacity': 0.75,
          'line-dasharray': [2, 2],
        }}
      />
    </Source>
  );
}

export default EditGhostLayer;
