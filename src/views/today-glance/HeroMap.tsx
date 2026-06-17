/**
 * HeroMap — the dominant left column of the glance. The route IS the workout:
 * a Mapbox line of today's route, with the prescription's hard-effort stretches
 * styled in effort-orange over the teal base line when interval data is ready
 * (gated — see deriveIntervalSegments.ts). Includes a start marker, a
 * distance/elevation chip, and an interval legend.
 *
 * Consumes the deferred `routePromise` via React 19 `use()`, so this component
 * suspends until the matched route resolves while the rail paints immediately.
 */

import { use, useMemo } from 'react';
import Map, { Source, Layer, Marker } from 'react-map-gl';
import { Box, Text } from '@mantine/core';
import 'mapbox-gl/dist/mapbox-gl.css';
import { C, FONT } from './tokens';
import { formatDistanceKm, formatElevationM, type UnitsPreference } from './units';
import type { TodayRoute } from './types';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

interface HeroMapProps {
  routePromise: Promise<TodayRoute | null>;
  units: UnitsPreference;
  height: number;
}

function getCoords(geometry: GeoJSON.Geometry | null): number[][] {
  if (!geometry) return [];
  if (geometry.type === 'LineString') return geometry.coordinates as number[][];
  if (geometry.type === 'MultiLineString') return (geometry.coordinates as number[][][]).flat();
  return [];
}

function computeBounds(coords: number[][]): [number, number, number, number] | null {
  if (coords.length === 0) return null;
  let minLng = Infinity,
    minLat = Infinity,
    maxLng = -Infinity,
    maxLat = -Infinity;
  for (const [lng, lat] of coords) {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  return [minLng, minLat, maxLng, maxLat];
}

/** Build effort-orange work segments from interval fractions along the line. */
function buildIntervalOverlay(
  coords: number[][],
  segments: TodayRoute['intervalSegments'],
): GeoJSON.FeatureCollection {
  const n = coords.length;
  const features: GeoJSON.Feature[] = [];
  for (const seg of segments) {
    if (seg.kind !== 'work') continue;
    const i0 = Math.max(0, Math.round(seg.startFraction * (n - 1)));
    const i1 = Math.min(n - 1, Math.round(seg.endFraction * (n - 1)));
    if (i1 <= i0) continue;
    features.push({
      type: 'Feature',
      properties: { zone: seg.zone },
      geometry: { type: 'LineString', coordinates: coords.slice(i0, i1 + 1) },
    });
  }
  return { type: 'FeatureCollection', features };
}

export function HeroMap({ routePromise, units, height }: HeroMapProps) {
  const route = use(routePromise);

  const coords = useMemo(() => getCoords(route?.geojson ?? null), [route]);
  const bounds = useMemo(() => computeBounds(coords), [coords]);
  const overlay = useMemo(
    () => (route ? buildIntervalOverlay(coords, route.intervalSegments) : null),
    [coords, route],
  );

  const routeFeature = useMemo<GeoJSON.Feature | null>(
    () => (route?.geojson ? { type: 'Feature', properties: {}, geometry: route.geojson } : null),
    [route],
  );

  if (!route?.geojson || !bounds || !MAPBOX_TOKEN) {
    // 'generated' with no geometry yet, or no token in this env.
    return (
      <Box
        style={{
          height,
          background: C.secondary,
          border: `1px solid ${C.border}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ fontFamily: FONT.mono, fontSize: 12, color: C.text3 }}>
          No matched route — generate one to ride today.
        </Text>
      </Box>
    );
  }

  const hasIntervals = !!overlay && overlay.features.length > 0;

  return (
    <Box style={{ height, position: 'relative', overflow: 'hidden', border: `1px solid ${C.border}` }}>
      <Map
        initialViewState={{ bounds, fitBoundsOptions: { padding: 36 } }}
        style={{ width: '100%', height: '100%' }}
        mapStyle="mapbox://styles/mapbox/dark-v11"
        mapboxAccessToken={MAPBOX_TOKEN}
        interactive={false}
        attributionControl={false}
      >
        {routeFeature && (
          <Source id="glance-route" type="geojson" data={routeFeature}>
            <Layer
              id="glance-route-line"
              type="line"
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{ 'line-color': C.teal, 'line-width': 4, 'line-opacity': 0.95 }}
            />
          </Source>
        )}
        {hasIntervals && (
          <Source id="glance-intervals" type="geojson" data={overlay}>
            <Layer
              id="glance-intervals-line"
              type="line"
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{ 'line-color': C.orange, 'line-width': 5, 'line-opacity': 1 }}
            />
          </Source>
        )}
        {route.start && (
          <Marker longitude={route.start[0]} latitude={route.start[1]} anchor="center">
            <Box
              style={{
                width: 12,
                height: 12,
                backgroundColor: C.teal,
                border: '2px solid #FFFFFF',
                boxShadow: '0 1px 3px rgba(0,0,0,0.5)',
              }}
            />
          </Marker>
        )}
      </Map>

      {/* Distance / elevation chip */}
      <Box
        style={{
          position: 'absolute',
          top: 8,
          left: 8,
          backgroundColor: 'rgba(20,20,16,0.82)',
          padding: '4px 8px',
          display: 'flex',
          gap: 10,
        }}
      >
        <Text style={{ fontFamily: FONT.mono, fontSize: 12, color: '#FFFFFF' }}>
          {formatDistanceKm(route.distanceKm, units)}
        </Text>
        <Text style={{ fontFamily: FONT.mono, fontSize: 12, color: '#E7C99A' }}>
          ↑ {formatElevationM(route.elevationGainM, units)}
        </Text>
      </Box>

      {/* Interval legend (only when interval coloring is live) */}
      {hasIntervals && (
        <Box
          style={{
            position: 'absolute',
            bottom: 8,
            left: 8,
            display: 'flex',
            gap: 12,
            alignItems: 'center',
            backgroundColor: 'rgba(20,20,16,0.82)',
            padding: '4px 8px',
          }}
        >
          <LegendSwatch color={C.teal} label="Easy" />
          <LegendSwatch color={C.orange} label="Effort" />
        </Box>
      )}
    </Box>
  );
}

function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <Box style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <Box style={{ width: 14, height: 4, backgroundColor: color }} />
      <Text style={{ fontFamily: FONT.mono, fontSize: 10, color: '#FFFFFF', letterSpacing: '0.5px' }}>
        {label}
      </Text>
    </Box>
  );
}
