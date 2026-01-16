import { useMemo } from 'react';
import { Card, Text, Group, Box, Stack, Progress, SimpleGrid, Skeleton } from '@mantine/core';
import { IconBike, IconClock, IconMountain, IconFlame, IconActivity } from '@tabler/icons-react';
import { tokens } from '../theme';

/**
 * WeekSummary Component
 * Displays weekly training stats with visual progress indicators
 */
const WeekSummary = ({
  activities = [],
  loading = false,
  formatDist,
  formatElev,
  weeklyDistanceGoal = 200, // km
  weeklyTimeGoal = 10, // hours
}) => {
  // Calculate weekly stats
  const weekStats = useMemo(() => {
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay()); // Start of week (Sunday)
    weekStart.setHours(0, 0, 0, 0);

    let distance = 0;
    let time = 0;
    let elevation = 0;
    let rides = 0;
    let calories = 0;

    activities.forEach((activity) => {
      const activityDate = new Date(activity.start_date);
      if (activityDate >= weekStart) {
        const distKm = activity.distance_meters
          ? activity.distance_meters / 1000
          : activity.distance
          ? activity.distance / 1000
          : 0;
        distance += distKm;
        time += (activity.duration_seconds || activity.moving_time || 0) / 3600;
        elevation += activity.elevation_gain_meters || activity.total_elevation_gain || 0;
        rides += 1;
        calories += activity.calories || 0;
      }
    });

    return {
      distance: Math.round(distance * 10) / 10,
      time: Math.round(time * 10) / 10,
      elevation: Math.round(elevation),
      rides,
      calories: Math.round(calories),
    };
  }, [activities]);

  // Calculate progress percentages
  const distanceProgress = Math.min(100, (weekStats.distance / weeklyDistanceGoal) * 100);
  const timeProgress = Math.min(100, (weekStats.time / weeklyTimeGoal) * 100);

  if (loading) {
    return (
      <Card>
        <Stack gap="md">
          <Skeleton height={24} width={150} />
          <SimpleGrid cols={{ base: 2, xs: 2 }} spacing="md">
            <Skeleton height={80} />
            <Skeleton height={80} />
            <Skeleton height={80} />
            <Skeleton height={80} />
          </SimpleGrid>
        </Stack>
      </Card>
    );
  }

  return (
    <Card>
      <Stack gap="md">
        <Group justify="space-between">
          <Text fw={600} style={{ color: tokens.colors.textPrimary }}>
            This Week
          </Text>
          <Text size="sm" style={{ color: tokens.colors.textMuted }}>
            {weekStats.rides} ride{weekStats.rides !== 1 ? 's' : ''}
          </Text>
        </Group>

        <SimpleGrid cols={2} spacing="md">
          {/* Distance */}
          <StatBox
            icon={IconBike}
            label="Distance"
            value={formatDist ? formatDist(weekStats.distance) : `${weekStats.distance} km`}
            progress={distanceProgress}
            progressColor={tokens.colors.electricLime}
            goal={formatDist ? formatDist(weeklyDistanceGoal) : `${weeklyDistanceGoal} km`}
          />

          {/* Time */}
          <StatBox
            icon={IconClock}
            label="Time"
            value={`${weekStats.time}h`}
            progress={timeProgress}
            progressColor={tokens.colors.zone1}
            goal={`${weeklyTimeGoal}h`}
          />

          {/* Elevation */}
          <StatBox
            icon={IconMountain}
            label="Elevation"
            value={formatElev ? formatElev(weekStats.elevation) : `${weekStats.elevation}m`}
            iconColor={tokens.colors.zone4}
          />

          {/* Calories */}
          <StatBox
            icon={IconFlame}
            label="Calories"
            value={weekStats.calories > 0 ? weekStats.calories.toLocaleString() : '-'}
            iconColor={tokens.colors.zone5}
          />
        </SimpleGrid>
      </Stack>
    </Card>
  );
};

/**
 * StatBox - Individual stat display
 */
function StatBox({ icon: Icon, label, value, progress, progressColor, goal, iconColor }) {
  return (
    <Box
      style={{
        padding: tokens.spacing.md,
        borderRadius: tokens.radius.md,
        backgroundColor: tokens.colors.bgTertiary,
      }}
    >
      <Stack gap="xs">
        <Group gap="xs">
          <Icon size={16} color={iconColor || tokens.colors.textMuted} />
          <Text size="xs" style={{ color: tokens.colors.textMuted }}>
            {label}
          </Text>
        </Group>

        <Text size="xl" fw={700} style={{ color: tokens.colors.textPrimary }}>
          {value}
        </Text>

        {progress !== undefined && (
          <Stack gap={4}>
            <Progress
              value={progress}
              size="sm"
              color={progressColor === tokens.colors.electricLime ? 'lime' : 'blue'}
              style={{ backgroundColor: tokens.colors.bgSecondary }}
            />
            <Text size="xs" style={{ color: tokens.colors.textMuted }}>
              {Math.round(progress)}% of {goal} goal
            </Text>
          </Stack>
        )}
      </Stack>
    </Box>
  );
}

export default WeekSummary;
