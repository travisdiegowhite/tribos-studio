import React, { useMemo, useEffect, useRef, useState } from 'react';
import { Card, Title, Text, Group, Badge, Stack, Loader, Center } from '@mantine/core';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { supabase } from '../supabase';

const MAPBOX_TOKEN = process.env.REACT_APP_MAPBOX_TOKEN;

const RideLocationHeatmap = ({ routes }) => {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const [locationData, setLocationData] = useState(null);
  const [loading, setLoading] = useState(true);

  // Fetch ALL track points from routes to create a true route heatmap
  useEffect(() => {
    const fetchLocationData = async () => {
      if (!routes || routes.length === 0) {
        console.log('🗺️ RideLocationHeatmap: No routes provided');
        setLoading(false);
        return;
      }

      console.log('🗺️ RideLocationHeatmap: Processing', routes.length, 'routes');

      try {
        const coordinates = [];
        const bounds = {
          north: -90,
          south: 90,
          east: -180,
          west: 180
        };

        // Get routes with GPS data
        const routesWithGPS = routes.filter(r => r.has_gps_data && r.track_points_count > 0);
        console.log('🗺️ Routes with GPS data:', routesWithGPS.length);

        if (routesWithGPS.length === 0) {
          setLocationData(null);
          setLoading(false);
          return;
        }

        // Extract all route IDs
        const routeIds = routesWithGPS.map(r => r.id);
        console.log('🗺️ Fetching track points for', routeIds.length, 'routes...');

        // Fetch ALL track points for ALL routes in batches using optimized query
        // Sample every Nth point based on total routes to keep performance good
        const sampleRate = Math.max(5, Math.floor(routeIds.length / 100)); // More routes = higher sample rate
        console.log('🗺️ Using sample rate:', sampleRate);

        // Fetch in batches of 50 routes at a time to avoid query limits
        const batchSize = 50;
        let processedCount = 0;

        for (let i = 0; i < routeIds.length; i += batchSize) {
          const batchIds = routeIds.slice(i, i + batchSize);

          // Fetch all track points for this batch where point_index is divisible by sampleRate
          const { data: trackPoints, error } = await supabase
            .from('track_points')
            .select('latitude, longitude, route_id, point_index')
            .in('route_id', batchIds)
            .order('route_id')
            .order('point_index');

          if (!error && trackPoints && trackPoints.length > 0) {
            // Sample points
            trackPoints.forEach((point, index) => {
              if (index % sampleRate === 0 && point.latitude && point.longitude) {
                const coord = [point.longitude, point.latitude];
                coordinates.push(coord);

                bounds.north = Math.max(bounds.north, point.latitude);
                bounds.south = Math.min(bounds.south, point.latitude);
                bounds.east = Math.max(bounds.east, point.longitude);
                bounds.west = Math.min(bounds.west, point.longitude);
              }
            });
          }

          processedCount += batchIds.length;
          console.log(`🗺️ Progress: ${processedCount}/${routeIds.length} routes processed (${coordinates.length} points collected)`);
        }

        console.log('🗺️ Collected', coordinates.length, 'track points for heatmap from', routeIds.length, 'routes');

        if (coordinates.length > 0) {
          setLocationData({ coordinates, bounds });
        } else {
          setLocationData(null);
        }
      } catch (error) {
        console.error('🗺️ Error fetching location data:', error);
        setLocationData(null);
      } finally {
        setLoading(false);
      }
    };

    fetchLocationData();
  }, [routes]);

  useEffect(() => {
    if (!MAPBOX_TOKEN) {
      console.error('Mapbox token not configured');
      return;
    }

    if (!locationData || locationData.coordinates.length === 0) {
      return;
    }

    if (map.current) return; // Initialize map only once

    mapboxgl.accessToken = MAPBOX_TOKEN;

    // Calculate center point
    const centerLng = (locationData.bounds.east + locationData.bounds.west) / 2;
    const centerLat = (locationData.bounds.north + locationData.bounds.south) / 2;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: [centerLng, centerLat],
      zoom: 10
    });

    map.current.on('load', () => {
      // Add heatmap layer
      map.current.addSource('rides', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: locationData.coordinates.map(coord => ({
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'Point',
              coordinates: coord
            }
          }))
        }
      });

      // Add heatmap layer for route density
      map.current.addLayer({
        id: 'rides-heat',
        type: 'heatmap',
        source: 'rides',
        maxzoom: 16,
        paint: {
          // Weight for each point
          'heatmap-weight': 1,
          // Increase intensity as zoom level increases
          'heatmap-intensity': {
            stops: [
              [0, 0.8],
              [9, 1],
              [16, 1.5]
            ]
          },
          // Color ramp showing where you ride most - cycling themed colors
          'heatmap-color': [
            'interpolate',
            ['linear'],
            ['heatmap-density'],
            0, 'rgba(0,0,255,0)',      // Transparent where no rides
            0.1, 'rgba(65,105,225,0.4)', // Royal blue - light activity
            0.3, 'rgba(30,144,255,0.6)', // Dodger blue - moderate
            0.5, 'rgba(0,191,255,0.7)',  // Deep sky blue - common routes
            0.7, 'rgba(255,215,0,0.8)',  // Gold - frequent routes
            0.85, 'rgba(255,140,0,0.9)', // Dark orange - very frequent
            1, 'rgba(255,69,0,1)'        // Red-orange - most ridden
          ],
          // Radius of each heatmap point (smaller for route-level detail)
          'heatmap-radius': {
            stops: [
              [0, 8],
              [9, 12],
              [16, 20]
            ]
          },
          // Keep heatmap visible longer when zooming
          'heatmap-opacity': {
            default: 0.8,
            stops: [
              [0, 0.8],
              [14, 0.8],
              [16, 0.4]
            ]
          }
        }
      });

      // Add line layer for individual route paths at higher zoom (optional)
      map.current.addLayer({
        id: 'rides-point',
        type: 'circle',
        source: 'rides',
        minzoom: 14,
        paint: {
          'circle-radius': {
            stops: [
              [14, 2],
              [16, 3],
              [22, 8]
            ]
          },
          'circle-color': '#1e90ff',
          'circle-stroke-color': '#fff',
          'circle-stroke-width': 0.5,
          'circle-opacity': {
            stops: [
              [14, 0],
              [16, 0.6]
            ]
          }
        }
      });

      // Fit map to bounds with padding
      const bounds = new mapboxgl.LngLatBounds(
        [locationData.bounds.west, locationData.bounds.south],
        [locationData.bounds.east, locationData.bounds.north]
      );

      map.current.fitBounds(bounds, {
        padding: 50,
        maxZoom: 12
      });
    });

    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, [locationData]);

  if (!MAPBOX_TOKEN) {
    return (
      <Card withBorder p="md">
        <Title order={5} mb="md">Ride Location Heatmap</Title>
        <Text size="sm" c="dimmed">
          Mapbox token not configured. Set REACT_APP_MAPBOX_TOKEN in your environment.
        </Text>
      </Card>
    );
  }

  if (!routes || routes.length === 0) {
    return (
      <Card withBorder p="md">
        <Title order={5} mb="md">Ride Location Heatmap</Title>
        <Text size="sm" c="dimmed">No ride data available</Text>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card withBorder p="md">
        <Title order={5} mb="md">Ride Location Heatmap</Title>
        <Center py="xl">
          <Stack align="center" gap="sm">
            <Loader size="md" />
            <Text size="sm" c="dimmed">Loading ride locations...</Text>
          </Stack>
        </Center>
      </Card>
    );
  }

  if (!locationData || locationData.coordinates.length === 0) {
    return (
      <Card withBorder p="md">
        <Title order={5} mb="md">Ride Location Heatmap</Title>
        <Text size="sm" c="dimmed">
          No GPS data available. Import rides with location data to see your riding heatmap.
        </Text>
      </Card>
    );
  }

  return (
    <Card withBorder p="md">
      <Stack gap="sm">
        <Group justify="space-between">
          <div>
            <Title order={5}>Ride Location Heatmap</Title>
            <Text size="xs" c="dimmed">Your most ridden routes and areas</Text>
          </div>
          <Badge variant="light" color="blue">
            {locationData.coordinates.length} points
          </Badge>
        </Group>

        <div
          ref={mapContainer}
          style={{
            width: '100%',
            height: '350px',
            borderRadius: '8px',
            border: '1px solid #e9ecef'
          }}
        />

        <Group justify="space-between" wrap="wrap">
          <Text size="xs" c="dimmed">
            Blue → Gold → Orange shows ride frequency
          </Text>
          <Text size="xs" c="dimmed">
            Zoom to explore your riding patterns
          </Text>
        </Group>
      </Stack>
    </Card>
  );
};

export default RideLocationHeatmap;
