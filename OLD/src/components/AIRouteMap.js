import React, { useState, useRef, useEffect } from 'react';
import { Map, Source, Layer, Marker, NavigationControl } from 'react-map-gl';
import { useMediaQuery } from '@mantine/hooks';
import { Button, Menu, ActionIcon, Container, Paper, Stack, Text, Group, Badge, UnstyledButton, Divider } from '@mantine/core';
import { Maximize2, Layers, Check, MapPin, Mountain, Clock, Route } from 'lucide-react';
import { buildLineString } from '../utils/geo';
import AIRouteGenerator from './AIRouteGenerator';
import QuickRouteGenerator from './QuickRouteGenerator';
import RouteProfile from './RouteProfile';
import AIRouteActions from './AIRouteActions';
import BreadcrumbNav from './BreadcrumbNav';
import { createColoredRouteSegments } from '../utils/intervalCues';
import { supabase } from '../supabase';
import { useAuth } from '../contexts/AuthContext';
import 'mapbox-gl/dist/mapbox-gl.css';

const AIRouteMap = () => {
  const { user } = useAuth();
  const isMobile = useMediaQuery('(max-width: 768px)');
  const [viewState, setViewState] = useState({
    longitude: -0.09,
    latitude: 51.505,
    zoom: 13,
    pitch: 0,
    bearing: 0,
  });

  const [selectedRoute, setSelectedRoute] = useState(null);
  const [generatedRoutes, setGeneratedRoutes] = useState([]); // Array of all generated routes
  const [startLocation, setStartLocation] = useState(null);
  const [mapStyle, setMapStyle] = useState('outdoors');
  const mapRef = useRef(null);

  // Quick vs Advanced mode toggle
  // Default to quick mode for new users (< 5 rides), unless they've toggled to advanced
  const [useQuickMode, setUseQuickMode] = useState(() => {
    return localStorage.getItem('tribos_route_mode') !== 'advanced';
  });
  const [userRideCount, setUserRideCount] = useState(null);

  // Check user ride count to determine default mode
  useEffect(() => {
    if (user) {
      const checkRideCount = async () => {
        try {
          const { count } = await supabase
            .from('routes')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', user.id)
            .not('recorded_at', 'is', null);

          setUserRideCount(count || 0);

          // If user has 5+ rides and hasn't explicitly set mode, suggest advanced
          if (count >= 5 && !localStorage.getItem('tribos_route_mode')) {
            // Still default to quick, but they can switch
          }
        } catch (err) {
          console.error('Error checking ride count:', err);
        }
      };
      checkRideCount();
    }
  }, [user]);

  const handleModeSwitch = (toAdvanced) => {
    setUseQuickMode(!toAdvanced);
    localStorage.setItem('tribos_route_mode', toAdvanced ? 'advanced' : 'quick');
  };

  // Map styles configuration
  const mapStyles = [
    { value: 'streets', label: 'Streets', url: 'mapbox://styles/mapbox/streets-v12' },
    { value: 'outdoors', label: 'Outdoors', url: 'mapbox://styles/mapbox/outdoors-v12' },
    { value: 'satellite', label: 'Satellite', url: 'mapbox://styles/mapbox/satellite-streets-v12' },
    { value: 'terrain', label: 'Terrain', url: 'mapbox://styles/mapbox/satellite-v9' },
  ];

  // Memoize the routes array to prevent infinite re-renders
  const routesArray = React.useMemo(() =>
    selectedRoute ? [selectedRoute] : [],
    [selectedRoute]
  );

  // Memoize the GeoJSON data to prevent re-creating it on every map move
  const routeGeoJSON = React.useMemo(() => {
    if (!selectedRoute?.coordinates || selectedRoute.coordinates.length === 0) {
      return null;
    }
    return buildLineString(selectedRoute.coordinates);
  }, [selectedRoute]); // Use selectedRoute instead of coordinates to avoid reference issues

  // Memoize colored route segments if interval cues exist
  const coloredRouteSegments = React.useMemo(() => {
    if (!selectedRoute?.coordinates || !selectedRoute?.intervalCues || selectedRoute.intervalCues.length === 0) {
      return null;
    }
    return createColoredRouteSegments(selectedRoute.coordinates, selectedRoute.intervalCues);
  }, [selectedRoute]);


  const handleRouteGenerated = (routes) => {
    // Handle both array of routes and single route
    const routeArray = Array.isArray(routes) ? routes : [routes];
    const validRoutes = routeArray.filter(r => r && r.coordinates && r.coordinates.length > 0);

    console.log('Routes generated:', validRoutes.length, 'valid routes');

    setGeneratedRoutes(validRoutes);

    // Auto-select the first valid route
    if (validRoutes.length > 0) {
      console.log('Selected route:', validRoutes[0].name, 'with', validRoutes[0].coordinates.length, 'points');
      setSelectedRoute(validRoutes[0]);

      // Fit map to show the route
      if (mapRef.current && validRoutes[0].coordinates.length > 0) {
        setTimeout(() => {
          const bounds = calculateBounds(validRoutes[0].coordinates);
          mapRef.current.fitBounds(bounds, {
            padding: { top: 50, bottom: 50, left: 50, right: isMobile ? 50 : 350 },
            duration: 1000
          });
        }, 100);
      }
    }
  };

  const handleRouteSelect = (route) => {
    setSelectedRoute(route);

    // Fit map to show the selected route
    if (mapRef.current && route.coordinates && route.coordinates.length > 0) {
      const bounds = calculateBounds(route.coordinates);
      mapRef.current.fitBounds(bounds, {
        padding: { top: 50, bottom: 50, left: 50, right: isMobile ? 50 : 350 },
        duration: 1000
      });
    }
  };

  const handleStartLocationSet = (location) => {
    setStartLocation(location);
  };

  // Manual fit to bounds - called by button click
  const fitRouteInView = () => {
    if (selectedRoute?.coordinates && selectedRoute.coordinates.length > 0 && mapRef.current) {
      const bounds = calculateBounds(selectedRoute.coordinates);
      mapRef.current.fitBounds(bounds, {
        padding: { top: 50, bottom: 50, left: 50, right: 350 },
        duration: 1000
      });
    }
  };

  // Calculate bounds for a set of coordinates
  const calculateBounds = (coordinates) => {
    let minLng = Infinity, maxLng = -Infinity;
    let minLat = Infinity, maxLat = -Infinity;

    coordinates.forEach(([lng, lat]) => {
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    });

    return [[minLng, minLat], [maxLng, maxLat]];
  };

  return (
    <>
      {/* Breadcrumb Navigation */}
      <Container size="xl" pt="md">
        <BreadcrumbNav
          items={[
            { label: 'Dashboard', path: '/' },
            { label: 'Planning & Routes', path: '#' },
            { label: 'Smart Route Planner' }
          ]}
        />
      </Container>

      <div style={{
        display: 'flex',
        height: 'calc(100vh - 70px)',
        overflow: 'hidden',
        flexDirection: isMobile ? 'column' : 'row',
        margin: isMobile ? '-0.5rem' : '-1rem',
        marginTop: isMobile ? '-0.5rem' : '-1rem'
      }}>
        {/* AI Route Generator Panel */}
        <div style={{
          width: isMobile ? '100%' : '400px',
          height: isMobile ? '40vh' : '100%',
          overflowY: 'auto',
          borderRight: isMobile ? 'none' : '1px solid #475569'
        }}>
          {useQuickMode ? (
            <QuickRouteGenerator
              mapRef={mapRef}
              onRouteGenerated={handleRouteGenerated}
              onStartLocationSet={handleStartLocationSet}
              onShowAdvanced={() => handleModeSwitch(true)}
            />
          ) : (
            <AIRouteGenerator
              mapRef={mapRef}
              onRouteGenerated={handleRouteGenerated}
              onStartLocationSet={handleStartLocationSet}
              externalStartLocation={startLocation}
              onShowQuick={() => handleModeSwitch(false)}
            />
          )}

          {/* Route Options - Show when multiple routes are available */}
          {generatedRoutes.length > 1 && (
            <Paper p="md" radius="md" withBorder mt="md" mx="md">
              <Group gap="xs" mb="sm">
                <Route size={18} />
                <Text fw={600} size="sm">Route Options</Text>
                <Badge size="sm" variant="light">{generatedRoutes.length} routes</Badge>
              </Group>
              <Stack gap="xs">
                {generatedRoutes.map((route, index) => (
                  <UnstyledButton
                    key={index}
                    onClick={() => handleRouteSelect(route)}
                    style={{
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: selectedRoute === route ? '2px solid #228be6' : '1px solid #475569',
                      backgroundColor: selectedRoute === route ? 'rgba(34, 139, 230, 0.1)' : 'transparent',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <Group justify="space-between" wrap="nowrap">
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <Text size="sm" fw={500} truncate>
                          {route.name || `Route ${index + 1}`}
                        </Text>
                        <Group gap="xs" mt={4}>
                          <Group gap={3}>
                            <MapPin size={12} style={{ color: '#868e96' }} />
                            <Text size="xs" c="dimmed">{route.distance?.toFixed(1) || '?'} km</Text>
                          </Group>
                          <Group gap={3}>
                            <Mountain size={12} style={{ color: '#868e96' }} />
                            <Text size="xs" c="dimmed">{Math.round(route.elevationGain || 0)}m</Text>
                          </Group>
                        </Group>
                      </div>
                      {selectedRoute === route && (
                        <Check size={16} style={{ color: '#228be6' }} />
                      )}
                    </Group>
                  </UnstyledButton>
                ))}
              </Stack>
            </Paper>
          )}

          <Divider my="md" />

        {/* Route Actions - Save and Export */}
        <AIRouteActions
          route={selectedRoute}
          onSaved={(savedRoute) => {
            console.log('Route saved:', savedRoute);
            // Could optionally refresh route list or show success message
          }}
        />
      </div>

      {/* Map and Route Profile Container */}
      <div style={{
        flex: 1,
        height: isMobile ? '60vh' : '100%',
        position: 'relative',
        overflow: 'hidden'
      }}>
          {/* Fit to Route button */}
          {selectedRoute && selectedRoute.coordinates && selectedRoute.coordinates.length > 0 && (
            <Button
              onClick={fitRouteInView}
              leftSection={<Maximize2 size={16} />}
              variant="filled"
              size="xs"
              style={{
                position: 'absolute',
                top: 10,
                left: 10,
                zIndex: 1,
                boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
              }}
            >
              Fit to Route
            </Button>
          )}

          <Map
            ref={mapRef}
            {...viewState}
            onMove={evt => setViewState(evt.viewState)}
            mapboxAccessToken={process.env.REACT_APP_MAPBOX_TOKEN}
            style={{ width: '100%', height: '100%' }}
            mapStyle={mapStyles.find(s => s.value === mapStyle)?.url || 'mapbox://styles/mapbox/outdoors-v12'}
            interactiveLayerIds={[]}
          >
          <NavigationControl position="top-right" />

          {/* Basemap Style Selector */}
          <Menu position="bottom-end">
            <Menu.Target>
              <ActionIcon
                variant="default"
                size="lg"
                style={{
                  position: 'absolute',
                  top: 10,
                  right: 50,
                  backgroundColor: '#475569',
                  color: '#E8E8E8',
                  boxShadow: '0 0 0 2px rgba(0,0,0,.3)'
                }}
              >
                <Layers size={18} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Label>Map Style</Menu.Label>
              {mapStyles.map(style => (
                <Menu.Item
                  key={style.value}
                  onClick={() => setMapStyle(style.value)}
                  leftSection={mapStyle === style.value && <Check size={14} />}
                >
                  {style.label}
                </Menu.Item>
              ))}
            </Menu.Dropdown>
          </Menu>

          {/* Display generated route - use consistent Source ID to prevent errors */}
          {(coloredRouteSegments || routeGeoJSON) && (
            <Source
              key={selectedRoute?.name || 'route'}
              id="ai-generated-route"
              type="geojson"
              data={coloredRouteSegments || routeGeoJSON}
            >
              <Layer
                id="ai-route-line"
                type="line"
                paint={{
                  'line-color': coloredRouteSegments ? ['get', 'color'] : '#228be6',
                  'line-width': coloredRouteSegments ? 5 : 4,
                  'line-opacity': coloredRouteSegments ? 0.85 : 0.8
                }}
              />
            </Source>
          )}
          
          {/* Display start location marker - draggable */}
          {startLocation && Array.isArray(startLocation) &&
           !isNaN(startLocation[0]) && !isNaN(startLocation[1]) && (
            <Marker
              longitude={startLocation[0]}
              latitude={startLocation[1]}
              anchor="center"
              draggable={true}
              onDragEnd={(e) => {
                const newLocation = [e.lngLat.lng, e.lngLat.lat];
                handleStartLocationSet(newLocation);
              }}
            >
              <div style={{
                width: 20,
                height: 20,
                borderRadius: '50%',
                backgroundColor: '#228be6',
                border: '3px solid white',
                boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
                cursor: 'grab'
              }} />
            </Marker>
          )}
          
          {/* Display route start/end markers if route exists */}
          {selectedRoute && selectedRoute.coordinates && selectedRoute.coordinates.length > 0 && (
            <>
              {/* Start marker */}
              <Marker
                longitude={selectedRoute.coordinates[0][0]}
                latitude={selectedRoute.coordinates[0][1]}
                anchor="center"
              >
                <div style={{
                  width: 16,
                  height: 16,
                  borderRadius: '50%',
                  backgroundColor: '#40c057',
                  border: '2px solid white',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.3)'
                }} />
              </Marker>
              
              {/* End marker (if different from start) */}
              {selectedRoute.coordinates.length > 1 && (
                <Marker
                  longitude={selectedRoute.coordinates[selectedRoute.coordinates.length - 1][0]}
                  latitude={selectedRoute.coordinates[selectedRoute.coordinates.length - 1][1]}
                  anchor="center"
                >
                  <div style={{
                    width: 16,
                    height: 16,
                    borderRadius: '50%',
                    backgroundColor: '#fa5252',
                    border: '2px solid white',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.3)'
                  }} />
                </Marker>
              )}
            </>
          )}
          </Map>

          {/* Floating Route Profile Card */}
          {selectedRoute && (
            <div style={{
              position: 'absolute',
              bottom: 16,
              right: 16,
              zIndex: 10,
              maxWidth: isMobile ? '90%' : '400px',
              width: isMobile ? '90%' : 'auto'
            }}>
              <RouteProfile
                route={selectedRoute}
                selectedRouteIndex={0}
                routes={routesArray}
                floatingStyle={{
                  backgroundColor: 'rgba(71, 85, 105, 0.95)',
                  backdropFilter: 'blur(10px)',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                  border: '1px solid rgba(50, 205, 50, 0.3)'
                }}
              />
            </div>
          )}
      </div>
      </div>
    </>
  );
};

export default AIRouteMap;