import { useState, useEffect, useCallback } from 'react';
import {
  Container,
  Card,
  Text,
  Badge,
  Group,
  Stack,
  Title,
  TextInput,
  Select,
  Button,
  ActionIcon,
  Tooltip,
  SegmentedControl,
  SimpleGrid,
  Paper,
  Loader,
  Center,
  Avatar,
  Menu,
  Modal,
  Box,
  Progress,
  Divider,
} from '@mantine/core';
import BreadcrumbNav from './BreadcrumbNav';
import EmptyState from './EmptyState';
import {
  Search,
  Filter,
  MapPin,
  TrendingUp,
  Clock,
  Mountain,
  Activity,
  Eye,
  Edit,
  Trash2,
  Share2,
  Download,
  MoreVertical,
  Route as RouteIcon,
  Bike,
  SortDesc,
  RefreshCw,
  Check,
  AlertCircle,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../supabase';
import { useUnits } from '../utils/units';
import { notifications } from '@mantine/notifications';
import RouteMap from './RouteMap';
import SendToGarminButton from './SendToGarminButton';

/**
 * ViewRoutes Component
 * Comprehensive view for browsing and managing saved routes and completed rides
 */
const ViewRoutes = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { formatDistance, formatElevation, formatSpeed } = useUnits();

  // State
  const [loading, setLoading] = useState(true);
  const [routes, setRoutes] = useState([]);
  const [filteredRoutes, setFilteredRoutes] = useState([]);
  const [viewMode, setViewMode] = useState('all'); // all, planned, completed
  const [viewType, setViewType] = useState('grid'); // grid, list
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('date-desc');
  const [filterType, setFilterType] = useState('all');
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [routeToDelete, setRouteToDelete] = useState(null);
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [routeToView, setRouteToView] = useState(null);
  const [viewRouteDetails, setViewRouteDetails] = useState(null);

  // Pagination state
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const ROUTES_PER_PAGE = 50;

  // Overall stats (separate from displayed routes)
  const [overallStats, setOverallStats] = useState({
    totalRoutes: 0,
    completedRides: 0,
    totalDistance: 0,
    totalElevation: 0
  });

  // Load overall stats without loading all route data
  const loadOverallStats = useCallback(async () => {
    try {
      // Supabase has a default limit of 1000 rows, so we need to fetch all data in batches
      let allRoutes = [];
      let from = 0;
      const batchSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data: batch, error } = await supabase
          .from('routes')
          .select('distance_km, elevation_gain_m, recorded_at')
          .eq('user_id', user.id)
          .range(from, from + batchSize - 1);

        if (error) throw error;

        if (batch && batch.length > 0) {
          allRoutes = [...allRoutes, ...batch];
          from += batchSize;

          // If we got less than batchSize, we've reached the end
          if (batch.length < batchSize) {
            hasMore = false;
          }
        } else {
          hasMore = false;
        }
      }

      console.log(`📊 Loaded stats for ${allRoutes.length} total routes`);

      const totalRoutes = allRoutes.length;
      const completedRides = allRoutes.filter(r => r.recorded_at).length;
      const totalDistance = allRoutes.reduce((sum, r) => sum + (r.distance_km || 0), 0);
      const totalElevation = allRoutes.reduce((sum, r) => sum + (r.elevation_gain_m || 0), 0);

      setOverallStats({
        totalRoutes,
        completedRides,
        totalDistance,
        totalElevation
      });
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  }, [user.id]);

  const loadRoutes = useCallback(async (reset = false) => {
    try {
      if (reset) {
        setLoading(true);
        setRoutes([]);
        setHasMore(true);
      } else {
        setLoadingMore(true);
      }

      // Calculate date for 3-4 weeks ago
      const fourWeeksAgo = new Date();
      fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);

      const startIndex = reset ? 0 : routes.length;

      // Load only essential fields, not all data
      // Order by recorded_at (for rides) and created_at (for planned routes) in database
      // This ensures consistent ordering across pagination
      const { data, error, count } = await supabase
        .from('routes')
        .select('id, user_id, name, description, route_type, strava_id, imported_from, device_model, distance_km, duration_seconds, elevation_gain_m, average_speed, recorded_at, created_at, has_gps_data, track_points_count, has_power_data, training_stress_score, average_heartrate', { count: 'exact' })
        .eq('user_id', user.id)
        .order('recorded_at', { ascending: false, nullsLast: true })
        .order('created_at', { ascending: false })
        .range(startIndex, startIndex + ROUTES_PER_PAGE - 1);

      if (error) throw error;

      const newRoutes = reset ? (data || []) : [...routes, ...(data || [])];
      setRoutes(newRoutes);

      // Check if there are more routes to load
      setHasMore(data && data.length === ROUTES_PER_PAGE);

    } catch (error) {
      console.error('Error loading routes:', error);
      notifications.show({
        title: 'Error',
        message: 'Failed to load routes',
        color: 'red',
      });
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [user, routes, ROUTES_PER_PAGE]);

  const applyFilters = useCallback(() => {
    let filtered = [...routes];

    // View mode filter (planned routes vs completed rides)
    if (viewMode === 'planned') {
      // Planned routes are those without a recorded_at date
      filtered = filtered.filter(r => !r.recorded_at);
    } else if (viewMode === 'completed') {
      // Completed rides have a recorded_at date
      filtered = filtered.filter(r => r.recorded_at);
    }

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(r =>
        r.name?.toLowerCase().includes(query) ||
        r.description?.toLowerCase().includes(query)
      );
    }

    // Type filter
    if (filterType !== 'all') {
      filtered = filtered.filter(r => r.route_type === filterType);
    }

    // Sort
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'date-desc':
          // For completed rides, use recorded_at; for planned routes, use created_at
          // Show completed rides first, then planned routes
          if (a.recorded_at && !b.recorded_at) return -1; // a is completed, b is planned -> a comes first
          if (!a.recorded_at && b.recorded_at) return 1;  // a is planned, b is completed -> b comes first
          if (a.recorded_at && b.recorded_at) {
            // Both completed - sort by recorded_at descending
            return new Date(b.recorded_at) - new Date(a.recorded_at);
          }
          // Both planned - sort by created_at descending
          return new Date(b.created_at) - new Date(a.created_at);
        case 'date-asc':
          // Same logic but reversed order
          if (a.recorded_at && !b.recorded_at) return -1;
          if (!a.recorded_at && b.recorded_at) return 1;
          if (a.recorded_at && b.recorded_at) {
            return new Date(a.recorded_at) - new Date(b.recorded_at);
          }
          return new Date(a.created_at) - new Date(b.created_at);
        case 'distance-desc':
          return (b.distance_km || 0) - (a.distance_km || 0);
        case 'distance-asc':
          return (a.distance_km || 0) - (b.distance_km || 0);
        case 'elevation-desc':
          return (b.elevation_gain_m || 0) - (a.elevation_gain_m || 0);
        case 'elevation-asc':
          return (a.elevation_gain_m || 0) - (b.elevation_gain_m || 0);
        case 'name-asc':
          return (a.name || '').localeCompare(b.name || '');
        case 'name-desc':
          return (b.name || '').localeCompare(a.name || '');
        default:
          return 0;
      }
    });

    setFilteredRoutes(filtered);
  }, [routes, viewMode, searchQuery, sortBy, filterType]);

  // Load routes and stats on mount
  useEffect(() => {
    if (user?.id) {
      loadOverallStats();
      loadRoutes(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Apply filters when data or filters change
  useEffect(() => {
    applyFilters();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routes, viewMode, searchQuery, sortBy, filterType]);

  const handleViewRoute = async (route) => {
    try {
      // First, fetch route details (without track_points to avoid 1000 limit)
      const { data: routeData, error: routeError } = await supabase
        .from('routes')
        .select('*')
        .eq('id', route.id)
        .single();

      if (routeError) throw routeError;

      // Then fetch ALL track points in batches (Supabase max is 1000 per request)
      // We use range() to paginate through all points
      let allTrackPoints = [];
      let from = 0;
      const batchSize = 1000; // Supabase limit is 1000 rows per request
      let hasMore = true;

      console.log(`📍 Loading track points for ${route.name || 'route'}...`);

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
          console.log(`  ✓ Loaded batch ${Math.floor(from / batchSize) + 1}: ${batch.length} points (total: ${allTrackPoints.length})`);
          from += batchSize;

          // If we got less than batchSize, we've reached the end
          if (batch.length < batchSize) {
            hasMore = false;
          }
        } else {
          hasMore = false;
        }
      }

      // Process track points to format expected by RouteMap
      const trackPoints = allTrackPoints.map(point => ({
        lat: point.latitude,
        lng: point.longitude,
        elevation: point.elevation,
      }));

      console.log(`📍 Loaded ${trackPoints.length} track points for route ${route.name}`);

      setRouteToView(route);
      setViewRouteDetails({ ...routeData, trackPoints });
      setViewModalOpen(true);
    } catch (error) {
      console.error('Error loading route details:', error);
      notifications.show({
        title: 'Error',
        message: 'Failed to load route details',
        color: 'red',
      });
    }
  };

  const handleDeleteRoute = async () => {
    if (!routeToDelete) return;

    try {
      const { error } = await supabase
        .from('routes')
        .delete()
        .eq('id', routeToDelete.id);

      if (error) throw error;

      notifications.show({
        title: 'Success',
        message: 'Route deleted successfully',
        color: 'green',
      });

      setRoutes(routes.filter(r => r.id !== routeToDelete.id));
      setDeleteModalOpen(false);
      setRouteToDelete(null);

      // Refresh overall stats after deletion
      loadOverallStats();
    } catch (error) {
      console.error('Error deleting route:', error);
      notifications.show({
        title: 'Error',
        message: 'Failed to delete route',
        color: 'red',
      });
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatDuration = (seconds) => {
    if (!seconds) return '-';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  // Format number with commas (e.g., 1234 -> 1,234)
  const formatNumber = (num) => {
    if (num == null) return '0';
    return Math.round(num).toLocaleString('en-US');
  };

  // Helper function to handle speed values that may be in m/s instead of km/h
  const normalizeSpeed = (speed) => {
    if (!speed) return null;
    // If speed is less than 15, it's likely in m/s (typical cycling speed is 15-40 km/h)
    // Convert m/s to km/h by multiplying by 3.6
    if (speed < 15) {
      return speed * 3.6;
    }
    return speed;
  };

  const estimateTSS = (route) => {
    const elevation = route.elevation_gain_m || 0;
    const duration = route.duration_seconds || 3600;

    const baseTSS = (duration / 3600) * 50;
    const elevationFactor = (elevation / 300) * 10;
    return Math.round(baseTSS + elevationFactor);
  };

  const getRouteTypeColor = (type) => {
    switch (type) {
      case 'loop': return 'green';
      case 'out_back': return 'blue';
      case 'point_to_point': return 'violet';
      default: return 'gray';
    }
  };

  const getSourceBadge = (route) => {
    if (route.strava_id) return { label: 'Strava', color: 'orange' };
    if (route.imported_from === 'garmin') {
      // Garmin brand compliance: Display "Garmin [device model]" or fallback to "Garmin"
      const deviceLabel = route.device_model ? `Garmin ${route.device_model}` : 'Garmin';
      return { label: deviceLabel, color: 'cyan' };
    }
    if (route.imported_from === 'file_upload') return { label: 'Uploaded', color: 'blue' };
    return { label: 'Manual', color: 'gray' };
  };

  const isPlannedRoute = (route) => {
    return !route.recorded_at;
  };

  const RouteCard = ({ route }) => {
    const sourceBadge = getSourceBadge(route);
    const isPlanned = isPlannedRoute(route);
    const displayDate = route.recorded_at || route.created_at;

    return (
      <Card withBorder shadow="sm" p="md" radius="md" style={{ height: '100%', cursor: 'pointer' }}>
        <Stack gap="sm">
          {/* Header */}
          <Group justify="space-between" wrap="nowrap">
            <Group gap="xs">
              <Avatar color={isPlanned ? 'blue' : 'green'} radius="sm">
                {isPlanned ? <RouteIcon size={20} /> : <Bike size={20} />}
              </Avatar>
              <div style={{ flex: 1, minWidth: 0 }}>
                <Text fw={600} size="sm" truncate>
                  {route.name || 'Untitled Route'}
                </Text>
                <Text size="xs" c="dimmed">
                  {formatDate(displayDate)}
                </Text>
              </div>
            </Group>
            <Menu position="bottom-end" withinPortal>
              <Menu.Target>
                <ActionIcon variant="subtle" color="gray">
                  <MoreVertical size={16} />
                </ActionIcon>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item
                  leftSection={<Eye size={14} />}
                  onClick={() => handleViewRoute(route)}
                >
                  View Details
                </Menu.Item>
                <Menu.Item
                  leftSection={<Edit size={14} />}
                  onClick={() => navigate(`/studio?routeId=${route.id}`)}
                >
                  Edit Route
                </Menu.Item>
                <Menu.Item leftSection={<Share2 size={14} />}>
                  Share
                </Menu.Item>
                <Menu.Item leftSection={<Download size={14} />}>
                  Download GPX
                </Menu.Item>
                <Menu.Divider />
                <Menu.Item
                  leftSection={<Trash2 size={14} />}
                  color="red"
                  onClick={() => {
                    setRouteToDelete(route);
                    setDeleteModalOpen(true);
                  }}
                >
                  Delete
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </Group>

          {/* Badges */}
          <Group gap="xs">
            <Badge size="xs" color={isPlanned ? 'blue' : 'green'} variant="light">
              {isPlanned ? 'Planned Route' : 'Completed Ride'}
            </Badge>
            <Badge size="xs" color={sourceBadge.color} variant="light">
              {sourceBadge.label}
            </Badge>
            {route.route_type && (
              <Badge size="xs" color={getRouteTypeColor(route.route_type)} variant="light">
                {route.route_type.replace('_', ' ')}
              </Badge>
            )}
            {/* Garmin Sync Status Badges */}
            {route.garmin_course_id && (
              <Badge size="xs" color="teal" variant="light" leftSection={<Check size={12} />}>
                On Garmin
              </Badge>
            )}
            {route.garmin_sync_status === 'error' && (
              <Tooltip label={route.garmin_sync_error || 'Sync failed'}>
                <Badge size="xs" color="red" variant="light" leftSection={<AlertCircle size={12} />}>
                  Sync Failed
                </Badge>
              </Tooltip>
            )}
            {/* GPS Data Status Badge */}
            {route.imported_from === 'strava' && !isPlanned && (
              route.has_gps_data ? (
                route.track_points_count > 100 ? (
                  <Badge size="xs" color="green" variant="light">
                    Full GPS
                  </Badge>
                ) : (
                  <Tooltip label={`Only ${route.track_points_count} GPS points`}>
                    <Badge size="xs" color="yellow" variant="light">
                      Partial GPS
                    </Badge>
                  </Tooltip>
                )
              ) : (
                <Tooltip label="GPS data not available - re-import to fix">
                  <Badge size="xs" color="red" variant="light">
                    No GPS
                  </Badge>
                </Tooltip>
              )
            )}
          </Group>

          {/* Send to Garmin Button */}
          <SendToGarminButton
            route={route}
            onSuccess={(data) => {
              setRoutes(prev => prev.map(r =>
                r.id === route.id
                  ? { ...r, garmin_course_id: data.courseId, garmin_synced_at: new Date(), garmin_sync_status: 'success' }
                  : r
              ));
            }}
          />

          {/* Description */}
          {route.description && (
            <Text size="xs" c="dimmed" lineClamp={2}>
              {route.description}
            </Text>
          )}

          <Divider />

          {/* Stats Grid */}
          <SimpleGrid cols={2} spacing="xs">
            <StatItem
              icon={<Activity size={14} />}
              label="Distance"
              value={formatDistance(route.distance_km || 0)}
            />
            <StatItem
              icon={<Mountain size={14} />}
              label="Elevation"
              value={`+${formatElevation(route.elevation_gain_m || 0)}`}
            />
            {route.duration_seconds && (
              <StatItem
                icon={<Clock size={14} />}
                label="Duration"
                value={formatDuration(route.duration_seconds)}
              />
            )}
            {route.average_speed && (
              <StatItem
                icon={<TrendingUp size={14} />}
                label="Avg Speed"
                value={formatSpeed(normalizeSpeed(route.average_speed))}
              />
            )}
            {!route.duration_seconds && !route.average_speed && (
              <>
                <StatItem
                  icon={<Activity size={14} />}
                  label="Est. TSS"
                  value={`${estimateTSS(route)}`}
                />
                <StatItem
                  icon={<MapPin size={14} />}
                  label="Points"
                  value={route.track_points_count || '-'}
                />
              </>
            )}
          </SimpleGrid>

          {/* Progress bar for completed rides with power data */}
          {!isPlanned && route.has_power_data && route.training_stress_score && (
            <Box>
              <Group justify="space-between" mb={4}>
                <Text size="xs" c="dimmed">Training Load</Text>
                <Text size="xs" fw={600}>{route.training_stress_score} TSS</Text>
              </Group>
              <Progress
                value={Math.min((route.training_stress_score / 200) * 100, 100)}
                color={route.training_stress_score > 150 ? 'red' : route.training_stress_score > 100 ? 'orange' : 'blue'}
                size="sm"
              />
            </Box>
          )}
        </Stack>
      </Card>
    );
  };

  const StatItem = ({ icon, label, value }) => (
    <Group gap="xs" wrap="nowrap">
      <Box c="dimmed">{icon}</Box>
      <div style={{ flex: 1, minWidth: 0 }}>
        <Text size="xs" c="dimmed">{label}</Text>
        <Text size="sm" fw={600} truncate>{value}</Text>
      </div>
    </Group>
  );

  const RouteListItem = ({ route }) => {
    const sourceBadge = getSourceBadge(route);
    const isPlanned = isPlannedRoute(route);
    const displayDate = route.recorded_at || route.created_at;

    return (
      <Card withBorder p="md" radius="md">
        <Group justify="space-between" wrap="wrap" gap="md">
          <Group gap="md" style={{ flex: 1, minWidth: 0 }}>
            <Avatar color={isPlanned ? 'blue' : 'green'} size="lg" radius="md">
              {isPlanned ? <RouteIcon size={24} /> : <Bike size={24} />}
            </Avatar>

            <div style={{ flex: 1, minWidth: 0 }}>
              <Group gap="xs" mb={4}>
                <Text fw={600} size="md" truncate>
                  {route.name || 'Untitled Route'}
                </Text>
                <Badge size="xs" color={isPlanned ? 'blue' : 'green'} variant="light">
                  {isPlanned ? 'Planned' : 'Completed'}
                </Badge>
                <Badge size="xs" color={sourceBadge.color} variant="light">
                  {sourceBadge.label}
                </Badge>
              </Group>
              <Text size="sm" c="dimmed">
                {formatDate(displayDate)}
              </Text>
            </div>
          </Group>

          <Group gap="xl">
            <StatItem
              icon={<Activity size={16} />}
              label="Distance"
              value={formatDistance(route.distance_km || 0)}
            />
            <StatItem
              icon={<Mountain size={16} />}
              label="Elevation"
              value={`+${formatElevation(route.elevation_gain_m || 0)}`}
            />
            {route.duration_seconds && (
              <StatItem
                icon={<Clock size={16} />}
                label="Duration"
                value={formatDuration(route.duration_seconds)}
              />
            )}
            {route.average_speed && (
              <StatItem
                icon={<TrendingUp size={16} />}
                label="Avg Speed"
                value={formatSpeed(normalizeSpeed(route.average_speed))}
              />
            )}
          </Group>

          <Group gap="xs">
            <Tooltip label="View details">
              <ActionIcon
                variant="light"
                onClick={() => handleViewRoute(route)}
              >
                <Eye size={16} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Edit route">
              <ActionIcon
                variant="light"
                onClick={() => navigate(`/studio?routeId=${route.id}`)}
              >
                <Edit size={16} />
              </ActionIcon>
            </Tooltip>
            {/* Send to Garmin Button */}
            <SendToGarminButton
              route={route}
              onSuccess={(data) => {
                // Update local state to show route is synced
                setRoutes(prev => prev.map(r =>
                  r.id === route.id
                    ? { ...r, garmin_course_id: data.courseId, garmin_synced_at: new Date(), garmin_sync_status: 'success' }
                    : r
                ));
              }}
            />
            <Menu position="bottom-end" withinPortal>
              <Menu.Target>
                <ActionIcon variant="light">
                  <MoreVertical size={16} />
                </ActionIcon>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item leftSection={<Share2 size={14} />}>Share</Menu.Item>
                <Menu.Item leftSection={<Download size={14} />}>Download GPX</Menu.Item>
                <Menu.Divider />
                <Menu.Item
                  leftSection={<Trash2 size={14} />}
                  color="red"
                  onClick={() => {
                    setRouteToDelete(route);
                    setDeleteModalOpen(true);
                  }}
                >
                  Delete
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </Group>
        </Group>
      </Card>
    );
  };

  if (loading) {
    return (
      <Container size="xl" py="xl">
        <Center h={400}>
          <Stack align="center" gap="md">
            <Loader size="lg" />
            <Text c="dimmed">Loading routes...</Text>
          </Stack>
        </Center>
      </Container>
    );
  }

  return (
    <Container size="xl" py="xl">
      {/* Breadcrumb Navigation */}
      <BreadcrumbNav
        items={[
          { label: 'Dashboard', path: '/' },
          { label: 'Planning & Routes', path: '#' },
          { label: 'My Routes' }
        ]}
      />

      {/* Header */}
      <Group justify="space-between" mb="xl">
        <div>
          <Title order={2}>My Routes & Rides</Title>
          <Text size="sm" c="dimmed">
            View and manage your planned routes and completed rides
          </Text>
        </div>
        <Button
          leftSection={<RouteIcon size={16} />}
          onClick={() => navigate('/studio')}
        >
          Create New Route
        </Button>
      </Group>

      {/* Stats Overview */}
      <SimpleGrid cols={{ base: 2, sm: 4 }} mb="xl">
        <Paper withBorder p="md" radius="md">
          <Text size="xs" c="dimmed" mb={4}>Total Routes</Text>
          <Text size="xl" fw={700}>{formatNumber(overallStats.totalRoutes)}</Text>
        </Paper>
        <Paper withBorder p="md" radius="md">
          <Text size="xs" c="dimmed" mb={4}>Completed Rides</Text>
          <Text size="xl" fw={700}>
            {formatNumber(overallStats.completedRides)}
          </Text>
        </Paper>
        <Paper withBorder p="md" radius="md">
          <Text size="xs" c="dimmed" mb={4}>Total Distance</Text>
          <Text size="xl" fw={700}>
            {formatDistance(overallStats.totalDistance)}
          </Text>
        </Paper>
        <Paper withBorder p="md" radius="md">
          <Text size="xs" c="dimmed" mb={4}>Total Elevation</Text>
          <Text size="xl" fw={700}>
            +{formatElevation(overallStats.totalElevation)}
          </Text>
        </Paper>
      </SimpleGrid>

      {/* Filters and Controls */}
      <Card withBorder p="md" mb="lg">
        <Stack gap="md">
          {/* View Mode Toggle */}
          <SegmentedControl
            value={viewMode}
            onChange={setViewMode}
            data={[
              { label: `All (${formatNumber(overallStats.totalRoutes)})`, value: 'all' },
              { label: `Planned Routes (${formatNumber(overallStats.totalRoutes - overallStats.completedRides)})`, value: 'planned' },
              { label: `Completed Rides (${formatNumber(overallStats.completedRides)})`, value: 'completed' },
            ]}
            fullWidth
          />

          {/* Search and Filters */}
          <Group grow>
            <TextInput
              placeholder="Search routes by name or description..."
              leftSection={<Search size={16} />}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <Select
              placeholder="Route type"
              leftSection={<Filter size={16} />}
              data={[
                { label: 'All Types', value: 'all' },
                { label: 'Loop', value: 'loop' },
                { label: 'Out & Back', value: 'out_back' },
                { label: 'Point to Point', value: 'point_to_point' },
              ]}
              value={filterType}
              onChange={setFilterType}
              clearable
            />
            <Select
              placeholder="Sort by"
              leftSection={<SortDesc size={16} />}
              data={[
                { label: 'Date (Newest)', value: 'date-desc' },
                { label: 'Date (Oldest)', value: 'date-asc' },
                { label: 'Distance (High to Low)', value: 'distance-desc' },
                { label: 'Distance (Low to High)', value: 'distance-asc' },
                { label: 'Elevation (High to Low)', value: 'elevation-desc' },
                { label: 'Elevation (Low to High)', value: 'elevation-asc' },
                { label: 'Name (A-Z)', value: 'name-asc' },
                { label: 'Name (Z-A)', value: 'name-desc' },
              ]}
              value={sortBy}
              onChange={setSortBy}
            />
          </Group>

          {/* View Type Toggle */}
          <Group justify="space-between">
            <Text size="sm" c="dimmed">
              Showing {filteredRoutes.length} {filteredRoutes.length === 1 ? 'route' : 'routes'}
            </Text>
            <SegmentedControl
              value={viewType}
              onChange={setViewType}
              data={[
                { label: 'Grid', value: 'grid' },
                { label: 'List', value: 'list' },
              ]}
              size="xs"
            />
          </Group>
        </Stack>
      </Card>

      {/* Routes Display */}
      {filteredRoutes.length === 0 ? (
        searchQuery || filterType !== 'all' ? (
          <EmptyState
            type="noSearchResults"
            description="Try adjusting your filters or search query"
            size="md"
          />
        ) : viewMode === 'planned' ? (
          <EmptyState
            type="noRoutes"
            size="lg"
          />
        ) : (
          <EmptyState
            type="noRides"
            size="lg"
          />
        )
      ) : (
        <>
          {viewType === 'grid' ? (
            <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="lg">
              {filteredRoutes.map(route => (
                <RouteCard key={route.id} route={route} />
              ))}
            </SimpleGrid>
          ) : (
            <Stack gap="md">
              {filteredRoutes.map(route => (
                <RouteListItem key={route.id} route={route} />
              ))}
            </Stack>
          )}

          {/* Load More Button */}
          {hasMore && !searchQuery && filterType === 'all' && (
            <Center mt="xl">
              <Button
                variant="light"
                size="lg"
                loading={loadingMore}
                onClick={() => loadRoutes(false)}
                leftSection={<RefreshCw size={16} />}
              >
                Load More Routes
              </Button>
            </Center>
          )}

          {!hasMore && routes.length > ROUTES_PER_PAGE && (
            <Center mt="lg">
              <Text size="sm" c="dimmed">
                All {routes.length} routes loaded
              </Text>
            </Center>
          )}
        </>
      )}

      {/* Delete Confirmation Modal */}
      <Modal
        opened={deleteModalOpen}
        onClose={() => {
          setDeleteModalOpen(false);
          setRouteToDelete(null);
        }}
        title="Delete Route"
        centered
      >
        <Stack gap="md">
          <Text>
            Are you sure you want to delete <strong>{routeToDelete?.name || 'this route'}</strong>?
            This action cannot be undone.
          </Text>
          <Group justify="flex-end" gap="sm">
            <Button
              variant="default"
              onClick={() => {
                setDeleteModalOpen(false);
                setRouteToDelete(null);
              }}
            >
              Cancel
            </Button>
            <Button color="red" onClick={handleDeleteRoute}>
              Delete
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* View Route Details Modal */}
      <Modal
        opened={viewModalOpen}
        onClose={() => {
          setViewModalOpen(false);
          setRouteToView(null);
          setViewRouteDetails(null);
        }}
        title={routeToView?.name || 'Route Details'}
        size="xl"
        centered
      >
        {viewRouteDetails ? (
          <Stack gap="md">
            {/* Route Stats */}
            <SimpleGrid cols={3} spacing="xs">
              <Paper withBorder p="sm">
                <Text size="xs" c="dimmed">Distance</Text>
                <Text size="lg" fw={600}>{formatDistance(viewRouteDetails.distance_km || 0)}</Text>
              </Paper>
              <Paper withBorder p="sm">
                <Text size="xs" c="dimmed">Elevation</Text>
                <Text size="lg" fw={600}>+{formatElevation(viewRouteDetails.elevation_gain_m || 0)}</Text>
              </Paper>
              <Paper withBorder p="sm">
                <Text size="xs" c="dimmed">Duration</Text>
                <Text size="lg" fw={600}>{formatDuration(viewRouteDetails.duration_seconds)}</Text>
              </Paper>
            </SimpleGrid>

            {viewRouteDetails.average_speed && (
              <Paper withBorder p="sm">
                <Text size="xs" c="dimmed">Average Speed</Text>
                <Text size="lg" fw={600}>{formatSpeed(normalizeSpeed(viewRouteDetails.average_speed))}</Text>
              </Paper>
            )}

            {/* Map */}
            <Box>
              <Text size="sm" fw={500} mb="xs">Route Map</Text>
              <RouteMap trackPoints={viewRouteDetails.trackPoints} mapHeight={400} />
            </Box>

            {/* Additional Info */}
            {viewRouteDetails.description && (
              <Box>
                <Text size="sm" fw={500} mb="xs">Description</Text>
                <Text size="sm" c="dimmed">{viewRouteDetails.description}</Text>
              </Box>
            )}

            <Group gap="xs">
              {viewRouteDetails.recorded_at && (
                <Badge color="green">
                  Completed: {formatDate(viewRouteDetails.recorded_at)}
                </Badge>
              )}
              {viewRouteDetails.route_type && (
                <Badge color={getRouteTypeColor(viewRouteDetails.route_type)}>
                  {viewRouteDetails.route_type.replace('_', ' ')}
                </Badge>
              )}
              {viewRouteDetails.imported_from && (
                <Badge color={getSourceBadge(viewRouteDetails).color}>
                  {getSourceBadge(viewRouteDetails).label}
                </Badge>
              )}
            </Group>
          </Stack>
        ) : (
          <Center p="xl">
            <Loader />
          </Center>
        )}
      </Modal>
    </Container>
  );
};

export default ViewRoutes;
