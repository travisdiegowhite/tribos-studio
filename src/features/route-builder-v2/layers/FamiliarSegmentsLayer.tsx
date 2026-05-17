/**
 * FamiliarSegmentsLayer — Route Builder 2.0 familiar-segments overlay.
 *
 * Renders user past-ride road segments within the current viewport bbox.
 * Fetches via `getFamiliarSegmentsGeoJSON(bbox, authToken)` from
 * routePreferences. Color band is driven by ride count via a data
 * expression so the legend (Mantine UI) and the polyline stay in sync.
 */

import { useEffect, useRef, useState } from 'react';
// eslint-disable-next-line import/no-unresolved
import { Source, Layer } from 'react-map-gl';
import { getFamiliarSegmentsGeoJSON } from '../../../utils/routePreferences.js';
import { supabase } from '../../../lib/supabase.js';

export interface FamiliarSegmentsLayerProps {
  /** Map bounds; when null, the layer renders nothing. */
  bbox: { north: number; south: number; east: number; west: number } | null;
  visible: boolean;
  minRideCount?: number;
}

const DEBOUNCE_MS = 500;

function hashBbox(b: { north: number; south: number; east: number; west: number }, min: number): string {
  return `${b.north.toFixed(3)},${b.south.toFixed(3)},${b.east.toFixed(3)},${b.west.toFixed(3)}|${min}`;
}

export function FamiliarSegmentsLayer({
  bbox,
  visible,
  minRideCount = 1,
}: FamiliarSegmentsLayerProps) {
  const [data, setData] = useState<GeoJSON.FeatureCollection | null>(null);
  const lastKeyRef = useRef<string>('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!visible || !bbox) {
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }
    const key = hashBbox(bbox, minRideCount);
    if (key === lastKeyRef.current) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      lastKeyRef.current = key;
      void (async () => {
        try {
          const { data: session } = await supabase.auth.getSession();
          const token = session?.session?.access_token;
          if (!token) {
            setData(null);
            return;
          }
          const fc = await getFamiliarSegmentsGeoJSON(bbox, token, minRideCount);
          setData(fc as GeoJSON.FeatureCollection | null);
        } catch (e) {
          console.warn('[RB2] familiar segments fetch failed', e);
        }
      })();
    }, DEBOUNCE_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [bbox, visible, minRideCount]);

  if (!visible || !data || !data.features || data.features.length === 0) return null;

  return (
    <Source id="rb2-familiar-segments" type="geojson" data={data}>
      <Layer
        id="rb2-familiar-segments-line"
        type="line"
        paint={{
          'line-color': [
            'step',
            ['coalesce', ['get', 'ride_count'], ['get', 'familiarity'], 0],
            '#9A9C90',
            3, '#C49A0A',
            5, '#D4600A',
            10, '#3D8B50',
          ],
          'line-width': 3,
          'line-opacity': 0.7,
        }}
        layout={{ 'line-cap': 'round', 'line-join': 'round' }}
      />
    </Source>
  );
}

export default FamiliarSegmentsLayer;
