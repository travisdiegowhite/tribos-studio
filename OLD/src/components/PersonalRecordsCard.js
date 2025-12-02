import React, { useMemo } from 'react';
import { Card, Text, Group, Stack, Badge, ThemeIcon } from '@mantine/core';
import { Award, TrendingUp } from 'lucide-react';

/**
 * Personal Records Card
 * Shows recent personal records and lifetime bests
 */
const PersonalRecordsCard = ({ rides = [], formatDistance, formatElevation }) => {
  const records = useMemo(() => {
    if (!rides || rides.length === 0) return null;

    // Calculate PRs
    const longestRide = [...rides].sort((a, b) => (b.distance_km || 0) - (a.distance_km || 0))[0];
    const highestTSS = [...rides].sort((a, b) => (b.training_stress_score || 0) - (a.training_stress_score || 0))[0];
    const mostElevation = [...rides].sort((a, b) => (b.elevation_gain_m || 0) - (a.elevation_gain_m || 0))[0];
    const highestPower = [...rides].filter(r => r.average_watts > 0).sort((a, b) => b.average_watts - a.average_watts)[0];

    // Check for recent PRs (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentPRs = [];

    if (longestRide) {
      const rideDate = new Date(longestRide.recorded_at || longestRide.created_at);
      if (rideDate >= thirtyDaysAgo) {
        recentPRs.push({ type: 'Longest Ride', value: formatDistance(longestRide.distance_km), date: rideDate });
      }
    }

    if (highestTSS && highestTSS.training_stress_score > 0) {
      const rideDate = new Date(highestTSS.recorded_at || highestTSS.created_at);
      if (rideDate >= thirtyDaysAgo) {
        recentPRs.push({ type: 'Highest TSS', value: Math.round(highestTSS.training_stress_score), date: rideDate });
      }
    }

    if (mostElevation && mostElevation.elevation_gain_m > 0) {
      const rideDate = new Date(mostElevation.recorded_at || mostElevation.created_at);
      if (rideDate >= thirtyDaysAgo) {
        recentPRs.push({ type: 'Most Climbing', value: formatElevation(mostElevation.elevation_gain_m), date: rideDate });
      }
    }

    if (highestPower) {
      const rideDate = new Date(highestPower.recorded_at || highestPower.created_at);
      if (rideDate >= thirtyDaysAgo) {
        recentPRs.push({ type: 'Highest Avg Power', value: `${Math.round(highestPower.average_watts)}W`, date: rideDate });
      }
    }

    return {
      longestRide: longestRide ? formatDistance(longestRide.distance_km) : null,
      highestTSS: highestTSS && highestTSS.training_stress_score > 0 ? Math.round(highestTSS.training_stress_score) : null,
      mostElevation: mostElevation && mostElevation.elevation_gain_m > 0 ? formatElevation(mostElevation.elevation_gain_m) : null,
      highestPower: highestPower ? `${Math.round(highestPower.average_watts)}W` : null,
      recentPRs
    };
  }, [rides, formatDistance, formatElevation]);

  if (!records) {
    return null;
  }

  return (
    <Card withBorder p="md">
      <Stack gap="sm">
        {/* Header */}
        <Group gap="xs">
          <ThemeIcon size="lg" color="yellow" variant="light">
            <Award size={20} />
          </ThemeIcon>
          <Text size="lg" fw={600}>Personal Records</Text>
        </Group>

        {/* Recent PRs */}
        {records.recentPRs.length > 0 ? (
          <>
            <Badge color="yellow" variant="light" size="sm">
              🎉 {records.recentPRs.length} new PR{records.recentPRs.length > 1 ? 's' : ''} this month!
            </Badge>

            <Stack gap="xs">
              {records.recentPRs.slice(0, 3).map((pr, index) => (
                <Group key={index} justify="space-between" p="xs" style={{ backgroundColor: 'rgba(50, 205, 50, 0.1)', borderRadius: 4 }}>
                  <Group gap="xs">
                    <TrendingUp size={14} color="#32CD32" />
                    <Text size="sm" fw={500} c="dark">{pr.type}</Text>
                  </Group>
                  <Text size="sm" fw={600} c="#32CD32">{pr.value}</Text>
                </Group>
              ))}
            </Stack>
          </>
        ) : (
          <Text size="sm" c="dimmed">No new PRs this month. Keep pushing!</Text>
        )}

        {/* Lifetime Bests */}
        <Text size="xs" c="dimmed" mt="sm">Lifetime Bests:</Text>
        <Group gap="lg" wrap="wrap">
          {records.longestRide && (
            <div>
              <Text size="xs" c="dimmed">Longest Ride</Text>
              <Text size="sm" fw={600}>{records.longestRide}</Text>
            </div>
          )}
          {records.highestTSS && (
            <div>
              <Text size="xs" c="dimmed">Highest TSS</Text>
              <Text size="sm" fw={600}>{records.highestTSS}</Text>
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
        </Group>
      </Stack>
    </Card>
  );
};

export default PersonalRecordsCard;
