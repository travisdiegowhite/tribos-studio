/**
 * The landing's right column: a map preview, the start marker and the route
 * coloured by comfort tone, with the legend bottom-left (spec §1–2).
 */

import { useEffect, useMemo, useRef } from 'react';
import Map, { Source, Layer, Marker, type MapRef } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import type { Coordinate } from '../../types/geo';
import type { ComfortCandidate } from '../../utils/comfortLadder';
import { COMFORT_TONE_COLORS, MAP_PALETTE, getBaseMapStyle } from '../../utils/mapPalette';
import { toneFeatures, lineBounds } from './comfortLine';
import { LANDING_COPY } from './landingCopy';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;

// Boulder until the rider picks a start: the harness's home turf.
const DEFAULT_VIEW = { longitude: -105.27, latitude: 40.015, zoom: 9 };

const TONE_COLOR_EXPR = [
  'match',
  ['get', 'tone'],
  'within', COMFORT_TONE_COLORS.within,
  'at', COMFORT_TONE_COLORS.at,
  'flagged', COMFORT_TONE_COLORS.flagged,
  'unknown', COMFORT_TONE_COLORS.unknown,
  COMFORT_TONE_COLORS.blocked,
] as unknown as string;

interface Props {
  start: Coordinate | null;
  route: ComfortCandidate | null;
}

export function LandingMap({ start, route }: Props) {
  const mapRef = useRef<MapRef | null>(null);
  const data = useMemo(() => (route ? toneFeatures(route.coordinates, route.validation) : null), [route]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const b = route ? lineBounds(route.coordinates) : null;
    if (b) map.fitBounds(b, { padding: 48, duration: 600 });
    else if (start) map.flyTo({ center: [start[0], start[1]], zoom: 11, duration: 600 });
  }, [route, start]);

  if (!MAPBOX_TOKEN) {
    return <div className="rl-map rl-map-empty" role="img" aria-label="Map preview unavailable" />;
  }

  return (
    <div className="rl-map">
      <Map
        ref={mapRef}
        initialViewState={start ? { longitude: start[0], latitude: start[1], zoom: 11 } : DEFAULT_VIEW}
        style={{ width: '100%', height: '100%' }}
        mapStyle={getBaseMapStyle()}
        mapboxAccessToken={MAPBOX_TOKEN}
        attributionControl
        dragRotate={false}
      >
        {data && (
          <Source id="rl-route" type="geojson" data={data}>
            <Layer id="rl-route-casing" type="line" layout={{ 'line-join': 'round', 'line-cap': 'round' }} paint={{ 'line-color': MAP_PALETTE.casing, 'line-width': 8 }} />
            <Layer
              id="rl-route-solid"
              type="line"
              filter={['!=', ['get', 'tone'], 'unknown']}
              layout={{ 'line-join': 'round', 'line-cap': 'round' }}
              paint={{ 'line-color': TONE_COLOR_EXPR, 'line-width': 4 }}
            />
            <Layer
              id="rl-route-unknown"
              type="line"
              filter={['==', ['get', 'tone'], 'unknown']}
              layout={{ 'line-join': 'round' }}
              paint={{ 'line-color': COMFORT_TONE_COLORS.unknown, 'line-width': 4, 'line-dasharray': [1.5, 1.5] }}
            />
          </Source>
        )}
        {start && (
          <Marker longitude={start[0]} latitude={start[1]} anchor="center">
            <span className="rl-start-marker" aria-label="Start" />
          </Marker>
        )}
      </Map>
      <ul className="rl-legend" aria-label="Map legend">
        {(['within', 'at', 'flagged', 'unknown'] as const).map((tone) => (
          <li key={tone}>
            <span className={`rl-swatch rl-swatch-${tone}`} style={{ background: COMFORT_TONE_COLORS[tone] }} aria-hidden="true" />
            {LANDING_COPY.legend[tone]}
          </li>
        ))}
      </ul>
    </div>
  );
}
