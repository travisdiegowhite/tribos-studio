import { useState, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Box, Paper, Stack, Title, Text, Button, Group, TextInput, SegmentedControl, NumberInput, Select, Card, Badge, Divider } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconSparkles, IconRoute } from '@tabler/icons-react';
import Map, { Marker, Source, Layer } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { tokens } from '../theme';
import AppShell from '../components/AppShell.jsx';
import { generateClaudeRoutes } from '../utils/claudeRouteService';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

function RouteBuilder() {
  const { routeId } = useParams();
  const [routeName, setRouteName] = useState('Untitled Route');
  const [waypoints, setWaypoints] = useState([]);
  const [routeGeometry, setRouteGeometry] = useState(null);
  const [routeStats, setRouteStats] = useState({ distance: 0, elevation: 0, duration: 0 });
  const [isCalculating, setIsCalculating] = useState(false);
  const mapRef = useRef();
  const isEditing = !!routeId;

  // AI Route Generation State
  const [trainingGoal, setTrainingGoal] = useState('endurance');
  const [timeAvailable, setTimeAvailable] = useState(60);
  const [routeType, setRouteType] = useState('loop');
  const [aiSuggestions, setAiSuggestions] = useState([]);
  const [generatingAI, setGeneratingAI] = useState(false);

  const [viewport, setViewport] = useState({
    latitude: 37.7749,
    longitude: -122.4194,
    zoom: 12
  });

  // Calculate route using Mapbox Directions API
  const calculateRoute = useCallback(async (points) => {
    if (points.length < 2) {
      setRouteGeometry(null);
      setRouteStats({ distance: 0, elevation: 0, duration: 0 });
      return;
    }

    setIsCalculating(true);
    try {
      const coordinates = points.map(p => `${p.lng},${p.lat}`).join(';');
      const url = `https://api.mapbox.com/directions/v5/mapbox/cycling/${coordinates}?` +
        `geometries=geojson&overview=full&steps=true&` +
        `access_token=${MAPBOX_TOKEN}`;

      const response = await fetch(url);
      const data = await response.json();

      if (data.code !== 'Ok') {
        console.error('Mapbox API error:', data);
        return;
      }

      if (data.routes && data.routes[0]) {
        const route = data.routes[0];
        setRouteGeometry(route.geometry);
        setRouteStats({
          distance: (route.distance / 1000).toFixed(1), // Convert to km
          elevation: 0, // Mapbox doesn't provide elevation in basic API
          duration: Math.round(route.duration / 60) // Convert to minutes
        });
      }
    } catch (error) {
      console.error('Error calculating route:', error);
    } finally {
      setIsCalculating(false);
    }
  }, []);

  // Handle map click to add waypoint
  const handleMapClick = useCallback((event) => {
    const { lng, lat } = event.lngLat;
    const newWaypoints = [...waypoints, { lng, lat, id: Date.now() }];
    setWaypoints(newWaypoints);
    calculateRoute(newWaypoints);
  }, [waypoints, calculateRoute]);

  // Remove waypoint
  const removeWaypoint = useCallback((id) => {
    const newWaypoints = waypoints.filter(w => w.id !== id);
    setWaypoints(newWaypoints);
    calculateRoute(newWaypoints);
  }, [waypoints, calculateRoute]);

  // Clear all waypoints
  const clearRoute = useCallback(() => {
    setWaypoints([]);
    setRouteGeometry(null);
    setRouteStats({ distance: 0, elevation: 0, duration: 0 });
  }, []);

  // Export GPX
  const exportGPX = useCallback(() => {
    if (!routeGeometry || waypoints.length < 2) {
      alert('Please create a route first');
      return;
    }

    const gpxContent = generateGPX(routeName, routeGeometry.coordinates);
    const blob = new Blob([gpxContent], { type: 'application/gpx+xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${routeName.replace(/\s+/g, '_')}.gpx`;
    link.click();
    URL.revokeObjectURL(url);
  }, [routeName, routeGeometry, waypoints]);

  // Generate AI Routes
  const handleGenerateAIRoutes = useCallback(async () => {
    setGeneratingAI(true);
    try {
      const suggestions = await generateClaudeRoutes({
        startLocation: {
          lat: viewport.latitude,
          lng: viewport.longitude
        },
        timeAvailable,
        trainingGoal,
        routeType
      });

      setAiSuggestions(suggestions);
      notifications.show({
        title: 'Routes Generated!',
        message: `Found ${suggestions.length} routes for your ${trainingGoal} session`,
        color: 'lime'
      });
    } catch (error) {
      console.error('AI route generation error:', error);
      notifications.show({
        title: 'Generation Failed',
        message: error.message || 'Failed to generate routes. Please try again.',
        color: 'red'
      });
    } finally {
      setGeneratingAI(false);
    }
  }, [viewport, timeAvailable, trainingGoal, routeType]);

  // Select an AI suggestion
  const handleSelectAISuggestion = useCallback((suggestion) => {
    // For MVP, we'll display the suggestion details
    // In full implementation, this would convert keyDirections to actual GPS route
    notifications.show({
      title: 'Route Selected',
      message: `"${suggestion.name}" - Full routing implementation coming soon!`,
      color: 'blue'
    });

    // Set route name to the suggestion name
    setRouteName(suggestion.name);
  }, []);

  return (
    <AppShell fullWidth>
      <Box style={{ display: 'flex', height: 'calc(100vh - 60px)' }}>
        {/* Sidebar */}
        <Paper
          style={{
            width: 360,
            backgroundColor: tokens.colors.bgSecondary,
            borderRight: `1px solid ${tokens.colors.bgTertiary}`,
            display: 'flex',
            flexDirection: 'column',
          }}
          radius={0}
          p="md"
        >
          <Stack gap="md" style={{ flex: 1 }}>
            <Box>
              <Text size="xs" style={{ color: tokens.colors.textMuted }} mb="xs">
                ROUTE NAME
              </Text>
              <TextInput
                value={routeName}
                onChange={(e) => setRouteName(e.target.value)}
                variant="filled"
                size="md"
              />
            </Box>

            <Divider label="AI Route Generator" labelPosition="center" />

            {/* AI Route Generation Controls */}
            <Box>
              <Text size="xs" style={{ color: tokens.colors.textMuted }} mb="xs">
                TRAINING GOAL
              </Text>
              <SegmentedControl
                value={trainingGoal}
                onChange={setTrainingGoal}
                fullWidth
                size="xs"
                data={[
                  { label: 'Recovery', value: 'recovery' },
                  { label: 'Endurance', value: 'endurance' },
                  { label: 'Intervals', value: 'intervals' },
                  { label: 'Hills', value: 'hills' }
                ]}
                styles={{
                  root: { backgroundColor: tokens.colors.bgTertiary }
                }}
              />
            </Box>

            <Group grow>
              <Box>
                <Text size="xs" style={{ color: tokens.colors.textMuted }} mb="xs">
                  TIME (MIN)
                </Text>
                <NumberInput
                  value={timeAvailable}
                  onChange={setTimeAvailable}
                  min={15}
                  max={480}
                  step={15}
                  size="sm"
                  variant="filled"
                />
              </Box>

              <Box>
                <Text size="xs" style={{ color: tokens.colors.textMuted }} mb="xs">
                  ROUTE TYPE
                </Text>
                <Select
                  value={routeType}
                  onChange={setRouteType}
                  size="sm"
                  variant="filled"
                  data={[
                    { value: 'loop', label: 'Loop' },
                    { value: 'out_back', label: 'Out & Back' },
                    { value: 'point_to_point', label: 'Point to Point' }
                  ]}
                />
              </Box>
            </Group>

            <Button
              onClick={handleGenerateAIRoutes}
              loading={generatingAI}
              leftSection={<IconSparkles size={18} />}
              color="lime"
              fullWidth
            >
              {generatingAI ? 'Generating Routes...' : 'Generate AI Routes'}
            </Button>

            {/* AI Suggestions Display */}
            {aiSuggestions.length > 0 && (
              <Box>
                <Text size="xs" style={{ color: tokens.colors.textMuted }} mb="xs">
                  AI SUGGESTIONS ({aiSuggestions.length})
                </Text>
                <Stack gap="xs" style={{ maxHeight: '300px', overflowY: 'auto' }}>
                  {aiSuggestions.map((suggestion, index) => (
                    <Card
                      key={index}
                      padding="sm"
                      style={{
                        backgroundColor: tokens.colors.bgTertiary,
                        cursor: 'pointer',
                        border: `1px solid ${tokens.colors.bgPrimary}`,
                        transition: 'all 0.2s'
                      }}
                      onClick={() => handleSelectAISuggestion(suggestion)}
                    >
                      <Stack gap="xs">
                        <Group justify="space-between" align="flex-start">
                          <Text fw={600} size="sm" style={{ color: tokens.colors.textPrimary, flex: 1 }}>
                            {suggestion.name}
                          </Text>
                          <Badge
                            size="xs"
                            color={
                              suggestion.difficulty === 'easy' ? 'green' :
                              suggestion.difficulty === 'moderate' ? 'yellow' :
                              'red'
                            }
                          >
                            {suggestion.difficulty}
                          </Badge>
                        </Group>
                        <Text size="xs" style={{ color: tokens.colors.textSecondary }} lineClamp={2}>
                          {suggestion.description}
                        </Text>
                        <Group gap="xs">
                          <Badge variant="outline" size="xs">
                            {suggestion.distance} km
                          </Badge>
                          {suggestion.elevationGain > 0 && (
                            <Badge variant="outline" size="xs">
                              {suggestion.elevationGain}m ↗
                            </Badge>
                          )}
                          <Badge variant="light" size="xs" color="lime">
                            {suggestion.estimatedTime}min
                          </Badge>
                        </Group>
                        <Button
                          size="xs"
                          variant="light"
                          color="lime"
                          leftSection={<IconRoute size={14} />}
                          fullWidth
                        >
                          Select Route
                        </Button>
                      </Stack>
                    </Card>
                  ))}
                </Stack>
              </Box>
            )}

            <Divider />

            {/* Route Stats */}
            <Box
              style={{
                padding: tokens.spacing.md,
                backgroundColor: tokens.colors.bgTertiary,
                borderRadius: tokens.radius.md,
              }}
            >
              <Group justify="space-between" mb="xs">
                <Text size="sm" style={{ color: tokens.colors.textSecondary }}>
                  Distance
                </Text>
                <Text fw={600} style={{ color: tokens.colors.textPrimary }}>
                  {routeStats.distance} km
                </Text>
              </Group>
              <Group justify="space-between" mb="xs">
                <Text size="sm" style={{ color: tokens.colors.textSecondary }}>
                  Waypoints
                </Text>
                <Text fw={600} style={{ color: tokens.colors.textPrimary }}>
                  {waypoints.length}
                </Text>
              </Group>
              <Group justify="space-between">
                <Text size="sm" style={{ color: tokens.colors.textSecondary }}>
                  Est. Time
                </Text>
                <Text fw={600} style={{ color: tokens.colors.textPrimary }}>
                  {routeStats.duration > 0 ? `${Math.floor(routeStats.duration / 60)}h ${routeStats.duration % 60}m` : '--:--'}
                </Text>
              </Group>
            </Box>

            {/* Instructions */}
            <Box style={{ flex: 1 }}>
              <Text size="xs" style={{ color: tokens.colors.textMuted }} mb="sm">
                INSTRUCTIONS
              </Text>
              <Stack gap="xs">
                <Text style={{ color: tokens.colors.textSecondary }} size="sm">
                  {waypoints.length === 0 ? '📍 Click on the map to add your first waypoint' :
                   waypoints.length === 1 ? '📍 Add another waypoint to create a route' :
                   `✅ Route created! ${isCalculating ? 'Calculating...' : ''}`}
                </Text>
                {waypoints.length > 0 && (
                  <Text style={{ color: tokens.colors.textMuted }} size="xs">
                    Click waypoint markers to remove them
                  </Text>
                )}
              </Stack>
            </Box>

            {/* Actions */}
            <Stack gap="sm">
              <Button
                color="lime"
                fullWidth
                disabled={waypoints.length < 2}
                onClick={exportGPX}
              >
                Export GPX
              </Button>
              <Button
                variant="outline"
                color="red"
                fullWidth
                disabled={waypoints.length === 0}
                onClick={clearRoute}
              >
                Clear Route
              </Button>
            </Stack>
          </Stack>
        </Paper>

        {/* Map Container */}
        <Box style={{ flex: 1, position: 'relative' }}>
          {MAPBOX_TOKEN ? (
            <Map
              ref={mapRef}
              {...viewport}
              onMove={evt => setViewport(evt.viewState)}
              onClick={handleMapClick}
              mapStyle="mapbox://styles/mapbox/outdoors-v12"
              mapboxAccessToken={MAPBOX_TOKEN}
              style={{ width: '100%', height: '100%' }}
              cursor="crosshair"
            >
              {/* Render route line */}
              {routeGeometry && (
                <Source id="route" type="geojson" data={{ type: 'Feature', geometry: routeGeometry }}>
                  <Layer
                    id="route-line"
                    type="line"
                    paint={{
                      'line-color': tokens.colors.electricLime,
                      'line-width': 4,
                      'line-opacity': 0.8
                    }}
                  />
                </Source>
              )}

              {/* Render waypoint markers */}
              {waypoints.map((waypoint, index) => (
                <Marker
                  key={waypoint.id}
                  longitude={waypoint.lng}
                  latitude={waypoint.lat}
                  anchor="bottom"
                  onClick={(e) => {
                    e.originalEvent.stopPropagation();
                    removeWaypoint(waypoint.id);
                  }}
                >
                  <div style={{
                    backgroundColor: index === 0 ? '#22c55e' : index === waypoints.length - 1 ? '#ef4444' : tokens.colors.electricLime,
                    color: 'white',
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 600,
                    fontSize: 14,
                    cursor: 'pointer',
                    border: '2px solid white',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                  }}>
                    {index === 0 ? 'S' : index === waypoints.length - 1 ? 'E' : index + 1}
                  </div>
                </Marker>
              ))}
            </Map>
          ) : (
            <Box
              style={{
                width: '100%',
                height: '100%',
                backgroundColor: tokens.colors.bgPrimary,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Stack align="center" gap="md">
                <Text size="4rem">🗺️</Text>
                <Title order={2} style={{ color: tokens.colors.textPrimary }}>
                  Map Configuration Required
                </Title>
                <Text style={{ color: tokens.colors.textSecondary, maxWidth: 400, textAlign: 'center' }}>
                  Configure VITE_MAPBOX_TOKEN in your .env file to enable the map.
                </Text>
              </Stack>
            </Box>
          )}
        </Box>
      </Box>
    </AppShell>
  );
}

// GPX generation helper
function generateGPX(name, coordinates) {
  const points = coordinates.map(([lng, lat]) => {
    return `    <trkpt lat="${lat}" lon="${lng}">
      <ele>0</ele>
    </trkpt>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="tribos.studio" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${name}</name>
    <time>${new Date().toISOString()}</time>
  </metadata>
  <trk>
    <name>${name}</name>
    <trkseg>
${points}
    </trkseg>
  </trk>
</gpx>`;
}

export default RouteBuilder;
