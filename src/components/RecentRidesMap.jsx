import { useMemo, useState, useCallback } from 'react';
import { Card, Text, Group, Badge, Box, Stack, Skeleton, Loader } from '@mantine/core';
import { IconMapPin, IconRoute } from '@tabler/icons-react';
import Map, { Source, Layer } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { tokens } from '../theme';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

/**
 * Decode a Google-encoded polyline string to coordinates
 * @param {string} encoded - The encoded polyline string
 * @returns {Array<[number, number]>} Array of [lng, lat] coordinates
 */
function decodePolyline(encoded) {
  if (!encoded) return [];

  const coords = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte;

    // Decode latitude
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    shift = 0;
    result = 0;

    // Decode longitude
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    coords.push([lng / 1e5, lat / 1e5]);
  }

  return coords;
}

/**
 * Get bounds for a set of coordinates
 */
function getBounds(coords) {
  if (!coords || coords.length === 0) return null;

  let minLng = Infinity, maxLng = -Infinity;
  let minLat = Infinity, maxLat = -Infinity;

  coords.forEach(([lng, lat]) => {
    minLng = Math.min(minLng, lng);
    maxLng = Math.max(maxLng, lng);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  });

  return { minLng, maxLng, minLat, maxLat };
}

/**
 * Get color based on activity intensity (TSS or power)
 */
function getActivityColor(activity, index) {
  // Color palette for rides - recent rides are brighter
  const colors = [
    tokens.colors.electricLime, // Most recent
    '#60a5fa', // Blue
    '#f59e0b', // Amber
    '#a855f7', // Purple
    '#ec4899', // Pink
  ];

  return colors[index % colors.length];
}

/**
 * RecentRidesMap Component
 * Displays the last few rides on an interactive map
 */
const RecentRidesMap = ({ activities = [], loading = false, formatDist, formatElev }) => {
  const [hoveredActivity, setHoveredActivity] = useState(null);
  const [mapLoaded, setMapLoaded] = useState(false);

  // Process activities with polylines
  const ridesWithRoutes = useMemo(() => {
    return activities
      .filter(a => a.polyline || a.summary_polyline || a.map?.summary_polyline)
      .slice(0, 5)
      .map((activity, index) => {
        const polyline = activity.polyline || activity.summary_polyline || activity.map?.summary_polyline;
        const coords = decodePolyline(polyline);

        return {
          ...activity,
          coords,
          color: getActivityColor(activity, index),
          geojson: {
            type: 'Feature',
            properties: {
              id: activity.id,
              name: activity.name,
              color: getActivityColor(activity, index),
            },
            geometry: {
              type: 'LineString',
              coordinates: coords,
            },
          },
        };
      });
  }, [activities]);

  // Calculate map bounds to fit all rides
  const initialViewState = useMemo(() => {
    const allCoords = ridesWithRoutes.flatMap(r => r.coords);

    if (allCoords.length === 0) {
      // Default to US center if no routes
      return {
        longitude: -98.5795,
        latitude: 39.8283,
        zoom: 3,
      };
    }

    const bounds = getBounds(allCoords);
    if (!bounds) return { longitude: -98.5795, latitude: 39.8283, zoom: 3 };

    const centerLng = (bounds.minLng + bounds.maxLng) / 2;
    const centerLat = (bounds.minLat + bounds.maxLat) / 2;

    // Calculate zoom based on bounds span
    const lngSpan = bounds.maxLng - bounds.minLng;
    const latSpan = bounds.maxLat - bounds.minLat;
    const maxSpan = Math.max(lngSpan, latSpan);

    let zoom = 10;
    if (maxSpan > 1) zoom = 7;
    else if (maxSpan > 0.5) zoom = 8;
    else if (maxSpan > 0.2) zoom = 9;
    else if (maxSpan > 0.1) zoom = 10;
    else zoom = 11;

    return {
      longitude: centerLng,
      latitude: centerLat,
      zoom,
      padding: { top: 40, bottom: 40, left: 40, right: 40 },
    };
  }, [ridesWithRoutes]);

  const handleMapLoad = useCallback(() => {
    setMapLoaded(true);
  }, []);

  // Format duration
  const formatDuration = (seconds) => {
    if (!seconds) return '-';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  // Format date
  const formatDate = (dateString) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;

    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  if (loading) {
    return (
      <Card>
        <Stack gap="md">
          <Group justify="space-between">
            <Text fw={600} style={{ color: tokens.colors.textPrimary }}>
              Recent Rides
            </Text>
          </Group>
          <Skeleton height={300} radius="md" />
        </Stack>
      </Card>
    );
  }

  if (!MAPBOX_TOKEN) {
    return (
      <Card>
        <Stack gap="md" align="center" py="xl">
          <IconMapPin size={48} color={tokens.colors.textMuted} />
          <Text style={{ color: tokens.colors.textMuted }}>
            Map requires configuration
          </Text>
        </Stack>
      </Card>
    );
  }

  if (ridesWithRoutes.length === 0) {
    return (
      <Card>
        <Stack gap="md">
          <Group justify="space-between">
            <Text fw={600} style={{ color: tokens.colors.textPrimary }}>
              Recent Rides
            </Text>
          </Group>
          <Box
            style={{
              height: 300,
              borderRadius: tokens.radius.md,
              backgroundColor: tokens.colors.bgTertiary,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'column',
              gap: tokens.spacing.md,
            }}
          >
            <IconRoute size={48} color={tokens.colors.textMuted} />
            <Text style={{ color: tokens.colors.textMuted }}>
              No rides with route data yet
            </Text>
            <Text size="sm" style={{ color: tokens.colors.textMuted }}>
              Connect Strava or upload FIT files to see your rides on the map
            </Text>
          </Box>
        </Stack>
      </Card>
    );
  }

  return (
    <Card p={0} style={{ overflow: 'hidden' }}>
      <Box style={{ position: 'relative' }}>
        {/* Map Header */}
        <Box
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 1,
            background: 'linear-gradient(to bottom, rgba(18,18,18,0.9) 0%, rgba(18,18,18,0) 100%)',
            padding: tokens.spacing.md,
          }}
        >
          <Group justify="space-between" align="center">
            <Text fw={600} style={{ color: tokens.colors.textPrimary }}>
              Recent Rides
            </Text>
            <Badge variant="light" color="lime" size="sm">
              {ridesWithRoutes.length} ride{ridesWithRoutes.length !== 1 ? 's' : ''}
            </Badge>
          </Group>
        </Box>

        {/* Map */}
        <Box style={{ height: 350 }}>
          <Map
            initialViewState={initialViewState}
            style={{ width: '100%', height: '100%' }}
            mapStyle="mapbox://styles/mapbox/dark-v11"
            mapboxAccessToken={MAPBOX_TOKEN}
            onLoad={handleMapLoad}
            interactive={true}
            attributionControl={false}
          >
            {mapLoaded && ridesWithRoutes.map((ride, index) => (
              <Source
                key={ride.id}
                id={`route-${ride.id}`}
                type="geojson"
                data={ride.geojson}
              >
                <Layer
                  id={`route-line-${ride.id}`}
                  type="line"
                  paint={{
                    'line-color': ride.color,
                    'line-width': hoveredActivity === ride.id ? 4 : 2.5,
                    'line-opacity': hoveredActivity === ride.id ? 1 : 0.8,
                  }}
                  layout={{
                    'line-cap': 'round',
                    'line-join': 'round',
                  }}
                />
              </Source>
            ))}
          </Map>
        </Box>

        {/* Activity Legend */}
        <Box
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            background: 'linear-gradient(to top, rgba(18,18,18,0.95) 0%, rgba(18,18,18,0) 100%)',
            padding: tokens.spacing.md,
            paddingTop: tokens.spacing.xl,
          }}
        >
          <Stack gap="xs">
            {ridesWithRoutes.slice(0, 3).map((ride) => {
              const distanceKm = ride.distance_meters ? ride.distance_meters / 1000 :
                                 ride.distance ? ride.distance / 1000 : 0;
              const elevation = ride.elevation_gain_meters || ride.total_elevation_gain || 0;
              const duration = ride.duration_seconds || ride.moving_time || ride.elapsed_time || 0;

              return (
                <Group
                  key={ride.id}
                  justify="space-between"
                  wrap="nowrap"
                  style={{
                    cursor: 'pointer',
                    padding: '4px 8px',
                    borderRadius: tokens.radius.sm,
                    transition: 'background-color 0.15s',
                    backgroundColor: hoveredActivity === ride.id ? tokens.colors.bgTertiary : 'transparent',
                  }}
                  onMouseEnter={() => setHoveredActivity(ride.id)}
                  onMouseLeave={() => setHoveredActivity(null)}
                >
                  <Group gap="sm" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
                    <Box
                      style={{
                        width: 12,
                        height: 12,
                        borderRadius: '50%',
                        backgroundColor: ride.color,
                        flexShrink: 0,
                      }}
                    />
                    <Text
                      size="sm"
                      fw={500}
                      lineClamp={1}
                      style={{ color: tokens.colors.textPrimary }}
                    >
                      {ride.name || 'Untitled Ride'}
                    </Text>
                  </Group>
                  <Group gap="md" wrap="nowrap">
                    <Text size="xs" style={{ color: tokens.colors.textSecondary }}>
                      {formatDate(ride.start_date)}
                    </Text>
                    <Text size="xs" style={{ color: tokens.colors.textMuted }}>
                      {formatDist ? formatDist(distanceKm) : `${distanceKm.toFixed(1)} km`}
                    </Text>
                    <Text size="xs" style={{ color: tokens.colors.textMuted }}>
                      {formatDuration(duration)}
                    </Text>
                  </Group>
                </Group>
              );
            })}
          </Stack>
        </Box>
      </Box>
    </Card>
  );
};

export default RecentRidesMap;
