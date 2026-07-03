/**
 * SharedRoute — public, unauthenticated view of a shared route.
 *
 * Mounted at /r/:routeId with no auth guard (like the OAuth callbacks).
 * Fetches via the unauthenticated get_public_route action, which only
 * returns routes explicitly marked public by their owner. Read-only map +
 * stats, with a CTA into the Route Builder (sign-in gated there).
 */
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Box, Button, Loader, Text } from '@mantine/core';
import Map, { Layer, Marker, Source } from 'react-map-gl';
import { getPublicRoute } from '../utils/routesService';
import { MAPBOX_TOKEN } from '../components/RouteBuilder';
import { useAuth } from '../contexts/AuthContext.jsx';

interface PublicRoute {
  id: string;
  name?: string;
  description?: string | null;
  distance_km?: number | null;
  elevation_gain_m?: number | null;
  estimated_duration_minutes?: number | null;
  geometry?: { type: string; coordinates: number[][] } | null;
  surface_type?: string | null;
}

const CARD: React.CSSProperties = {
  backgroundColor: 'var(--tribos-bg-card, #FFFFFF)',
  border: '1px solid var(--tribos-border, #D8D5CC)',
  borderRadius: 0,
  boxShadow: 'var(--tribos-shadow-card, 0 2px 8px rgba(0,0,0,0.08))',
};

function formatDuration(minutes: number | null | undefined): string {
  if (!minutes || minutes <= 0) return '—';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function SharedRoute() {
  const { routeId } = useParams<{ routeId: string }>();
  const { user } = useAuth() as { user: { id: string } | null };
  const [route, setRoute] = useState<PublicRoute | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'not_found' | 'error'>('loading');

  useEffect(() => {
    document.title = 'Shared Route — Tribos';
    let cancelled = false;
    if (!routeId) {
      setStatus('not_found');
      return;
    }
    (getPublicRoute as (id: string) => Promise<PublicRoute | null>)(routeId)
      .then((r) => {
        if (cancelled) return;
        if (!r || !Array.isArray(r.geometry?.coordinates) || r.geometry.coordinates.length < 2) {
          setStatus('not_found');
          return;
        }
        setRoute(r);
        setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [routeId]);

  const bounds = useMemo(() => {
    const coords = route?.geometry?.coordinates;
    if (!coords || coords.length < 2) return null;
    let minLng = Infinity;
    let minLat = Infinity;
    let maxLng = -Infinity;
    let maxLat = -Infinity;
    for (const [lng, lat] of coords) {
      if (lng < minLng) minLng = lng;
      if (lat < minLat) minLat = lat;
      if (lng > maxLng) maxLng = lng;
      if (lat > maxLat) maxLat = lat;
    }
    return [
      [minLng, minLat],
      [maxLng, maxLat],
    ] as [[number, number], [number, number]];
  }, [route]);

  if (status === 'loading') {
    return (
      <Box style={{ display: 'flex', justifyContent: 'center', paddingTop: 120 }}>
        <Loader />
      </Box>
    );
  }

  if (status !== 'ready' || !route || !bounds) {
    return (
      <Box style={{ maxWidth: 480, margin: '96px auto', padding: 24, textAlign: 'center', ...CARD }}>
        <Text style={{ fontWeight: 700, fontSize: 18, marginBottom: 8 }}>
          {status === 'error' ? 'Something went wrong' : 'Route not available'}
        </Text>
        <Text style={{ fontSize: 14, color: 'var(--tribos-text-secondary, #6B6B60)', marginBottom: 16 }}>
          {status === 'error'
            ? 'Could not load this route right now — try again in a minute.'
            : 'This route doesn’t exist or is no longer shared.'}
        </Text>
        <Button component={Link} to="/" radius={0}>
          Go to tribos.studio
        </Button>
      </Box>
    );
  }

  const coords = route.geometry!.coordinates;
  const start = coords[0];
  const end = coords[coords.length - 1];

  return (
    <Box style={{ height: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <Box
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          padding: '12px 16px',
          flexWrap: 'wrap',
          ...CARD,
        }}
      >
        <Box style={{ minWidth: 0 }}>
          <Text style={{ fontWeight: 700, fontSize: 16 }} truncate>
            {route.name || 'Shared Route'}
          </Text>
          <Text style={{ fontSize: 13, color: 'var(--tribos-text-secondary, #6B6B60)' }}>
            {route.distance_km != null ? `${route.distance_km.toFixed(1)} km` : ''}
            {route.elevation_gain_m != null ? ` · ↑ ${Math.round(route.elevation_gain_m)} m` : ''}
            {` · ${formatDuration(route.estimated_duration_minutes)}`}
            {route.surface_type ? ` · ${route.surface_type}` : ''}
          </Text>
        </Box>
        <Button
          component={Link}
          to={user ? `/routes/${route.id}` : '/auth'}
          radius={0}
          data-testid="shared-route-cta"
        >
          {user ? 'Open in Route Builder' : 'Sign in to save a copy'}
        </Button>
      </Box>
      {route.description && (
        <Text style={{ padding: '8px 16px', fontSize: 13, color: 'var(--tribos-text-secondary, #6B6B60)' }}>
          {route.description}
        </Text>
      )}
      <Box style={{ flex: 1, minHeight: 0 }}>
        <Map
          mapboxAccessToken={MAPBOX_TOKEN}
          initialViewState={{ bounds, fitBoundsOptions: { padding: 48 } }}
          mapStyle="mapbox://styles/mapbox/outdoors-v12"
          style={{ width: '100%', height: '100%' }}
          attributionControl
        >
          <Source
            id="shared-route"
            type="geojson"
            data={{ type: 'Feature', properties: {}, geometry: route.geometry as GeoJSON.Geometry }}
          >
            <Layer
              id="shared-route-casing"
              type="line"
              paint={{ 'line-color': '#FFFFFF', 'line-width': 6, 'line-opacity': 0.9 }}
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            />
            <Layer
              id="shared-route-line"
              type="line"
              paint={{ 'line-color': '#2A8C82', 'line-width': 3.5 }}
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            />
          </Source>
          <Marker longitude={start[0]} latitude={start[1]} anchor="center">
            <div
              style={{
                width: 14,
                height: 14,
                borderRadius: '50%',
                backgroundColor: '#2A8C82',
                border: '2px solid #FFFFFF',
              }}
            />
          </Marker>
          <Marker longitude={end[0]} latitude={end[1]} anchor="center">
            <div
              style={{
                width: 14,
                height: 14,
                borderRadius: '50%',
                backgroundColor: '#D4600A',
                border: '2px solid #FFFFFF',
              }}
            />
          </Marker>
        </Map>
      </Box>
    </Box>
  );
}
