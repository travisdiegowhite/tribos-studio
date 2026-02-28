import { useMemo } from 'react';
import { Text, Group, Badge, Paper, SimpleGrid, Stack } from '@mantine/core';
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
import { tokens } from '../theme';

const QUARTER_LABELS = ['Q1 (0-25%)', 'Q2 (25-50%)', 'Q3 (50-75%)', 'Q4 (75-100%)'];

/**
 * Get strategy display info
 */
function getStrategyInfo(strategy) {
  switch (strategy) {
    case 'negative_split':
      return { label: 'Negative Split', color: 'teal', description: 'Got stronger' };
    case 'even_split':
      return { label: 'Even Split', color: 'green', description: 'Steady effort' };
    case 'positive_split':
      return { label: 'Positive Split', color: 'orange', description: 'Faded slightly' };
    case 'positive_split_heavy':
      return { label: 'Heavy Fade', color: 'red', description: 'Significant power drop' };
    default:
      return { label: strategy || 'Unknown', color: 'gray', description: '' };
  }
}

/**
 * Get bar color based on quarter power relative to average
 */
function getBarColor(watts, avgWatts) {
  if (!avgWatts) return tokens.colors.zone3;
  const pct = watts / avgWatts;
  if (pct >= 1.05) return tokens.colors.zone1; // Above average — strong
  if (pct >= 0.97) return tokens.colors.zone2; // Near average — steady
  if (pct >= 0.90) return tokens.colors.zone3; // Slightly below — fading
  return tokens.colors.zone4; // Well below — significant fade
}

/**
 * Custom tooltip
 */
const PacingTooltip = ({ active, payload }) => {
  if (!active || !payload || payload.length === 0) return null;
  const data = payload[0]?.payload;
  if (!data) return null;

  return (
    <Paper p="xs" withBorder style={{ backgroundColor: 'var(--tribos-bg-secondary)' }}>
      <Text size="xs" fw={600}>{data.label}</Text>
      <Text size="xs">{Math.round(data.watts)} W</Text>
    </Paper>
  );
};

/**
 * RidePacingChart — Quarter-by-quarter pacing analysis
 */
const RidePacingChart = ({ activity, ftp }) => {
  const pacingData = activity?.ride_analytics?.pacing;

  const chartData = useMemo(() => {
    if (!pacingData?.quarter_avgs && !pacingData?.quarter_avg_watts) return null;

    const quarters = pacingData.quarter_avg_watts || pacingData.quarter_avgs;
    if (!Array.isArray(quarters) || quarters.length < 4) return null;

    const avgWatts = quarters.reduce((a, b) => a + b, 0) / quarters.length;

    return quarters.slice(0, 4).map((watts, i) => ({
      label: QUARTER_LABELS[i],
      watts: Math.round(watts),
      avgWatts,
    }));
  }, [pacingData]);

  if (!chartData) return null;

  const strategy = getStrategyInfo(pacingData?.strategy);
  const splitRatio = pacingData?.split_ratio;
  const powerFade = pacingData?.power_fade_percent;
  const avgWatts = chartData[0]?.avgWatts;

  return (
    <Stack gap="xs">
      <SimpleGrid cols={{ base: 2, sm: 3 }} spacing="xs">
        <Paper p="xs" style={{ backgroundColor: 'var(--tribos-bg-tertiary)' }}>
          <Text size="xs" style={{ color: 'var(--tribos-text-muted)' }}>Strategy</Text>
          <Group gap={4}>
            <Badge size="sm" color={strategy.color} variant="light">
              {strategy.label}
            </Badge>
          </Group>
        </Paper>
        {splitRatio != null && (
          <Paper p="xs" style={{ backgroundColor: 'var(--tribos-bg-tertiary)' }}>
            <Text size="xs" style={{ color: 'var(--tribos-text-muted)' }}>Split Ratio</Text>
            <Text size="sm" fw={600}>{splitRatio.toFixed(2)}</Text>
            <Text size="xs" style={{ color: 'var(--tribos-text-muted)' }}>
              {splitRatio < 1 ? '2nd half harder' : splitRatio > 1 ? '1st half harder' : 'Even'}
            </Text>
          </Paper>
        )}
        {powerFade != null && (
          <Paper p="xs" style={{ backgroundColor: 'var(--tribos-bg-tertiary)' }}>
            <Text size="xs" style={{ color: 'var(--tribos-text-muted)' }}>Power Fade</Text>
            <Text size="sm" fw={600} style={{ color: powerFade > 10 ? tokens.colors.zone4 : 'inherit' }}>
              {powerFade > 0 ? `-${Math.round(powerFade)}%` : `+${Math.abs(Math.round(powerFade))}%`}
            </Text>
          </Paper>
        )}
      </SimpleGrid>

      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--tribos-bg-tertiary)" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: 'var(--tribos-text-muted)' }}
          />
          <YAxis
            tick={{ fontSize: 11, fill: 'var(--tribos-text-muted)' }}
            width={45}
            domain={['dataMin - 20', 'auto']}
          />
          <RechartsTooltip content={<PacingTooltip />} />

          {ftp && (
            <ReferenceLine
              y={ftp}
              stroke={tokens.colors.zone4}
              strokeDasharray="4 4"
              label={{
                value: `FTP ${ftp}W`,
                position: 'right',
                style: { fontSize: 10, fill: tokens.colors.zone4 },
              }}
            />
          )}

          <Bar dataKey="watts" radius={[2, 2, 0, 0]} isAnimationActive={false}>
            {chartData.map((entry, index) => (
              <Cell key={index} fill={getBarColor(entry.watts, avgWatts)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Stack>
  );
};

export default RidePacingChart;
