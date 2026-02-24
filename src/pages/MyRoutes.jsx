import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { IconPlus, IconDotsVertical, IconTrash, IconEdit, IconDownload, IconSearch, IconX, IconDeviceWatch, IconRoute, IconCloudUpload, IconBrain, IconMap } from '@tabler/icons-react';
import { tokens } from '../theme';
import AppShell from '../components/AppShell.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';
import { listRoutes, deleteRoute, getRoute } from '../utils/routesService';
import { formatDistance, formatElevation } from '../utils/units';
import { supabase } from '../lib/supabase';
import { exportAndDownloadRoute } from '../utils/routeExport';
import { garminService } from '../utils/garminService';
import PageHeader from '../components/PageHeader.jsx';

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
        setGarminConnected(status.connected && !status.requiresReconnect);
      } catch (error) {
        console.error('Error checking Garmin status:', error);
        setGarminConnected(false);
      }
    };
    checkGarmin();
  }, []);

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
    try {
      const route = await getRoute(routeId);
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
      notifications.show({
        title: 'Send Failed',
        message: error.message || 'Failed to send route to Garmin',
        color: 'red'
      });
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
                <Card key={i} padding="lg" style={{ backgroundColor: 'var(--tribos-bg-secondary)' }}>
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
        <Stack gap="xl">
          {/* Header */}
          <PageHeader
            title="My Routes"
            subtitle={`${filteredRoutes.length} of ${routes.length} route${routes.length !== 1 ? 's' : ''}`}
            actions={
              <Button
                color="terracotta"
                leftSection={<IconPlus size={18} />}
                onClick={() => navigate('/routes/new')}
              >
                New Route
              </Button>
            }
          />

          {/* Search and Filter */}
          {routes.length > 0 && (
            <Group gap="md" wrap="wrap">
              <TextInput
                placeholder="Search routes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                leftSection={<IconSearch size={16} />}
                rightSection={searchQuery && (
                  <ActionIcon
                    variant="subtle"
                    size="sm"
                    onClick={() => setSearchQuery('')}
                  >
                    <IconX size={14} />
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
                  root: { backgroundColor: 'var(--tribos-bg-tertiary)' }
                }}
              />
            </Group>
          )}

          {/* Routes Grid */}
          {routes.length === 0 ? (
            <Card>
              <Stack align="center" gap="lg" py="xl">
                <Text size="4rem">🗺️</Text>
                <Title order={3} style={{ color: 'var(--tribos-text-primary)' }}>
                  No routes yet
                </Title>
                <Text style={{ color: 'var(--tribos-text-secondary)', textAlign: 'center' }} maw={{ base: '100%', sm: 400 }}>
                  Plan your next ride with the route builder. Start from scratch, let AI suggest something, or trace one of your past rides.
                </Text>
                <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm" w="100%" maw={600}>
                  <Button
                    variant="light"
                    color="sage"
                    size="md"
                    leftSection={<IconBrain size={18} />}
                    onClick={() => navigate('/routes/new?mode=ai')}
                    styles={{ root: { height: 'auto', padding: '12px 16px' } }}
                  >
                    <Stack gap={2} align="flex-start">
                      <Text size="sm" fw={600}>AI-suggested route</Text>
                      <Text size="xs" c="dimmed">Based on your location</Text>
                    </Stack>
                  </Button>
                  <Button
                    variant="light"
                    color="terracotta"
                    size="md"
                    leftSection={<IconRoute size={18} />}
                    onClick={() => navigate('/routes/new?mode=activity')}
                    styles={{ root: { height: 'auto', padding: '12px 16px' } }}
                  >
                    <Stack gap={2} align="flex-start">
                      <Text size="sm" fw={600}>From a past ride</Text>
                      <Text size="xs" c="dimmed">Retrace your steps</Text>
                    </Stack>
                  </Button>
                  <Button
                    variant="light"
                    color="gray"
                    size="md"
                    leftSection={<IconMap size={18} />}
                    onClick={() => navigate('/routes/new')}
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
                <Title order={3} style={{ color: 'var(--tribos-text-primary)' }}>
                  No routes found
                </Title>
                <Text style={{ color: 'var(--tribos-text-secondary)', textAlign: 'center' }} maw={{ base: '100%', sm: 400 }}>
                  No routes match your search. Try adjusting your filters or search terms.
                </Text>
                <Button
                  variant="light"
                  color="terracotta"
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
                    backgroundColor: 'var(--tribos-bg-secondary)',
                    cursor: 'pointer',
                    transition: 'transform 0.2s, box-shadow 0.2s',
                  }}
                  onClick={() => navigate(`/routes/${route.id}`)}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
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
                              color: 'var(--tribos-text-primary)',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap'
                            }}
                          >
                            {route.name}
                          </Text>
                        </Group>
                        <Text size="xs" style={{ color: 'var(--tribos-text-muted)' }}>
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
                            <IconDotsVertical size={16} />
                          </ActionIcon>
                        </Menu.Target>
                        <Menu.Dropdown>
                          <Menu.Item
                            leftSection={<IconEdit size={14} />}
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
                              leftSection={sendingToGarmin === route.id ? <Loader size={14} /> : <IconCloudUpload size={14} />}
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
                            leftSection={<IconDeviceWatch size={14} />}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleExportRoute(route.id, 'tcx');
                            }}
                          >
                            TCX Course
                          </Menu.Item>
                          <Menu.Item
                            leftSection={<IconRoute size={14} />}
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
                            leftSection={deletingId === route.id ? <Loader size={14} /> : <IconTrash size={14} />}
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
                        <Text size="xs" style={{ color: 'var(--tribos-text-muted)' }}>
                          Distance
                        </Text>
                        <Text fw={600} style={{ color: 'var(--tribos-terracotta-500)' }}>
                          {route.distance_km ? formatDist(route.distance_km) : '--'}
                        </Text>
                      </Box>
                      <Box>
                        <Text size="xs" style={{ color: 'var(--tribos-text-muted)' }}>
                          Elevation
                        </Text>
                        <Text fw={600} style={{ color: 'var(--tribos-text-primary)' }}>
                          {route.elevation_gain_m ? formatElev(route.elevation_gain_m) : '--'}
                        </Text>
                      </Box>
                      <Box>
                        <Text size="xs" style={{ color: 'var(--tribos-text-muted)' }}>
                          Time
                        </Text>
                        <Text fw={600} style={{ color: 'var(--tribos-text-primary)' }}>
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
        </Stack>
      </Container>
    </AppShell>
  );
}

export default MyRoutes;
