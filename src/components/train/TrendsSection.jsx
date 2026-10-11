import React, { useMemo } from 'react';
import AerobicDecoupling from '../AerobicDecoupling.jsx';
import EmptyState from '../EmptyState.jsx';
import HealthTrendsChart from '../HealthTrendsChart.jsx';
import PersonalRecordsCard from '../PersonalRecordsCard.jsx';
import RampRateAlert from '../RampRateAlert.jsx';
import TrainingLoadChart from '../TrainingLoadChart.jsx';
import { Box, Card, Group, Paper, SimpleGrid, Stack, Text, ThemeIcon } from '@mantine/core';
import { ChartBar, Medal, Path, TrendDown, TrendUp } from '@phosphor-icons/react';
import { PoweredByGarmin } from '../GarminBranding';
import { PoweredByStrava } from '../StravaBranding';

// ============================================================================
// TRENDS — the fitness section of the Progress tab (moved from TrainingDashboard.jsx)
// ============================================================================
const TrendsSection = React.memo(function TrendsSection({ dailyTSSData, trainingMetrics, activities, speedProfile, formatDist, formatElev, isImperial, ftp, weight, healthHistory, onOpenCheckIn }) {
  // Check if any activities are from Strava/Garmin for attribution
  const hasStravaActivities = activities?.some(a => a.provider === 'strava');
  const hasGarminActivities = activities?.some(a => a.provider === 'garmin');

  // Count activities in last 90 days
  const ninetyDayActivityCount = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90);
    return (activities || []).filter(a => new Date(a.start_date) >= cutoff).length;
  }, [activities]);

  // Real 4-week fitness change, read off the server-preferred per-day series
  // (points carry ctl from buildDailyLoadSeries).
  const fitnessDelta4w = useMemo(() => {
    if (!dailyTSSData || dailyTSSData.length < 29) return null;
    const now = dailyTSSData[dailyTSSData.length - 1];
    const fourWeeksAgo = dailyTSSData[dailyTSSData.length - 29];
    if (now?.ctl == null || fourWeeksAgo?.ctl == null) return null;
    return Math.round(now.ctl - fourWeeksAgo.ctl);
  }, [dailyTSSData]);

  return (
    <Stack gap="lg">
      {/* Ramp Rate Alert */}
      {dailyTSSData.length > 14 && (
        <RampRateAlert
          dailyTSSData={dailyTSSData}
          currentCTL={trainingMetrics.ctl}
          showDetails={true}
        />
      )}

      {/* Fitness Journey Chart */}
      <Card withBorder p="md">
        <Group justify="space-between" mb="md">
          <Text fw={600}>Fitness Journey</Text>
          <Group gap="md">
            <Group gap={4}>
              <Box w={12} h={3} bg="blue" style={{ borderRadius: 2 }} />
              <Text size="xs" c="dimmed">Fitness (TFI)</Text>
            </Group>
            <Group gap={4}>
              <Box w={12} h={3} bg="orange" style={{ borderRadius: 2 }} />
              <Text size="xs" c="dimmed">Fatigue (AFI)</Text>
            </Group>
            <Group gap={4}>
              <Box w={12} h={3} bg="teal" style={{ borderRadius: 2 }} />
              <Text size="xs" c="dimmed">Form (FS)</Text>
            </Group>
          </Group>
        </Group>
        {dailyTSSData.length > 0 ? (
          <TrainingLoadChart data={dailyTSSData} />
        ) : (
          <EmptyState type="noTrainingData" size="sm" />
        )}
        {hasStravaActivities && (
          <Box mt="md" pt="sm" style={{ borderTop: '1px solid var(--mantine-color-dark-4)' }}>
            <PoweredByStrava variant="light" size="sm" />
          </Box>
        )}
        {hasGarminActivities && (
          <Box mt={hasStravaActivities ? 'xs' : 'md'} pt={hasStravaActivities ? 0 : 'sm'} style={{ borderTop: hasStravaActivities ? 'none' : '1px solid var(--mantine-color-dark-4)' }}>
            <PoweredByGarmin variant="light" size="sm" />
          </Box>
        )}
      </Card>

      {/* Aerobic Decoupling */}
      <AerobicDecoupling
        activities={activities}
        timeRange={90}
      />

      {/* Health Trends */}
      <HealthTrendsChart
        data={healthHistory}
        onOpenCheckIn={onOpenCheckIn}
      />

      {/* Progress Cards */}
      <Card withBorder p="md">
        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
          <Paper p="md" ta="center" style={{ background: 'var(--tribos-input)', border: '1px solid var(--tribos-border-subtle)', boxShadow: 'var(--tribos-shadow-inset)' }}>
            {fitnessDelta4w != null && fitnessDelta4w < 0 ? (
              <TrendDown size={24} color="#C2410C" style={{ marginBottom: 8 }} />
            ) : (
              <TrendUp size={24} color="#3D8B50" style={{ marginBottom: 8 }} />
            )}
            <Text size="xl" fw={700} c={fitnessDelta4w != null && fitnessDelta4w < 0 ? 'orange' : 'teal'}>
              {fitnessDelta4w == null ? '--' : `${fitnessDelta4w >= 0 ? '+' : ''}${fitnessDelta4w}`}
            </Text>
            <Text size="sm" c="dimmed">Fitness change (4 weeks)</Text>
            <Text size="xs" c="dimmed" mt={4}>
              {fitnessDelta4w == null
                ? 'Log a few weeks of riding to see your trend.'
                : fitnessDelta4w > 3
                  ? 'Your base is growing — the training is landing.'
                  : fitnessDelta4w < -3
                    ? 'A lighter month — fitness eases when the load does.'
                    : 'Holding steady over the last month.'}
            </Text>
          </Paper>
          <Paper p="md" ta="center" style={{ background: 'var(--tribos-input)', border: '1px solid var(--tribos-border-subtle)', boxShadow: 'var(--tribos-shadow-inset)' }}>
            <Path size={24} color="#3D8B50" style={{ marginBottom: 8 }} />
            <Text size="xl" fw={700} c="blue">{ninetyDayActivityCount}</Text>
            <Text size="sm" c="dimmed">Activities in 90 days</Text>
          </Paper>
          <Paper p="md" ta="center" style={{ background: 'var(--tribos-input)', border: '1px solid var(--tribos-border-subtle)', boxShadow: 'var(--tribos-shadow-inset)' }}>
            <Medal size={24} color="#D4820A" style={{ marginBottom: 8 }} />
            <Text size="xl" fw={700} c="yellow">
              {speedProfile ? `${(speedProfile.average_speed * (isImperial ? 0.621371 : 1)).toFixed(1)}` : '--'}
            </Text>
            <Text size="sm" c="dimmed">Avg Speed ({isImperial ? 'mph' : 'km/h'})</Text>
          </Paper>
        </SimpleGrid>
        {hasStravaActivities && (
          <Box mt="md" pt="sm" style={{ borderTop: '1px solid var(--mantine-color-dark-4)' }}>
            <PoweredByStrava variant="light" size="sm" />
          </Box>
        )}
        {hasGarminActivities && (
          <Box mt={hasStravaActivities ? 'xs' : 'md'} pt={hasStravaActivities ? 0 : 'sm'} style={{ borderTop: hasStravaActivities ? 'none' : '1px solid var(--mantine-color-dark-4)' }}>
            <PoweredByGarmin variant="light" size="sm" />
          </Box>
        )}
      </Card>

      {/* Personal Records */}
      <PersonalRecordsCard
        rides={activities}
        formatDistance={formatDist}
        formatElevation={formatElev}
      />

      {/* Riding Patterns */}
      {activities.length > 5 && (
        <Card withBorder p="md">
          <Group gap="xs" mb="md">
            <ThemeIcon size="md" color="grape" variant="light">
              <ChartBar size={16} />
            </ThemeIcon>
            <Text fw={600}>Riding Patterns</Text>
          </Group>
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
            <Box>
              <Text size="xs" c="dimmed">Preferred Duration</Text>
              <Text size="sm" fw={500}>
                {speedProfile ? `${Math.round(speedProfile.avg_ride_duration)} min` : '60-90 min'}
              </Text>
            </Box>
            <Box>
              <Text size="xs" c="dimmed">Avg Climbing</Text>
              <Text size="sm" fw={500}>
                {speedProfile ? formatElev(speedProfile.avg_elevation_per_km * 20) : '-- '}/ride
              </Text>
            </Box>
          </SimpleGrid>
          {hasStravaActivities && (
            <Box mt="md" pt="sm" style={{ borderTop: '1px solid var(--mantine-color-dark-4)' }}>
              <PoweredByStrava variant="light" size="sm" />
            </Box>
          )}
          {hasGarminActivities && (
            <Box mt={hasStravaActivities ? 'xs' : 'md'} pt={hasStravaActivities ? 0 : 'sm'} style={{ borderTop: hasStravaActivities ? 'none' : '1px solid var(--mantine-color-dark-4)' }}>
              <PoweredByGarmin variant="light" size="sm" />
            </Box>
          )}
        </Card>
      )}
    </Stack>
  );
});

export default TrendsSection;
