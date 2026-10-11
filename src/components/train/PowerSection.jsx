import React from 'react';
import AthleteBenchmarking from '../AthleteBenchmarking.jsx';
import CriticalPowerModel from '../CriticalPowerModel.jsx';
import EmptyState from '../EmptyState.jsx';
import PowerDurationCurve from '../PowerDurationCurve.jsx';
import { Box, Button, Card, Group, Paper, Progress, Stack, Text } from '@mantine/core';
import { Lightning } from '@phosphor-icons/react';
import { TRAINING_ZONES } from '../../utils/trainingPlans';
import { zoneColor } from '../../utils/rideZones';

// ============================================================================
// POWER — the power section of the Progress tab (moved from TrainingDashboard.jsx)
// ============================================================================
const PowerSection = React.memo(function PowerSection({ ftp, powerZones, navigate, activities, weight }) {
  // Names/ranges local; plain-language descriptions come from the canonical
  // zone table so every surface explains a zone the same way.
  // Colors come from the shared zone palette (src/utils/rideZones.ts) so
  // the ride map paints the same Z1–Z7.
  const zones = [
    { zone: 1, name: 'Recovery', range: '< 55%', color: zoneColor(1), description: TRAINING_ZONES[1]?.description },
    { zone: 2, name: 'Endurance', range: '55-75%', color: zoneColor(2), description: TRAINING_ZONES[2]?.description },
    { zone: 3, name: 'Tempo', range: '75-90%', color: zoneColor(3), description: TRAINING_ZONES[3]?.description },
    { zone: 4, name: 'Threshold', range: '90-105%', color: zoneColor(4), description: TRAINING_ZONES[4]?.description },
    { zone: 5, name: 'VO2max', range: '105-120%', color: zoneColor(5), description: TRAINING_ZONES[5]?.description },
    { zone: 6, name: 'Anaerobic', range: '120-150%', color: zoneColor(6), description: TRAINING_ZONES[6]?.description },
    { zone: 7, name: 'Neuromuscular', range: '> 150%', color: zoneColor(7), description: TRAINING_ZONES[7]?.description },
  ];

  // Check if we have any power data
  const hasPowerData = activities?.some(a => a.average_watts > 0);

  if (!ftp) {
    return (
      <EmptyState
        icon={Lightning}
        iconColor="yellow"
        title="Set Your FTP"
        description="Enter your Functional Threshold Power to see personalized power zones and training recommendations."
        primaryAction={{
          label: 'Set FTP in Settings',
          onClick: () => navigate('/settings'),
        }}
      />
    );
  }

  return (
    <Stack gap="lg">
      {/* Power Duration Curve */}
      {hasPowerData && (
        <PowerDurationCurve
          activities={activities}
          ftp={ftp}
          weight={weight}
        />
      )}

      {/* FTP Display */}
      <Paper
        p="lg"
        style={{
          background: 'linear-gradient(135deg, rgba(212, 168, 67, 0.15), transparent)',
          border: '1px solid rgba(212, 168, 67, 0.3)',
        }}
      >
        <Group justify="space-between" align="center">
          <Box>
            <Text size="sm" c="dimmed">Current FTP</Text>
            <Group gap="sm" align="baseline">
              <Text size="3rem" fw={700} style={{ color: '#D4820A' }}>
                {ftp}W
              </Text>
              {weight && (
                <Text size="lg" c="dimmed">
                  ({(ftp / weight).toFixed(2)} W/kg — watts per kilogram)
                </Text>
              )}
            </Group>
            <Text size="sm" c="dimmed" mt={4}>
              Your FTP — the anchor for all your zones and intensity targets.
            </Text>
            <Text size="xs" c="dimmed" mt="xs">
              Last updated: Manual entry
            </Text>
          </Box>
          <Button variant="light" color="yellow" onClick={() => navigate('/settings')}>
            Update FTP
          </Button>
        </Group>
      </Paper>

      {/* Power Zones */}
      <Card withBorder p="md">
        <Text fw={600} mb="md">Power Zones</Text>
        <Stack gap="sm">
          {zones.map((z) => {
            const zoneData = powerZones?.[`z${z.zone}`];
            const watts = zoneData
              ? z.zone === 7
                ? `${zoneData.min}+`
                : z.zone === 1
                  ? `0-${zoneData.max}`
                  : `${zoneData.min}-${zoneData.max}`
              : null;

            return (
              <Group key={z.zone} gap="md">
                <Box w={30} ta="center">
                  <Text fw={700} style={{ color: z.color }}>Z{z.zone}</Text>
                </Box>
                <Box style={{ flex: 1 }}>
                  <Group justify="space-between" mb={4}>
                    <Text size="sm">{z.name}</Text>
                    <Text size="sm" c="dimmed">{z.range}</Text>
                  </Group>
                  {z.description && (
                    <Text size="xs" c="dimmed" mb={4}>
                      {z.description}
                    </Text>
                  )}
                  <Progress
                    value={watts ? (z.zone / 7) * 100 : 0}
                    color={z.color}
                    size="sm"
                    radius="xl"
                  />
                </Box>
                <Box w={90} ta="right">
                  <Text size="sm" fw={watts ? 600 : 400} c={watts ? undefined : 'dimmed'}>
                    {watts ? `${watts}W` : '-- W'}
                  </Text>
                </Box>
              </Group>
            );
          })}
        </Stack>
      </Card>

      {/* Critical Power Model */}
      <CriticalPowerModel
        activities={activities}
        ftp={ftp}
        weight={weight}
      />

      {/* Athlete Benchmarking */}
      <AthleteBenchmarking
        activities={activities}
        ftp={ftp}
        weight={weight}
      />
    </Stack>
  );
});

export default PowerSection;
