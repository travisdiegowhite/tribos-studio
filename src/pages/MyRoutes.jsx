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
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconPlus, IconDotsVertical, IconTrash, IconEdit, IconDownload } from '@tabler/icons-react';
import { tokens } from '../theme';
import AppShell from '../components/AppShell.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';
import { listRoutes, deleteRoute, getRoute } from '../utils/routesService';

function MyRoutes() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [routes, setRoutes] = useState([]);
  const [deletingId, setDeletingId] = useState(null);

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

  // Export route as GPX
  const handleExportGPX = async (routeId, routeName) => {
    try {
      const route = await getRoute(routeId);
      if (!route?.geometry?.coordinates) {
        throw new Error('Route has no geometry');
      }

      const gpxContent = generateGPX(route.name, route.geometry.coordinates);
      const blob = new Blob([gpxContent], { type: 'application/gpx+xml' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${routeName.replace(/\s+/g, '_')}.gpx`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error exporting route:', error);
      notifications.show({
        title: 'Export Failed',
        message: error.message || 'Failed to export route',
        color: 'red'
      });
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
          <Stack align="center" justify="center" style={{ minHeight: 400 }}>
            <Loader color="lime" size="lg" />
            <Text style={{ color: tokens.colors.textSecondary }}>Loading your routes...</Text>
          </Stack>
        </Container>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <Container size="xl" py="xl">
        <Stack gap="xl">
          {/* Header */}
          <Group justify="space-between" align="flex-start" wrap="wrap" gap="md">
            <Box>
              <Title order={1} style={{ color: tokens.colors.textPrimary }}>
                My Routes
              </Title>
              <Text style={{ color: tokens.colors.textSecondary }}>
                {routes.length} saved route{routes.length !== 1 ? 's' : ''}
              </Text>
            </Box>
            <Button
              color="lime"
              leftSection={<IconPlus size={18} />}
              onClick={() => navigate('/routes/new')}
            >
              New Route
            </Button>
          </Group>

          {/* Routes Grid */}
          {routes.length === 0 ? (
            <Card>
              <Stack align="center" gap="md" py="xl">
                <Text size="4rem">🗺️</Text>
                <Title order={3} style={{ color: tokens.colors.textPrimary }}>
                  No routes yet
                </Title>
                <Text style={{ color: tokens.colors.textSecondary, textAlign: 'center' }} maw={{ base: '100%', sm: 400 }}>
                  Create your first route using our AI-powered route builder or by drawing on the map.
                </Text>
                <Button
                  color="lime"
                  size="lg"
                  leftSection={<IconPlus size={20} />}
                  onClick={() => navigate('/routes/new')}
                >
                  Create Your First Route
                </Button>
              </Stack>
            </Card>
          ) : (
            <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="lg">
              {routes.map((route) => (
                <Card
                  key={route.id}
                  padding="lg"
                  style={{
                    backgroundColor: tokens.colors.bgSecondary,
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
                              color: tokens.colors.textPrimary,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap'
                            }}
                          >
                            {route.name}
                          </Text>
                        </Group>
                        <Text size="xs" style={{ color: tokens.colors.textMuted }}>
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
                          <Menu.Item
                            leftSection={<IconDownload size={14} />}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleExportGPX(route.id, route.name);
                            }}
                          >
                            Export GPX
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
                        <Text size="xs" style={{ color: tokens.colors.textMuted }}>
                          Distance
                        </Text>
                        <Text fw={600} style={{ color: tokens.colors.electricLime }}>
                          {route.distance_km?.toFixed(1) || '--'} km
                        </Text>
                      </Box>
                      <Box>
                        <Text size="xs" style={{ color: tokens.colors.textMuted }}>
                          Elevation
                        </Text>
                        <Text fw={600} style={{ color: tokens.colors.textPrimary }}>
                          {route.elevation_gain_m || '--'}m
                        </Text>
                      </Box>
                      <Box>
                        <Text size="xs" style={{ color: tokens.colors.textMuted }}>
                          Time
                        </Text>
                        <Text fw={600} style={{ color: tokens.colors.textPrimary }}>
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

export default MyRoutes;
