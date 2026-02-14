import React, { useMemo } from 'react';
import { Card, Text, Group, Stack, Badge, ThemeIcon } from '@mantine/core';
import { IconAward, IconTrendingUp, IconBolt, IconMountain, IconRoute, IconClock } from '@tabler/icons-react';

/**
 * Personal Records Card
 * Shows recent personal records and lifetime bests
 */
const PersonalRecordsCard = ({ rides = [], formatDistance, formatElevation }) => {
  const records = useMemo(() => {
    if (!rides || rides.length === 0) return null;

    // Calculate PRs from rides (supports both activities and routes table formats)
    const getDistance = (r) => r.distance_km || (r.distance ? r.distance / 1000 : 0);
    const getElevation = (r) => r.elevation_gain_m || r.total_elevation_gain || 0;
    const getDuration = (r) => r.duration_seconds || r.moving_time || r.elapsed_time || 0;
    const getPower = (r) => r.average_watts || 0;
    const getTSS = (r) => r.training_stress_score || 0;
    const getDate = (r) => r.recorded_at || r.start_date || r.created_at;

    const longestRide = [...rides].sort((a, b) => getDistance(b) - getDistance(a))[0];
    const mostElevation = [...rides].filter(r => getElevation(r) > 0).sort((a, b) => getElevation(b) - getElevation(a))[0];
    const highestPower = [...rides].filter(r => getPower(r) > 0).sort((a, b) => getPower(b) - getPower(a))[0];
    const longestDuration = [...rides].filter(r => getDuration(r) > 0).sort((a, b) => getDuration(b) - getDuration(a))[0];

    // Check for recent PRs (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentPRs = [];

    if (longestRide && getDistance(longestRide) > 0) {
      const rideDate = new Date(getDate(longestRide));
      if (rideDate >= thirtyDaysAgo) {
        recentPRs.push({
          type: 'Longest Ride',
          value: formatDistance(getDistance(longestRide)),
          icon: IconRoute,
          color: 'blue'
        });
      }
    }

    if (mostElevation) {
      const rideDate = new Date(getDate(mostElevation));
      if (rideDate >= thirtyDaysAgo) {
        recentPRs.push({
          type: 'Most Climbing',
          value: formatElevation(getElevation(mostElevation)),
          icon: IconMountain,
          color: 'orange'
        });
      }
    }

    if (highestPower) {
      const rideDate = new Date(getDate(highestPower));
      if (rideDate >= thirtyDaysAgo) {
        recentPRs.push({
          type: 'Highest Avg Power',
          value: `${Math.round(getPower(highestPower))}W`,
          icon: IconBolt,
          color: 'yellow'
        });
      }
    }

    return {
      longestRide: longestRide ? formatDistance(getDistance(longestRide)) : null,
      mostElevation: mostElevation ? formatElevation(getElevation(mostElevation)) : null,
      highestPower: highestPower ? `${Math.round(getPower(highestPower))}W` : null,
      longestDuration: longestDuration ? formatDuration(getDuration(longestDuration)) : null,
      recentPRs
    };
  }, [rides, formatDistance, formatElevation]);

  if (!records) {
    return (
      <Card withBorder p="md">
        <Group gap="xs" mb="sm">
          <ThemeIcon size="lg" color="yellow" variant="light">
            <IconAward size={20} />
          </ThemeIcon>
          <Text size="lg" fw={600}>Personal Records</Text>
        </Group>
        <Text size="sm" c="dimmed">Complete some rides to see your PRs!</Text>
      </Card>
    );
  }

  return (
    <Card withBorder p="md">
      <Stack gap="sm">
        <Group gap="xs">
          <ThemeIcon size="lg" color="yellow" variant="light">
            <IconAward size={20} />
          </ThemeIcon>
          <Text size="lg" fw={600}>Personal Records</Text>
        </Group>

        {/* Recent PRs */}
        {records.recentPRs.length > 0 ? (
          <>
            <Badge color="yellow" variant="light" size="sm">
              {records.recentPRs.length} new PR{records.recentPRs.length > 1 ? 's' : ''} this month!
            </Badge>

            <Stack gap="xs">
              {records.recentPRs.slice(0, 3).map((pr, index) => (
                <Group
                  key={index}
                  justify="space-between"
                  p="xs"
                  style={{
                    backgroundColor: 'rgba(168, 191, 168, 0.1)',
                    borderRadius: 4
                  }}
                >
                  <Group gap="xs">
                    <pr.icon size={14} color="#A8BFA8" />
                    <Text size="sm" fw={500}>{pr.type}</Text>
                  </Group>
                  <Text size="sm" fw={600} c="teal">{pr.value}</Text>
                </Group>
              ))}
            </Stack>
          </>
        ) : (
          <Text size="sm" c="dimmed">No new PRs this month. Keep pushing!</Text>
        )}

        {/* Lifetime Bests */}
        <Text size="xs" c="dimmed" mt="xs">Lifetime Bests</Text>
        <Group gap="lg" wrap="wrap">
          {records.longestRide && (
            <div>
              <Text size="xs" c="dimmed">Longest Ride</Text>
              <Text size="sm" fw={600}>{records.longestRide}</Text>
            </div>
          )}
          {records.mostElevation && (
            <div>
              <Text size="xs" c="dimmed">Most Climbing</Text>
              <Text size="sm" fw={600}>{records.mostElevation}</Text>
            </div>
          )}
          {records.highestPower && (
            <div>
              <Text size="xs" c="dimmed">Avg Power PR</Text>
              <Text size="sm" fw={600}>{records.highestPower}</Text>
            </div>
          )}
          {records.longestDuration && (
            <div>
              <Text size="xs" c="dimmed">Longest Duration</Text>
              <Text size="sm" fw={600}>{records.longestDuration}</Text>
            </div>
          )}
        </Group>
      </Stack>
    </Card>
  );
};

// Helper to format duration
function formatDuration(seconds) {
  if (!seconds) return '-';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

export default PersonalRecordsCard;
