import { useState, useEffect, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Container,
  Title,
  Text,
  Card,
  SimpleGrid,
  Stack,
  Group,
  Box,
  Badge,
  Button,
  Loader,
  Menu,
  ActionIcon,
  Skeleton,
  TextInput,
  SegmentedControl,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { tokens } from '../theme';
import AppShell from '../components/AppShell.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';
import { listRoutes, deleteRoute, getRoute } from '../utils/routesService';
import { formatDistance, formatElevation } from '../utils/units';
import { supabase } from '../lib/supabase';
import { exportAndDownloadRoute } from '../utils/routeExport';
import { garminService } from '../utils/garminService';
import { trackFeature, EventType } from '../utils/activityTracking';
import PageHeader from '../components/PageHeader.jsx';
import { Brain, CloudArrowUp, DotsThreeVertical, DownloadSimple, MagnifyingGlass, MapTrifold, Path, PencilSimple, Plus, Trash, Watch, X } from '@phosphor-icons/react';
import BuilderPromptBar from '../components/ride/BuilderPromptBar.jsx';
import MatchedRouteCard from '../components/ride/MatchedRouteCard.jsx';

function MyRoutes() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [routes, setRoutes] = useState([]);
  const [deletingId, setDeletingId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all'); // 'all', 'ai', 'manual'
  const [garminConnected, setGarminConnected] = useState(false);
  const [sendingToGarmin, setSendingToGarmin] = useState(null); // Track which route is being sent
  const [unitsPreference, setUnitsPreference] = useState('imperial');
  const [rideArea, setRideArea] = useState('your area');
  const [medianDistanceKm, setMedianDistanceKm] = useState(null);
  const [viewMode, setViewMode] = useState('workouts'); // 'workouts' | 'all'
  const [todayWorkout, setTodayWorkout] = useState(null);
  const [matchedRoutes, setMatchedRoutes] = useState([]);
  const [matchesLoading, setMatchesLoading] = useState(false);

  // Unit formatting helpers
  const isImperial = unitsPreference === 'imperial';
  const formatDist = (km) => formatDistance(km, isImperial);
  const formatElev = (m) => formatElevation(m, isImperial);

  // Filter routes based on search and filter type
  const filteredRoutes = routes.filter(route => {
    // Text search filter
    const matchesSearch = searchQuery.trim() === '' ||
      route.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      route.training_goal?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      route.surface_type?.toLowerCase().includes(searchQuery.toLowerCase());

    // Type filter
    const matchesType = filterType === 'all' ||
      (filterType === 'ai' && route.generated_by === 'ai') ||
      (filterType === 'manual' && route.generated_by !== 'ai');

    return matchesSearch && matchesType;
  });

  // Load user's units preference
  useEffect(() => {
    const loadUnitsPreference = async () => {
      if (!user) return;
      try {
        const { data } = await supabase
          .from('user_profiles')
          .select('units_preference')
          .eq('id', user.id)
          .single();
        if (data?.units_preference) {
          setUnitsPreference(data.units_preference);
        }
      } catch (err) {
        console.error('Failed to load units preference:', err);
      }
    };
    loadUnitsPreference();
  }, [user]);

  // Load routes on mount
  useEffect(() => {
    const loadRoutes = async () => {
      if (!user) return;

      try {
        const data = await listRoutes();
        setRoutes(data);
      } catch (error) {
        console.error('Error loading routes:', error);
        notifications.show({
          title: 'Error',
          message: 'Failed to load routes',
          color: 'red'
        });
      } finally {
        setLoading(false);
      }
    };

    loadRoutes();
  }, [user]);

  // Check Garmin connection status
  useEffect(() => {
    const checkGarmin = async () => {
      try {
        const status = await garminService.getConnectionStatus();
        setGarminConnected(status.connected);
      } catch (error) {
        console.error('Error checking Garmin status:', error);
        setGarminConnected(false);
      }
    };
    checkGarmin();
  }, []);

  // Fetch ride data for personalized empty state
  useEffect(() => {
    const loadRideContext = async () => {
      if (!user) return;
      try {
        const { data: recentActivities } = await supabase
          .from('activities')
          .select('raw_data, distance')
          .eq('user_id', user.id)
          .order('start_date', { ascending: false })
          .limit(20);

        if (!recentActivities?.length) return;

        // Extract most common city from raw_data
        const cities = recentActivities
          .map(a => a.raw_data?.location_city)
          .filter(Boolean);
        if (cities.length > 0) {
          const counts = {};
          for (const city of cities) {
            counts[city] = (counts[city] || 0) + 1;
          }
          const topCity = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
          setRideArea(topCity);
        }

        // Calculate median distance
        const distances = recentActivities
          .map(a => a.distance ? a.distance / 1000 : null)
          .filter(Boolean)
          .sort((a, b) => a - b);
        if (distances.length > 0) {
          const mid = Math.floor(distances.length / 2);
          const median = distances.length % 2 === 0
            ? (distances[mid - 1] + distances[mid]) / 2
            : distances[mid];
          setMedianDistanceKm(Math.round(median));
        }
      } catch (err) {
        console.error('Failed to load ride context:', err);
      }
    };
    loadRideContext();
  }, [user]);

  // Fetch today's planned workout
  useEffect(() => {
    const fetchTodayWorkout = async () => {
      if (!user) return;
      try {
        // Get active plan
        const { data: planData } = await supabase
          .from('training_plans')
          .select('id')
          .eq('user_id', user.id)
          .eq('status', 'active')
          .maybeSingle();

        if (!planData) return;

        const today = new Date().toISOString().split('T')[0];
        const { data: workoutData } = await supabase
          .from('planned_workouts')
          .select('*')
          .eq('plan_id', planData.id)
          .eq('scheduled_date', today)
          .maybeSingle();

        if (workoutData) {
          setTodayWorkout(workoutData);
        }
      } catch (err) {
        console.error('Error fetching today workout:', err);
      }
    };
    fetchTodayWorkout();
  }, [user]);

  // Fetch matched routes for today's workout
  useEffect(() => {
    if (!todayWorkout || !user?.id) return;
    let cancelled = false;

    async function fetchMatches() {
      setMatchesLoading(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) return;

        const workoutCategory = todayWorkout.workout_type || todayWorkout.category || 'endurance';
        const workoutId = todayWorkout.id || 'today';

        const res = await fetch('/api/route-analysis', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action: 'get_matches',
            workouts: [{
              id: workoutId,
              name: todayWorkout.title || todayWorkout.workout_type || 'Workout',
              category: workoutCategory,
              duration: todayWorkout.duration_minutes || 60,
            }],
          }),
        });

        if (cancelled) return;

        if (res.ok) {
          const data = await res.json();
          const matches = data.matches?.[workoutId] || [];
          setMatchedRoutes(matches);
        }
      } catch (err) {
        console.error('Error fetching route matches:', err);
      } finally {
        if (!cancelled) setMatchesLoading(false);
      }
    }

    fetchMatches();
    return () => { cancelled = true; };
  }, [todayWorkout, user?.id]);

  // Delete a route
  const handleDelete = async (routeId, routeName) => {
    if (!confirm(`Delete "${routeName}"? This cannot be undone.`)) {
      return;
    }

    setDeletingId(routeId);
    try {
      await deleteRoute(routeId);
      setRoutes(routes.filter(r => r.id !== routeId));
      notifications.show({
        title: 'Route Deleted',
        message: `"${routeName}" has been deleted`,
        color: 'green'
      });
    } catch (error) {
      console.error('Error deleting route:', error);
      notifications.show({
        title: 'Delete Failed',
        message: error.message || 'Failed to delete route',
        color: 'red'
      });
    } finally {
      setDeletingId(null);
    }
  };

  // Export route in specified format (gpx or tcx)
  const handleExportRoute = async (routeId, format) => {
    try {
      const route = await getRoute(routeId);
      if (!route?.geometry?.coordinates) {
        throw new Error('Route has no geometry');
      }

      exportAndDownloadRoute(
        {
          name: route.name,
          description: route.description,
          coordinates: route.geometry.coordinates,
          distanceKm: route.distance_km,
          elevationGainM: route.elevation_gain_m,
          elevationLossM: route.elevation_loss_m,
          routeType: route.route_type,
          surfaceType: route.surface_type,
        },
        format
      );

      notifications.show({
        title: 'Route Exported',
        message: `Your route has been exported as ${format.toUpperCase()}`,
        color: 'green',
      });
    } catch (error) {
      console.error('Error exporting route:', error);
      notifications.show({
        title: 'Export Failed',
        message: error.message || 'Failed to export route',
        color: 'red'
      });
    }
  };

  // Send route directly to Garmin Connect
  const handleSendToGarmin = async (routeId) => {
    setSendingToGarmin(routeId);
    let route;
    try {
      route = await getRoute(routeId);
      if (!route?.geometry?.coordinates) {
        throw new Error('Route has no geometry');
      }

      const result = await garminService.pushRoute({
        name: route.name,
        description: route.description,
        coordinates: route.geometry.coordinates,
        distanceKm: route.distance_km,
        elevationGainM: route.elevation_gain_m,
        elevationLossM: route.elevation_loss_m,
        routeType: route.route_type,
        surfaceType: route.surface_type,
      });

      if (result.success) {
        notifications.show({
          title: 'Sent to Garmin!',
          message: result.message || 'Route sent to Garmin Connect. Sync your device to download it.',
          color: 'green',
          autoClose: 5000,
        });
      } else {
        throw new Error(result.error || 'Failed to send route');
      }
    } catch (error) {
      console.error('Error sending to Garmin:', error);
      if (error.message?.includes('COURSES_API_NOT_AVAILABLE') || error.message?.includes('ApplicationNotFound')) {
        notifications.show({
          title: 'Direct send not available yet',
          message: 'Downloading as TCX instead. Import it at connect.garmin.com > Courses > Import.',
          color: 'yellow',
          autoClose: 8000,
        });
        try {
          exportAndDownloadRoute(
            {
              name: route.name,
              description: route.description,
              coordinates: route.geometry.coordinates,
              distanceKm: route.distance_km,
              elevationGainM: route.elevation_gain_m,
              elevationLossM: route.elevation_loss_m,
              routeType: route.route_type,
              surfaceType: route.surface_type,
            },
            'tcx'
          );
        } catch (exportErr) {
          console.error('TCX fallback export failed:', exportErr);
        }
      } else {
        notifications.show({
          title: 'Send Failed',
          message: error.message || 'Failed to send route to Garmin',
          color: 'red'
        });
      }
    } finally {
      setSendingToGarmin(null);
    }
  };

  // Format duration
  const formatDuration = (minutes) => {
    if (!minutes) return '--';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
  };

  // Format date
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  // Get training goal color
  const getGoalColor = (goal) => {
    switch (goal) {
      case 'recovery': return 'green';
      case 'endurance': return 'blue';
      case 'intervals': return 'orange';
      case 'hills': return 'red';
      default: return 'gray';
    }
  };

  // Get surface type icon
  const getSurfaceIcon = (surface) => {
    switch (surface) {
      case 'road': return '🚴';
      case 'gravel': return '🌲';
      case 'mountain': return '⛰️';
      case 'commuting': return '🏙️';
      default: return '🚴';
    }
  };

  if (loading) {
    return (
      <AppShell>
        <Container size="xl" py="xl">
          <Stack gap="xl">
            {/* Header skeleton */}
            <Group justify="space-between" align="flex-start">
              <Box>
                <Skeleton height={32} width={180} mb="xs" />
                <Skeleton height={16} width={100} />
              </Box>
              <Skeleton height={36} width={110} radius="md" />
            </Group>

            {/* Routes grid skeleton */}
            <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="lg">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Card key={i} padding="lg" style={{ backgroundColor: 'var(--color-bg-secondary)' }}>
                  <Stack gap="sm">
                    <Group justify="space-between">
                      <Box style={{ flex: 1 }}>
                        <Skeleton height={20} width="70%" mb={4} />
                        <Skeleton height={12} width="40%" />
                      </Box>
                      <Skeleton height={24} width={24} radius="sm" />
                    </Group>
                    <Group gap="md">
                      <Box>
                        <Skeleton height={10} width={50} mb={4} />
                        <Skeleton height={16} width={60} />
                      </Box>
                      <Box>
                        <Skeleton height={10} width={50} mb={4} />
                        <Skeleton height={16} width={50} />
                      </Box>
                      <Box>
                        <Skeleton height={10} width={40} mb={4} />
                        <Skeleton height={16} width={50} />
                      </Box>
                    </Group>
                    <Group gap="xs">
                      <Skeleton height={20} width={70} radius="xl" />
                      <Skeleton height={20} width={60} radius="xl" />
                    </Group>
                  </Stack>
                </Card>
              ))}
            </SimpleGrid>
          </Stack>
        </Container>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <Container size="xl" py="lg">
        <Stack gap={14}>
          {/* Header */}
          <PageHeader
            title="Ride"
            subtitle={viewMode === 'all'
              ? `${filteredRoutes.length} of ${routes.length} route${routes.length !== 1 ? 's' : ''}`
              : todayWorkout
                ? `Matched routes for today's ${todayWorkout.title || todayWorkout.workout_type || 'workout'}`
                : 'Route library'
            }
          />

          {/* Builder Prompt Bar */}
          <BuilderPromptBar
            todayWorkout={todayWorkout}
            medianDistanceKm={medianDistanceKm}
            formatDist={formatDist}
          />

          {/* View Toggle: WORKOUTS / ALL ROUTES */}
          <Group gap="sm">
            <Button
              variant={viewMode === 'workouts' ? 'filled' : 'subtle'}
              color={viewMode === 'workouts' ? 'dark' : 'gray'}
              size="sm"
              onClick={() => setViewMode('workouts')}
              style={{
                fontFamily: "'Barlow Condensed', sans-serif",
                fontWeight: 700,
                letterSpacing: '1.5px',
                textTransform: 'uppercase',
                fontSize: 12,
              }}
            >
              WORKOUTS
            </Button>
            <Button
              variant={viewMode === 'all' ? 'filled' : 'subtle'}
              color={viewMode === 'all' ? 'dark' : 'gray'}
              size="sm"
              onClick={() => setViewMode('all')}
              style={{
                fontFamily: "'Barlow Condensed', sans-serif",
                fontWeight: 700,
                letterSpacing: '1.5px',
                textTransform: 'uppercase',
                fontSize: 12,
              }}
            >
              ALL ROUTES
            </Button>
          </Group>

          {/* WORKOUTS view: matched routes for today's workout */}
          {viewMode === 'workouts' && (
            <>
              {matchesLoading ? (
                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                  {[1, 2, 3, 4].map((i) => (
                    <Box key={i} style={{ border: '1px solid var(--color-border)', padding: 16 }}>
                      <Skeleton height={16} width="60%" mb={10} />
                      <Skeleton height={12} width="40%" mb={8} />
                      <Skeleton height={12} width="50%" />
                    </Box>
                  ))}
                </SimpleGrid>
              ) : !todayWorkout ? (
                <Box
                  style={{
                    border: '1px solid var(--color-border)',
                    backgroundColor: 'var(--color-card)',
                    padding: 24,
                    textAlign: 'center',
                  }}
                >
                  <Text
                    style={{
                      fontFamily: "'Barlow Condensed', sans-serif",
                      fontSize: 13,
                      fontWeight: 700,
                      letterSpacing: '2px',
                      textTransform: 'uppercase',
                      color: 'var(--color-text-muted)',
                      marginBottom: 8,
                    }}
                  >
                    NO WORKOUT SCHEDULED
                  </Text>
                  <Text size="sm" style={{ color: 'var(--color-text-secondary)', marginBottom: 16 }}>
                    Set up a training plan to get route recommendations matched to your workouts.
                  </Text>
                  <Button
                    component={Link}
                    to="/train/planner?tab=browse"
                    variant="light"
                    color="teal"
                    size="sm"
                  >
                    Browse Plans
                  </Button>
                </Box>
              ) : matchedRoutes.length === 0 ? (
                <Box
                  style={{
                    border: '1px solid var(--color-border)',
                    backgroundColor: 'var(--color-card)',
                    padding: 24,
                    textAlign: 'center',
                  }}
                >
                  <Text
                    style={{
                      fontFamily: "'Barlow Condensed', sans-serif",
                      fontSize: 13,
                      fontWeight: 700,
                      letterSpacing: '2px',
                      textTransform: 'uppercase',
                      color: 'var(--color-text-muted)',
                      marginBottom: 8,
                    }}
                  >
                    NO MATCHED ROUTES YET
                  </Text>
                  <Text size="sm" style={{ color: 'var(--color-text-secondary)', marginBottom: 16 }}>
                    Analyze your past rides to find routes that match today&apos;s {todayWorkout.title || todayWorkout.workout_type || 'workout'}.
                  </Text>
                  <Button
                    component={Link}
                    to="/train?tab=routes"
                    variant="light"
                    color="teal"
                    size="sm"
                  >
                    Analyze Routes
                  </Button>
                </Box>
              ) : (
                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                  {matchedRoutes.map((match, index) => (
                    <MatchedRouteCard
                      key={match.activity?.id || index}
                      match={match}
                      formatDist={formatDist}
                      formatElev={formatElev}
                    />
                  ))}
                  {/* Build new route card */}
                  <Box
                    style={{
                      border: '1.5px dashed var(--color-border)',
                      padding: 16,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      minHeight: 100,
                    }}
                    onClick={() => navigate('/ride/new')}
                  >
                    <Stack align="center" gap={6}>
                      <Plus size={20} color="var(--color-text-muted)" />
                      <Text
                        style={{
                          fontFamily: "'Barlow Condensed', sans-serif",
                          fontSize: 12,
                          fontWeight: 700,
                          letterSpacing: '1.5px',
                          textTransform: 'uppercase',
                          color: 'var(--color-text-muted)',
                        }}
                      >
                        BUILD NEW ROUTE
                      </Text>
                    </Stack>
                  </Box>
                </SimpleGrid>
              )}
            </>

          )}

          {/* ALL ROUTES view: existing route library */}
          {viewMode === 'all' && (
            <>
              {/* Search and Filter */}
              {routes.length > 0 && (
                <Group gap="md" wrap="wrap">
                  <TextInput
                    placeholder="Search routes..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    leftSection={<MagnifyingGlass size={16} />}
                    rightSection={searchQuery && (
                      <ActionIcon
                        variant="subtle"
                        size="sm"
                        onClick={() => setSearchQuery('')}
                      >
                        <X size={14} />
                      </ActionIcon>
                    )}
                    style={{ flex: 1, minWidth: 200, maxWidth: 400 }}
                  />
                  <SegmentedControl
                    value={filterType}
                    onChange={setFilterType}
                    size="sm"
                    data={[
                      { label: 'All', value: 'all' },
                      { label: 'AI Generated', value: 'ai' },
                      { label: 'Manual', value: 'manual' }
                    ]}
                    styles={{
                      root: { backgroundColor: 'var(--color-bg-secondary)' }
                    }}
                  />
                </Group>
              )}

              {/* Routes Grid */}
              {routes.length === 0 ? (
            <Card p="2rem">
              <Stack align="center" gap="xl" py="xl">
                <Path size={48} color="var(--color-teal, #2A8C82)"  />
                <Stack align="center" gap="xs">
                  <Title order={3} style={{ color: 'var(--color-text-primary)' }}>
                    {rideArea !== 'your area'
                      ? `Your ride history shows you like ${rideArea}.`
                      : 'Plan your next ride'}
                  </Title>
                  <Text style={{ color: 'var(--color-text-secondary)', textAlign: 'center' }} maw={{ base: '100%', sm: 420 }}>
                    {rideArea !== 'your area'
                      ? "Let's put that to work."
                      : 'Start from scratch, let AI suggest something, or trace one of your past rides.'}
                  </Text>
                </Stack>
                <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm" w="100%" maw={600}>
                  <Button
                    variant="light"
                    color="teal"
                    size="md"
                    leftSection={<Path size={18} />}
                    onClick={() => {
                      trackFeature(EventType.ROUTE_CREATE_FROM_EMPTY_STATE, 'empty_state_past_ride');
                      navigate('/routes/new?mode=activity');
                    }}
                    styles={{ root: { height: 'auto', padding: '12px 16px' } }}
                  >
                    <Stack gap={2} align="flex-start">
                      <Text size="sm" fw={600}>Build from a past ride</Text>
                      <Text size="xs" c="dimmed">Retrace your steps</Text>
                    </Stack>
                  </Button>
                  <Button
                    variant="light"
                    color="teal"
                    size="md"
                    leftSection={<Brain size={18} />}
                    onClick={() => {
                      trackFeature(EventType.ROUTE_CREATE_FROM_EMPTY_STATE, 'empty_state_ai_route');
                      const params = new URLSearchParams({ mode: 'ai' });
                      if (medianDistanceKm) params.set('distance', String(medianDistanceKm));
                      navigate(`/routes/new?${params.toString()}`);
                    }}
                    styles={{ root: { height: 'auto', padding: '12px 16px' } }}
                  >
                    <Stack gap={2} align="flex-start">
                      <Text size="sm" fw={600}>Get an AI-suggested route</Text>
                      <Text size="xs" c="dimmed">
                        {medianDistanceKm
                          ? `Based on your typical ${formatDist(medianDistanceKm)} rides`
                          : 'Based on your location'}
                      </Text>
                    </Stack>
                  </Button>
                  <Button
                    variant="light"
                    color="gray"
                    size="md"
                    leftSection={<MapTrifold size={18} />}
                    onClick={() => {
                      trackFeature(EventType.ROUTE_CREATE_FROM_EMPTY_STATE, 'empty_state_scratch');
                      navigate('/routes/new');
                    }}
                    styles={{ root: { height: 'auto', padding: '12px 16px' } }}
                  >
                    <Stack gap={2} align="flex-start">
                      <Text size="sm" fw={600}>Start from scratch</Text>
                      <Text size="xs" c="dimmed">Draw on the map</Text>
                    </Stack>
                  </Button>
                </SimpleGrid>
              </Stack>
            </Card>
          ) : filteredRoutes.length === 0 ? (
            <Card>
              <Stack align="center" gap="md" py="xl">
                <Text size="3rem">🔍</Text>
                <Title order={3} style={{ color: 'var(--color-text-primary)' }}>
                  No routes found
                </Title>
                <Text style={{ color: 'var(--color-text-secondary)', textAlign: 'center' }} maw={{ base: '100%', sm: 400 }}>
                  No routes match your search. Try adjusting your filters or search terms.
                </Text>
                <Button
                  variant="light"
                  color="teal"
                  onClick={() => { setSearchQuery(''); setFilterType('all'); }}
                >
                  Clear Filters
                </Button>
              </Stack>
            </Card>
          ) : (
            <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="lg">
              {filteredRoutes.map((route) => (
                <Card
                  key={route.id}
                  padding="lg"
                  style={{
                    backgroundColor: 'var(--color-bg-secondary)',
                    cursor: 'pointer',
                    transition: 'transform 0.2s, box-shadow 0.2s',
                  }}
                  onClick={() => navigate(`/routes/${route.id}`)}
                  className="tribos-route-card"
                >
                  <Stack gap="sm">
                    {/* Header with menu */}
                    <Group justify="space-between" align="flex-start">
                      <Box style={{ flex: 1 }}>
                        <Group gap="xs" mb={4}>
                          <Text size="lg">{getSurfaceIcon(route.surface_type)}</Text>
                          <Text
                            fw={600}
                            style={{
                              color: 'var(--color-text-primary)',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap'
                            }}
                          >
                            {route.name}
                          </Text>
                        </Group>
                        <Text size="xs" style={{ color: 'var(--color-text-muted)' }}>
                          {formatDate(route.updated_at || route.created_at)}
                        </Text>
                      </Box>
                      <Menu position="bottom-end" withinPortal>
                        <Menu.Target>
                          <ActionIcon
                            variant="subtle"
                            color="gray"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <DotsThreeVertical size={16} />
                          </ActionIcon>
                        </Menu.Target>
                        <Menu.Dropdown>
                          <Menu.Item
                            leftSection={<PencilSimple size={14} />}
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/routes/${route.id}`);
                            }}
                          >
                            Edit
                          </Menu.Item>
                          <Menu.Divider />
                          {garminConnected && (
                            <Menu.Item
                              leftSection={sendingToGarmin === route.id ? <Loader size={14} /> : <CloudArrowUp size={14} />}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSendToGarmin(route.id);
                              }}
                              disabled={sendingToGarmin === route.id}
                              color="blue"
                            >
                              {sendingToGarmin === route.id ? 'Sending...' : 'Send to Garmin'}
                            </Menu.Item>
                          )}
                          <Menu.Label>Download Files</Menu.Label>
                          <Menu.Item
                            leftSection={<Watch size={14} />}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleExportRoute(route.id, 'tcx');
                            }}
                          >
                            TCX Course
                          </Menu.Item>
                          <Menu.Item
                            leftSection={<Path size={14} />}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleExportRoute(route.id, 'gpx');
                            }}
                          >
                            GPX Track
                          </Menu.Item>
                          <Menu.Divider />
                          <Menu.Item
                            color="red"
                            leftSection={deletingId === route.id ? <Loader size={14} /> : <Trash size={14} />}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(route.id, route.name);
                            }}
                            disabled={deletingId === route.id}
                          >
                            Delete
                          </Menu.Item>
                        </Menu.Dropdown>
                      </Menu>
                    </Group>

                    {/* Stats */}
                    <Group gap="md">
                      <Box>
                        <Text size="xs" style={{ color: 'var(--color-text-muted)' }}>
                          Distance
                        </Text>
                        <Text fw={600} style={{ color: 'var(--color-teal)' }}>
                          {route.distance_km ? formatDist(route.distance_km) : '--'}
                        </Text>
                      </Box>
                      <Box>
                        <Text size="xs" style={{ color: 'var(--color-text-muted)' }}>
                          Elevation
                        </Text>
                        <Text fw={600} style={{ color: 'var(--color-text-primary)' }}>
                          {route.elevation_gain_m ? formatElev(route.elevation_gain_m) : '--'}
                        </Text>
                      </Box>
                      <Box>
                        <Text size="xs" style={{ color: 'var(--color-text-muted)' }}>
                          Time
                        </Text>
                        <Text fw={600} style={{ color: 'var(--color-text-primary)' }}>
                          {formatDuration(route.estimated_duration_minutes)}
                        </Text>
                      </Box>
                    </Group>

                    {/* Tags */}
                    <Group gap="xs">
                      {route.training_goal && (
                        <Badge size="sm" color={getGoalColor(route.training_goal)} variant="light">
                          {route.training_goal}
                        </Badge>
                      )}
                      {route.route_type && (
                        <Badge size="sm" variant="outline" color="gray">
                          {route.route_type.replace('_', ' ')}
                        </Badge>
                      )}
                      {route.generated_by === 'ai' && (
                        <Badge size="sm" variant="light" color="violet">
                          AI Generated
                        </Badge>
                      )}
                    </Group>
                  </Stack>
                </Card>
              ))}
            </SimpleGrid>
          )}
            </>
          )}
        </Stack>
      </Container>
    </AppShell>
  );
}

export default MyRoutes;
