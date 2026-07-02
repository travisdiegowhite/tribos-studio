/**
 * RidesMap — Zone 03. A dark Mapbox canvas showing the last few rides as teal
 * route lines (most recent full-strength, older dimmed), each sitting on a
 * blurred same-color shadow — the brand's one real flourish. Overlay chips carry
 * the this-week distance / elevation / ride-count rollup.
 *
 * Reuses the map plumbing proven in src/components/RecentRidesMap.jsx
 * (react-map-gl, dark-v11, VITE_MAPBOX_TOKEN) and the shared polyline decoder.
 * Coordinates are canonical [lng, lat].
 */

import { useMemo, useState } from 'react';
import Map, { Layer, Marker, Source } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Box, Group, Text } from '@mantine/core';
import { decodePolyline } from '../today/shared/decodePolyline';
import { filterRidesNearLatest } from '../today/shared/recentRides';
import { C, FONT } from './tokens';
import type { RecentRide, WeekRollup } from './types';
import type { UnitsPreference } from './units';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;

interface RidesMapProps {
  rides: RecentRide[];
  weekRollup: WeekRollup;
  units: UnitsPreference;
  height?: number;
}

interface DecodedRide extends RecentRide {
  coords: Array<[number, number]>;
  geojson: GeoJSON.Feature<GeoJSON.LineString>;
}

function getBounds(coords: Array<[number, number]>) {
  let minLng = Infinity;
  let maxLng = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (const [lng, lat] of coords) {
    minLng = Math.min(minLng, lng);
    maxLng = Math.max(maxLng, lng);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  }
  return { minLng, maxLng, minLat, maxLat };
}

function OverlayChip({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <Box
      style={{
        background: 'rgba(20,16,8,.72)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        border: '1px solid rgba(255,255,255,.12)',
        padding: '7px 10px',
      }}
    >
      <Text style={{ fontFamily: FONT.mono, fontSize: 8, letterSpacing: '1px', color: '#9a988f' }}>{label}</Text>
      <Text style={{ fontFamily: FONT.mono, fontWeight: 500, fontSize: 16, color: C.base }}>
        {value}
        {unit && <span style={{ fontSize: 10, color: '#9a988f' }}> {unit}</span>}
      </Text>
    </Box>
  );
}

function EmptyCanvas({ height, message }: { height: number; message: string }) {
  return (
    <Box style={{ flex: 1, minHeight: height, background: C.navy, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontFamily: FONT.mono, fontSize: 11, letterSpacing: '1px', color: '#7A7970' }}>{message}</Text>
    </Box>
  );
}

export function RidesMap({ rides, weekRollup, units, height = 230 }: RidesMapProps) {
  const [mapLoaded, setMapLoaded] = useState(false);

  const decoded = useMemo<DecodedRide[]>(() => {
    return rides
      .map((r) => {
        const coords = decodePolyline(r.polyline);
        return {
          ...r,
          coords,
          geojson: {
            type: 'Feature' as const,
            properties: { id: r.id },
            geometry: { type: 'LineString' as const, coordinates: coords },
          },
        };
      })
      .filter((r) => r.coords.length > 0);
  }, [rides]);

  const ridesForMap = useMemo(() => filterRidesNearLatest(decoded), [decoded]);

  const initialViewState = useMemo(() => {
    const all = ridesForMap.flatMap((r) => r.coords);
    if (all.length === 0) return { longitude: -105.27, latitude: 40.015, zoom: 10 };
    const b = getBounds(all);
    const maxSpan = Math.max(b.maxLng - b.minLng, b.maxLat - b.minLat);
    let zoom = 11;
    if (maxSpan > 1) zoom = 7;
    else if (maxSpan > 0.5) zoom = 8;
    else if (maxSpan > 0.2) zoom = 9;
    else if (maxSpan > 0.1) zoom = 10;
    return {
      longitude: (b.minLng + b.maxLng) / 2,
      latitude: (b.minLat + b.maxLat) / 2,
      zoom,
      padding: { top: 30, bottom: 60, left: 30, right: 30 },
    };
  }, [ridesForMap]);

  const distanceLabel =
    units === 'metric'
      ? { value: Math.round(weekRollup.distanceKm).toLocaleString(), unit: 'km' }
      : { value: Math.round(weekRollup.distanceMi).toLocaleString(), unit: 'mi' };
  const elevLabel =
    units === 'metric'
      ? { value: Math.round(weekRollup.elevationM).toLocaleString(), unit: 'm' }
      : { value: Math.round(weekRollup.elevationFt).toLocaleString(), unit: 'ft' };

  return (
    <Box
      style={{
        background: C.card,
        border: `1.5px solid ${C.border}`,
        boxShadow: '0 1px 3px rgba(20,16,8,.07),0 4px 12px rgba(20,16,8,.05)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Group justify="space-between" align="center" style={{ padding: '13px 16px 11px' }}>
        <Group gap={9} align="center">
          <Text style={{ fontFamily: FONT.mono, fontSize: 10, fontWeight: 500, letterSpacing: '2px', color: C.text3 }}>03</Text>
          <span style={{ width: 5, height: 5, background: C.gold, display: 'inline-block' }} />
          <Text style={{ fontFamily: FONT.mono, fontSize: 11, fontWeight: 500, letterSpacing: '2px', color: C.text }}>
            WHERE YOU RIDE
          </Text>
        </Group>
        <Text style={{ fontFamily: FONT.mono, fontSize: 10, letterSpacing: '1px', color: C.text3 }}>
          {ridesForMap.length > 0 ? `LAST ${ridesForMap.length} RIDES` : 'NO RIDES'}
        </Text>
      </Group>

      {!MAPBOX_TOKEN ? (
        <EmptyCanvas height={height} message="MAP REQUIRES CONFIGURATION" />
      ) : decoded.length === 0 ? (
        <EmptyCanvas height={height} message="NO RIDES WITH ROUTE DATA YET" />
      ) : (
        <Box style={{ position: 'relative', flex: 1, minHeight: height, background: C.navy, overflow: 'hidden' }}>
          <Map
            initialViewState={initialViewState}
            style={{ width: '100%', height: '100%' }}
            mapStyle="mapbox://styles/mapbox/dark-v11"
            mapboxAccessToken={MAPBOX_TOKEN}
            onLoad={() => setMapLoaded(true)}
            interactive={false}
            attributionControl={false}
          >
            {mapLoaded &&
              ridesForMap.map((ride, index) => {
                const isRecent = index === 0;
                return (
                  <Source key={ride.id} id={`spine-route-${ride.id}`} type="geojson" data={ride.geojson}>
                    {/* blurred shadow */}
                    <Layer
                      id={`spine-route-shadow-${ride.id}`}
                      type="line"
                      paint={{ 'line-color': C.teal, 'line-width': 8, 'line-opacity': 0.16, 'line-blur': 4 }}
                      layout={{ 'line-cap': 'round', 'line-join': 'round' }}
                    />
                    {/* solid line */}
                    <Layer
                      id={`spine-route-line-${ride.id}`}
                      type="line"
                      paint={{ 'line-color': C.teal, 'line-width': 3, 'line-opacity': isRecent ? 0.95 : 0.35 }}
                      layout={{ 'line-cap': 'round', 'line-join': 'round' }}
                    />
                  </Source>
                );
              })}

            {/* start/end dots for the most recent ride */}
            {mapLoaded && ridesForMap[0] && ridesForMap[0].coords.length > 1 && (
              <>
                <Marker longitude={ridesForMap[0].coords[0][0]} latitude={ridesForMap[0].coords[0][1]}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: C.navy, border: `2.5px solid ${C.teal}` }} />
                </Marker>
                <Marker
                  longitude={ridesForMap[0].coords[ridesForMap[0].coords.length - 1][0]}
                  latitude={ridesForMap[0].coords[ridesForMap[0].coords.length - 1][1]}
                >
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: C.coral }} />
                </Marker>
              </>
            )}
          </Map>

          <Box style={{ position: 'absolute', left: 14, bottom: 14, display: 'flex', gap: 10 }}>
            <OverlayChip label="THIS WEEK" value={distanceLabel.value} unit={distanceLabel.unit} />
            <OverlayChip label="ELEV" value={elevLabel.value} unit={elevLabel.unit} />
            <OverlayChip label="RIDES" value={String(weekRollup.rideCount)} />
          </Box>
        </Box>
      )}
    </Box>
  );
}
