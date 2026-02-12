import { useMemo } from 'react';
import {
  Text,
  Group,
  Badge,
  Box,
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
  ReferenceLine,
  Cell,
} from 'recharts';
import { IconBolt, IconTrendingUp } from '@tabler/icons-react';
import { tokens } from '../theme';

/**
 * Standard durations for the power curve display
 * Keys match the power_curve_summary JSONB format from FIT parser
 */
const DURATION_CONFIG = [
  { key: '1s', seconds: 1, label: '1s', name: 'Peak' },
  { key: '5s', seconds: 5, label: '5s', name: 'Sprint' },
  { key: '10s', seconds: 10, label: '10s', name: '10 Sec' },
  { key: '30s', seconds: 30, label: '30s', name: 'Anaerobic' },
  { key: '60s', seconds: 60, label: '1m', name: '1 Minute' },
  { key: '120s', seconds: 120, label: '2m', name: '2 Minutes' },
  { key: '300s', seconds: 300, label: '5m', name: 'VO2max' },
  { key: '600s', seconds: 600, label: '10m', name: '10 Minutes' },
  { key: '1200s', seconds: 1200, label: '20m', name: 'Threshold' },
  { key: '1800s', seconds: 1800, label: '30m', name: '30 Minutes' },
  { key: '3600s', seconds: 3600, label: '60m', name: 'Endurance' },
];

/**
 * Color gradient from sprint (hot) to endurance (cool)
 */
function getBarColor(seconds) {
  if (seconds <= 10) return tokens.colors.zone7;   // pink - sprint
  if (seconds <= 30) return tokens.colors.zone5;    // red - anaerobic
  if (seconds <= 60) return tokens.colors.zone4;    // orange - VO2max
  if (seconds <= 300) return tokens.colors.zone3;   // yellow - tempo
  if (seconds <= 1200) return tokens.colors.zone2;  // green - threshold
  return tokens.colors.zone1;                       // blue - endurance
}

/**
 * ActivityPowerCurve Component
 * Shows the Mean Maximal Power (MMP) curve for a single activity
 * Uses actual power_curve_summary data from FIT file parsing
 */
const ActivityPowerCurve = ({ powerCurveSummary, ftp, weight }) => {
  const chartData = useMemo(() => {
    if (!powerCurveSummary || typeof powerCurveSummary !== 'object') return [];

    return DURATION_CONFIG
      .filter(d => powerCurveSummary[d.key] && powerCurveSummary[d.key] > 0)
      .map(d => ({
        duration: d.label,
        durationSeconds: d.seconds,
        name: d.name,
        watts: Math.round(powerCurveSummary[d.key]),
        wkg: weight ? (powerCurveSummary[d.key] / weight).toFixed(2) : null,
        ftpPercent: ftp ? Math.round((powerCurveSummary[d.key] / ftp) * 100) : null,
        color: getBarColor(d.seconds),
      }));
  }, [powerCurveSummary, ftp, weight]);

  // Key best efforts for the summary cards
  const bestEfforts = useMemo(() => {
    if (!powerCurveSummary) return [];

    const highlights = [
      { key: '5s', label: '5s Peak', icon: 'sprint' },
      { key: '60s', label: '1min', icon: 'anaerobic' },
      { key: '300s', label: '5min', icon: 'vo2max' },
      { key: '1200s', label: '20min', icon: 'threshold' },
    ];

    return highlights
      .filter(h => powerCurveSummary[h.key] && powerCurveSummary[h.key] > 0)
      .map(h => ({
        ...h,
        watts: Math.round(powerCurveSummary[h.key]),
        wkg: weight ? (powerCurveSummary[h.key] / weight).toFixed(1) : null,
        ftpPercent: ftp ? Math.round((powerCurveSummary[h.key] / ftp) * 100) : null,
      }));
  }, [powerCurveSummary, ftp, weight]);

  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload || payload.length === 0) return null;
    const data = payload[0].payload;

    return (
      <Paper
        p="xs"
        withBorder
        style={{ backgroundColor: 'var(--tribos-bg-secondary)' }}
      >
        <Text size="xs" fw={600} style={{ color: 'var(--tribos-text-primary)' }}>
          {data.name} ({data.duration})
        </Text>
        <Text size="sm" fw={700} style={{ color: data.color }}>
          {data.watts}W
        </Text>
        {data.wkg && (
          <Text size="xs" c="dimmed">{data.wkg} W/kg</Text>
        )}
        {data.ftpPercent && (
          <Text size="xs" c="dimmed">{data.ftpPercent}% of FTP</Text>
        )}
      </Paper>
    );
  };

  if (chartData.length === 0) return null;

  return (
    <Box>
      {/* Best Efforts Summary */}
      {bestEfforts.length > 0 && (
        <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="xs" mb="sm">
          {bestEfforts.map(effort => (
            <Paper
              key={effort.key}
              p="xs"
              ta="center"
              style={{ backgroundColor: 'var(--tribos-bg-tertiary)' }}
            >
              <Text size="xs" c="dimmed">{effort.label}</Text>
              <Text size="sm" fw={700} c="yellow.4">
                {effort.watts}W
              </Text>
              {effort.wkg && (
                <Text size="xs" c="dimmed">{effort.wkg} W/kg</Text>
              )}
            </Paper>
          ))}
        </SimpleGrid>
      )}

      {/* Power Curve Bar Chart */}
      <ResponsiveContainer width="100%" height={200}>
        <BarChart
          data={chartData}
          margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="var(--tribos-bg-tertiary)"
            vertical={false}
          />
          <XAxis
            dataKey="duration"
            tick={{ fontSize: 10, fill: 'var(--tribos-text-muted)' }}
            axisLine={{ stroke: 'var(--tribos-bg-tertiary)' }}
          />
          <YAxis
            tick={{ fontSize: 10, fill: 'var(--tribos-text-muted)' }}
            axisLine={{ stroke: 'var(--tribos-bg-tertiary)' }}
            width={45}
            label={{
              value: 'W',
              angle: -90,
              position: 'insideLeft',
              style: { textAnchor: 'middle', fill: 'var(--tribos-text-muted)', fontSize: 10 },
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
                value: `FTP ${ftp}W`,
                position: 'right',
                fill: tokens.colors.zone4,
                fontSize: 9,
              }}
            />
          )}

          <Bar dataKey="watts" radius={[3, 3, 0, 0]} maxBarSize={40}>
            {chartData.map((entry, index) => (
              <Cell key={index} fill={entry.color} fillOpacity={0.85} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      <Text size="xs" c="dimmed" mt={4}>
        Mean Maximal Power at each duration — from power meter data
      </Text>
    </Box>
  );
};

export default ActivityPowerCurve;
