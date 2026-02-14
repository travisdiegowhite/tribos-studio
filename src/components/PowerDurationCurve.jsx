import { useMemo, useState } from 'react';
import {
  Card,
  Text,
  Group,
  Badge,
  SegmentedControl,
  Stack,
  Box,
  SimpleGrid,
  Paper,
  Tooltip,
} from '@mantine/core';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { IconBolt, IconTrendingUp, IconTrophy } from '@tabler/icons-react';
import { tokens } from '../theme';

/**
 * Power Duration Curve Component
 * Displays best power outputs across all durations
 * Compares current period to previous periods
 */
const PowerDurationCurve = ({ activities, ftp, weight }) => {
  const [timeRange, setTimeRange] = useState('90'); // 42, 90, 365, all

  // Standard durations to track (in seconds)
  const STANDARD_DURATIONS = [
    { seconds: 5, label: '5s', name: 'Peak Sprint' },
    { seconds: 15, label: '15s', name: 'Sprint' },
    { seconds: 30, label: '30s', name: 'Anaerobic' },
    { seconds: 60, label: '1m', name: '1 Minute' },
    { seconds: 120, label: '2m', name: '2 Minutes' },
    { seconds: 300, label: '5m', name: '5 Minutes' },
    { seconds: 480, label: '8m', name: '8 Minutes' },
    { seconds: 600, label: '10m', name: '10 Minutes' },
    { seconds: 1200, label: '20m', name: '20 Minutes' },
    { seconds: 1800, label: '30m', name: '30 Minutes' },
    { seconds: 3600, label: '60m', name: '60 Minutes' },
    { seconds: 5400, label: '90m', name: '90 Minutes' },
    { seconds: 7200, label: '2h', name: '2 Hours' },
  ];

  // Calculate best efforts for each duration
  const powerCurveData = useMemo(() => {
    if (!activities || activities.length === 0) return { current: [], previous: [], bests: {} };

    // Filter by time range
    const days = timeRange === 'all' ? 9999 : parseInt(timeRange);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const previousCutoff = new Date();
    previousCutoff.setDate(previousCutoff.getDate() - (days * 2));

    // Filter activities with power data
    const currentActivities = activities.filter(a => {
      const actDate = new Date(a.start_date);
      return actDate >= cutoffDate && a.average_watts > 0;
    });

    const previousActivities = activities.filter(a => {
      const actDate = new Date(a.start_date);
      return actDate >= previousCutoff && actDate < cutoffDate && a.average_watts > 0;
    });

    // Calculate best power for each duration
    // Note: Without raw power stream data, we estimate from average power
    // This is a simplified version - with full power stream data, we'd calculate actual best efforts
    const calculateBestPowers = (activityList) => {
      const bests = {};

      STANDARD_DURATIONS.forEach(({ seconds }) => {
        bests[seconds] = 0;
      });

      activityList.forEach(activity => {
        const avgWatts = activity.average_watts || 0;
        const maxWatts = activity.max_watts || avgWatts * 1.5;
        const duration = activity.moving_time || 0;

        // Estimate power at different durations using power decay model
        // P(t) = CP + W' / t (simplified hyperbolic model)
        // We use the activity's avg and max to estimate
        STANDARD_DURATIONS.forEach(({ seconds }) => {
          if (duration >= seconds) {
            // Interpolate between max power (short) and avg power (long)
            const factor = Math.pow(seconds / duration, 0.07); // Decay factor
            const estimatedPower = avgWatts + (maxWatts - avgWatts) * Math.max(0, 1 - factor);

            if (estimatedPower > bests[seconds]) {
              bests[seconds] = Math.round(estimatedPower);
            }
          }
        });
      });

      return bests;
    };

    const currentBests = calculateBestPowers(currentActivities);
    const previousBests = calculateBestPowers(previousActivities);

    // Build chart data
    const chartData = STANDARD_DURATIONS.map(({ seconds, label, name }) => {
      const current = currentBests[seconds] || null;
      const previous = previousBests[seconds] || null;
      const improvement = current && previous ? current - previous : null;

      return {
        duration: label,
        durationSeconds: seconds,
        name,
        current,
        previous,
        improvement,
        currentWkg: current && weight ? (current / weight).toFixed(2) : null,
        previousWkg: previous && weight ? (previous / weight).toFixed(2) : null,
      };
    }).filter(d => d.current !== null || d.previous !== null);

    // Calculate key metrics
    const bests = {
      sprint5s: currentBests[5],
      sprint30s: currentBests[30],
      oneMin: currentBests[60],
      fiveMin: currentBests[300],
      twentyMin: currentBests[1200],
      sixtyMin: currentBests[3600],
    };

    return { current: chartData, bests };
  }, [activities, timeRange, weight]);

  // Determine rider type based on power profile
  const riderType = useMemo(() => {
    const { bests } = powerCurveData;
    if (!bests.fiveMin || !bests.oneMin) return null;

    const fiveToOneRatio = bests.fiveMin / bests.oneMin;
    const twentyToFiveRatio = bests.twentyMin ? bests.twentyMin / bests.fiveMin : 0;

    if (bests.sprint5s && bests.sprint5s / bests.fiveMin > 2.2) {
      return { type: 'Sprinter', color: 'pink', description: 'Explosive power specialist' };
    } else if (fiveToOneRatio < 0.75) {
      return { type: 'Pursuiter', color: 'orange', description: 'Strong in 3-5 minute efforts' };
    } else if (twentyToFiveRatio > 0.9) {
      return { type: 'Time Trialist', color: 'blue', description: 'Excellent sustained power' };
    } else if (bests.sixtyMin && bests.sixtyMin / bests.fiveMin > 0.8) {
      return { type: 'Climber', color: 'green', description: 'Strong endurance climber' };
    } else {
      return { type: 'All-Rounder', color: 'grape', description: 'Balanced power profile' };
    }
  }, [powerCurveData]);

  // Custom tooltip
  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload || payload.length === 0) return null;
    const data = payload[0].payload;

    return (
      <Card withBorder p="xs" style={{ backgroundColor: 'var(--tribos-bg-secondary)' }}>
        <Text size="xs" fw={600} mb="xs" style={{ color: 'var(--tribos-text-primary)' }}>
          {data.name}
        </Text>
        {data.current && (
          <Group justify="space-between" gap="md">
            <Text size="xs" c="yellow">Current:</Text>
            <Text size="xs" fw={600} style={{ color: 'var(--tribos-text-primary)' }}>
              {data.current}W {data.currentWkg && `(${data.currentWkg} W/kg)`}
            </Text>
          </Group>
        )}
        {data.previous && (
          <Group justify="space-between" gap="md">
            <Text size="xs" c="dimmed">Previous:</Text>
            <Text size="xs" c="dimmed">{data.previous}W</Text>
          </Group>
        )}
        {data.improvement !== null && data.improvement !== 0 && (
          <Group justify="space-between" gap="md">
            <Text size="xs" c={data.improvement > 0 ? 'green' : 'red'}>
              {data.improvement > 0 ? '+' : ''}{data.improvement}W
            </Text>
          </Group>
        )}
      </Card>
    );
  };

  if (!powerCurveData.current || powerCurveData.current.length === 0) {
    return (
      <Card withBorder p="xl">
        <Text style={{ color: 'var(--tribos-text-muted)' }} ta="center">
          No power data available. Connect a power meter to see your power duration curve.
        </Text>
      </Card>
    );
  }

  return (
    <Card>
      <Group justify="space-between" mb="md" wrap="wrap">
        <Group gap="sm">
          <IconBolt size={20} color={tokens.colors.zone4} />
          <Text size="sm" fw={600} style={{ color: 'var(--tribos-text-primary)' }}>
            Power Duration Curve
          </Text>
          {riderType && (
            <Badge color={riderType.color} variant="light" size="sm">
              {riderType.type}
            </Badge>
          )}
        </Group>
        <SegmentedControl
          size="xs"
          value={timeRange}
          onChange={setTimeRange}
          data={[
            { label: '42 days', value: '42' },
            { label: '90 days', value: '90' },
            { label: '1 year', value: '365' },
            { label: 'All time', value: 'all' },
          ]}
        />
      </Group>

      {/* Key Power Metrics */}
      <SimpleGrid cols={{ base: 3, sm: 6 }} spacing="xs" mb="md">
        <PowerMetricCard
          label="5s"
          value={powerCurveData.bests.sprint5s}
          weight={weight}
          color="pink"
        />
        <PowerMetricCard
          label="1m"
          value={powerCurveData.bests.oneMin}
          weight={weight}
          color="red"
        />
        <PowerMetricCard
          label="5m"
          value={powerCurveData.bests.fiveMin}
          weight={weight}
          color="orange"
        />
        <PowerMetricCard
          label="20m"
          value={powerCurveData.bests.twentyMin}
          weight={weight}
          ftp={ftp}
          color="yellow"
        />
        <PowerMetricCard
          label="60m"
          value={powerCurveData.bests.sixtyMin}
          weight={weight}
          color="green"
        />
        <PowerMetricCard
          label="FTP"
          value={ftp}
          weight={weight}
          color="blue"
          isFtp
        />
      </SimpleGrid>

      {/* Power Curve Chart */}
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={powerCurveData.current} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={'var(--tribos-bg-tertiary)'} />
          <XAxis
            dataKey="duration"
            tick={{ fontSize: 11, fill: 'var(--tribos-text-muted)' }}
          />
          <YAxis
            tick={{ fontSize: 11, fill: 'var(--tribos-text-muted)' }}
            label={{
              value: 'Watts',
              angle: -90,
              position: 'insideLeft',
              style: { textAnchor: 'middle', fill: 'var(--tribos-text-muted)', fontSize: 11 }
            }}
          />
          <RechartsTooltip content={<CustomTooltip />} />

          {/* FTP Reference Line */}
          {ftp && (
            <ReferenceLine
              y={ftp}
              stroke={tokens.colors.zone4}
              strokeDasharray="5 5"
              label={{
                value: `FTP: ${ftp}W`,
                position: 'right',
                fill: tokens.colors.zone4,
                fontSize: 10
              }}
            />
          )}

          {/* Previous period (dimmed) */}
          <Line
            type="monotone"
            dataKey="previous"
            stroke={'var(--tribos-text-muted)'}
            strokeWidth={1}
            strokeDasharray="3 3"
            dot={false}
            name="Previous"
          />

          {/* Current period */}
          <Line
            type="monotone"
            dataKey="current"
            stroke="#fbbf24"
            strokeWidth={2}
            dot={{ fill: '#fbbf24', r: 3 }}
            activeDot={{ r: 5, fill: '#fbbf24' }}
            name="Current"
          />
        </LineChart>
      </ResponsiveContainer>

      {/* Rider type description */}
      {riderType && (
        <Paper p="xs" mt="md" style={{ backgroundColor: 'var(--tribos-bg-tertiary)' }}>
          <Group gap="xs">
            <IconTrophy size={16} color={'var(--tribos-terracotta-500)'} />
            <Text size="xs" style={{ color: 'var(--tribos-text-secondary)' }}>
              <Text span fw={600} c={riderType.color}>{riderType.type}</Text>
              {' - '}{riderType.description}
            </Text>
          </Group>
        </Paper>
      )}

      <Text size="xs" style={{ color: 'var(--tribos-text-muted)' }} mt="md">
        Power curve shows best efforts at each duration. Dashed line shows previous period for comparison.
      </Text>
    </Card>
  );
};

// Power metric card component
function PowerMetricCard({ label, value, weight, ftp, color, isFtp }) {
  if (!value) {
    return (
      <Paper p="xs" ta="center" style={{ backgroundColor: 'var(--tribos-bg-tertiary)' }}>
        <Text size="xs" c="dimmed">{label}</Text>
        <Text size="sm" fw={600} c="dimmed">--</Text>
      </Paper>
    );
  }

  const wkg = weight ? (value / weight).toFixed(2) : null;
  const ftpPercentage = ftp && !isFtp ? Math.round((value / ftp) * 100) : null;

  return (
    <Tooltip
      label={
        <Stack gap={2}>
          <Text size="xs">{value}W</Text>
          {wkg && <Text size="xs">{wkg} W/kg</Text>}
          {ftpPercentage && <Text size="xs">{ftpPercentage}% of FTP</Text>}
        </Stack>
      }
    >
      <Paper p="xs" ta="center" style={{ backgroundColor: 'var(--tribos-bg-tertiary)' }}>
        <Text size="xs" c="dimmed">{label}</Text>
        <Text size="sm" fw={700} c={color}>{value}W</Text>
        {wkg && <Text size="xs" c="dimmed">{wkg}</Text>}
      </Paper>
    </Tooltip>
  );
}

export default PowerDurationCurve;
