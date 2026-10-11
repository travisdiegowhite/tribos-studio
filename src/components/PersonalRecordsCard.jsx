import React, { useMemo } from 'react';
import { Box, Group, Text } from '@mantine/core';
import HandTick from './ui/HandTick.jsx';
import { StatRow, SubHeading, kicker, mono } from './train/progressUi.jsx';
import { Lightning, Mountains, Path } from '@phosphor-icons/react';

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
          icon: Path,
        });
      }
    }

    if (mostElevation) {
      const rideDate = new Date(getDate(mostElevation));
      if (rideDate >= thirtyDaysAgo) {
        recentPRs.push({
          type: 'Most Climbing',
          value: formatElevation(getElevation(mostElevation)),
          icon: Mountains,
        });
      }
    }

    if (highestPower) {
      const rideDate = new Date(getDate(highestPower));
      if (rideDate >= thirtyDaysAgo) {
        recentPRs.push({
          type: 'Highest Avg Power',
          value: `${Math.round(getPower(highestPower))}W`,
          icon: Lightning,
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
      <Box>
        <SubHeading>Personal records</SubHeading>
        <Text size="sm" c="var(--color-text-secondary)">Complete some rides to see your PRs.</Text>
      </Box>
    );
  }

  const lifetime = [
    records.longestRide && { label: 'Longest ride', value: records.longestRide },
    records.mostElevation && { label: 'Most climbing', value: records.mostElevation },
    records.highestPower && { label: 'Avg power PR', value: records.highestPower },
    records.longestDuration && { label: 'Longest duration', value: records.longestDuration },
  ].filter(Boolean);

  return (
    <Box>
      <SubHeading
        aside={
          records.recentPRs.length > 0 ? (
            <Text style={{ ...mono, fontSize: 12, color: 'var(--color-signal-text)' }}>
              {records.recentPRs.length} new PR{records.recentPRs.length > 1 ? 's' : ''} this month
            </Text>
          ) : null
        }
      >
        Personal records
      </SubHeading>

      {records.recentPRs.length > 0 ? (
        <Box mb="sm" style={{ borderTop: '1px solid var(--color-border)' }}>
          {records.recentPRs.slice(0, 3).map((pr, index) => (
            <Group key={index} justify="space-between" wrap="nowrap" style={{ borderBottom: '1px solid var(--color-border)', padding: '6px 0' }}>
              <Group gap="xs" wrap="nowrap">
                <HandTick size={16} title="New this month" />
                <Text size="sm" fw={600}>{pr.type}</Text>
              </Group>
              <Text style={{ ...mono, fontSize: 14, fontWeight: 700 }}>{pr.value}</Text>
            </Group>
          ))}
        </Box>
      ) : (
        <Text size="sm" c="var(--color-text-secondary)" mb="sm">
          No new PRs this month. Keep pushing.
        </Text>
      )}

      {lifetime.length > 0 && (
        <>
          <Text style={kicker} mb={4}>
            Lifetime bests
          </Text>
          <StatRow stats={lifetime} minWidth={120} />
        </>
      )}
    </Box>
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
