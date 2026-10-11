import { useMemo, useState } from 'react';
import { Text, Group, SegmentedControl, SimpleGrid, Stack, Tooltip, Box, UnstyledButton } from '@mantine/core';
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
import { SubHeading, kicker, mono, tooltipStyle, useChartColors } from './train/progressUi.jsx';
import { Heart, Heartbeat, Moon, Speedometer } from '@phosphor-icons/react';

// Metric configuration
const METRICS = {
  sleep: {
    key: 'sleep_hours',
    label: 'Sleep',
    unit: 'hrs',
    color: 'bar', // chart key (progressUi CHART): cyan
    icon: Moon,
    domain: [0, 12],
    goodRange: [7, 9],
  },
  hrv: {
    key: 'hrv',
    label: 'HRV (heart-rate variability)',
    unit: 'ms',
    color: 'fitness', // ink
    icon: Heartbeat,
    domain: [0, 'auto'],
    description: 'Higher is better',
  },
  rhr: {
    key: 'resting_hr',
    label: 'Resting HR',
    unit: 'bpm',
    color: 'fatigue', // magenta
    icon: Heart,
    domain: [40, 100],
    description: 'Lower is better (when fit)',
  },
  readiness: {
    key: 'readiness',
    label: 'Readiness',
    unit: '%',
    color: 'future', // grey
    icon: Speedometer,
    domain: [0, 100],
  },
};

/**
 * Health Trends Chart Component
 * Displays sleep, HRV, resting HR, and readiness score trends over time
 */
const HealthTrendsChart = ({ data, onOpenCheckIn }) => {
  const [timeRange, setTimeRange] = useState('30');
  const CHART = useChartColors();
  const col = (metric) => CHART[metric.color];
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
      <Box style={tooltipStyle} p={8}>
        <Group justify="space-between" mb="xs">
          <Text size="xs" fw={600} style={{ color: 'var(--color-text-primary)' }}>{label}</Text>
          {isGarmin && (
            <Text style={{ ...mono, fontSize: 10, color: 'var(--color-text-muted)' }}>GARMIN</Text>
          )}
        </Group>
        {payload.map((entry, index) => (
          <Group key={index} justify="space-between" gap="md">
            <Text size="xs" style={{ color: 'var(--color-text-secondary)' }}>{entry.name}</Text>
            <Text size="xs" fw={700} style={{ ...mono, color: 'var(--color-text-primary)' }}>
              {entry.value != null ? `${entry.value}${METRICS[Object.keys(METRICS).find(k => METRICS[k].label === entry.name)]?.unit || ''}` : '—'}
            </Text>
          </Group>
        ))}
      </Box>
    );
  };

  // Empty state
  if (!chartData || chartData.length === 0) {
    return (
      <Box>
        <SubHeading>Health</SubHeading>
        <Stack gap="xs" align="flex-start">
          <Text size="sm" style={{ color: 'var(--color-text-secondary)' }}>
            No health data recorded yet.
          </Text>
          <Text size="sm" style={{ color: 'var(--color-text-muted)' }}>
            Use the Body Check-in to log your daily health metrics, or connect Garmin for automatic sync.
          </Text>
          {onOpenCheckIn && (
            <UnstyledButton onClick={onOpenCheckIn} style={{ fontWeight: 700, textDecoration: 'underline', fontSize: 14 }}>
              Open body check-in
            </UnstyledButton>
          )}
        </Stack>
      </Box>
    );
  }

  return (
    <Box>
      <SubHeading
        aside={
        <SegmentedControl
          size="xs"
          radius={0}
          styles={{ label: { fontFamily: 'var(--font-mono)' } }}
          value={timeRange}
          onChange={setTimeRange}
          data={[
            { label: '7d', value: '7' },
            { label: '30d', value: '30' },
            { label: '90d', value: '90' },
          ]}
        />
        }
      >
        Health
        {stats && stats.garminPercent > 0 && (
          <Tooltip label={`${stats.garminDays} of ${stats.totalDays} days from Garmin`}>
            <Text component="span" style={{ ...mono, fontSize: 11, fontWeight: 400, color: 'var(--color-text-muted)', marginLeft: 8, textTransform: 'none' }}>
              {stats.garminPercent}% Garmin
            </Text>
          </Tooltip>
        )}
      </SubHeading>

      {/* Metric toggles */}
      <Group gap="xs" mb="md">
        {Object.entries(METRICS).map(([key, metric]) => {
          const Icon = metric.icon;
          const isActive = activeMetrics.includes(key);
          return (
            <UnstyledButton
              key={key}
              onClick={() => toggleMetric(key)}
              aria-pressed={isActive}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '3px 8px',
                border: `1px solid ${isActive ? 'var(--color-ink)' : 'var(--color-border)'}`,
                color: isActive ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              <Box style={{ width: 12, borderTop: `2px ${metric.color === 'future' ? 'dashed' : 'solid'} ${isActive ? col(metric) : 'var(--color-border)'}` }} />
              <Icon size={12} />
              {metric.label}
            </UnstyledButton>
          );
        })}
      </Group>

      {/* Summary stats */}
      {stats && (
        <SimpleGrid cols={{ base: 2, sm: 4 }} mb="md">
          {activeMetrics.includes('sleep') && stats.avgSleep && (
            <Box p="xs" style={{ borderTop: '1px solid var(--color-border)' }}>
              <Text style={kicker}>Avg Sleep</Text>
              <Text style={{ ...mono, fontSize: 20, fontWeight: 700, color: 'var(--color-text-primary)' }}>
                {stats.avgSleep} <Text span size="xs" style={{ color: 'var(--color-text-muted)' }}>hrs</Text>
              </Text>
            </Box>
          )}
          {activeMetrics.includes('hrv') && stats.avgHrv && (
            <Box p="xs" style={{ borderTop: '1px solid var(--color-border)' }}>
              <Text style={kicker}>Avg HRV</Text>
              <Text style={{ ...mono, fontSize: 20, fontWeight: 700, color: 'var(--color-text-primary)' }}>
                {stats.avgHrv} <Text span size="xs" style={{ color: 'var(--color-text-muted)' }}>ms</Text>
              </Text>
            </Box>
          )}
          {activeMetrics.includes('rhr') && stats.avgRhr && (
            <Box p="xs" style={{ borderTop: '1px solid var(--color-border)' }}>
              <Text style={kicker}>Avg Resting HR</Text>
              <Text style={{ ...mono, fontSize: 20, fontWeight: 700, color: 'var(--color-text-primary)' }}>
                {stats.avgRhr} <Text span size="xs" style={{ color: 'var(--color-text-muted)' }}>bpm</Text>
              </Text>
            </Box>
          )}
          {activeMetrics.includes('readiness') && stats.latestReadiness && (
            <Box p="xs" style={{ borderTop: '1px solid var(--color-border)' }}>
              <Text style={kicker}>Latest Readiness</Text>
              <Text style={{ ...mono, fontSize: 20, fontWeight: 700, color: 'var(--color-text-primary)' }}>
                {Math.round(stats.latestReadiness)} <Text span size="xs" style={{ color: 'var(--color-text-muted)' }}>%</Text>
              </Text>
            </Box>
          )}
        </SimpleGrid>
      )}

      {/* Main chart */}
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
          <XAxis
            dataKey="formattedDate"
            tick={{ fontSize: 11, fill: CHART.axis, fontFamily: 'var(--font-mono)' }}
            interval="preserveStartEnd" minTickGap={28}
          />
          <YAxis
            yAxisId="left"
            tick={{ fontSize: 11, fill: CHART.axis, fontFamily: 'var(--font-mono)' }}
            domain={[0, 'auto']}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            tick={{ fontSize: 11, fill: CHART.axis, fontFamily: 'var(--font-mono)' }}
            domain={[0, 100]}
          />
          <RechartsTooltip content={<CustomTooltip />} />

          {/* Reference line for good sleep range */}
          {activeMetrics.includes('sleep') && (
            <>
              <ReferenceLine yAxisId="left" y={7} stroke={col(METRICS.sleep)} strokeDasharray="3 3" strokeOpacity={0.3} />
              <ReferenceLine yAxisId="left" y={9} stroke={col(METRICS.sleep)} strokeDasharray="3 3" strokeOpacity={0.3} />
            </>
          )}

          {activeMetrics.includes('sleep') && (
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="sleep_hours"
              stroke={col(METRICS.sleep)}
              strokeWidth={2}
              dot={{ fill: col(METRICS.sleep), strokeWidth: 0, r: 3 }}
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
              stroke={col(METRICS.hrv)}
              strokeWidth={2}
              dot={{ fill: col(METRICS.hrv), strokeWidth: 0, r: 3 }}
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
              stroke={col(METRICS.rhr)}
              strokeWidth={2}
              dot={{ fill: col(METRICS.rhr), strokeWidth: 0, r: 3 }}
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
              stroke={col(METRICS.readiness)}
              strokeWidth={2}
              strokeDasharray="5 4"
              dot={{ fill: col(METRICS.readiness), strokeWidth: 0, r: 3 }}
              activeDot={{ r: 5 }}
              name="Readiness"
              connectNulls
            />
          )}
        </LineChart>
      </ResponsiveContainer>

      <Text size="xs" style={{ color: 'var(--color-text-muted)' }} mt="xs">
        Sleep reference lines show optimal 7-9 hour range. Readiness uses right axis (0-100%).
      </Text>
    </Box>
  );
};

export default HealthTrendsChart;
