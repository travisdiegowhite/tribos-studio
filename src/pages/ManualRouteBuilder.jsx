import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box, Paper, Stack, Title, Text, Button, Group, TextInput, Textarea,
  SegmentedControl, Select, Card, Divider, Tooltip, ActionIcon, Menu,
  Switch, Badge, ThemeIcon
} from '@mantine/core';
import { useMediaQuery, useLocalStorage } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import {
  IconRoute, IconDeviceFloppy, IconCurrentLocation, IconX, IconSettings,
  IconDownload, IconTrash, IconRefresh, IconMap, IconBike, IconArrowBack,
  IconArrowForward, IconUpload, IconShare, IconArrowsExchange, IconPlus,
  IconGripVertical, IconMapPin, IconPoint
} from '@tabler/icons-react';
import Map, { Marker, Source, Layer } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

import { tokens } from '../theme';
import AppShell from '../components/AppShell.jsx';
import BottomSheet from '../components/BottomSheet.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';
import { getRoute } from '../utils/routesService';
import { formatDistance, formatElevation, formatSpeed } from '../utils/units';

// Shared components
import {
  MapControls,
  ElevationProfile,
  RouteStatsPanel,
  BikeInfrastructureLayer,
  BikeInfrastructureLegend,
  RouteExportMenu,
  CollapsibleSection,
  MAPBOX_TOKEN,
  BASEMAP_STYLES,
  CYCLOSM_STYLE,
  ROUTE_PROFILES,
  WAYPOINT_COLORS,
} from '../components/RouteBuilder';

// Shared hooks
import { useRouteManipulation } from '../hooks/useRouteManipulation';
import { useRouteOperations } from '../hooks/useRouteOperations';

/**
 * Manual Route Builder
 *
 * Traditional waypoint-based route building with:
 * - Click on map to add waypoints
 * - Drag waypoints to reposition
 * - Undo/Redo history
 * - Reverse route direction
 * - GPX import/export
 * - Save routes to database
 *
 * Shares base components with AI Route Builder but focuses on manual control.
 */
export default function ManualRouteBuilder() {
  const { routeId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const mapRef = useRef(null);
  const isMobile = useMediaQuery('(max-width: 768px)');

  // === State ===
  const [waypoints, setWaypoints] = useState([]);
  const [routeGeometry, setRouteGeometry] = useState(null);
  const [routeStats, setRouteStats] = useState(null);
  const [elevationProfile, setElevationProfile] = useState([]);

  const [routeName, setRouteName] = useState('');
  const [routeDescription, setRouteDescription] = useState('');
  const [routingProfile, setRoutingProfile] = useState('road');

  const [viewport, setViewport] = useState({
    latitude: 39.7392,
    longitude: -104.9903,
    zoom: 12,
  });

  const [basemapStyle, setBasemapStyle] = useLocalStorage({
    key: 'tribos-manual-builder-basemap',
    defaultValue: 'outdoors',
  });

  const [showInfrastructure, setShowInfrastructure] = useLocalStorage({
    key: 'tribos-manual-builder-infrastructure',
    defaultValue: false,
  });

  const [autoSnap, setAutoSnap] = useLocalStorage({
    key: 'tribos-manual-builder-autosnap',
    defaultValue: true,
  });

  const [isImperial] = useLocalStorage({
    key: 'tribos-use-imperial',
    defaultValue: true,
  });

  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedWaypoint, setSelectedWaypoint] = useState(null);
  const [draggingWaypoint, setDraggingWaypoint] = useState(null);

  // === Hooks ===
  const {
    addWaypoint,
    removeWaypoint,
    updateWaypointPosition,
    reverseRoute,
    clearRoute,
    undo,
    redo,
    canUndo,
    canRedo,
    snapToRoads,
    fetchElevation,
  } = useRouteManipulation({
    waypoints,
    setWaypoints,
    routeGeometry,
    setRouteGeometry,
    routeStats,
    setRouteStats,
    elevationProfile,
    setElevationProfile,
    routingProfile,
    useSmartRouting: true,
  });

  const {
    exportGPX,
    exportTCX,
    importGPX,
    triggerGPXImport,
    saveRoute,
    shareRoute,
  } = useRouteOperations({
    waypoints,
    routeGeometry,
    routeName,
    setRouteName,
    routeDescription,
    setRouteDescription,
    routeStats,
    elevationProfile,
    routingProfile,
    setWaypoints,
    setRouteGeometry,
    setRouteStats,
    setElevationProfile,
    onSaved: (savedRoute) => {
      if (savedRoute?.id) {
        navigate(`/routes/${savedRoute.id}`);
      }
    },
  });

  // === Format helpers ===
  const formatDist = useCallback((meters) => {
    const km = meters / 1000;
    return formatDistance(km, isImperial);
  }, [isImperial]);

  const formatElev = useCallback((meters) => {
    return formatElevation(meters, isImperial);
  }, [isImperial]);

  // === Get current basemap style ===
  const currentMapStyle = useMemo(() => {
    const style = BASEMAP_STYLES.find(s => s.id === basemapStyle);
    return style?.style || BASEMAP_STYLES[0].style;
  }, [basemapStyle]);

  // === Load existing route if routeId provided ===
  useEffect(() => {
    if (routeId && routeId !== 'new') {
      loadExistingRoute(routeId);
    }
  }, [routeId]);

  const loadExistingRoute = async (id) => {
    setLoading(true);
    try {
      const route = await getRoute(id);
      if (route) {
        setRouteName(route.name || '');
        setRouteDescription(route.description || '');

        if (route.track_points?.length > 0) {
          const coords = route.track_points.map(p => [p.longitude, p.latitude]);
          setRouteGeometry({ type: 'LineString', coordinates: coords });

          // Create waypoints from first/last points
          const firstPoint = route.track_points[0];
          const lastPoint = route.track_points[route.track_points.length - 1];

          setWaypoints([
            {
              id: 'wp_start',
              position: [firstPoint.longitude, firstPoint.latitude],
              type: 'start',
              name: 'Start',
            },
            {
              id: 'wp_end',
              position: [lastPoint.longitude, lastPoint.latitude],
              type: 'end',
              name: 'End',
            },
          ]);

          // Fit map to route
          if (mapRef.current) {
            const bounds = coords.reduce(
              (acc, [lng, lat]) => ({
                minLng: Math.min(acc.minLng, lng),
                maxLng: Math.max(acc.maxLng, lng),
                minLat: Math.min(acc.minLat, lat),
                maxLat: Math.max(acc.maxLat, lat),
              }),
              { minLng: 180, maxLng: -180, minLat: 90, maxLat: -90 }
            );

            mapRef.current.fitBounds(
              [[bounds.minLng, bounds.minLat], [bounds.maxLng, bounds.maxLat]],
              { padding: 50 }
            );
          }
        }

        if (route.distance) {
          setRouteStats({
            distance: route.distance * 1000,
            gain: route.elevation_gain || 0,
            loss: route.elevation_loss || 0,
          });
        }
      }
    } catch (err) {
      console.error('Failed to load route:', err);
      notifications.show({
        title: 'Failed to load route',
        message: err.message,
        color: 'red',
      });
    } finally {
      setLoading(false);
    }
  };

  // === Get user location ===
  const getUserLocation = useCallback(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setViewport({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            zoom: 14,
          });
        },
        (error) => {
          console.error('Geolocation error:', error);
          notifications.show({
            title: 'Location unavailable',
            message: 'Could not get your location',
            color: 'yellow',
          });
        }
      );
    }
  }, []);

  // Get location on mount
  useEffect(() => {
    if (!routeId || routeId === 'new') {
      getUserLocation();
    }
  }, [routeId, getUserLocation]);

  // === Map click handler ===
  const handleMapClick = useCallback((event) => {
    const { lng, lat } = event.lngLat;

    // Add waypoint
    const newWaypoints = addWaypoint({ lng, lat });

    // Auto-snap to roads if enabled and we have 2+ waypoints
    if (autoSnap && newWaypoints.length >= 2) {
      snapToRoads(newWaypoints);
    }
  }, [addWaypoint, autoSnap, snapToRoads]);

  // === Waypoint drag handlers ===
  const handleWaypointDragStart = useCallback((waypointId) => {
    setDraggingWaypoint(waypointId);
  }, []);

  const handleWaypointDrag = useCallback((waypointId, event) => {
    // Update position during drag for visual feedback
    const { lng, lat } = event.lngLat;
    const updated = waypoints.map(wp =>
      wp.id === waypointId ? { ...wp, position: [lng, lat] } : wp
    );
    setWaypoints(updated);
  }, [waypoints, setWaypoints]);

  const handleWaypointDragEnd = useCallback((waypointId, event) => {
    const { lng, lat } = event.lngLat;
    updateWaypointPosition(waypointId, { lng, lat });
    setDraggingWaypoint(null);

    // Re-snap if auto-snap is enabled
    if (autoSnap && waypoints.length >= 2) {
      const updatedWaypoints = waypoints.map(wp =>
        wp.id === waypointId ? { ...wp, position: [lng, lat] } : wp
      );
      snapToRoads(updatedWaypoints);
    }
  }, [waypoints, updateWaypointPosition, autoSnap, snapToRoads]);

  // === Calculate route (manual trigger) ===
  const handleCalculateRoute = useCallback(() => {
    if (waypoints.length >= 2) {
      snapToRoads(waypoints);
    } else {
      notifications.show({
        title: 'Need more waypoints',
        message: 'Add at least 2 waypoints to calculate a route',
        color: 'yellow',
      });
    }
  }, [waypoints, snapToRoads]);

  // === Handle save ===
  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await saveRoute();
    } finally {
      setSaving(false);
    }
  }, [saveRoute]);

  // === Route line layer style ===
  // Note: Mapbox GL doesn't support CSS variables, use hardcoded hex
  const routeLayerStyle = {
    id: 'route-line',
    type: 'line',
    paint: {
      'line-color': '#32CD32', // electricLime - hardcoded for Mapbox GL
      'line-width': 4,
      'line-opacity': 0.9,
    },
  };

  const routeOutlineStyle = {
    id: 'route-outline',
    type: 'line',
    paint: {
      'line-color': '#000',
      'line-width': 6,
      'line-opacity': 0.5,
    },
  };

  // === Render ===
  return (
    <AppShell>
      <Box
        style={{
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <Paper
          shadow="sm"
          p="sm"
          style={{
            backgroundColor: 'var(--tribos-bg-secondary)',
            borderBottom: `1px solid ${'var(--tribos-border)'}`,
            zIndex: 100,
          }}
        >
          <Group justify="space-between">
            <Group>
              <ThemeIcon size="lg" color="lime" variant="light">
                <IconRoute size={20} />
              </ThemeIcon>
              <div>
                <Title order={4} style={{ color: 'var(--tribos-text-primary)' }}>
                  Manual Route Builder
                </Title>
                <Text size="xs" c="dimmed">
                  Click on the map to add waypoints
                </Text>
              </div>
            </Group>

            <Group>
              {/* Undo/Redo */}
              <Tooltip label="Undo (Ctrl+Z)">
                <ActionIcon
                  variant="light"
                  color="gray"
                  disabled={!canUndo}
                  onClick={undo}
                >
                  <IconArrowBack size={18} />
                </ActionIcon>
              </Tooltip>

              <Tooltip label="Redo (Ctrl+Y)">
                <ActionIcon
                  variant="light"
                  color="gray"
                  disabled={!canRedo}
                  onClick={redo}
                >
                  <IconArrowForward size={18} />
                </ActionIcon>
              </Tooltip>

              <Divider orientation="vertical" />

              {/* Actions */}
              <Tooltip label="Import GPX">
                <ActionIcon variant="subtle" color="gray" onClick={triggerGPXImport}>
                  <IconUpload size={18} />
                </ActionIcon>
              </Tooltip>

              <Tooltip label="Reverse route">
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  onClick={reverseRoute}
                  disabled={waypoints.length < 2}
                >
                  <IconArrowsExchange size={18} />
                </ActionIcon>
              </Tooltip>

              <Tooltip label="Clear route">
                <ActionIcon variant="subtle" color="red" onClick={clearRoute}>
                  <IconTrash size={18} />
                </ActionIcon>
              </Tooltip>

              <Divider orientation="vertical" />

              {/* Export Menu */}
              <RouteExportMenu
                routeGeometry={routeGeometry}
                routeName={routeName}
                routeStats={routeStats}
                elevationProfile={elevationProfile}
                onExportGPX={exportGPX}
                onExportTCX={exportTCX}
              />

              {/* Save */}
              <Button
                leftSection={<IconDeviceFloppy size={16} />}
                color="lime"
                variant="filled"
                loading={saving}
                onClick={handleSave}
                disabled={!routeName || waypoints.length < 2}
              >
                Save
              </Button>
            </Group>
          </Group>
        </Paper>

        {/* Main content */}
        <Box style={{ flex: 1, display: 'flex', position: 'relative' }}>
          {/* Sidebar */}
          {!isMobile && (
            <Paper
              shadow="sm"
              style={{
                width: 320,
                backgroundColor: 'var(--tribos-bg-secondary)',
                borderRight: `1px solid ${'var(--tribos-border)'}`,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
              }}
            >
              <Stack p="md" gap="md" style={{ flex: 1, overflowY: 'auto' }}>
                {/* Route name */}
                <TextInput
                  label="Route Name"
                  placeholder="Enter route name"
                  value={routeName}
                  onChange={(e) => setRouteName(e.target.value)}
                />

                <Textarea
                  label="Description"
                  placeholder="Optional description"
                  value={routeDescription}
                  onChange={(e) => setRouteDescription(e.target.value)}
                  minRows={2}
                />

                {/* Route profile */}
                <Select
                  label="Route Type"
                  value={routingProfile}
                  onChange={setRoutingProfile}
                  data={ROUTE_PROFILES}
                />

                <Divider />

                {/* Settings */}
                <CollapsibleSection title="Settings" defaultOpen>
                  <Stack gap="sm">
                    <Group justify="space-between">
                      <Text size="sm">Auto-snap to roads</Text>
                      <Switch
                        checked={autoSnap}
                        onChange={(e) => setAutoSnap(e.currentTarget.checked)}
                        color="lime"
                      />
                    </Group>

                    <Group justify="space-between">
                      <Text size="sm">Show bike infrastructure</Text>
                      <Switch
                        checked={showInfrastructure}
                        onChange={(e) => setShowInfrastructure(e.currentTarget.checked)}
                        color="lime"
                      />
                    </Group>

                    <Select
                      label="Map Style"
                      size="xs"
                      value={basemapStyle}
                      onChange={setBasemapStyle}
                      data={BASEMAP_STYLES.map(s => ({ value: s.id, label: s.label }))}
                    />
                  </Stack>
                </CollapsibleSection>

                <Divider />

                {/* Waypoints list */}
                <CollapsibleSection
                  title={`Waypoints (${waypoints.length})`}
                  defaultOpen
                >
                  <Stack gap="xs">
                    {waypoints.length === 0 ? (
                      <Text size="sm" c="dimmed" ta="center" py="md">
                        Click on the map to add waypoints
                      </Text>
                    ) : (
                      waypoints.map((wp, index) => (
                        <Card
                          key={wp.id}
                          padding="xs"
                          radius="sm"
                          style={{
                            backgroundColor: selectedWaypoint === wp.id
                              ? 'var(--tribos-bg-tertiary)'
                              : 'transparent',
                            border: `1px solid ${'var(--tribos-border)'}`,
                            cursor: 'pointer',
                          }}
                          onClick={() => setSelectedWaypoint(wp.id)}
                        >
                          <Group justify="space-between">
                            <Group gap="xs">
                              <Box
                                style={{
                                  width: 12,
                                  height: 12,
                                  borderRadius: '50%',
                                  backgroundColor: WAYPOINT_COLORS[wp.type] || WAYPOINT_COLORS.waypoint,
                                }}
                              />
                              <Text size="sm">{wp.name}</Text>
                            </Group>

                            <ActionIcon
                              size="sm"
                              variant="subtle"
                              color="red"
                              onClick={(e) => {
                                e.stopPropagation();
                                removeWaypoint(wp.id);
                                if (autoSnap && waypoints.length > 2) {
                                  const remaining = waypoints.filter(w => w.id !== wp.id);
                                  if (remaining.length >= 2) {
                                    snapToRoads(remaining);
                                  }
                                }
                              }}
                            >
                              <IconX size={14} />
                            </ActionIcon>
                          </Group>
                        </Card>
                      ))
                    )}

                    {waypoints.length >= 2 && !autoSnap && (
                      <Button
                        variant="light"
                        color="lime"
                        size="sm"
                        leftSection={<IconRefresh size={14} />}
                        onClick={handleCalculateRoute}
                      >
                        Calculate Route
                      </Button>
                    )}
                  </Stack>
                </CollapsibleSection>

                {/* Route Stats */}
                {routeStats && (
                  <>
                    <Divider />
                    <CollapsibleSection title="Route Stats" defaultOpen>
                      <Stack gap="xs">
                        <Group justify="space-between">
                          <Text size="sm" c="dimmed">Distance</Text>
                          <Text size="sm" fw={600}>
                            {formatDist(routeStats.distance || 0)}
                          </Text>
                        </Group>
                        <Group justify="space-between">
                          <Text size="sm" c="dimmed">Elevation Gain</Text>
                          <Text size="sm" fw={600}>
                            {formatElev(routeStats.gain || 0)}
                          </Text>
                        </Group>
                        <Group justify="space-between">
                          <Text size="sm" c="dimmed">Elevation Loss</Text>
                          <Text size="sm" fw={600}>
                            {formatElev(routeStats.loss || 0)}
                          </Text>
                        </Group>
                        {routeStats.routingSource && (
                          <Group justify="space-between">
                            <Text size="sm" c="dimmed">Router</Text>
                            <Badge size="sm" variant="light">
                              {routeStats.routingSource}
                            </Badge>
                          </Group>
                        )}
                      </Stack>
                    </CollapsibleSection>
                  </>
                )}
              </Stack>
            </Paper>
          )}

          {/* Map */}
          <Box style={{ flex: 1, position: 'relative' }}>
            <Map
              ref={mapRef}
              {...viewport}
              onMove={(evt) => setViewport(evt.viewState)}
              onClick={handleMapClick}
              mapStyle={currentMapStyle}
              mapboxAccessToken={MAPBOX_TOKEN}
              style={{ width: '100%', height: '100%' }}
              cursor="crosshair"
            >
              {/* Bike infrastructure layer */}
              {showInfrastructure && <BikeInfrastructureLayer />}

              {/* Route line */}
              {routeGeometry && (
                <Source type="geojson" data={routeGeometry}>
                  <Layer {...routeOutlineStyle} />
                  <Layer {...routeLayerStyle} />
                </Source>
              )}

              {/* Waypoint markers */}
              {waypoints.map((wp, index) => (
                <Marker
                  key={wp.id}
                  longitude={wp.position[0]}
                  latitude={wp.position[1]}
                  draggable
                  onDragStart={() => handleWaypointDragStart(wp.id)}
                  onDrag={(e) => handleWaypointDrag(wp.id, e)}
                  onDragEnd={(e) => handleWaypointDragEnd(wp.id, e)}
                  anchor="center"
                >
                  <Box
                    style={{
                      width: wp.type === 'waypoint' ? 16 : 24,
                      height: wp.type === 'waypoint' ? 16 : 24,
                      borderRadius: '50%',
                      backgroundColor: WAYPOINT_COLORS[wp.type] || WAYPOINT_COLORS.waypoint,
                      border: '3px solid white',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                      cursor: 'grab',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'white',
                      fontSize: 10,
                      fontWeight: 'bold',
                    }}
                  >
                    {wp.type !== 'waypoint' && (wp.type === 'start' ? 'S' : 'E')}
                  </Box>
                </Marker>
              ))}

              {/* Map Controls */}
              <MapControls
                mapRef={mapRef}
                viewport={viewport}
                routeGeometry={routeGeometry}
              />
            </Map>

            {/* Map controls */}
            <Box
              style={{
                position: 'absolute',
                top: 16,
                right: 16,
                zIndex: 10,
              }}
            >
              <Stack gap="xs">
                <Tooltip label="My location" position="left">
                  <ActionIcon
                    variant="filled"
                    color="dark"
                    size="lg"
                    onClick={getUserLocation}
                  >
                    <IconCurrentLocation size={18} />
                  </ActionIcon>
                </Tooltip>

                {routeGeometry && (
                  <Tooltip label="Fit to route" position="left">
                    <ActionIcon
                      variant="filled"
                      color="dark"
                      size="lg"
                      onClick={() => {
                        if (mapRef.current && routeGeometry?.coordinates?.length > 0) {
                          const coords = routeGeometry.coordinates;
                          const bounds = coords.reduce(
                            (acc, [lng, lat]) => ({
                              minLng: Math.min(acc.minLng, lng),
                              maxLng: Math.max(acc.maxLng, lng),
                              minLat: Math.min(acc.minLat, lat),
                              maxLat: Math.max(acc.maxLat, lat),
                            }),
                            { minLng: 180, maxLng: -180, minLat: 90, maxLat: -90 }
                          );
                          mapRef.current.fitBounds(
                            [[bounds.minLng, bounds.minLat], [bounds.maxLng, bounds.maxLat]],
                            { padding: 50 }
                          );
                        }
                      }}
                    >
                      <IconMap size={18} />
                    </ActionIcon>
                  </Tooltip>
                )}
              </Stack>
            </Box>

            {/* Infrastructure legend */}
            {showInfrastructure && (
              <Box
                style={{
                  position: 'absolute',
                  bottom: routeGeometry ? 140 : 16,
                  left: 16,
                  zIndex: 10,
                }}
              >
                <BikeInfrastructureLegend />
              </Box>
            )}
          </Box>
        </Box>

        {/* Elevation Profile */}
        {routeGeometry?.coordinates && (
          <ElevationProfile
            coordinates={routeGeometry.coordinates}
            totalDistance={routeStats?.distance ? routeStats.distance / 1000 : 0}
            isImperial={isImperial}
            leftOffset={isMobile ? 0 : 320}
          />
        )}

        {/* Mobile bottom sheet */}
        {isMobile && (
          <BottomSheet
            title="Route Builder"
            defaultHeight={180}
            minHeight={60}
            maxHeight={400}
          >
            <Stack p="sm" gap="sm">
              <TextInput
                placeholder="Route name"
                value={routeName}
                onChange={(e) => setRouteName(e.target.value)}
                size="sm"
              />

              <Group grow>
                <Button
                  variant="light"
                  size="sm"
                  leftSection={<IconUpload size={14} />}
                  onClick={triggerGPXImport}
                >
                  Import
                </Button>
                <Button
                  variant="light"
                  size="sm"
                  leftSection={<IconDownload size={14} />}
                  onClick={exportGPX}
                  disabled={!routeGeometry}
                >
                  Export
                </Button>
              </Group>

              <Group justify="space-between">
                <Text size="sm">Auto-snap</Text>
                <Switch
                  size="sm"
                  checked={autoSnap}
                  onChange={(e) => setAutoSnap(e.currentTarget.checked)}
                  color="lime"
                />
              </Group>

              {routeStats && (
                <Group justify="space-around">
                  <div>
                    <Text size="xs" c="dimmed">Distance</Text>
                    <Text size="sm" fw={600}>{formatDist(routeStats.distance || 0)}</Text>
                  </div>
                  <div>
                    <Text size="xs" c="dimmed">Elevation</Text>
                    <Text size="sm" fw={600}>{formatElev(routeStats.gain || 0)}</Text>
                  </div>
                </Group>
              )}
            </Stack>
          </BottomSheet>
        )}
      </Box>
    </AppShell>
  );
}
