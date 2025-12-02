// RouteDiscovery Component
// Discover routes - Nearby, from Friends, and Curated collections

import React, { useState, useEffect } from 'react';
import {
  Tabs,
  Card,
  Badge,
  Group,
  Stack,
  Text,
  Avatar,
  Button,
  TextInput,
  Select,
  LoadingOverlay,
  ActionIcon,
  Tooltip,
  Paper,
  Grid,
  Box
} from '@mantine/core';
import {
  Globe,
  Users,
  Star,
  Map as MapIcon,
  Bookmark,
  BookmarkCheck,
  MessageCircle,
  TrendingUp,
  Navigation,
  Search
} from 'lucide-react';
import { supabase } from '../supabase';
import { SharingLevels } from '../utils/routeSharing';
import { saveRoute, isRouteSaved } from '../utils/routeSharing';
import { useUnits } from '../utils/units';
import { notifications } from '@mantine/notifications';

const RouteDiscovery = ({ onRouteSelect }) => {
  const [activeTab, setActiveTab] = useState('nearby');
  const [loading, setLoading] = useState(false);
  const [routes, setRoutes] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState({
    distance: 'all',
    difficulty: 'all',
    surface: 'all'
  });

  useEffect(() => {
    loadRoutes();
  }, [activeTab, filters]);

  const loadRoutes = async () => {
    setLoading(true);
    try {
      let data = [];

      switch (activeTab) {
        case 'nearby':
          data = await loadNearbyRoutes();
          break;
        case 'friends':
          data = await loadFriendRoutes();
          break;
        case 'curated':
          data = await loadCuratedRoutes();
          break;
        default:
          break;
      }

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

  const loadNearbyRoutes = async () => {
    // Load public and local routes
    const { data, error } = await supabase
      .from('shared_routes')
      .select(`
        *,
        routes (
          id,
          name,
          distance,
          elevation_gain,
          route_type,
          created_at
        ),
        user_profiles (
          display_name,
          avatar_url
        )
      `)
      .in('sharing_level', [SharingLevels.PUBLIC, SharingLevels.LOCAL])
      .or('expires_at.is.null,expires_at.gt.' + new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;
    return data || [];
  };

  const loadFriendRoutes = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    // Get friend connections
    const { data: connections } = await supabase
      .from('connections')
      .select('connected_user_id')
      .eq('user_id', user.id)
      .eq('status', 'accepted')
      .eq('can_see_routes', true);

    if (!connections || connections.length === 0) {
      return [];
    }

    const friendIds = connections.map(c => c.connected_user_id);

    // Get routes shared by friends
    const { data, error } = await supabase
      .from('shared_routes')
      .select(`
        *,
        routes (
          id,
          name,
          distance,
          elevation_gain,
          route_type,
          created_at
        ),
        user_profiles (
          display_name,
          avatar_url
        )
      `)
      .in('owner_id', friendIds)
      .in('sharing_level', [SharingLevels.FRIENDS, SharingLevels.PUBLIC])
      .or('expires_at.is.null,expires_at.gt.' + new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;
    return data || [];
  };

  const loadCuratedRoutes = async () => {
    // Load public route collections
    const { data, error } = await supabase
      .from('route_collections')
      .select(`
        *,
        user_profiles (
          display_name,
          avatar_url
        )
      `)
      .eq('is_public', true)
      .order('subscriber_count', { ascending: false })
      .limit(20);

    if (error) throw error;
    return data || [];
  };

  const handleSaveRoute = async (routeId, sharedRouteId) => {
    const result = await saveRoute(routeId, sharedRouteId);
    if (result.success) {
      notifications.show({
        title: 'Success',
        message: 'Route saved to your library',
        color: 'green'
      });
      loadRoutes(); // Refresh to update save status
    } else {
      notifications.show({
        title: 'Error',
        message: result.error,
        color: 'red'
      });
    }
  };

  const filteredRoutes = routes.filter(route => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchesTitle = route.title?.toLowerCase().includes(query);
      const matchesDescription = route.description?.toLowerCase().includes(query);
      const matchesRouteName = route.routes?.name?.toLowerCase().includes(query);
      if (!matchesTitle && !matchesDescription && !matchesRouteName) {
        return false;
      }
    }

    // Apply filters
    if (filters.distance !== 'all' && route.routes) {
      const distance = route.routes.distance / 1000; // Convert to km
      if (filters.distance === 'short' && distance > 30) return false;
      if (filters.distance === 'medium' && (distance < 30 || distance > 80)) return false;
      if (filters.distance === 'long' && distance < 80) return false;
    }

    return true;
  });

  return (
    <Box>
      <Paper p="md" mb="md" withBorder>
        <Stack spacing="md">
          <Group position="apart">
            <Text size="xl" weight={600}>Discover Routes</Text>
            <Group>
              <TextInput
                placeholder="Search routes..."
                leftSection={<Search size={16} />}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ width: 300 }}
              />
            </Group>
          </Group>

          <Group>
            <Select
              label="Distance"
              value={filters.distance}
              onChange={(value) => setFilters({ ...filters, distance: value })}
              data={[
                { value: 'all', label: 'All distances' },
                { value: 'short', label: 'Short (< 30km)' },
                { value: 'medium', label: 'Medium (30-80km)' },
                { value: 'long', label: 'Long (> 80km)' }
              ]}
              style={{ width: 200 }}
            />
          </Group>
        </Stack>
      </Paper>

      <Tabs value={activeTab} onChange={setActiveTab}>
        <Tabs.List>
          <Tabs.Tab value="nearby" leftSection={<Globe size={16} />}>
            Nearby Routes
          </Tabs.Tab>
          <Tabs.Tab value="friends" leftSection={<Users size={16} />}>
            Friend Routes
          </Tabs.Tab>
          <Tabs.Tab value="curated" leftSection={<Star size={16} />}>
            Collections
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="nearby" pt="md">
          <RouteList
            routes={filteredRoutes}
            loading={loading}
            onRouteSelect={onRouteSelect}
            onSaveRoute={handleSaveRoute}
            type="route"
          />
        </Tabs.Panel>

        <Tabs.Panel value="friends" pt="md">
          <RouteList
            routes={filteredRoutes}
            loading={loading}
            onRouteSelect={onRouteSelect}
            onSaveRoute={handleSaveRoute}
            type="route"
          />
        </Tabs.Panel>

        <Tabs.Panel value="curated" pt="md">
          <CollectionsList
            collections={filteredRoutes}
            loading={loading}
          />
        </Tabs.Panel>
      </Tabs>
    </Box>
  );
};

const RouteList = ({ routes, loading, onRouteSelect, onSaveRoute, type }) => {
  if (loading) {
    return <LoadingOverlay visible />;
  }

  if (routes.length === 0) {
    return (
      <Paper p="xl" withBorder>
        <Stack align="center" spacing="md">
          <MapIcon size={48} opacity={0.3} />
          <Text c="dimmed">No routes found</Text>
        </Stack>
      </Paper>
    );
  }

  return (
    <Grid>
      {routes.map(route => (
        <Grid.Col key={route.id} span={{ base: 12, sm: 6, md: 4 }}>
          <RouteCard
            route={route}
            onSelect={() => onRouteSelect?.(route)}
            onSave={() => onSaveRoute?.(route.routes?.id, route.id)}
          />
        </Grid.Col>
      ))}
    </Grid>
  );
};

const RouteCard = ({ route, onSelect, onSave }) => {
  const [saved, setSaved] = useState(false);
  const { formatDistance, formatElevation } = useUnits();

  useEffect(() => {
    checkIfSaved();
  }, [route]);

  const checkIfSaved = async () => {
    if (route.routes?.id) {
      const isSaved = await isRouteSaved(route.routes.id);
      setSaved(isSaved);
    }
  };

  const routeData = route.routes || {};
  const distanceKm = routeData.distance ? routeData.distance / 1000 : null;
  const elevationM = routeData.elevation_gain ? routeData.elevation_gain : null;

  return (
    <Card shadow="sm" padding="lg" withBorder style={{ cursor: 'pointer' }}>
      <Stack spacing="sm" onClick={onSelect}>
        <Group position="apart">
          <Text weight={500} lineClamp={1}>
            {route.title || routeData.name || 'Unnamed Route'}
          </Text>
          <ActionIcon
            variant="subtle"
            color={saved ? 'blue' : 'gray'}
            onClick={(e) => {
              e.stopPropagation();
              onSave?.();
            }}
          >
            {saved ? <BookmarkCheck size={18} /> : <Bookmark size={18} />}
          </ActionIcon>
        </Group>

        {route.description && (
          <Text size="sm" c="dimmed" lineClamp={2}>
            {route.description}
          </Text>
        )}

        <Group spacing="xs">
          <Badge variant="light" size="sm">
            {distanceKm !== null ? formatDistance(distanceKm, 1) : '?'}
          </Badge>
          <Badge variant="light" size="sm">
            {elevationM !== null ? formatElevation(elevationM) : '?'} ↗
          </Badge>
          {routeData.route_type && (
            <Badge variant="light" size="sm">
              {routeData.route_type}
            </Badge>
          )}
        </Group>

        {route.tags && route.tags.length > 0 && (
          <Group spacing={4}>
            {route.tags.slice(0, 3).map((tag, idx) => (
              <Badge key={idx} size="xs" variant="dot">
                {tag}
              </Badge>
            ))}
          </Group>
        )}

        <Group position="apart" mt="xs">
          <Group spacing="xs">
            <Avatar
              src={route.user_profiles?.avatar_url}
              size="sm"
              radius="xl"
            >
              {route.user_profiles?.display_name?.[0] || '?'}
            </Avatar>
            <Text size="xs" c="dimmed">
              {route.user_profiles?.display_name || 'Anonymous'}
            </Text>
          </Group>

          <Group spacing="xs">
            <Tooltip label="Views">
              <Group spacing={4}>
                <TrendingUp size={14} opacity={0.6} />
                <Text size="xs" c="dimmed">{route.view_count || 0}</Text>
              </Group>
            </Tooltip>
          </Group>
        </Group>
      </Stack>
    </Card>
  );
};

const CollectionsList = ({ collections, loading }) => {
  if (loading) {
    return <LoadingOverlay visible />;
  }

  if (collections.length === 0) {
    return (
      <Paper p="xl" withBorder>
        <Stack align="center" spacing="md">
          <Star size={48} opacity={0.3} />
          <Text c="dimmed">No collections found</Text>
        </Stack>
      </Paper>
    );
  }

  return (
    <Grid>
      {collections.map(collection => (
        <Grid.Col key={collection.id} span={{ base: 12, sm: 6 }}>
          <CollectionCard collection={collection} />
        </Grid.Col>
      ))}
    </Grid>
  );
};

const CollectionCard = ({ collection }) => {
  return (
    <Card shadow="sm" padding="lg" withBorder style={{ cursor: 'pointer' }}>
      <Stack spacing="sm">
        <Group>
          <Avatar
            src={collection.user_profiles?.avatar_url}
            size="sm"
            radius="xl"
          >
            {collection.user_profiles?.display_name?.[0] || '?'}
          </Avatar>
          <div>
            <Text size="sm" weight={500}>
              {collection.name}
            </Text>
            <Text size="xs" c="dimmed">
              by {collection.user_profiles?.display_name || 'Anonymous'}
            </Text>
          </div>
        </Group>

        {collection.description && (
          <Text size="sm" c="dimmed" lineClamp={2}>
            {collection.description}
          </Text>
        )}

        {collection.tags && collection.tags.length > 0 && (
          <Group spacing={4}>
            {collection.tags.map((tag, idx) => (
              <Badge key={idx} size="sm" variant="light">
                {tag}
              </Badge>
            ))}
          </Group>
        )}

        <Group position="apart" mt="xs">
          <Group spacing="xs">
            <Users size={14} opacity={0.6} />
            <Text size="xs" c="dimmed">
              {collection.subscriber_count || 0} subscribers
            </Text>
          </Group>
          <Button size="xs" variant="light">
            View Collection
          </Button>
        </Group>
      </Stack>
    </Card>
  );
};

export default RouteDiscovery;
