/**
 * HeroRecentRides — the hero map's fallback when there's no single matched route
 * (run days, no-match days). Draws the rider's last ~5 rides as colored
 * polylines, mirroring the live Today's RecentRides map but sized to fill the
 * glance hero. Shares decode/filter/palette with RecentRides via
 * ../today/shared/recentRides.
 *
 * Consumes the deferred `recentRoutesPromise` via React 19 `use()`.
 */

import { use, useMemo } from 'react';
import Map, { Source, Layer } from 'react-map-gl';
import { Box, Text } from '@mantine/core';
import 'mapbox-gl/dist/mapbox-gl.css';
import { C, FONT } from './tokens';
import { decodePolyline } from '../today/shared/decodePolyline';
import {
  RIDE_PALETTE,
  filterRidesNearLatest,
  type RecentRide,
} from '../today/shared/recentRides';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

interface HeroRecentRidesProps {
  recentRoutesPromise: Promise<RecentRide[]>;
  height: number;
}

interface DecodedRide extends RecentRide {
  coords: Array<[number, number]>;
  color: string;
}

function getBounds(coords: Array<[number, number]>) {
  if (!coords.length) return null;
  let minLng = Infinity,
    maxLng = -Infinity,
    minLat = Infinity,
    maxLat = -Infinity;
  for (const [lng, lat] of coords) {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  return { minLng, maxLng, minLat, maxLat };
}

/** Empty/no-token fallback — same copy the hero used before. */
function EmptyHero({ height }: { height: number }) {
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

export function HeroRecentRides({ recentRoutesPromise, height }: HeroRecentRidesProps) {
  const rides = use(recentRoutesPromise);

  const decoded = useMemo<DecodedRide[]>(
    () =>
      rides
        .map((r, idx) => ({
          ...r,
          coords: decodePolyline(r.polyline),
          color: RIDE_PALETTE[idx % RIDE_PALETTE.length],
        }))
        .filter((r) => r.coords.length > 0),
    [rides],
  );

  const ridesForMap = useMemo(() => filterRidesNearLatest(decoded), [decoded]);

  const initialViewState = useMemo(() => {
    const all = ridesForMap.flatMap((r) => r.coords);
    const bounds = getBounds(all);
    if (!bounds) return { longitude: -98.5795, latitude: 39.8283, zoom: 3 };
    const maxSpan = Math.max(bounds.maxLng - bounds.minLng, bounds.maxLat - bounds.minLat);
    let zoom = 11;
    if (maxSpan > 1) zoom = 7;
    else if (maxSpan > 0.5) zoom = 8;
    else if (maxSpan > 0.2) zoom = 9;
    else if (maxSpan > 0.1) zoom = 10;
    return {
      longitude: (bounds.minLng + bounds.maxLng) / 2,
      latitude: (bounds.minLat + bounds.maxLat) / 2,
      zoom,
    };
  }, [ridesForMap]);

  if (!MAPBOX_TOKEN || decoded.length === 0) {
    return <EmptyHero height={height} />;
  }

  return (
    <Box style={{ height, position: 'relative', overflow: 'hidden', border: `1px solid ${C.border}` }}>
      <Map
        initialViewState={initialViewState}
        style={{ width: '100%', height: '100%' }}
        mapStyle="mapbox://styles/mapbox/dark-v11"
        mapboxAccessToken={MAPBOX_TOKEN}
        interactive={false}
        attributionControl={false}
      >
        {ridesForMap.map((ride) => (
          <Source
            key={ride.id}
            id={`hero-recent-${ride.id}`}
            type="geojson"
            data={{
              type: 'Feature',
              properties: { id: ride.id },
              geometry: { type: 'LineString', coordinates: ride.coords },
            }}
          >
            <Layer
              id={`hero-recent-line-${ride.id}`}
              type="line"
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{ 'line-color': ride.color, 'line-width': 2.5, 'line-opacity': 0.85 }}
            />
          </Source>
        ))}
      </Map>

      {/* "RECENT RIDES" pill */}
      <Box
        style={{
          position: 'absolute',
          top: 8,
          right: 8,
          fontFamily: FONT.mono,
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '1px',
          color: '#FFFFFF',
          backgroundColor: 'rgba(20,20,16,0.7)',
          padding: '3px 7px',
        }}
      >
        {decoded.length} RECENT {decoded.length === 1 ? 'RIDE' : 'RIDES'}
      </Box>
    </Box>
  );
}
