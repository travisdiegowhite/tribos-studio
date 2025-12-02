import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Map, Source, Layer, Marker, Popup, NavigationControl } from 'react-map-gl';
import {
  Paper,
  Title,
  Button,
  ScrollArea,
  Card,
  Text,
  Group,
  Badge,
  Stack,
  Loader,
  Center,
  ActionIcon,
  Container,
  Grid,
  SimpleGrid,
} from '@mantine/core';
import { Route, Plus, MapPin, Square, Home, TrendingUp, Brain } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useUnits } from '../utils/units';
import { supabase } from '../supabase';
import { getDisplayName } from '../services/userProfile';
import 'mapbox-gl/dist/mapbox-gl.css';
import './Map.css';
import ProfessionalRouteBuilder from './ProfessionalRouteBuilder';
import RouteProfile from './RouteProfile';
import ElevationProfileBar from './ElevationProfileBar';
import UpcomingWorkoutCard from './UpcomingWorkoutCard';
import WeekAtAGlanceCard from './WeekAtAGlanceCard';
import PersonalRecordsCard from './PersonalRecordsCard';
import NewUserDashboard from './NewUserDashboard';
import { DashboardSkeleton, RouteListSkeleton } from './LoadingSkeletons';

const MapComponent = () => {
  const { user } = useAuth();
  const { formatDistance, formatElevation } = useUnits();
  const [routes, setRoutes] = useState([]);
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [displayName, setDisplayName] = useState(null);
  const [viewState, setViewState] = useState({
    longitude: -104.9903,  // Denver, Colorado
    latitude: 39.7392,     // Denver, Colorado
    zoom: 13,
    pitch: 0,
    bearing: 0,
    padding: { top: 0, bottom: 0, left: 0, right: 0 }
  });
  const [popupInfo, setPopupInfo] = useState(null);
  const [builderActive, setBuilderActive] = useState(false);
  const mapRef = useRef(null);
  const [refreshFlag, setRefreshFlag] = useState(0); // used to refetch after save
  const [selectedRouteData, setSelectedRouteData] = useState(null); // Full route data for profile
  // Removed routeBuilderMapElements and routeBuilderData - no longer needed
  const routeBuilderRef = useRef(null); // Reference to route builder for map clicks

  // Dashboard stats
  const [recentActivityStats, setRecentActivityStats] = useState({
    ridesLast7Days: 0,
    totalDistanceLast7Days: 0,
    totalElevationLast7Days: 0
  });
  const [totalRideCount, setTotalRideCount] = useState(null); // null = loading, number = loaded

  // Fetch user's display name for personalized greeting
  useEffect(() => {
    const fetchDisplayName = async () => {
      if (user?.id) {
        const name = await getDisplayName(user.id);
        setDisplayName(name);
      }
    };
    fetchDisplayName();
  }, [user]);

  // Center map at user current location if available and no stored routes yet
  useEffect(() => {
    if (!('geolocation' in navigator)) return;
    if (routes.length > 0) return; // don't override if user already has routes
    navigator.geolocation.getCurrentPosition(
      pos => {
        const { longitude, latitude } = pos.coords;
        setViewState(s => ({ ...s, longitude, latitude, zoom: 13 }));
        if (mapRef.current) {
          mapRef.current.flyTo({ center: [longitude, latitude], zoom: 13, essential: true });
        }
      },
      err => console.warn('Geolocation denied or failed', err),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }, [routes]);

  // Fetch past rides from Supabase
  useEffect(() => {
    const fetchRoutes = async () => {
      try {
        // First, fetch the routes metadata (only actual ridden routes)
        const { data, error } = await supabase
          .from('routes')
          .select('*')
          .eq('user_id', user.id)
          .not('recorded_at', 'is', null)  // Only routes that have been ridden
          .order('recorded_at', { ascending: false })
          .limit(10);

        if (error) throw error;

        // Then fetch ALL track points for each route in batches
        const processedRoutes = await Promise.all(
          (data || []).map(async (route) => {
            let allTrackPoints = [];
            let from = 0;
            const batchSize = 1000; // Supabase limit
            let hasMore = true;

            // Fetch track points in batches of 1000 to get all points
            while (hasMore) {
              const { data: batch, error: batchError } = await supabase
                .from('track_points')
                .select('latitude, longitude, elevation, time_seconds, distance_m, point_index')
                .eq('route_id', route.id)
                .order('point_index', { ascending: true })
                .range(from, from + batchSize - 1);

              if (batchError) {
                console.error('Error loading track points batch:', batchError);
                break;
              }

              if (batch && batch.length > 0) {
                allTrackPoints = [...allTrackPoints, ...batch];
                from += batchSize;

                // If we got less than batchSize, we've reached the end
                if (batch.length < batchSize) {
                  hasMore = false;
                }
              } else {
                hasMore = false;
              }
            }

            // Convert to expected format
            return {
              ...route,
              track_points: allTrackPoints.map(point => ({
                longitude: point.longitude,
                latitude: point.latitude,
                elevation: point.elevation,
                time: point.time_seconds,
                distance: point.distance_m
              }))
            };
          })
        );

        setRoutes(processedRoutes);

        // If routes exist, center map on the first route
        if (processedRoutes.length > 0 && processedRoutes[0].track_points?.length > 0) {
          const firstPoint = processedRoutes[0].track_points[0];
          setViewState(state => ({
            ...state,
            longitude: firstPoint.longitude,
            latitude: firstPoint.latitude,
            zoom: 13
          }));
        }
      } catch (error) {
        console.error('Error fetching routes:', error);
      } finally {
        setIsLoading(false);
      }
    };

    if (user) {
      fetchRoutes();
    }
  }, [user, refreshFlag]);


  // Calculate stats for last 7 days and total ride count
  useEffect(() => {
    const loadStats = async () => {
      try {
        // Fetch total ride count first (for new user detection)
        const { count: totalCount, error: countError } = await supabase
          .from('routes')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .not('recorded_at', 'is', null);

        if (countError) {
          console.error('Error fetching total ride count:', countError);
          setTotalRideCount(0);
        } else {
          setTotalRideCount(totalCount || 0);
        }

        // Calculate date 7 days ago
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const sevenDaysAgoISO = sevenDaysAgo.toISOString();

        // Fetch routes from last 7 days
        const { data: recentRoutes, error } = await supabase
          .from('routes')
          .select('distance_km, elevation_gain_m, recorded_at')
          .eq('user_id', user.id)
          .gte('recorded_at', sevenDaysAgoISO)
          .not('recorded_at', 'is', null);

        if (error) throw error;

        // Calculate totals from last 7 days
        const completedRides = recentRoutes?.length || 0;
        const totalDistance = recentRoutes?.reduce((sum, r) => sum + (r.distance_km || 0), 0) || 0;
        const totalElevation = recentRoutes?.reduce((sum, r) => sum + (r.elevation_gain_m || 0), 0) || 0;

        setRecentActivityStats({
          ridesLast7Days: completedRides,
          totalDistanceLast7Days: totalDistance,
          totalElevationLast7Days: totalElevation
        });
      } catch (error) {
        console.error('Error loading stats:', error);
        setTotalRideCount(0);
      }
    };

    if (user) {
      loadStats();
    }
  }, [user]);

  // Get route color based on index
  const getRouteColor = (index) => {
    const colors = ['#ff4444', '#44ff44', '#4444ff', '#ffff44', '#ff44ff', '#44ffff'];
    return colors[index % colors.length];
  };

  // Handle map clicks for route builder
  const handleMapClick = useCallback((e) => {
    if (builderActive && routeBuilderRef.current && routeBuilderRef.current.addPoint) {
      routeBuilderRef.current.addPoint(e.lngLat);
    }
  }, [builderActive]);

  // Show loading skeleton while we determine if user is new
  if (totalRideCount === null) {
    return <DashboardSkeleton />;
  }

  // Show streamlined dashboard for new users (fewer than 5 rides)
  const isNewUser = totalRideCount < 5;

  if (isNewUser) {
    return <NewUserDashboard displayName={displayName} rideCount={totalRideCount} />;
  }

  return (
    <>
      {/* Dashboard Cards Section */}
      <Container size="xl" mb="xl">
        <Title order={1} mb="lg" style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          color: '#F5F5F5'
        }}>
          <Home size={32} color="#32CD32" />
          {displayName ? `Welcome back, ${displayName}!` : 'Dashboard'}
        </Title>

        {/* Top Row - Recent Activity Stats (Last 7 Days) */}
        <Grid mb="lg">
          <Grid.Col span={{ base: 12, sm: 6, md: 4 }}>
            <Card withBorder shadow="sm" p="md" style={{ backgroundColor: '#475569' }}>
              <Text size="xs" c="#D5E1EE" mb={4}>Rides (7 Days)</Text>
              <Text size="lg" fw={700} c="#32CD32">{recentActivityStats.ridesLast7Days}</Text>
            </Card>
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6, md: 4 }}>
            <Card withBorder shadow="sm" p="md" style={{ backgroundColor: '#475569' }}>
              <Text size="xs" c="#D5E1EE" mb={4}>Distance (7 Days)</Text>
              <Text size="lg" fw={700} c="#32CD32">
                {formatDistance(recentActivityStats.totalDistanceLast7Days)}
              </Text>
            </Card>
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6, md: 4 }}>
            <Card withBorder shadow="sm" p="md" style={{ backgroundColor: '#475569' }}>
              <Text size="xs" c="#D5E1EE" mb={4}>Elevation (7 Days)</Text>
              <Text size="lg" fw={700} c="#32CD32">
                {formatElevation(recentActivityStats.totalElevationLast7Days)}
              </Text>
            </Card>
          </Grid.Col>
        </Grid>

        {/* Main Dashboard Cards */}
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="lg" mb="xl">
          {/* Upcoming Workout Card */}
          <UpcomingWorkoutCard />

          {/* Week at a Glance Card */}
          <WeekAtAGlanceCard />

          {/* Personal Records Card */}
          <PersonalRecordsCard />
        </SimpleGrid>
      </Container>

      {/* Map Section */}
      <div className="map-container">
        {/* Full Route Builder Overlay */}
        {builderActive && (
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1000 }}>
            <ProfessionalRouteBuilder
              ref={routeBuilderRef}
              active={builderActive}
              onExit={() => setBuilderActive(false)}
              onSaved={(newRoute) => {
                setBuilderActive(false);
                setRefreshFlag(f => f + 1);
                if (newRoute?.id) setSelectedRoute(newRoute.id);
              }}
              inline={false}
            />
          </div>
        )}
        <Paper className="routes-sidebar" shadow="sm" p="md">
        <Stack gap="md">
          <Group justify="space-between" align="center">
            <Title order={3} size="h4">
              <Group gap="xs">
                <Route size={20} />
                Your Routes
              </Group>
            </Title>
          </Group>

          <Button
            variant={builderActive ? 'filled' : 'light'}
            leftSection={builderActive ? <Square size={16} /> : <Plus size={16} />}
            onClick={() => setBuilderActive(a => !a)}
            fullWidth
          >
            {builderActive ? 'Finish Building' : 'Build New Route'}
          </Button>

          {/* Route Builder in inline mode */}

          <Title order={4} size="h5" mb="sm">
            Past Rides ({routes.length})
          </Title>
          <ScrollArea style={{ height: builderActive ? 'calc(100vh - 650px)' : 'calc(100vh - 350px)' }}>
            {isLoading ? (
              <RouteListSkeleton count={5} />
            ) : routes.length === 0 ? (
              <Center py="xl">
                <Text c="gray.7" size="sm" ta="center">
                  No past rides found. Import from Strava or upload GPX files!
                </Text>
              </Center>
            ) : (
              <Stack gap="xs" mt="sm">
                {routes.map((route, index) => (
                  <Card
                    key={route.id}
                    padding="sm"
                    shadow="xs"
                    style={{
                      cursor: 'pointer',
                      borderLeft: `4px solid ${getRouteColor(index)}`,
                      backgroundColor: selectedRoute === route.id ? 'var(--mantine-color-blue-0)' : undefined,
                    }}
                    onClick={() => {
                      setSelectedRoute(route.id);
                      // Convert route data to expected format for RouteProfile
                      const convertedRoute = {
                        ...route,
                        distance: route.distance_km, // km
                        elevationGain: route.elevation_gain_m,
                        elevationLoss: route.elevation_loss_m,
                        elevationProfile: route.elevation_profile || [],
                        metadata: {
                          name: route.activity_name || route.name || 'Ride'
                        },
                        summary: {
                          distance: route.distance_km * 1000, // meters
                          elevation_gain: route.elevation_gain_m,
                          elevation_loss: route.elevation_loss_m,
                          snapped: false
                        }
                      };
                      setSelectedRouteData(convertedRoute);
                      if (route.track_points?.length > 0) {
                        setViewState({
                          ...viewState,
                          longitude: route.track_points[0].longitude,
                          latitude: route.track_points[0].latitude,
                          zoom: 13
                        });
                      }
                    }}
                  >
                    <Stack gap="xs">
                      <Group justify="space-between" align="flex-start">
                        <div>
                          <Text fw={500} size="sm" c="dark">
                            {route.activity_name || route.name || `Ride ${index + 1}`}
                          </Text>
                          {route.recorded_at && (
                            <Text size="xs" c="dimmed">
                              {new Date(route.recorded_at).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric'
                              })}
                            </Text>
                          )}
                        </div>
                        <ActionIcon size="xs" variant="subtle">
                          <MapPin size={12} />
                        </ActionIcon>
                      </Group>

                      <Group gap="xs">
                        <Badge size="xs" variant="light">
                          {formatDistance(route.distance_km || 0)}
                        </Badge>
                        {route.elevation_gain_m > 0 && (
                          <Badge size="xs" color="green" variant="light">
                            +{formatElevation(route.elevation_gain_m)}
                          </Badge>
                        )}
                        {route.imported_from && route.imported_from !== 'manual' && (
                          <Badge size="xs" color="orange" variant="light">
                            {route.imported_from}
                          </Badge>
                        )}
                      </Group>
                    </Stack>
                  </Card>
                ))}
              </Stack>
            )}
          </ScrollArea>
        </Stack>
      </Paper>

      <div className="map-view">
        <Map
          ref={mapRef}
          initialViewState={viewState}
          onMove={evt => setViewState(evt.viewState)}
          onClick={handleMapClick}
          style={{ width: '100%', height: '100%' }}
          mapStyle="mapbox://styles/mapbox/streets-v11"
          mapboxAccessToken={process.env.REACT_APP_MAPBOX_TOKEN}
          attributionControl={true}
          reuseMaps
          className="map-inner"
        >
        <NavigationControl position="top-right" />
        
        
        {/* Route builder map elements are now handled by the overlay component */}
        
          {/* Render past rides */}
          {routes.map((route, index) => {
            if (!route.track_points?.length) return null;

            const geojson = {
              type: 'Feature',
              properties: {},
              geometry: {
                type: 'LineString',
                coordinates: route.track_points.map(point => [point.longitude, point.latitude])
              }
            };

            return (
              <Source key={route.id} type="geojson" data={geojson}>
                <Layer
                  type="line"
                  paint={{
                    'line-color': getRouteColor(index),
                    'line-width': selectedRoute === route.id ? 6 : 3,
                    'line-opacity': selectedRoute === route.id ? 1 : 0.7
                  }}
                />
              </Source>
            );
          })}

          {selectedRoute && (() => {
            // Find selected route from past rides
            const route = routes.find(r => r.id === selectedRoute);

            if (!route) return null;

            // Get track points
            const trackPoints = route.track_points || [];

            if (trackPoints.length === 0) return null;

            return (
              <>
                {[
                  { point: trackPoints[0], label: 'Start' },
                  { point: trackPoints[trackPoints.length - 1], label: 'End' }
                ].map((marker, i) => (
                  <Marker
                    key={i}
                    longitude={marker.point.longitude}
                    latitude={marker.point.latitude}
                    onClick={e => {
                      e.originalEvent.stopPropagation();
                      setPopupInfo(marker);
                    }}
                  />
                ))}
              </>
            );
          })()}

          {popupInfo && (
            <Popup
              longitude={popupInfo.point.longitude}
              latitude={popupInfo.point.latitude}
              anchor="bottom"
              onClose={() => setPopupInfo(null)}
            >
              {popupInfo.label}
            </Popup>
          )}
        </Map>
      </div>
      
      {selectedRouteData && (
        <RouteProfile
          route={selectedRouteData}
          elevationProfile={selectedRouteData.elevation_profile}
          elevationStats={{
            gain: selectedRouteData.summary?.elevation_gain,
            loss: selectedRouteData.summary?.elevation_loss,
            min: selectedRouteData.summary?.elevation_min,
            max: selectedRouteData.summary?.elevation_max
          }}
          onClose={() => {
            setSelectedRouteData(null);
            setSelectedRoute(null);
          }}
        />
      )}

      {/* Elevation Profile Bar - shows for route builder or selected route */}
      {selectedRouteData && (
        <ElevationProfileBar
          elevationProfile={
   
            selectedRouteData?.elevation_profile || 
            []
          }
          elevationStats={
   
            {
              gain: selectedRouteData?.summary?.elevation_gain,
              loss: selectedRouteData?.summary?.elevation_loss,
              min: selectedRouteData?.summary?.elevation_min,
              max: selectedRouteData?.summary?.elevation_max
            }
          }
          routeStats={
   
            {
              distance: selectedRouteData?.summary?.distance,
              confidence: selectedRouteData?.summary?.confidence,
              duration: selectedRouteData?.summary?.duration
            }
          }
          isRouteBuilder={false}
        />
      )}
      </div>
    </>
  );
};

export default MapComponent;
