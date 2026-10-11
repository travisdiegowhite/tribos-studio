import React from 'react';
import AthleteBenchmarking from '../AthleteBenchmarking.jsx';
import CriticalPowerModel from '../CriticalPowerModel.jsx';
import EmptyState from '../EmptyState.jsx';
import PowerDurationCurve from '../PowerDurationCurve.jsx';
import { Box, Button, Group, Stack, Text } from '@mantine/core';
import { SubHeading, kicker, mono } from './progressUi.jsx';
import { Lightning } from '@phosphor-icons/react';
import { TRAINING_ZONES } from '../../utils/trainingPlans';
import { getRouteZoneColor as zoneColor } from '../ui/zoneColors';

// ============================================================================
// POWER — the power section of the Progress tab (moved from TrainingDashboard.jsx)
// ============================================================================
const PowerSection = React.memo(function PowerSection({ ftp, powerZones, navigate, activities, weight }) {
  // Names/ranges local; plain-language descriptions come from the canonical
  // zone table so every surface explains a zone the same way.
  // Colors come from the brand zone palette (src/components/ui/zoneColors.js:
  // cyan, ultramarine, lime, magenta, ink — no orange or red), the same one
  // the workout overlay paints.
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
    <Stack gap="xl">
      {/* Power Duration Curve */}
      {hasPowerData && (
        <PowerDurationCurve
          activities={activities}
          ftp={ftp}
          weight={weight}
        />
      )}

      {/* FTP: the anchor for every zone */}
      <Box style={{ borderTop: '1px solid var(--color-border)', borderBottom: '1px solid var(--color-border)', padding: '12px 0' }}>
        <Group justify="space-between" align="center" wrap="wrap" gap="sm">
          <Box>
            <Text style={kicker}>Current FTP</Text>
            <Group gap="sm" align="baseline" wrap="wrap">
              <Text style={{ ...mono, fontSize: 44, fontWeight: 700, lineHeight: 1.1 }}>{ftp}W</Text>
              {weight && (
                <Text style={{ ...mono, fontSize: 16, color: 'var(--color-text-secondary)' }}>
                  {(ftp / weight).toFixed(2)} W/kg
                </Text>
              )}
            </Group>
            <Text size="sm" c="var(--color-text-secondary)" mt={4}>
              Your FTP — the anchor for all your zones and intensity targets.
            </Text>
          </Box>
          <Button variant="outline" radius={0} size="xs" onClick={() => navigate('/settings')}>
            Update FTP
          </Button>
        </Group>
      </Box>

      {/* Power zones */}
      <Box>
        <SubHeading>Power zones</SubHeading>
        <Box style={{ borderTop: '1px solid var(--color-border)' }}>
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
              <Group
                key={z.zone}
                gap="md"
                wrap="nowrap"
                align="flex-start"
                style={{ borderBottom: '1px solid var(--color-border)', padding: '8px 0' }}
              >
                <Box w={34} style={{ flexShrink: 0 }}>
                  <Text style={{ ...mono, fontWeight: 700 }}>Z{z.zone}</Text>
                  <Box style={{ height: 4, backgroundColor: z.color, marginTop: 2 }} />
                </Box>
                <Box style={{ flex: 1, minWidth: 0 }}>
                  <Group justify="space-between" wrap="nowrap" gap="xs">
                    <Text size="sm" fw={600}>{z.name}</Text>
                    <Text style={{ ...mono, fontSize: 12, color: 'var(--color-text-muted)' }}>{z.range}</Text>
                  </Group>
                  {z.description && (
                    <Text size="xs" c="var(--color-text-secondary)">
                      {z.description}
                    </Text>
                  )}
                </Box>
                <Box w={86} ta="right" style={{ flexShrink: 0 }}>
                  <Text style={{ ...mono, fontSize: 14, fontWeight: watts ? 700 : 400, color: watts ? undefined : 'var(--color-text-muted)' }}>
                    {watts ? `${watts}W` : '-- W'}
                  </Text>
                </Box>
              </Group>
            );
          })}
        </Box>
      </Box>

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
