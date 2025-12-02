import React, { useMemo } from 'react';
import { Card, Text, Group, Stack, SimpleGrid, ThemeIcon, Badge } from '@mantine/core';
import { Activity, Clock, Mountain, TrendingUp, Zap } from 'lucide-react';

/**
 * Last Workout Summary Card
 * Shows quick stats from the most recent completed ride
 */
const LastWorkoutCard = ({ rides = [], formatDistance, formatElevation }) => {
  const lastRide = useMemo(() => {
    if (!rides || rides.length === 0) return null;

    // Get most recent ride
    const sorted = [...rides].sort((a, b) => {
      const dateA = new Date(a.recorded_at || a.created_at);
      const dateB = new Date(b.recorded_at || b.created_at);
      return dateB - dateA;
    });

    const ride = sorted[0];
    const rideDate = new Date(ride.recorded_at || ride.created_at);

    // Calculate time ago
    const now = new Date();
    const hoursAgo = Math.floor((now - rideDate) / (60 * 60 * 1000));
    const daysAgo = Math.floor(hoursAgo / 24);

    let timeAgo = '';
    if (hoursAgo < 1) {
      timeAgo = 'Just now';
    } else if (hoursAgo < 24) {
      timeAgo = `${hoursAgo}h ago`;
    } else if (daysAgo === 1) {
      timeAgo = 'Yesterday';
    } else if (daysAgo < 7) {
      timeAgo = `${daysAgo} days ago`;
    } else {
      timeAgo = rideDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }

    return {
      ...ride,
      timeAgo,
      duration: ride.duration_seconds || ride.elapsed_time_seconds || ride.moving_time_seconds || 0
    };
  }, [rides]);

  if (!lastRide) {
    return (
      <Card withBorder p="md">
        <Stack align="center" gap="xs" py="md">
          <Activity size={32} color="#adb5bd" />
          <Text size="sm" c="gray.7">No rides yet</Text>
          <Text size="xs" c="gray.7">Your last workout will appear here</Text>
        </Stack>
      </Card>
    );
  }

  const durationMinutes = Math.floor(lastRide.duration / 60);
  const durationHours = Math.floor(durationMinutes / 60);
  const remainingMinutes = durationMinutes % 60;
  const durationText = durationHours > 0
    ? `${durationHours}h ${remainingMinutes}m`
    : `${durationMinutes}m`;

  return (
    <Card withBorder p="md">
      <Stack gap="sm">
        {/* Header */}
        <Group justify="space-between">
          <Group gap="xs">
            <ThemeIcon size="lg" color="blue" variant="light">
              <Activity size={20} />
            </ThemeIcon>
            <div>
              <Text size="sm" fw={600}>Last Workout</Text>
              <Text size="xs" c="gray.7">{lastRide.timeAgo}</Text>
            </div>
          </Group>
          {lastRide.imported_from && (
            <Badge size="xs" variant="light" color="gray">
              {lastRide.imported_from}
            </Badge>
          )}
        </Group>

        {/* Workout Name */}
        {lastRide.name && (
          <Text size="sm" fw={500} lineClamp={1}>
            {lastRide.name}
          </Text>
        )}

        {/* Stats Grid */}
        <SimpleGrid cols={2} spacing="xs">
          <Stack gap={4}>
            <Group gap={4}>
              <Activity size={14} color="#228be6" />
              <Text size="xs" c="gray.7">Distance</Text>
            </Group>
            <Text size="md" fw={600}>
              {formatDistance(lastRide.distance_km)}
            </Text>
          </Stack>

          <Stack gap={4}>
            <Group gap={4}>
              <Clock size={14} color="#228be6" />
              <Text size="xs" c="gray.7">Duration</Text>
            </Group>
            <Text size="md" fw={600}>
              {durationText}
            </Text>
          </Stack>

          {lastRide.elevation_gain_m > 0 && (
            <Stack gap={4}>
              <Group gap={4}>
                <Mountain size={14} color="#228be6" />
                <Text size="xs" c="gray.7">Elevation</Text>
              </Group>
              <Text size="md" fw={600}>
                {formatElevation(lastRide.elevation_gain_m)}
              </Text>
            </Stack>
          )}

          {lastRide.training_stress_score > 0 && (
            <Stack gap={4}>
              <Group gap={4}>
                <TrendingUp size={14} color="#228be6" />
                <Text size="xs" c="gray.7">TSS</Text>
              </Group>
              <Text size="md" fw={600}>
                {Math.round(lastRide.training_stress_score)}
              </Text>
            </Stack>
          )}

          {lastRide.average_watts > 0 && (
            <Stack gap={4}>
              <Group gap={4}>
                <Zap size={14} color="#228be6" />
                <Text size="xs" c="gray.7">Avg Power</Text>
              </Group>
              <Text size="md" fw={600}>
                {Math.round(lastRide.average_watts)}W
              </Text>
            </Stack>
          )}
        </SimpleGrid>
      </Stack>
    </Card>
  );
};

export default LastWorkoutCard;
