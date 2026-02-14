import { useMemo, useState } from 'react';
import { Card, Text, Group, Badge, SegmentedControl, SimpleGrid, Stack, Tooltip, Box } from '@mantine/core';
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
import { IconActivity, IconMoon, IconHeart, IconBrandSpeedtest } from '@tabler/icons-react';
import { tokens } from '../theme';

// Metric configuration
const METRICS = {
  sleep: {
    key: 'sleep_hours',
    label: 'Sleep',
    unit: 'hrs',
    color: '#B8CDD9',
    icon: IconMoon,
    domain: [0, 12],
    goodRange: [7, 9],
  },
  hrv: {
    key: 'hrv',
    label: 'HRV',
    unit: 'ms',
    color: '#A8BFA8',
    icon: IconActivity,
    domain: [0, 'auto'],
    description: 'Higher is better',
  },
  rhr: {
    key: 'resting_hr',
    label: 'Resting HR',
    unit: 'bpm',
    color: '#D4A843',
    icon: IconHeart,
    domain: [40, 100],
    description: 'Lower is better (when fit)',
  },
  readiness: {
    key: 'readiness',
    label: 'Readiness',
    unit: '%',
    color: '#C4A0B9',
    icon: IconBrandSpeedtest,
    domain: [0, 100],
  },
};

/**
 * Health Trends Chart Component
 * Displays sleep, HRV, resting HR, and readiness score trends over time
 */
const HealthTrendsChart = ({ data, onOpenCheckIn }) => {
  const [timeRange, setTimeRange] = useState('30');
  const [activeMetrics, setActiveMetrics] = useState(['sleep', 'hrv', 'readiness']);

  // Process data for chart
  const chartData = useMemo(() => {
    if (!data || data.length === 0) return [];

    const days = parseInt(timeRange);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    return data
      .filter(d => new Date(d.metric_date || d.recorded_date) >= cutoffDate)
      .map(d => ({
        date: d.metric_date || d.recorded_date,
        formattedDate: new Date(d.metric_date || d.recorded_date).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
        }),
        sleep_hours: d.sleep_hours,
        hrv: d.hrv_ms || d.hrv_score,
        resting_hr: d.resting_hr || d.resting_heart_rate,
        readiness: d.readiness_score,
        energy: d.energy_level,
        stress: d.stress_level,
        source: d.source || 'manual',
      }))
      .sort((a, b) => new Date(a.date) - new Date(b.date));
  }, [data, timeRange]);

  // Calculate summary statistics
  const stats = useMemo(() => {
    if (chartData.length === 0) return null;

    const validData = (key) => chartData.filter(d => d[key] != null).map(d => d[key]);
    const avg = (arr) => arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1) : null;
    const latest = (key) => {
      const valid = chartData.filter(d => d[key] != null);
      return valid.length ? valid[valid.length - 1][key] : null;
    };

    const garminDays = chartData.filter(d => d.source === 'garmin').length;
    const totalDays = chartData.length;

    return {
      avgSleep: avg(validData('sleep_hours')),
      avgHrv: avg(validData('hrv')),
      avgRhr: avg(validData('resting_hr')),
      avgReadiness: avg(validData('readiness')),
      latestReadiness: latest('readiness'),
      garminPercent: totalDays > 0 ? Math.round((garminDays / totalDays) * 100) : 0,
      totalDays,
      garminDays,
    };
  }, [chartData]);

  // Toggle metric visibility
  const toggleMetric = (metric) => {
    setActiveMetrics(prev =>
      prev.includes(metric)
        ? prev.filter(m => m !== metric)
        : [...prev, metric]
    );
  };

  // Custom tooltip
  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload || payload.length === 0) return null;

    const dataPoint = payload[0]?.payload;
    const isGarmin = dataPoint?.source === 'garmin';

    return (
      <Card withBorder p="xs" style={{ backgroundColor: 'var(--tribos-bg-secondary)' }}>
        <Group justify="space-between" mb="xs">
          <Text size="xs" fw={600} style={{ color: 'var(--tribos-text-primary)' }}>{label}</Text>
          {isGarmin && (
            <Badge size="xs" variant="light" color="blue">Garmin</Badge>
          )}
        </Group>
        {payload.map((entry, index) => (
          <Group key={index} justify="space-between" gap="md">
            <Text size="xs" style={{ color: entry.color }}>{entry.name}:</Text>
            <Text size="xs" fw={600} style={{ color: 'var(--tribos-text-primary)' }}>
              {entry.value != null ? `${entry.value}${METRICS[Object.keys(METRICS).find(k => METRICS[k].label === entry.name)]?.unit || ''}` : '—'}
            </Text>
          </Group>
        ))}
      </Card>
    );
  };

  // Empty state
  if (!chartData || chartData.length === 0) {
    return (
      <Card withBorder p="xl">
        <Stack align="center" gap="md">
          <IconActivity size={48} style={{ color: 'var(--tribos-text-muted)' }} />
          <Text style={{ color: 'var(--tribos-text-muted)' }} ta="center">
            No health data recorded yet.
          </Text>
          <Text size="sm" style={{ color: 'var(--tribos-text-muted)' }} ta="center">
            Use the Body Check-in to log your daily health metrics, or connect Garmin for automatic sync.
          </Text>
          {onOpenCheckIn && (
            <Badge
              size="lg"
              variant="light"
              color="terracotta"
              style={{ cursor: 'pointer' }}
              onClick={onOpenCheckIn}
            >
              Open Body Check-in
            </Badge>
          )}
        </Stack>
      </Card>
    );
  }

  return (
    <Card>
      <Group justify="space-between" mb="md" wrap="wrap">
        <Group gap="xs">
          <Text size="sm" fw={600} style={{ color: 'var(--tribos-text-primary)' }}>
            Health Trends
          </Text>
          {stats && stats.garminPercent > 0 && (
            <Tooltip label={`${stats.garminDays} of ${stats.totalDays} days from Garmin`}>
              <Badge size="xs" variant="light" color="blue">
                {stats.garminPercent}% Garmin
              </Badge>
            </Tooltip>
          )}
        </Group>
        <SegmentedControl
          size="xs"
          value={timeRange}
          onChange={setTimeRange}
          data={[
            { label: '7d', value: '7' },
            { label: '30d', value: '30' },
            { label: '90d', value: '90' },
          ]}
        />
      </Group>

      {/* Metric toggles */}
      <Group gap="xs" mb="md">
        {Object.entries(METRICS).map(([key, metric]) => {
          const Icon = metric.icon;
          const isActive = activeMetrics.includes(key);
          return (
            <Badge
              key={key}
              leftSection={<Icon size={12} />}
              variant={isActive ? 'light' : 'outline'}
              color={isActive ? undefined : 'gray'}
              size="sm"
              style={{
                cursor: 'pointer',
                backgroundColor: isActive ? `${metric.color}20` : undefined,
                color: isActive ? metric.color : 'var(--tribos-text-muted)',
                borderColor: isActive ? metric.color : undefined,
              }}
              onClick={() => toggleMetric(key)}
            >
              {metric.label}
            </Badge>
          );
        })}
      </Group>

      {/* Summary stats */}
      {stats && (
        <SimpleGrid cols={{ base: 2, sm: 4 }} mb="md">
          {activeMetrics.includes('sleep') && stats.avgSleep && (
            <Box p="xs" style={{ borderRadius: tokens.radius.md, backgroundColor: 'var(--tribos-bg-tertiary)' }}>
              <Text size="xs" style={{ color: 'var(--tribos-text-muted)' }}>Avg Sleep</Text>
              <Text size="lg" fw={600} style={{ color: METRICS.sleep.color }}>
                {stats.avgSleep} <Text span size="xs" style={{ color: 'var(--tribos-text-muted)' }}>hrs</Text>
              </Text>
            </Box>
          )}
          {activeMetrics.includes('hrv') && stats.avgHrv && (
            <Box p="xs" style={{ borderRadius: tokens.radius.md, backgroundColor: 'var(--tribos-bg-tertiary)' }}>
              <Text size="xs" style={{ color: 'var(--tribos-text-muted)' }}>Avg HRV</Text>
              <Text size="lg" fw={600} style={{ color: METRICS.hrv.color }}>
                {stats.avgHrv} <Text span size="xs" style={{ color: 'var(--tribos-text-muted)' }}>ms</Text>
              </Text>
            </Box>
          )}
          {activeMetrics.includes('rhr') && stats.avgRhr && (
            <Box p="xs" style={{ borderRadius: tokens.radius.md, backgroundColor: 'var(--tribos-bg-tertiary)' }}>
              <Text size="xs" style={{ color: 'var(--tribos-text-muted)' }}>Avg Resting HR</Text>
              <Text size="lg" fw={600} style={{ color: METRICS.rhr.color }}>
                {stats.avgRhr} <Text span size="xs" style={{ color: 'var(--tribos-text-muted)' }}>bpm</Text>
              </Text>
            </Box>
          )}
          {activeMetrics.includes('readiness') && stats.latestReadiness && (
            <Box p="xs" style={{ borderRadius: tokens.radius.md, backgroundColor: 'var(--tribos-bg-tertiary)' }}>
              <Text size="xs" style={{ color: 'var(--tribos-text-muted)' }}>Latest Readiness</Text>
              <Text size="lg" fw={600} style={{ color: METRICS.readiness.color }}>
                {Math.round(stats.latestReadiness)} <Text span size="xs" style={{ color: 'var(--tribos-text-muted)' }}>%</Text>
              </Text>
            </Box>
          )}
        </SimpleGrid>
      )}

      {/* Main chart */}
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={'var(--tribos-bg-tertiary)'} />
          <XAxis
            dataKey="formattedDate"
            tick={{ fontSize: 11, fill: 'var(--tribos-text-muted)' }}
            interval="preserveStartEnd"
          />
          <YAxis
            yAxisId="left"
            tick={{ fontSize: 11, fill: 'var(--tribos-text-muted)' }}
            domain={[0, 'auto']}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            tick={{ fontSize: 11, fill: 'var(--tribos-text-muted)' }}
            domain={[0, 100]}
          />
          <RechartsTooltip content={<CustomTooltip />} />

          {/* Reference line for good sleep range */}
          {activeMetrics.includes('sleep') && (
            <>
              <ReferenceLine yAxisId="left" y={7} stroke={METRICS.sleep.color} strokeDasharray="3 3" strokeOpacity={0.3} />
              <ReferenceLine yAxisId="left" y={9} stroke={METRICS.sleep.color} strokeDasharray="3 3" strokeOpacity={0.3} />
            </>
          )}

          {activeMetrics.includes('sleep') && (
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="sleep_hours"
              stroke={METRICS.sleep.color}
              strokeWidth={2}
              dot={{ fill: METRICS.sleep.color, strokeWidth: 0, r: 3 }}
              activeDot={{ r: 5 }}
              name="Sleep"
              connectNulls
            />
          )}

          {activeMetrics.includes('hrv') && (
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="hrv"
              stroke={METRICS.hrv.color}
              strokeWidth={2}
              dot={{ fill: METRICS.hrv.color, strokeWidth: 0, r: 3 }}
              activeDot={{ r: 5 }}
              name="HRV"
              connectNulls
            />
          )}

          {activeMetrics.includes('rhr') && (
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="resting_hr"
              stroke={METRICS.rhr.color}
              strokeWidth={2}
              dot={{ fill: METRICS.rhr.color, strokeWidth: 0, r: 3 }}
              activeDot={{ r: 5 }}
              name="Resting HR"
              connectNulls
            />
          )}

          {activeMetrics.includes('readiness') && (
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="readiness"
              stroke={METRICS.readiness.color}
              strokeWidth={2}
              dot={{ fill: METRICS.readiness.color, strokeWidth: 0, r: 3 }}
              activeDot={{ r: 5 }}
              name="Readiness"
              connectNulls
            />
          )}
        </LineChart>
      </ResponsiveContainer>

      <Text size="xs" style={{ color: 'var(--tribos-text-muted)' }} mt="xs">
        Sleep reference lines show optimal 7-9 hour range. Readiness uses right axis (0-100%).
      </Text>
    </Card>
  );
};

export default HealthTrendsChart;
