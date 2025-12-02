import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useMediaQuery } from '@mantine/hooks';
import {
  Paper,
  Text,
  Button,
  Group,
  Stack,
  Card,
  Badge,
  Grid,
  Alert,
  Loader,
  Center,
  TextInput,
  List,
  ActionIcon,
  Tooltip,
} from '@mantine/core';
import {
  Brain,
  MapPin,
  Navigation,
  Play,
  Sparkles,
  ChevronRight,
  RotateCw,
  Mountain,
  Route as RouteIcon,
  Clock,
} from 'lucide-react';
import Map, { Source, Layer, Marker } from 'react-map-gl';
import toast from 'react-hot-toast';
import 'mapbox-gl/dist/mapbox-gl.css';

const EXAMPLE_PROMPTS = [
  "60 minute scenic loop with coffee stops",
  "gravel adventure through trails near me",
  "45 min hill training loop",
  "easy recovery ride with scenic views",
  "coffee shop crawl by bike",
];

const LOADING_MESSAGES = [
  "Teaching AI about bike-friendly roads...",
  "Finding the best coffee shops...",
  "Avoiding traffic jams...",
  "Calculating perfect hill climbs...",
  "Mapping scenic views...",
];

const LandingRouteDemo = ({ onGetStarted }) => {
  const isMobile = useMediaQuery('(max-width: 768px)');
  const mapRef = useRef();
  const [startLocation, setStartLocation] = useState(null);
  const [currentAddress, setCurrentAddress] = useState('');
  const [promptInput, setPromptInput] = useState(EXAMPLE_PROMPTS[0]);
  const [generating, setGenerating] = useState(false);
  const [generatedRoute, setGeneratedRoute] = useState(null);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [locationDetected, setLocationDetected] = useState(false);
  const [routeVersion, setRouteVersion] = useState(0);

  // Auto-detect user location on mount
  useEffect(() => {
    const detectLocation = async () => {
      if (!navigator.geolocation) {
        console.log('Geolocation not supported - using Boulder fallback');
        setStartLocation([-105.2705, 40.0150]);
        setCurrentAddress('Boulder, CO');
        setLocationDetected(true);
        return;
      }

      console.log('Requesting geolocation permission...');

      navigator.geolocation.getCurrentPosition(
        async (position) => {
          console.log('Geolocation success:', position.coords);
          const location = [position.coords.longitude, position.coords.latitude];
          setStartLocation(location);

          // Reverse geocode to get address
          const address = await reverseGeocode(location);
          setCurrentAddress(address || 'Your Location');
          setLocationDetected(true);

          // Center map on location
          if (mapRef?.current) {
            mapRef.current.flyTo({
              center: location,
              zoom: 12,
              duration: 1000,
            });
          }
        },
        (error) => {
          console.warn('Geolocation error:', error.code, error.message);
          // Permission denied or error - fallback to Boulder
          setStartLocation([-105.2705, 40.0150]);
          setCurrentAddress('Boulder, CO');
          setLocationDetected(true);
        },
        {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0, // Don't use cached location
        }
      );
    };

    detectLocation();
  }, []);

  // Reverse geocode coordinates to address
  const reverseGeocode = useCallback(async (location) => {
    const mapboxToken = process.env.REACT_APP_MAPBOX_TOKEN;
    if (!mapboxToken || !location) return '';

    try {
      const [longitude, latitude] = location;
      const response = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${longitude},${latitude}.json?access_token=${mapboxToken}&types=place,locality`
      );

      const data = await response.json();

      if (data.features && data.features.length > 0) {
        return data.features[0].place_name;
      }
      return '';
    } catch (error) {
      console.warn('Reverse geocoding failed:', error);
      return '';
    }
  }, []);


  // Cycle through loading messages
  useEffect(() => {
    if (!generating) return;

    const interval = setInterval(() => {
      const randomMessage = LOADING_MESSAGES[Math.floor(Math.random() * LOADING_MESSAGES.length)];
      setLoadingMessage(randomMessage);
    }, 2000);

    return () => clearInterval(interval);
  }, [generating]);

  // Handle route generation
  const handleGenerateRoute = async () => {
    if (!startLocation) {
      toast.error('Waiting for location...');
      return;
    }

    if (!promptInput.trim()) {
      toast.error('Please describe the route you want!');
      return;
    }

    setGenerating(true);
    setLoadingMessage(LOADING_MESSAGES[0]);

    try {
      // Import the route generation utility
      const { getCyclingDirections } = await import('../utils/directions');

      // Simple demo: create a loop route with 4 waypoints around the start location
      // In production, this would use the AI route generator
      const offset = 0.02; // ~2km offset for demo
      const waypoints = [
        startLocation,
        [startLocation[0] + offset, startLocation[1] + offset], // NE
        [startLocation[0] + offset, startLocation[1] - offset], // SE
        [startLocation[0] - offset, startLocation[1] - offset], // SW
        startLocation, // Back to start
      ];

      console.log('🎯 Generating demo route with waypoints:', waypoints);

      const mapboxToken = process.env.REACT_APP_MAPBOX_TOKEN;
      const routeData = await getCyclingDirections(waypoints, mapboxToken, {
        profile: 'cycling',
      });

      if (routeData && routeData.coordinates) {
        const route = {
          name: promptInput,
          description: `Demo route from ${currentAddress}`,
          coordinates: routeData.coordinates,
          distance: (routeData.distance || 0) / 1000, // Convert to km
          elevationGain: routeData.elevationGain || 150,
          difficulty: 'moderate',
          routeType: 'loop',
        };

        setGeneratedRoute(route);
        setRouteVersion(prev => prev + 1); // Increment to force map update
        toast.success('Route generated! ✨');

        // Fit map to route bounds
        if (mapRef?.current && routeData.coordinates) {
          const bounds = routeData.coordinates.reduce(
            (bounds, coord) => {
              return [
                [Math.min(bounds[0][0], coord[0]), Math.min(bounds[0][1], coord[1])],
                [Math.max(bounds[1][0], coord[0]), Math.max(bounds[1][1], coord[1])],
              ];
            },
            [[Infinity, Infinity], [-Infinity, -Infinity]]
          );

          mapRef.current.fitBounds(bounds, {
            padding: 50,
            duration: 1000,
          });
        }
      } else {
        throw new Error('Could not generate route');
      }
    } catch (error) {
      console.error('Route generation error:', error);
      toast.error('Failed to generate route. Please try again!');
    } finally {
      setGenerating(false);
    }
  };

  // Pick random example
  const handleSurpriseMe = () => {
    const randomPrompt = EXAMPLE_PROMPTS[Math.floor(Math.random() * EXAMPLE_PROMPTS.length)];
    setPromptInput(randomPrompt);
    toast('Try this one! 🎲', { icon: '✨' });
  };

  // Create route line for map
  const routeGeoJSON = generatedRoute ? {
    type: 'Feature',
    geometry: {
      type: 'LineString',
      coordinates: generatedRoute.coordinates,
    },
  } : null;

  return (
    <Paper
      shadow="xl"
      p="xl"
      radius="lg"
      style={{
        background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.05) 0%, rgba(34, 211, 238, 0.05) 100%)',
        border: '2px solid transparent',
        backgroundImage: 'linear-gradient(white, white), linear-gradient(135deg, #10b981, #22d3ee, #fbbf24)',
        backgroundOrigin: 'border-box',
        backgroundClip: 'padding-box, border-box',
      }}
    >
      <Stack gap="md">
        {/* Header */}
        <Group justify="space-between" align="center">
          <Text size="sm" c="dimmed">
            {locationDetected ? `📍 ${currentAddress}` : '📍 Detecting your location...'}
          </Text>
        </Group>

        {/* Input Section */}
        <Stack gap="sm">
          <Group gap="sm" align="flex-end" wrap="nowrap">
            <TextInput
              placeholder="Describe your dream ride..."
              value={promptInput}
              onChange={(e) => setPromptInput(e.target.value)}
              leftSection={<Brain size={16} />}
              size="md"
              style={{ flex: 1 }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !generating && locationDetected) {
                  handleGenerateRoute();
                }
              }}
              disabled={generating || !locationDetected}
            />
            <Tooltip label="Random example">
              <ActionIcon
                size={48} // Explicit size for better mobile touch target (44px+)
                variant="light"
                color="violet"
                onClick={handleSurpriseMe}
                disabled={generating}
              >
                <RotateCw size={20} />
              </ActionIcon>
            </Tooltip>
          </Group>

          <Button
            size="md"
            onClick={handleGenerateRoute}
            disabled={generating || !locationDetected}
            loading={generating}
            leftSection={!generating && <Play size={18} />}
            style={{
              background: 'linear-gradient(135deg, #10b981 0%, #22d3ee 100%)',
              minHeight: '48px', // Better mobile touch target
            }}
            fullWidth
          >
            {generating ? loadingMessage :
             !locationDetected ? 'Detecting location...' :
             'Generate Route ✨'}
          </Button>
        </Stack>

        {/* Map */}
        <Paper
          shadow="sm"
          style={{
            height: isMobile ? 350 : 400, // Increased mobile height from 300 to 350
            position: 'relative',
            overflow: 'hidden',
            borderRadius: 8,
          }}
        >
          {!locationDetected ? (
            <Center h="100%">
              <Stack align="center" gap="md">
                <Loader size="lg" color="green" />
                <Text c="dimmed">Detecting your location...</Text>
              </Stack>
            </Center>
          ) : (
            <Map
              ref={mapRef}
              mapboxAccessToken={process.env.REACT_APP_MAPBOX_TOKEN}
              initialViewState={{
                longitude: startLocation[0],
                latitude: startLocation[1],
                zoom: 12,
              }}
              style={{ width: '100%', height: '100%' }}
              mapStyle="mapbox://styles/mapbox/outdoors-v12"
            >
              {/* Start marker */}
              {startLocation && (
                <Marker
                  longitude={startLocation[0]}
                  latitude={startLocation[1]}
                  anchor="bottom"
                >
                  <div style={{
                    backgroundColor: '#10b981',
                    width: 24,
                    height: 24,
                    borderRadius: '50%',
                    border: '3px solid white',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
                  }} />
                </Marker>
              )}

              {/* Route line */}
              {routeGeoJSON && (
                <Source
                  key={`route-${routeVersion}`}
                  id={`route-source-${routeVersion}`}
                  type="geojson"
                  data={routeGeoJSON}
                >
                  <Layer
                    id={`route-line-${routeVersion}`}
                    type="line"
                    paint={{
                      'line-color': '#10b981',
                      'line-width': 4,
                      'line-opacity': 0.8,
                    }}
                  />
                </Source>
              )}
            </Map>
          )}
        </Paper>

        {/* Route Stats */}
        {generatedRoute && (
          <Card withBorder>
            <Stack gap="md">
              <Group justify="space-between">
                <Text fw={600} size="sm">Route Details</Text>
                <Badge color="green" variant="light">
                  {generatedRoute.difficulty}
                </Badge>
              </Group>

              <Grid gutter="md">
                <Grid.Col span={4}>
                  <Stack gap={4} align="center">
                    <RouteIcon size={20} color="#10b981" />
                    <Text size="xs" c="dimmed">Distance</Text>
                    <Text fw={600} size="sm">{generatedRoute.distance.toFixed(1)} km</Text>
                  </Stack>
                </Grid.Col>
                <Grid.Col span={4}>
                  <Stack gap={4} align="center">
                    <Mountain size={20} color="#10b981" />
                    <Text size="xs" c="dimmed">Elevation</Text>
                    <Text fw={600} size="sm">+{generatedRoute.elevationGain} m</Text>
                  </Stack>
                </Grid.Col>
                <Grid.Col span={4}>
                  <Stack gap={4} align="center">
                    <Clock size={20} color="#10b981" />
                    <Text size="xs" c="dimmed">Type</Text>
                    <Text fw={600} size="sm">{generatedRoute.routeType}</Text>
                  </Stack>
                </Grid.Col>
              </Grid>
            </Stack>
          </Card>
        )}

        {/* CTA Button */}
        <Button
          onClick={onGetStarted}
          size="lg"
          leftSection={<ChevronRight size={18} />}
          style={{
            background: 'linear-gradient(135deg, #10b981 0%, #22d3ee 100%)',
            minHeight: '48px', // Better mobile touch target
          }}
          fullWidth
        >
          Create Free Account
        </Button>

        <Text size="xs" c="dimmed" ta="center" mt={-8}>
          Save routes • Export to GPS • Import from Strava/Garmin
        </Text>
      </Stack>
    </Paper>
  );
};

export default LandingRouteDemo;
