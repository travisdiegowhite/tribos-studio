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
 * Bar color relative to the ride average — semantic, theme-aware:
 * above average = teal (strong), near = gold (steady), below = coral
 * (light coral for a slight fade, full coral for a heavy fade).
 */
function getBarStyle(watts, avgWatts) {
  if (!avgWatts) return { fill: 'var(--color-gold)', fillOpacity: 0.85 };
  const pct = watts / avgWatts;
  if (pct >= 1.05) return { fill: 'var(--color-teal)', fillOpacity: 0.85 };
  if (pct >= 0.97) return { fill: 'var(--color-gold)', fillOpacity: 0.85 };
  if (pct >= 0.90) return { fill: 'var(--color-coral)', fillOpacity: 0.5 };
  return { fill: 'var(--color-coral)', fillOpacity: 0.85 };
}

/**
 * Describe a quarter's effort relative to the ride average
 */
function describeVsAverage(pctOfAvg) {
  if (pctOfAvg >= 105) return 'above average — strong';
  if (pctOfAvg >= 97) return 'near average — steady';
  if (pctOfAvg >= 90) return 'below average — fading';
  return 'well below average — heavy fade';
}

/**
 * Custom tooltip
 */
const PacingTooltip = ({ active, payload }) => {
  if (!active || !payload || payload.length === 0) return null;
  const data = payload[0]?.payload;
  if (!data) return null;

  const pctOfAvg = data.avgWatts ? Math.round((data.watts / data.avgWatts) * 100) : null;

  return (
    <Paper p="xs" withBorder style={{ backgroundColor: 'var(--color-bg-secondary)' }}>
      <Text size="xs" fw={600}>{data.label}</Text>
      <Text size="xs" ff="monospace">{Math.round(data.watts)} W</Text>
      {pctOfAvg != null && (
        <>
          <Text size="xs" ff="monospace" c="dimmed">{pctOfAvg}% of ride avg</Text>
          <Text size="xs" c="dimmed">{describeVsAverage(pctOfAvg)}</Text>
        </>
      )}
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
        <Paper p="xs" style={{ backgroundColor: 'var(--color-bg-secondary)' }}>
          <Text size="xs" style={{ color: 'var(--color-text-muted)' }}>Strategy</Text>
          <Group gap={4}>
            <Badge size="sm" color={strategy.color} variant="light">
              {strategy.label}
            </Badge>
          </Group>
        </Paper>
        {splitRatio != null && (
          <Paper p="xs" style={{ backgroundColor: 'var(--color-bg-secondary)' }}>
            <Text size="xs" style={{ color: 'var(--color-text-muted)' }}>Split Ratio</Text>
            <Text size="sm" fw={600}>{splitRatio.toFixed(2)}</Text>
            <Text size="xs" style={{ color: 'var(--color-text-muted)' }}>
              {splitRatio < 1 ? '2nd half harder' : splitRatio > 1 ? '1st half harder' : 'Even'}
            </Text>
          </Paper>
        )}
        {powerFade != null && (
          <Paper p="xs" style={{ backgroundColor: 'var(--color-bg-secondary)' }}>
            <Text size="xs" style={{ color: 'var(--color-text-muted)' }}>Power Fade</Text>
            <Text size="sm" fw={600} style={{ color: powerFade > 10 ? 'var(--color-coral)' : 'inherit' }}>
              {powerFade > 0 ? `-${Math.round(powerFade)}%` : `+${Math.abs(Math.round(powerFade))}%`}
            </Text>
          </Paper>
        )}
      </SimpleGrid>

      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-bg-secondary)" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }}
          />
          <YAxis
            tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }}
            width={50}
            domain={['dataMin - 20', 'auto']}
            label={{
              value: 'Watts',
              angle: -90,
              position: 'insideLeft',
              style: { textAnchor: 'middle', fill: 'var(--color-text-muted)', fontSize: 11 },
            }}
          />
          <RechartsTooltip content={<PacingTooltip />} cursor={{ fill: 'var(--color-teal-subtle)' }} />

          {avgWatts > 0 && (
            <ReferenceLine
              y={avgWatts}
              stroke="var(--color-text-muted)"
              strokeDasharray="4 4"
              label={{
                value: `avg ${Math.round(avgWatts)}W`,
                position: 'insideBottomRight',
                style: { fontSize: 10, fill: 'var(--color-text-muted)' },
              }}
            />
          )}

          {ftp && (
            <ReferenceLine
              y={ftp}
              stroke="var(--color-orange)"
              strokeDasharray="4 4"
              ifOverflow="extendDomain"
              label={{
                value: `FTP ${ftp}W`,
                position: 'insideTopRight',
                style: { fontSize: 10, fill: 'var(--color-orange)' },
              }}
            />
          )}

          <Bar dataKey="watts" radius={0} isAnimationActive={false}>
            {chartData.map((entry, index) => (
              <Cell key={index} {...getBarStyle(entry.watts, avgWatts)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      <Text size="xs" c="dimmed">
        Bar color compares each quarter to the ride average — teal above, gold near, coral fading
      </Text>
    </Stack>
  );
};

export default RidePacingChart;
