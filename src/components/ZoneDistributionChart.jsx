import { useMemo, useState } from 'react';
import {
  Card,
  Text,
  Group,
  Badge,
  SegmentedControl,
  Stack,
  Box,
  Progress,
  Paper,
  SimpleGrid,
  Tooltip,
} from '@mantine/core';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
  Legend,
} from 'recharts';
import { IconChartPie, IconClock, IconFlame } from '@tabler/icons-react';
import { tokens } from '../theme';
import { TRAINING_ZONES, getPowerZone, getZoneColor, getZoneName } from '../utils/trainingPlans';

/**
 * Zone Distribution Chart Component
 * Shows time spent in each power/heart rate zone
 * Helps athletes understand their training distribution
 */
const ZoneDistributionChart = ({ activities, ftp, timeRange = '7' }) => {
  const [viewMode, setViewMode] = useState('bar'); // 'bar' or 'pie'
  const [rangeFilter, setRangeFilter] = useState(timeRange);

  // Zone colors matching the training zones
  const ZONE_COLORS = {
    1: tokens.colors.zone1,
    2: tokens.colors.zone2,
    3: tokens.colors.zone3,
    3.5: '#D4A843', // Sweet Spot - gold
    4: tokens.colors.zone4,
    5: tokens.colors.zone5,
    6: tokens.colors.zone6,
    7: tokens.colors.zone7,
  };

  // Calculate time in each zone
  const zoneData = useMemo(() => {
    if (!activities || activities.length === 0) {
      return { zones: [], totalTime: 0, distribution: {} };
    }

    // Filter by time range
    const days = parseInt(rangeFilter);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const filteredActivities = activities.filter(a => {
      const actDate = new Date(a.start_date);
      return actDate >= cutoffDate;
    });

    // Initialize zone buckets
    const zoneTimes = {
      1: 0, // Recovery
      2: 0, // Endurance
      3: 0, // Tempo
      4: 0, // Threshold
      5: 0, // VO2max
      6: 0, // Anaerobic
    };

    let totalTime = 0;

    filteredActivities.forEach(activity => {
      const duration = activity.moving_time || 0;
      const avgWatts = activity.average_watts || 0;

      if (duration > 0) {
        totalTime += duration;

        if (avgWatts > 0 && ftp) {
          // Estimate zone distribution based on average power
          // This is simplified - with power stream data we could be more precise
          const avgZone = getPowerZone(avgWatts, ftp) || 2;

          // Most time is spent around the average zone with some distribution
          // Recovery rides: mostly Z1-2
          // Endurance: mostly Z2
          // Tempo/Sweet Spot: Z2-4 mix
          // Threshold: Z3-4 mix
          // VO2max: Z4-5 mix

          if (avgZone <= 2) {
            // Recovery/Endurance ride
            zoneTimes[1] += duration * 0.2;
            zoneTimes[2] += duration * 0.7;
            zoneTimes[3] += duration * 0.1;
          } else if (avgZone === 3 || avgZone === 3.5) {
            // Tempo/Sweet Spot
            zoneTimes[2] += duration * 0.3;
            zoneTimes[3] += duration * 0.4;
            zoneTimes[4] += duration * 0.25;
            zoneTimes[5] += duration * 0.05;
          } else if (avgZone === 4) {
            // Threshold
            zoneTimes[2] += duration * 0.25;
            zoneTimes[3] += duration * 0.25;
            zoneTimes[4] += duration * 0.35;
            zoneTimes[5] += duration * 0.15;
          } else {
            // VO2max/Anaerobic
            zoneTimes[2] += duration * 0.3;
            zoneTimes[3] += duration * 0.15;
            zoneTimes[4] += duration * 0.2;
            zoneTimes[5] += duration * 0.25;
            zoneTimes[6] += duration * 0.1;
          }
        } else {
          // No power data - estimate based on ride characteristics
          const speed = activity.average_speed || 0;
          const elevation = activity.total_elevation_gain || 0;
          const distanceKm = (activity.distance || 0) / 1000;

          // Higher elevation/speed ratio = harder ride
          const intensityProxy = distanceKm > 0 ? elevation / distanceKm : 0;

          if (intensityProxy > 20) {
            // Hilly ride
            zoneTimes[2] += duration * 0.3;
            zoneTimes[3] += duration * 0.35;
            zoneTimes[4] += duration * 0.25;
            zoneTimes[5] += duration * 0.1;
          } else if (speed > 7) { // > 25 km/h
            // Fast flat ride
            zoneTimes[2] += duration * 0.4;
            zoneTimes[3] += duration * 0.35;
            zoneTimes[4] += duration * 0.2;
            zoneTimes[5] += duration * 0.05;
          } else {
            // Easy ride
            zoneTimes[1] += duration * 0.3;
            zoneTimes[2] += duration * 0.6;
            zoneTimes[3] += duration * 0.1;
          }
        }
      }
    });

    // Build chart data
    const zoneLabels = {
      1: 'Recovery',
      2: 'Endurance',
      3: 'Tempo',
      4: 'Threshold',
      5: 'VO2max',
      6: 'Anaerobic',
    };

    const zones = Object.entries(zoneTimes)
      .filter(([, time]) => time > 0)
      .map(([zone, time]) => ({
        zone: parseInt(zone),
        name: zoneLabels[zone],
        time: Math.round(time),
        percentage: totalTime > 0 ? Math.round((time / totalTime) * 100) : 0,
        hours: (time / 3600).toFixed(1),
        color: ZONE_COLORS[zone],
      }));

    // Calculate training distribution type
    const z2Pct = totalTime > 0 ? (zoneTimes[2] / totalTime) * 100 : 0;
    const highIntensityPct = totalTime > 0 ? ((zoneTimes[4] + zoneTimes[5] + zoneTimes[6]) / totalTime) * 100 : 0;

    let distributionType = { type: 'Unknown', color: 'gray', description: '' };

    if (z2Pct >= 75) {
      distributionType = {
        type: 'Polarized',
        color: 'green',
        description: '80/20 distribution - optimal for endurance building'
      };
    } else if (z2Pct >= 50 && highIntensityPct >= 20) {
      distributionType = {
        type: 'Pyramidal',
        color: 'blue',
        description: 'Good mix of endurance and intensity'
      };
    } else if (highIntensityPct >= 40) {
      distributionType = {
        type: 'High Intensity',
        color: 'red',
        description: 'Heavy intensity focus - watch for overtraining'
      };
    } else if (z2Pct >= 40) {
      distributionType = {
        type: 'Threshold',
        color: 'orange',
        description: 'Medium intensity focus - consider more Z2'
      };
    }

    return {
      zones,
      totalTime,
      distribution: distributionType,
      polarizedRatio: z2Pct,
      intensityRatio: highIntensityPct,
    };
  }, [activities, ftp, rangeFilter]);

  // Format time for display
  const formatTime = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  // Custom tooltip
  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload || payload.length === 0) return null;
    const data = payload[0].payload;

    return (
      <Card withBorder p="xs" style={{ backgroundColor: 'var(--tribos-bg-secondary)' }}>
        <Group gap="xs" mb="xs">
          <Box w={12} h={12} style={{ backgroundColor: data.color, borderRadius: 2 }} />
          <Text size="xs" fw={600} style={{ color: 'var(--tribos-text-primary)' }}>
            Zone {data.zone}: {data.name}
          </Text>
        </Group>
        <Text size="xs" style={{ color: 'var(--tribos-text-secondary)' }}>
          {formatTime(data.time)} ({data.percentage}%)
        </Text>
      </Card>
    );
  };

  if (!zoneData.zones || zoneData.zones.length === 0) {
    return (
      <Card withBorder p="xl">
        <Text style={{ color: 'var(--tribos-text-muted)' }} ta="center">
          No activity data available for zone analysis.
        </Text>
      </Card>
    );
  }

  return (
    <Card>
      <Group justify="space-between" mb="md" wrap="wrap">
        <Group gap="sm">
          <IconChartPie size={20} color={'var(--tribos-terracotta-500)'} />
          <Text size="sm" fw={600} style={{ color: 'var(--tribos-text-primary)' }}>
            Training Zone Distribution
          </Text>
          {zoneData.distribution.type !== 'Unknown' && (
            <Badge color={zoneData.distribution.color} variant="light" size="sm">
              {zoneData.distribution.type}
            </Badge>
          )}
        </Group>
        <Group gap="xs">
          <SegmentedControl
            size="xs"
            value={rangeFilter}
            onChange={setRangeFilter}
            data={[
              { label: '7d', value: '7' },
              { label: '30d', value: '30' },
              { label: '90d', value: '90' },
            ]}
          />
          <SegmentedControl
            size="xs"
            value={viewMode}
            onChange={setViewMode}
            data={[
              { label: 'Bar', value: 'bar' },
              { label: 'Pie', value: 'pie' },
            ]}
          />
        </Group>
      </Group>

      {/* Summary Stats */}
      <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="xs" mb="md">
        <Paper p="xs" style={{ backgroundColor: 'var(--tribos-bg-tertiary)' }}>
          <Group gap="xs">
            <IconClock size={14} color={'var(--tribos-text-muted)'} />
            <Text size="xs" c="dimmed">Total Time</Text>
          </Group>
          <Text size="sm" fw={600}>{formatTime(zoneData.totalTime)}</Text>
        </Paper>
        <Paper p="xs" style={{ backgroundColor: 'var(--tribos-bg-tertiary)' }}>
          <Group gap="xs">
            <Box w={8} h={8} style={{ backgroundColor: tokens.colors.zone2, borderRadius: '50%' }} />
            <Text size="xs" c="dimmed">Zone 2</Text>
          </Group>
          <Text size="sm" fw={600}>{Math.round(zoneData.polarizedRatio)}%</Text>
        </Paper>
        <Paper p="xs" style={{ backgroundColor: 'var(--tribos-bg-tertiary)' }}>
          <Group gap="xs">
            <IconFlame size={14} color={tokens.colors.zone5} />
            <Text size="xs" c="dimmed">High Intensity</Text>
          </Group>
          <Text size="sm" fw={600}>{Math.round(zoneData.intensityRatio)}%</Text>
        </Paper>
        <Paper p="xs" style={{ backgroundColor: 'var(--tribos-bg-tertiary)' }}>
          <Text size="xs" c="dimmed">Activities</Text>
          <Text size="sm" fw={600}>
            {activities?.filter(a => {
              const days = parseInt(rangeFilter);
              const cutoff = new Date();
              cutoff.setDate(cutoff.getDate() - days);
              return new Date(a.start_date) >= cutoff;
            }).length || 0}
          </Text>
        </Paper>
      </SimpleGrid>

      {/* Chart */}
      {viewMode === 'bar' ? (
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={zoneData.zones} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={'var(--tribos-bg-tertiary)'} />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 10, fill: 'var(--tribos-text-muted)' }}
              angle={-20}
              textAnchor="end"
              height={50}
            />
            <YAxis
              tick={{ fontSize: 11, fill: 'var(--tribos-text-muted)' }}
              label={{
                value: '%',
                angle: -90,
                position: 'insideLeft',
                style: { textAnchor: 'middle', fill: 'var(--tribos-text-muted)', fontSize: 11 }
              }}
            />
            <RechartsTooltip content={<CustomTooltip />} />
            <Bar dataKey="percentage" radius={[4, 4, 0, 0]}>
              {zoneData.zones.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie
              data={zoneData.zones}
              dataKey="percentage"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius={80}
              label={({ name, percentage }) => `${name}: ${percentage}%`}
              labelLine={{ stroke: 'var(--tribos-text-muted)' }}
            >
              {zoneData.zones.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <RechartsTooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>
      )}

      {/* Zone Breakdown */}
      <Stack gap="xs" mt="md">
        {zoneData.zones.map((zone) => (
          <Group key={zone.zone} gap="sm" align="center">
            <Badge
              w={25}
              h={25}
              p={0}
              style={{ backgroundColor: zone.color }}
              variant="filled"
            >
              <Text size="xs" fw={700}>{zone.zone}</Text>
            </Badge>
            <Box style={{ flex: 1 }}>
              <Group justify="space-between" mb={2}>
                <Text size="xs">{zone.name}</Text>
                <Text size="xs" c="dimmed">{zone.hours}h ({zone.percentage}%)</Text>
              </Group>
              <Progress
                value={zone.percentage}
                color={zone.color}
                size="xs"
                radius="xl"
              />
            </Box>
          </Group>
        ))}
      </Stack>

      {/* Training Distribution Insight */}
      {zoneData.distribution.type !== 'Unknown' && (
        <Paper p="xs" mt="md" style={{ backgroundColor: 'var(--tribos-bg-tertiary)' }}>
          <Text size="xs" style={{ color: 'var(--tribos-text-secondary)' }}>
            <Text span fw={600} c={zoneData.distribution.color}>
              {zoneData.distribution.type} Distribution:
            </Text>
            {' '}{zoneData.distribution.description}
          </Text>
        </Paper>
      )}

      <Text size="xs" style={{ color: 'var(--tribos-text-muted)' }} mt="md">
        Zone distribution estimated from average power/HR. 80/20 polarized training is optimal for most athletes.
      </Text>
    </Card>
  );
};

export default ZoneDistributionChart;
