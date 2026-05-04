import { useMemo } from 'react';
import { Box, Group, SimpleGrid, Text } from '@mantine/core';
import Map, { Layer, Source } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { ClusterCard } from './shared/ClusterCard';
import { ClusterHeader } from './shared/ClusterHeader';
import { decodePolyline } from './shared/decodePolyline';
import type { RecentRide, RecentRidesData } from './useTodayData';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

const RIDE_PALETTE = ['#2A8C82', '#3BA89D', '#D4600A', '#C49A0A', '#7A7970'];

interface RecentRidesProps {
  data: RecentRidesData;
  loading: boolean;
  onRideClick?: (rideId: string) => void;
}

interface DecodedRide extends RecentRide {
  coords: Array<[number, number]>;
  color: string;
}

function getBounds(coords: Array<[number, number]>) {
  if (!coords.length) return null;
  let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
  coords.forEach(([lng, lat]) => {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  });
  return { minLng, maxLng, minLat, maxLat };
}

function formatDate(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatDuration(sec: number): string {
  if (!sec) return '—';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function RecentRides({ data, loading, onRideClick }: RecentRidesProps) {
  const decodedRides = useMemo<DecodedRide[]>(() => {
    return data.rides
      .map((r, idx) => {
        const coords = decodePolyline(r.polyline);
        return {
          ...r,
          coords,
          color: RIDE_PALETTE[idx % RIDE_PALETTE.length],
        };
      })
      .filter((r) => r.coords.length > 0);
  }, [data.rides]);

  const initialViewState = useMemo(() => {
    const all = decodedRides.flatMap((r) => r.coords);
    if (!all.length) {
      return { longitude: -98.5795, latitude: 39.8283, zoom: 3 };
    }
    const bounds = getBounds(all);
    if (!bounds) return { longitude: -98.5795, latitude: 39.8283, zoom: 3 };
    const lngSpan = bounds.maxLng - bounds.minLng;
    const latSpan = bounds.maxLat - bounds.minLat;
    const maxSpan = Math.max(lngSpan, latSpan);
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
  }, [decodedRides]);

  const listRides = decodedRides.slice(0, 3);

  return (
    <ClusterCard>
      <ClusterHeader title="RECENT RIDES" subtitle="THE LAST 5 RIDES" />

      {/* Map */}
      <Box
        style={{
          position: 'relative',
          height: 200,
          backgroundColor: '#1a1a1a',
          marginBottom: 12,
          overflow: 'hidden',
        }}
      >
        {loading ? null : !MAPBOX_TOKEN ? (
          <Box
            style={{
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ color: '#7A7970', fontSize: 12 }}>Map requires configuration</Text>
          </Box>
        ) : decodedRides.length === 0 ? (
          <Box
            style={{
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ color: '#7A7970', fontSize: 12 }}>
              No rides with route data yet
            </Text>
          </Box>
        ) : (
          <Map
            initialViewState={initialViewState}
            style={{ width: '100%', height: '100%' }}
            mapStyle="mapbox://styles/mapbox/dark-v11"
            mapboxAccessToken={MAPBOX_TOKEN}
            attributionControl={false}
          >
            {decodedRides.map((ride) => (
              <Source
                key={ride.id}
                id={`today-route-${ride.id}`}
                type="geojson"
                data={{
                  type: 'Feature',
                  properties: { id: ride.id },
                  geometry: { type: 'LineString', coordinates: ride.coords },
                }}
              >
                <Layer
                  id={`today-route-line-${ride.id}`}
                  type="line"
                  paint={{
                    'line-color': ride.color,
                    'line-width': 2.5,
                    'line-opacity': 0.85,
                  }}
                  layout={{ 'line-cap': 'round', 'line-join': 'round' }}
                />
              </Source>
            ))}
          </Map>
        )}

        {/* "5 RIDES" pill */}
        {decodedRides.length > 0 && (
          <Box
            style={{
              position: 'absolute',
              top: 10,
              right: 10,
              fontFamily: "'DM Mono', monospace",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '1px',
              color: '#FFFFFF',
              backgroundColor: 'rgba(20, 20, 16, 0.7)',
              padding: '2px 6px',
            }}
          >
            {decodedRides.length} RIDES
          </Box>
        )}
      </Box>

      {/* Ride list */}
      <Box style={{ marginBottom: 12 }}>
        {listRides.length === 0 && !loading ? (
          <Text style={{ fontSize: 13, color: '#7A7970', fontStyle: 'italic' }}>
            No recent rides yet.
          </Text>
        ) : (
          listRides.map((ride, idx) => (
            <Group
              key={ride.id}
              justify="space-between"
              wrap="nowrap"
              style={{
                padding: '8px 0',
                borderTop: idx === 0 ? 'none' : '1px solid #DDDDD8',
                cursor: onRideClick ? 'pointer' : 'default',
              }}
              onClick={onRideClick ? () => onRideClick(ride.id) : undefined}
            >
              <Group gap={8} wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
                <Box
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    backgroundColor: ride.color,
                    flexShrink: 0,
                  }}
                />
                <Text
                  style={{ fontSize: 13, fontWeight: 500, color: '#141410' }}
                  lineClamp={1}
                >
                  {ride.name}
                </Text>
              </Group>
              <Group
                gap={12}
                wrap="nowrap"
                style={{
                  fontFamily: "'DM Mono', monospace",
                  fontSize: 11,
                  color: '#7A7970',
                }}
              >
                <Text inherit>{formatDate(ride.startDate)}</Text>
                <Text inherit>{ride.distanceKm.toFixed(1)} km</Text>
                <Text inherit>{formatDuration(ride.durationSec)}</Text>
              </Group>
            </Group>
          ))
        )}
      </Box>

      {/* 7-day rollup */}
      <SimpleGrid
        cols={3}
        spacing={8}
        style={{
          borderTop: '1px solid #DDDDD8',
          paddingTop: 12,
        }}
      >
        <Box>
          <Text
            style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: '1.5px',
              textTransform: 'uppercase',
              color: '#7A7970',
            }}
          >
            7-DAY DIST
          </Text>
          <Text
            style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: 16,
              fontWeight: 600,
              color: '#141410',
            }}
          >
            {data.weekRollup.distanceMi.toFixed(1)} mi
          </Text>
        </Box>
        <Box>
          <Text
            style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: '1.5px',
              textTransform: 'uppercase',
              color: '#7A7970',
            }}
          >
            ELEVATION
          </Text>
          <Text
            style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: 16,
              fontWeight: 600,
              color: '#141410',
            }}
          >
            {Math.round(data.weekRollup.elevationFt)} ft
          </Text>
        </Box>
        <Box>
          <Text
            style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: '1.5px',
              textTransform: 'uppercase',
              color: '#7A7970',
            }}
          >
            RIDE TIME
          </Text>
          <Text
            style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: 16,
              fontWeight: 600,
              color: '#141410',
            }}
          >
            {data.weekRollup.rideTime}
          </Text>
        </Box>
      </SimpleGrid>
    </ClusterCard>
  );
}
