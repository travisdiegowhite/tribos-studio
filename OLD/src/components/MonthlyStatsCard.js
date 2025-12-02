import React, { useMemo } from 'react';
import { Card, Text, Group, Stack, SimpleGrid, ThemeIcon, Progress } from '@mantine/core';
import { Calendar, Activity, TrendingUp, Clock } from 'lucide-react';

/**
 * Monthly Stats Summary Card
 * Shows current month's training totals
 */
const MonthlyStatsCard = ({ rides = [], formatDistance, formatElevation }) => {
  const monthStats = useMemo(() => {
    if (!rides || rides.length === 0) return null;

    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();

    // Filter rides for current month
    const monthRides = rides.filter(ride => {
      const rideDate = new Date(ride.recorded_at || ride.created_at);
      return rideDate.getMonth() === currentMonth && rideDate.getFullYear() === currentYear;
    });

    if (monthRides.length === 0) return null;

    // Calculate totals
    const totalDistance = monthRides.reduce((sum, r) => sum + (r.distance_km || 0), 0);
    const totalElevation = monthRides.reduce((sum, r) => sum + (r.elevation_gain_m || 0), 0);
    const totalTSS = monthRides.reduce((sum, r) => sum + (r.training_stress_score || 0), 0);
    const totalTime = monthRides.reduce((sum, r) => sum + (r.duration_seconds || r.elapsed_time_seconds || r.moving_time_seconds || 0), 0);

    const hours = Math.floor(totalTime / 3600);
    const minutes = Math.floor((totalTime % 3600) / 60);

    // Calculate progress through month (for progress bar)
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const dayOfMonth = today.getDate();
    const monthProgress = (dayOfMonth / daysInMonth) * 100;

    // Get month name
    const monthName = today.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    return {
      monthName,
      rideCount: monthRides.length,
      totalDistance,
      totalElevation,
      totalTSS: Math.round(totalTSS),
      hours,
      minutes,
      monthProgress,
      dayOfMonth,
      daysInMonth
    };
  }, [rides, formatDistance, formatElevation]);

  if (!monthStats) {
    return null;
  }

  return (
    <Card withBorder p="md">
      <Stack gap="sm">
        {/* Header */}
        <Group justify="space-between">
          <Group gap="xs">
            <ThemeIcon size="lg" color="blue" variant="light">
              <Calendar size={20} />
            </ThemeIcon>
            <div>
              <Text size="lg" fw={600}>{monthStats.monthName}</Text>
              <Text size="xs" c="dimmed">Monthly Summary</Text>
            </div>
          </Group>
        </Group>

        {/* Month Progress */}
        <div>
          <Group justify="space-between" mb={4}>
            <Text size="xs" c="dimmed">Month Progress</Text>
            <Text size="xs" c="dimmed">Day {monthStats.dayOfMonth}/{monthStats.daysInMonth}</Text>
          </Group>
          <Progress value={monthStats.monthProgress} size="sm" />
        </div>

        {/* Stats Grid */}
        <SimpleGrid cols={2} spacing="xs">
          <Stack gap={4}>
            <Group gap={4}>
              <Activity size={14} color="#228be6" />
              <Text size="xs" c="dimmed">Rides</Text>
            </Group>
            <Text size="xl" fw={700}>
              {monthStats.rideCount}
            </Text>
          </Stack>

          <Stack gap={4}>
            <Group gap={4}>
              <TrendingUp size={14} color="#228be6" />
              <Text size="xs" c="dimmed">Total TSS</Text>
            </Group>
            <Text size="xl" fw={700}>
              {monthStats.totalTSS}
            </Text>
          </Stack>

          <Stack gap={4}>
            <Text size="xs" c="dimmed">Distance</Text>
            <Text size="lg" fw={600}>
              {formatDistance(monthStats.totalDistance)}
            </Text>
          </Stack>

          <Stack gap={4}>
            <Text size="xs" c="dimmed">Elevation</Text>
            <Text size="lg" fw={600}>
              {formatElevation(monthStats.totalElevation)}
            </Text>
          </Stack>
        </SimpleGrid>

        {/* Time Total */}
        <Group justify="space-between" p="xs" style={{ backgroundColor: '#3d4e5e', borderRadius: 4 }}>
          <Group gap={4}>
            <Clock size={14} color="#32CD32" />
            <Text size="xs" c="#D5E1EE">Total Time</Text>
          </Group>
          <Text size="sm" fw={600} c="#E8E8E8">
            {monthStats.hours}h {monthStats.minutes}m
          </Text>
        </Group>
      </Stack>
    </Card>
  );
};

export default MonthlyStatsCard;
