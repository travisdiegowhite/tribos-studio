import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Drawer,
  Stack,
  Group,
  Box,
  Text,
  TextInput,
  SegmentedControl,
  ActionIcon,
  Button,
  Menu,
  Loader,
  Badge,
  Skeleton,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconSearch,
  IconX,
  IconDotsVertical,
  IconTrash,
  IconEdit,
  IconRoute,
  IconDeviceWatch,
  IconCloudUpload,
  IconFolderOpen,
} from '@tabler/icons-react';
import { useAuth } from '../contexts/AuthContext.jsx';
import { listRoutes, deleteRoute, getRoute } from '../utils/routesService';
import { formatDistance, formatElevation } from '../utils/units';
import { supabase } from '../lib/supabase';
import { exportAndDownloadRoute } from '../utils/routeExport';
import { garminService } from '../utils/garminService';

function SavedRoutesDrawer({ opened, onClose, onRouteSelect }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [routes, setRoutes] = useState([]);
  const [deletingId, setDeletingId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [garminConnected, setGarminConnected] = useState(false);
  const [sendingToGarmin, setSendingToGarmin] = useState(null);
  const [unitsPreference, setUnitsPreference] = useState('imperial');

  const isImperial = unitsPreference === 'imperial';
  const formatDist = (km) => formatDistance(km, isImperial);
  const formatElev = (m) => formatElevation(m, isImperial);

  const filteredRoutes = routes.filter(route => {
    const matchesSearch = searchQuery.trim() === '' ||
      route.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      route.training_goal?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      route.surface_type?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = filterType === 'all' ||
      (filterType === 'ai' && route.generated_by === 'ai') ||
      (filterType === 'manual' && route.generated_by !== 'ai');
    return matchesSearch && matchesType;
  });

  // Load routes when drawer opens
  useEffect(() => {
    if (!opened || !user) return;

    const loadRoutes = async () => {
      setLoading(true);
      try {
        const data = await listRoutes();
        setRoutes(data);
      } catch (error) {
        console.error('Error loading routes:', error);
        notifications.show({
          title: 'Error',
          message: 'Failed to load routes',
          color: 'red',
        });
      } finally {
        setLoading(false);
      }
    };

    loadRoutes();
  }, [opened, user]);

  // Load units preference
  useEffect(() => {
    if (!user) return;
    const loadUnits = async () => {
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
    loadUnits();
  }, [user]);

  // Check Garmin connection
  useEffect(() => {
    const checkGarmin = async () => {
      try {
        const status = await garminService.getConnectionStatus();
        setGarminConnected(status.connected);
      } catch (error) {
        setGarminConnected(false);
      }
    };
    checkGarmin();
  }, []);

  const handleRouteClick = useCallback((routeId) => {
    onClose();
    if (onRouteSelect) {
      onRouteSelect(routeId);
    } else {
      navigate(`/routes/${routeId}`);
    }
  }, [onClose, onRouteSelect, navigate]);

  const handleDelete = useCallback(async (routeId, routeName) => {
    if (!confirm(`Delete "${routeName}"? This cannot be undone.`)) return;

    setDeletingId(routeId);
    try {
      await deleteRoute(routeId);
      setRoutes(prev => prev.filter(r => r.id !== routeId));
      notifications.show({
        title: 'Route Deleted',
        message: `"${routeName}" has been deleted`,
        color: 'green',
      });
    } catch (error) {
      notifications.show({
        title: 'Delete Failed',
        message: error.message || 'Failed to delete route',
        color: 'red',
      });
    } finally {
      setDeletingId(null);
    }
  }, []);

  const handleExportRoute = useCallback(async (routeId, format) => {
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
        message: `Exported as ${format.toUpperCase()}`,
        color: 'green',
      });
    } catch (error) {
      notifications.show({
        title: 'Export Failed',
        message: error.message || 'Failed to export route',
        color: 'red',
      });
    }
  }, []);

  const handleSendToGarmin = useCallback(async (routeId) => {
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
          message: result.message || 'Route sent to Garmin Connect.',
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
        if (route?.geometry?.coordinates) {
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
        }
      } else {
        notifications.show({
          title: 'Send Failed',
          message: error.message || 'Failed to send route to Garmin',
          color: 'red',
        });
      }
    } finally {
      setSendingToGarmin(null);
    }
  }, []);

  const formatDuration = (minutes) => {
    if (!minutes) return '--';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const getGoalColor = (goal) => {
    switch (goal) {
      case 'recovery': return 'green';
      case 'endurance': return 'blue';
      case 'intervals': return 'orange';
      case 'hills': return 'red';
      default: return 'gray';
    }
  };

  const getSurfaceIcon = (surface) => {
    switch (surface) {
      case 'road': return '🚴';
      case 'gravel': return '🌲';
      case 'mountain': return '⛰️';
      case 'commuting': return '🏙️';
      default: return '🚴';
    }
  };

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      title={
        <Group gap="xs">
          <IconFolderOpen size={20} style={{ color: 'var(--tribos-terracotta-500)' }} />
          <Text fw={600}>My Routes</Text>
          {!loading && (
            <Badge size="sm" variant="light" color="gray">
              {routes.length}
            </Badge>
          )}
        </Group>
      }
      position="right"
      size="md"
      styles={{
        body: { padding: 0 },
        header: {
          backgroundColor: 'var(--tribos-bg-secondary)',
          borderBottom: '1px solid var(--tribos-bg-tertiary)',
        },
        content: { backgroundColor: 'var(--tribos-bg-secondary)' },
      }}
    >
      <Stack gap={0}>
        {/* Search and Filter */}
        <Box px="md" py="sm" style={{ borderBottom: '1px solid var(--tribos-bg-tertiary)' }}>
          <TextInput
            placeholder="Search routes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            leftSection={<IconSearch size={14} />}
            rightSection={searchQuery && (
              <ActionIcon variant="subtle" size="xs" onClick={() => setSearchQuery('')}>
                <IconX size={12} />
              </ActionIcon>
            )}
            size="sm"
            mb="xs"
          />
          <SegmentedControl
            value={filterType}
            onChange={setFilterType}
            size="xs"
            fullWidth
            data={[
              { label: 'All', value: 'all' },
              { label: 'AI', value: 'ai' },
              { label: 'Manual', value: 'manual' },
            ]}
            styles={{
              root: { backgroundColor: 'var(--tribos-bg-tertiary)' },
            }}
          />
        </Box>

        {/* Routes List */}
        <Box px="md" py="sm" style={{ overflowY: 'auto', maxHeight: 'calc(100vh - 180px)' }}>
          {loading ? (
            <Stack gap="sm">
              {[1, 2, 3, 4].map((i) => (
                <Box key={i} p="sm" style={{ backgroundColor: 'var(--tribos-bg-tertiary)', borderRadius: 8 }}>
                  <Skeleton height={16} width="60%" mb={8} />
                  <Skeleton height={12} width="40%" mb={8} />
                  <Group gap="sm">
                    <Skeleton height={12} width={50} />
                    <Skeleton height={12} width={50} />
                  </Group>
                </Box>
              ))}
            </Stack>
          ) : routes.length === 0 ? (
            <Stack align="center" gap="md" py="xl">
              <Text size="2rem">🗺️</Text>
              <Text size="sm" style={{ color: 'var(--tribos-text-secondary)', textAlign: 'center' }}>
                No saved routes yet. Create your first route!
              </Text>
            </Stack>
          ) : filteredRoutes.length === 0 ? (
            <Stack align="center" gap="md" py="lg">
              <Text size="sm" style={{ color: 'var(--tribos-text-secondary)', textAlign: 'center' }}>
                No routes match your search.
              </Text>
              <Button
                variant="light"
                color="terracotta"
                size="xs"
                onClick={() => { setSearchQuery(''); setFilterType('all'); }}
              >
                Clear Filters
              </Button>
            </Stack>
          ) : (
            <Stack gap="xs">
              {filteredRoutes.map((route) => (
                <Box
                  key={route.id}
                  p="sm"
                  style={{
                    backgroundColor: 'var(--tribos-bg-tertiary)',
                    borderRadius: 8,
                    cursor: 'pointer',
                    transition: 'background-color 0.15s ease',
                  }}
                  onClick={() => handleRouteClick(route.id)}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--tribos-bg-tertiary-hover, rgba(255,255,255,0.08))';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--tribos-bg-tertiary)';
                  }}
                >
                  <Group justify="space-between" align="flex-start" wrap="nowrap">
                    <Box style={{ flex: 1, minWidth: 0 }}>
                      <Group gap={6} mb={4}>
                        <Text size="sm">{getSurfaceIcon(route.surface_type)}</Text>
                        <Text
                          size="sm"
                          fw={600}
                          style={{
                            color: 'var(--tribos-text-primary)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {route.name}
                        </Text>
                      </Group>
                      <Text size="xs" style={{ color: 'var(--tribos-text-muted)' }} mb={6}>
                        {formatDate(route.updated_at || route.created_at)}
                      </Text>

                      {/* Stats row */}
                      <Group gap="md">
                        <Text size="xs" fw={500} style={{ color: 'var(--tribos-terracotta-500)' }}>
                          {route.distance_km ? formatDist(route.distance_km) : '--'}
                        </Text>
                        <Text size="xs" style={{ color: 'var(--tribos-text-secondary)' }}>
                          {route.elevation_gain_m ? formatElev(route.elevation_gain_m) : '--'}
                        </Text>
                        <Text size="xs" style={{ color: 'var(--tribos-text-secondary)' }}>
                          {formatDuration(route.estimated_duration_minutes)}
                        </Text>
                      </Group>

                      {/* Tags */}
                      <Group gap={4} mt={6}>
                        {route.training_goal && (
                          <Badge size="xs" color={getGoalColor(route.training_goal)} variant="light">
                            {route.training_goal}
                          </Badge>
                        )}
                        {route.generated_by === 'ai' && (
                          <Badge size="xs" variant="light" color="violet">AI</Badge>
                        )}
                      </Group>
                    </Box>

                    {/* Action Menu */}
                    <Menu position="bottom-end" withinPortal>
                      <Menu.Target>
                        <ActionIcon
                          variant="subtle"
                          color="gray"
                          size="sm"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <IconDotsVertical size={14} />
                        </ActionIcon>
                      </Menu.Target>
                      <Menu.Dropdown>
                        <Menu.Item
                          leftSection={<IconEdit size={14} />}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRouteClick(route.id);
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
                        <Menu.Label>Download</Menu.Label>
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
                </Box>
              ))}
            </Stack>
          )}
        </Box>
      </Stack>
    </Drawer>
  );
}

export default SavedRoutesDrawer;
