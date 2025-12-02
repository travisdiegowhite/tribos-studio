import React from 'react';
import {
  Modal,
  Stack,
  Text,
  Group,
  Card,
  SimpleGrid,
  Badge,
  ThemeIcon,
  Divider,
  ScrollArea,
  Title,
  Box
} from '@mantine/core';
import {
  Route,
  Clock,
  Mountain,
  Gauge,
  Heart,
  Zap,
  Award,
  Calendar,
  TrendingUp,
  Activity,
  MapPin
} from 'lucide-react';
import RouteMap from './RouteMap';
import { useUnits } from '../utils/units';
import { getRouteDate } from '../utils/dateUtils';

const RideDetailModal = ({
  opened,
  onClose,
  route,
  trackPoints
}) => {
  const { formatDistance, formatElevation, formatSpeed } = useUnits();

  if (!route) return null;

  // Debug logging
  console.log('RideDetailModal render:', {
    route: {
      id: route.id,
      name: route.name,
      has_gps_data: route.has_gps_data,
      track_points_count: route.track_points_count,
      start_lat: route.start_latitude,
      start_lng: route.start_longitude
    },
    trackPoints: {
      length: trackPoints?.length || 0,
      sample: trackPoints?.[0]
    }
  });

  const formatDuration = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  };

  const formatPace = (avgPace) => {
    if (!avgPace) return 'N/A';
    const minutes = Math.floor(avgPace / 60);
    const seconds = Math.floor(avgPace % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}/km`;
  };

  const getDifficultyColor = (distance, elevation) => {
    const elevationRatio = elevation / distance; // m/km
    if (elevationRatio < 10) return 'green';
    if (elevationRatio < 25) return 'yellow';
    return 'red';
  };

  const getDifficultyLabel = (distance, elevation) => {
    const elevationRatio = elevation / distance; // m/km
    if (elevationRatio < 10) return 'Easy';
    if (elevationRatio < 25) return 'Moderate';
    return 'Hard';
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      size="xl"
      title={
        <Group>
          <Activity size={20} />
          <Text fw={600}>{route.name || 'Ride Details'}</Text>
          {route.imported_from === 'strava' && (
            <Badge size="sm" color="orange">Strava</Badge>
          )}
        </Group>
      }
      scrollAreaComponent={ScrollArea.Autosize}
    >
      <Stack gap="lg">
        {/* Map Section */}
        <Card withBorder p="md">
          <Text fw={500} mb="sm" size="sm">Route Map</Text>
          {route.has_gps_data && trackPoints && trackPoints.length > 0 ? (
            <RouteMap
              trackPoints={trackPoints}
              mapHeight={300}
            />
          ) : (
            <Box ta="center" py="xl" c="dimmed">
              <Stack align="center" gap="sm">
                <MapPin size={32} />
                <Text size="sm">No GPS data available for this route</Text>
                <Text size="xs">
                  {route.imported_from === 'strava'
                    ? 'This Strava activity was recorded without GPS coordinates'
                    : 'This route was manually entered without GPS tracking'
                  }
                </Text>
                {route.start_latitude && route.start_longitude && (
                  <Text size="xs" c="blue">
                    Start location: {route.start_latitude.toFixed(4)}, {route.start_longitude.toFixed(4)}
                  </Text>
                )}
              </Stack>
            </Box>
          )}
        </Card>

        {/* Basic Statistics */}
        <SimpleGrid cols={{ base: 1, xs: 2, sm: 3, md: 4 }} spacing="md">
          <Card withBorder p="md" ta="center">
            <ThemeIcon size="lg" variant="light" color="blue" mb="xs">
              <Route size={20} />
            </ThemeIcon>
            <Text size="lg" fw={700}>{formatDistance(route.distance_km || 0)}</Text>
            <Text size="xs" c="dimmed">Distance</Text>
          </Card>

          <Card withBorder p="md" ta="center">
            <ThemeIcon size="lg" variant="light" color="orange" mb="xs">
              <Mountain size={20} />
            </ThemeIcon>
            <Text size="lg" fw={700}>{formatElevation(route.elevation_gain_m || 0)}</Text>
            <Text size="xs" c="dimmed">Elevation Gain</Text>
          </Card>

          <Card withBorder p="md" ta="center">
            <ThemeIcon size="lg" variant="light" color="violet" mb="xs">
              <Clock size={20} />
            </ThemeIcon>
            <Text size="lg" fw={700}>
              {route.duration_seconds ? formatDuration(route.duration_seconds) : 'N/A'}
            </Text>
            <Text size="xs" c="dimmed">Duration</Text>
          </Card>

          <Card withBorder p="md" ta="center">
            <ThemeIcon size="lg" variant="light" color={getDifficultyColor(route.distance_km || 1, route.elevation_gain_m || 0)} mb="xs">
              <Award size={20} />
            </ThemeIcon>
            <Text size="lg" fw={700}>
              {getDifficultyLabel(route.distance_km || 1, route.elevation_gain_m || 0)}
            </Text>
            <Text size="xs" c="dimmed">Difficulty</Text>
          </Card>
        </SimpleGrid>

        {/* Performance Metrics (if available) */}
        {(route.average_speed || route.average_heartrate || route.average_watts) && (
          <>
            <Divider />
            <div>
              <Title order={4} mb="md">Performance Metrics</Title>
              <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
                {route.average_speed && (
                  <Card withBorder p="md">
                    <Group justify="space-between" mb="sm">
                      <Group gap="xs">
                        <ThemeIcon size="sm" variant="light" color="blue">
                          <Gauge size={16} />
                        </ThemeIcon>
                        <Text fw={500} size="sm">Speed</Text>
                      </Group>
                    </Group>
                    <Stack gap="xs">
                      <Group justify="space-between">
                        <Text size="sm">Average</Text>
                        <Text fw={600}>
                          {formatSpeed(route.average_speed > 100 ? route.average_speed : route.average_speed * 3.6)}
                        </Text>
                      </Group>
                      {route.max_speed && (
                        <Group justify="space-between">
                          <Text size="sm" c="dimmed">Max</Text>
                          <Text size="sm" c="dimmed">
                            {formatSpeed(route.max_speed > 100 ? route.max_speed : route.max_speed * 3.6)}
                          </Text>
                        </Group>
                      )}
                      {route.average_pace && (
                        <Group justify="space-between">
                          <Text size="sm" c="dimmed">Pace</Text>
                          <Text size="sm" c="dimmed">{formatPace(route.average_pace)}</Text>
                        </Group>
                      )}
                    </Stack>
                  </Card>
                )}

                {route.average_heartrate && (
                  <Card withBorder p="md">
                    <Group justify="space-between" mb="sm">
                      <Group gap="xs">
                        <ThemeIcon size="sm" variant="light" color="red">
                          <Heart size={16} />
                        </ThemeIcon>
                        <Text fw={500} size="sm">Heart Rate</Text>
                      </Group>
                    </Group>
                    <Stack gap="xs">
                      <Group justify="space-between">
                        <Text size="sm">Average</Text>
                        <Text fw={600}>{Math.round(route.average_heartrate)} bpm</Text>
                      </Group>
                      {route.max_heartrate && (
                        <Group justify="space-between">
                          <Text size="sm" c="dimmed">Max</Text>
                          <Text size="sm" c="dimmed">{Math.round(route.max_heartrate)} bpm</Text>
                        </Group>
                      )}
                    </Stack>
                  </Card>
                )}

                {route.average_watts && (
                  <Card withBorder p="md">
                    <Group justify="space-between" mb="sm">
                      <Group gap="xs">
                        <ThemeIcon size="sm" variant="light" color="yellow">
                          <Zap size={16} />
                        </ThemeIcon>
                        <Text fw={500} size="sm">Power</Text>
                      </Group>
                    </Group>
                    <Stack gap="xs">
                      <Group justify="space-between">
                        <Text size="sm">Average</Text>
                        <Text fw={600}>{Math.round(route.average_watts)} W</Text>
                      </Group>
                      {route.max_watts && (
                        <Group justify="space-between">
                          <Text size="sm" c="dimmed">Max</Text>
                          <Text size="sm" c="dimmed">{Math.round(route.max_watts)} W</Text>
                        </Group>
                      )}
                      {route.normalized_power && (
                        <Group justify="space-between">
                          <Text size="sm" c="dimmed">Normalized</Text>
                          <Text size="sm" c="dimmed">{Math.round(route.normalized_power)} W</Text>
                        </Group>
                      )}
                    </Stack>
                  </Card>
                )}
              </SimpleGrid>
            </div>
          </>
        )}

        {/* Additional Details */}
        <Divider />
        <div>
          <Title order={4} mb="md">Additional Details</Title>
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
            <Stack gap="xs">
              <Group justify="space-between">
                <Group gap="xs">
                  <Calendar size={16} />
                  <Text size="sm">Date</Text>
                </Group>
                <Text size="sm" fw={500}>
                  {getRouteDate(route).format('MMM D, YYYY')}
                </Text>
              </Group>

              {route.activity_type && (
                <Group justify="space-between">
                  <Group gap="xs">
                    <Activity size={16} />
                    <Text size="sm">Activity Type</Text>
                  </Group>
                  <Badge size="sm" variant="light">
                    {route.activity_type}
                  </Badge>
                </Group>
              )}

              {route.route_type && (
                <Group justify="space-between">
                  <Text size="sm">Route Type</Text>
                  <Badge size="sm" variant="light" color="blue">
                    {route.route_type.replace('_', ' ')}
                  </Badge>
                </Group>
              )}

              {route.surface_type && (
                <Group justify="space-between">
                  <Text size="sm">Surface</Text>
                  <Badge size="sm" variant="light" color="green">
                    {route.surface_type}
                  </Badge>
                </Group>
              )}
            </Stack>

            <Stack gap="xs">
              {route.kilojoules && (
                <Group justify="space-between">
                  <Group gap="xs">
                    <Zap size={16} />
                    <Text size="sm">Energy</Text>
                  </Group>
                  <Text size="sm" fw={500}>
                    {Math.round(route.kilojoules).toLocaleString()} kJ
                  </Text>
                </Group>
              )}

              {route.training_stress_score && (
                <Group justify="space-between">
                  <Group gap="xs">
                    <TrendingUp size={16} />
                    <Text size="sm">Training Stress</Text>
                  </Group>
                  <Text size="sm" fw={500}>
                    {Math.round(route.training_stress_score)} TSS
                  </Text>
                </Group>
              )}

              {route.difficulty_rating && (
                <Group justify="space-between">
                  <Text size="sm">Difficulty Rating</Text>
                  <Badge size="sm" variant="filled" color={
                    route.difficulty_rating <= 2 ? 'green' :
                    route.difficulty_rating <= 4 ? 'yellow' : 'red'
                  }>
                    {route.difficulty_rating}/5
                  </Badge>
                </Group>
              )}

              {route.effort_level && (
                <Group justify="space-between">
                  <Text size="sm">Effort Level</Text>
                  <Badge size="sm" variant="light" color="grape">
                    {route.effort_level}
                  </Badge>
                </Group>
              )}
            </Stack>
          </SimpleGrid>
        </div>

        {/* Description */}
        {route.description && (
          <>
            <Divider />
            <div>
              <Title order={4} mb="sm">Description</Title>
              <Text size="sm" c="dimmed">{route.description}</Text>
            </div>
          </>
        )}

        {/* Location Info */}
        {(route.start_latitude && route.start_longitude) && (
          <>
            <Divider />
            <div>
              <Title order={4} mb="sm">Location</Title>
              <Group gap="xs">
                <MapPin size={16} />
                <Text size="sm" c="dimmed">
                  Start: {route.start_latitude?.toFixed(4)}, {route.start_longitude?.toFixed(4)}
                </Text>
              </Group>
              {route.end_latitude && route.end_longitude && (
                <Group gap="xs" mt="xs">
                  <MapPin size={16} />
                  <Text size="sm" c="dimmed">
                    End: {route.end_latitude?.toFixed(4)}, {route.end_longitude?.toFixed(4)}
                  </Text>
                </Group>
              )}
            </div>
          </>
        )}
      </Stack>
    </Modal>
  );
};

export default RideDetailModal;