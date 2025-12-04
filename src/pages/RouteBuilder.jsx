import { useState, useRef, useCallback, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Box, Paper, Stack, Title, Text, Button, Group, TextInput, Textarea, SegmentedControl, NumberInput, Select, Card, Badge, Divider, Loader, Tooltip } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconSparkles, IconRoute, IconDeviceFloppy } from '@tabler/icons-react';
import Map, { Marker, Source, Layer } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { tokens } from '../theme';
import AppShell from '../components/AppShell.jsx';
import { generateClaudeRoutes, convertClaudeToRoute, parseNaturalLanguageRoute } from '../utils/claudeRouteService';
import { useAuth } from '../contexts/AuthContext.jsx';
import { stravaService } from '../utils/stravaService';
import { saveRoute, getRoute } from '../utils/routesService';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

function RouteBuilder() {
  const { routeId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
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
  const [routeProfile, setRouteProfile] = useState('road'); // 'road', 'gravel', 'mountain', 'commuting'
  const [aiSuggestions, setAiSuggestions] = useState([]);
  const [generatingAI, setGeneratingAI] = useState(false);
  const [convertingRoute, setConvertingRoute] = useState(null); // Index of suggestion being converted
  const [naturalLanguageInput, setNaturalLanguageInput] = useState('');
  const [routingSource, setRoutingSource] = useState(null); // 'stadia_maps', 'brouter', 'mapbox'

  // Speed profile from Strava sync
  const [speedProfile, setSpeedProfile] = useState(null);

  // Route saving state
  const [savedRouteId, setSavedRouteId] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [loadingRoute, setLoadingRoute] = useState(false);

  const [viewport, setViewport] = useState({
    latitude: 37.7749,
    longitude: -122.4194,
    zoom: 12
  });

  // Load user's speed profile on mount
  useEffect(() => {
    const loadSpeedProfile = async () => {
      if (!user) return;

      try {
        const profile = await stravaService.getSpeedProfile();
        if (profile) {
          setSpeedProfile(profile);
          console.log('🚴 Speed profile loaded:', {
            average: profile.average_speed,
            road: profile.road_speed,
            gravel: profile.gravel_speed,
            mtb: profile.mtb_speed
          });
        }
      } catch (error) {
        console.error('Error loading speed profile:', error);
      }
    };

    loadSpeedProfile();
  }, [user]);

  // Load existing route if editing
  useEffect(() => {
    const loadExistingRoute = async () => {
      if (!routeId || !user) return;

      setLoadingRoute(true);
      try {
        const route = await getRoute(routeId);
        if (route) {
          setRouteName(route.name);
          setRouteGeometry(route.geometry);
          setRouteStats({
            distance: route.distance_km || 0,
            elevation: route.elevation_gain_m || 0,
            duration: route.estimated_duration_minutes || 0
          });
          setRouteType(route.route_type || 'loop');
          setTrainingGoal(route.training_goal || 'endurance');
          setSavedRouteId(route.id);

          // Center map on route start
          if (route.start_latitude && route.start_longitude) {
            setViewport(v => ({
              ...v,
              latitude: route.start_latitude,
              longitude: route.start_longitude,
              zoom: 13
            }));
          }
        }
      } catch (error) {
        console.error('Error loading route:', error);
        notifications.show({
          title: 'Error',
          message: 'Failed to load route',
          color: 'red'
        });
      } finally {
        setLoadingRoute(false);
      }
    };

    loadExistingRoute();
  }, [routeId, user]);

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
    if (!routeGeometry) {
      notifications.show({
        title: 'No Route',
        message: 'Please create a route first',
        color: 'yellow'
      });
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
  }, [routeName, routeGeometry]);

  // Save route to database
  const handleSaveRoute = useCallback(async () => {
    if (!routeGeometry) {
      notifications.show({
        title: 'No Route',
        message: 'Please create a route before saving',
        color: 'yellow'
      });
      return;
    }

    if (!user) {
      notifications.show({
        title: 'Sign In Required',
        message: 'Please sign in to save routes',
        color: 'yellow'
      });
      return;
    }

    setIsSaving(true);
    try {
      const routeData = {
        id: savedRouteId, // Include ID if updating existing route
        name: routeName,
        geometry: routeGeometry,
        distance_km: parseFloat(routeStats.distance) || null,
        elevation_gain_m: routeStats.elevation || null,
        estimated_duration_minutes: routeStats.duration || null,
        route_type: routeType,
        training_goal: trainingGoal,
        surface_type: routeProfile,
        generated_by: aiSuggestions.length > 0 ? 'ai' : 'manual',
        waypoints: waypoints.length > 0 ? waypoints : null
      };

      const saved = await saveRoute(routeData);
      setSavedRouteId(saved.id);

      notifications.show({
        title: 'Route Saved!',
        message: `"${routeName}" has been saved to your routes`,
        color: 'lime'
      });

      // If this was a new route, update URL to include route ID
      if (!routeId && saved.id) {
        navigate(`/routes/${saved.id}`, { replace: true });
      }
    } catch (error) {
      console.error('Error saving route:', error);
      notifications.show({
        title: 'Save Failed',
        message: error.message || 'Failed to save route',
        color: 'red'
      });
    } finally {
      setIsSaving(false);
    }
  }, [routeGeometry, routeName, routeStats, routeType, trainingGoal, routeProfile, waypoints, aiSuggestions, savedRouteId, user, routeId, navigate]);

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

  // Get user's speed for the current route profile
  const getUserSpeedForProfile = useCallback((profile) => {
    if (!speedProfile) return null;

    switch (profile) {
      case 'road':
        return speedProfile.road_speed || speedProfile.average_speed;
      case 'gravel':
        return speedProfile.gravel_speed || (speedProfile.average_speed ? speedProfile.average_speed * 0.85 : null);
      case 'mountain':
        return speedProfile.mtb_speed || (speedProfile.average_speed ? speedProfile.average_speed * 0.7 : null);
      case 'commuting':
        return speedProfile.easy_speed || (speedProfile.average_speed ? speedProfile.average_speed * 0.9 : null);
      default:
        return speedProfile.average_speed;
    }
  }, [speedProfile]);

  // Select an AI suggestion and convert to GPS route
  const handleSelectAISuggestion = useCallback(async (suggestion, index) => {
    setConvertingRoute(index);
    setRouteName(suggestion.name);

    // Get personalized speed for this route type
    const userSpeed = getUserSpeedForProfile(routeProfile);

    try {
      notifications.show({
        id: 'converting-route',
        title: 'Converting Route',
        message: `Generating GPS coordinates for "${suggestion.name}"...${userSpeed ? ` (using your ${routeProfile} speed: ${userSpeed.toFixed(1)} km/h)` : ''}`,
        loading: true,
        autoClose: false
      });

      // Convert Claude suggestion to actual GPS route using smart router
      const convertedRoute = await convertClaudeToRoute(suggestion, {
        mapboxToken: MAPBOX_TOKEN,
        profile: routeProfile,
        userSpeed // Use personalized speed from Strava data
      });

      if (convertedRoute && convertedRoute.coordinates) {
        // Set the route geometry
        setRouteGeometry(convertedRoute.geometry);

        // Update route stats
        setRouteStats({
          distance: convertedRoute.distance.toFixed(1),
          elevation: convertedRoute.elevationGain || 0,
          duration: Math.round(convertedRoute.duration)
        });

        // Track routing source for display
        setRoutingSource(convertedRoute.routingSource);

        // Clear waypoints since we're using AI-generated route
        setWaypoints([]);

        notifications.update({
          id: 'converting-route',
          title: 'Route Generated!',
          message: `${convertedRoute.distance.toFixed(1)} km via ${getRoutingSourceLabel(convertedRoute.routingSource)}`,
          color: 'lime',
          loading: false,
          autoClose: 3000
        });
      }
    } catch (error) {
      console.error('Error converting route:', error);
      notifications.update({
        id: 'converting-route',
        title: 'Conversion Failed',
        message: error.message || 'Failed to generate GPS route. Please try again.',
        color: 'red',
        loading: false,
        autoClose: 5000
      });
    } finally {
      setConvertingRoute(null);
    }
  }, [routeProfile, getUserSpeedForProfile]);

  // Get human-readable label for routing source
  const getRoutingSourceLabel = (source) => {
    switch (source) {
      case 'stadia_maps': return 'Stadia Maps (Valhalla)';
      case 'brouter': return 'BRouter';
      case 'brouter_gravel': return 'BRouter Gravel';
      case 'mapbox_fallback': return 'Mapbox';
      default: return source || 'Unknown';
    }
  };

  // Handle natural language route generation
  const handleNaturalLanguageGenerate = useCallback(async () => {
    if (!naturalLanguageInput.trim()) {
      notifications.show({
        title: 'Enter a description',
        message: 'Please describe the route you want (e.g., "40 mile gravel loop")',
        color: 'yellow'
      });
      return;
    }

    // Parse natural language into structured params
    const parsed = parseNaturalLanguageRoute(naturalLanguageInput, {
      lat: viewport.latitude,
      lng: viewport.longitude
    });

    // Update UI with parsed values
    setTimeAvailable(parsed.timeAvailable);
    setTrainingGoal(parsed.trainingGoal);
    setRouteType(parsed.routeType);
    setRouteProfile(parsed.profile);

    // Generate routes with parsed params
    setGeneratingAI(true);
    try {
      const suggestions = await generateClaudeRoutes({
        startLocation: parsed.startLocation,
        timeAvailable: parsed.timeAvailable,
        trainingGoal: parsed.trainingGoal,
        routeType: parsed.routeType
      });

      setAiSuggestions(suggestions);
      notifications.show({
        title: 'Routes Generated!',
        message: `Found ${suggestions.length} ${parsed.profile} routes matching "${naturalLanguageInput}"`,
        color: 'lime'
      });
    } catch (error) {
      console.error('Natural language route generation error:', error);
      notifications.show({
        title: 'Generation Failed',
        message: error.message || 'Failed to generate routes. Please try again.',
        color: 'red'
      });
    } finally {
      setGeneratingAI(false);
    }
  }, [naturalLanguageInput, viewport]);

  // Show loading state when loading existing route
  if (loadingRoute) {
    return (
      <AppShell fullWidth>
        <Box style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 'calc(100vh - 60px)' }}>
          <Stack align="center" gap="md">
            <Loader color="lime" size="lg" />
            <Text style={{ color: tokens.colors.textSecondary }}>Loading route...</Text>
          </Stack>
        </Box>
      </AppShell>
    );
  }

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

            {/* Natural Language Input */}
            <Box>
              <Text size="xs" style={{ color: tokens.colors.textMuted }} mb="xs">
                DESCRIBE YOUR RIDE
              </Text>
              <Textarea
                placeholder="e.g., '40 mile gravel loop' or '2 hour recovery ride on bike paths'"
                value={naturalLanguageInput}
                onChange={(e) => setNaturalLanguageInput(e.target.value)}
                minRows={2}
                maxRows={3}
                size="sm"
                variant="filled"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleNaturalLanguageGenerate();
                  }
                }}
              />
              <Button
                onClick={handleNaturalLanguageGenerate}
                loading={generatingAI}
                leftSection={<IconSparkles size={16} />}
                color="lime"
                variant="light"
                size="xs"
                mt="xs"
                fullWidth
              >
                Generate from Description
              </Button>
            </Box>

            <Divider label="or configure manually" labelPosition="center" size="xs" />

            {/* Route Profile Selector */}
            <Box>
              <Text size="xs" style={{ color: tokens.colors.textMuted }} mb="xs">
                ROUTE PROFILE
              </Text>
              <SegmentedControl
                value={routeProfile}
                onChange={setRouteProfile}
                fullWidth
                size="xs"
                data={[
                  { label: '🚴 Road', value: 'road' },
                  { label: '🌲 Gravel', value: 'gravel' },
                  { label: '⛰️ MTB', value: 'mountain' },
                  { label: '🏙️ Commute', value: 'commuting' }
                ]}
                styles={{
                  root: { backgroundColor: tokens.colors.bgTertiary }
                }}
              />
            </Box>

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
                        cursor: convertingRoute !== null ? 'wait' : 'pointer',
                        border: `1px solid ${convertingRoute === index ? tokens.colors.electricLime : tokens.colors.bgPrimary}`,
                        transition: 'all 0.2s',
                        opacity: convertingRoute !== null && convertingRoute !== index ? 0.5 : 1
                      }}
                      onClick={() => convertingRoute === null && handleSelectAISuggestion(suggestion, index)}
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
                          leftSection={convertingRoute === index ? <Loader size={14} /> : <IconRoute size={14} />}
                          fullWidth
                          disabled={convertingRoute !== null}
                          loading={convertingRoute === index}
                        >
                          {convertingRoute === index ? 'Converting...' : 'Select & Generate Route'}
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
                  Elevation
                </Text>
                <Text fw={600} style={{ color: tokens.colors.textPrimary }}>
                  {routeStats.elevation > 0 ? `${routeStats.elevation}m ↗` : '--'}
                </Text>
              </Group>
              <Group justify="space-between" mb="xs">
                <Text size="sm" style={{ color: tokens.colors.textSecondary }}>
                  Est. Time
                </Text>
                <Text fw={600} style={{ color: tokens.colors.textPrimary }}>
                  {routeStats.duration > 0 ? `${Math.floor(routeStats.duration / 60)}h ${routeStats.duration % 60}m` : '--:--'}
                </Text>
              </Group>
              {routingSource && (
                <Group justify="space-between">
                  <Text size="sm" style={{ color: tokens.colors.textSecondary }}>
                    Powered by
                  </Text>
                  <Tooltip label={getRoutingSourceLabel(routingSource)}>
                    <Badge size="xs" variant="light" color="blue">
                      {routingSource === 'stadia_maps' ? 'Valhalla' :
                       routingSource === 'brouter' || routingSource === 'brouter_gravel' ? 'BRouter' :
                       'Mapbox'}
                    </Badge>
                  </Tooltip>
                </Group>
              )}
              {speedProfile && (
                <Group justify="space-between">
                  <Text size="sm" style={{ color: tokens.colors.textSecondary }}>
                    Your Speed
                  </Text>
                  <Tooltip label={`Based on ${speedProfile.rides_analyzed} Strava rides`}>
                    <Badge size="xs" variant="light" color="lime">
                      {getUserSpeedForProfile(routeProfile)?.toFixed(1) || speedProfile.average_speed?.toFixed(1)} km/h
                    </Badge>
                  </Tooltip>
                </Group>
              )}
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
                disabled={!routeGeometry}
                onClick={handleSaveRoute}
                loading={isSaving}
                leftSection={<IconDeviceFloppy size={18} />}
              >
                {savedRouteId ? 'Update Route' : 'Save Route'}
              </Button>
              <Group grow>
                <Button
                  variant="light"
                  color="lime"
                  disabled={!routeGeometry}
                  onClick={exportGPX}
                >
                  Export GPX
                </Button>
                <Button
                  variant="outline"
                  color="red"
                  disabled={!routeGeometry && waypoints.length === 0}
                  onClick={clearRoute}
                >
                  Clear
                </Button>
              </Group>
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
