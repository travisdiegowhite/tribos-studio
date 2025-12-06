import { useMemo, useState } from 'react';
import { Card, Text, Group, Badge, SegmentedControl } from '@mantine/core';
import {
  LineChart,
  Line,
  Area,
  AreaChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { tokens } from '../theme';

/**
 * Training Load Chart Component
 * Displays CTL, ATL, TSB, and daily TSS over time
 */
const TrainingLoadChart = ({ data }) => {
  const [timeRange, setTimeRange] = useState('30'); // 7, 30, or 90 days

  // Process data for chart
  const chartData = useMemo(() => {
    if (!data || data.length === 0) return [];

    // Filter data based on selected time range
    const days = parseInt(timeRange);
    const filteredData = data.slice(-days);

    // Calculate rolling CTL and ATL for each day
    const processed = [];

    for (let i = 0; i < filteredData.length; i++) {
      // Use full data for accurate CTL calculation, but only show filtered range
      const dataIndex = data.length - filteredData.length + i;
      const dailyTSSValues = data.slice(0, dataIndex + 1).map(d => d.tss);

      // CTL: 42-day exponentially weighted average
      const ctlDecay = 1 / 42;
      let ctl = 0;
      dailyTSSValues.forEach((tss, index) => {
        const weight = Math.exp(-ctlDecay * (dailyTSSValues.length - index - 1));
        ctl += tss * weight;
      });
      ctl = Math.round(ctl * ctlDecay);

      // ATL: 7-day exponentially weighted average
      const recentTSS = dailyTSSValues.slice(-7);
      const atlDecay = 1 / 7;
      let atl = 0;
      recentTSS.forEach((tss, index) => {
        const weight = Math.exp(-atlDecay * (recentTSS.length - index - 1));
        atl += tss * weight;
      });
      atl = Math.round(atl * atlDecay);

      // TSB: CTL - ATL
      const tsb = ctl - atl;

      processed.push({
        date: filteredData[i].date,
        tss: filteredData[i].tss,
        ctl,
        atl,
        tsb,
        formattedDate: new Date(filteredData[i].date).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric'
        })
      });
    }

    return processed;
  }, [data, timeRange]);

  // Custom tooltip
  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload || payload.length === 0) return null;

    return (
      <Card withBorder p="xs" style={{ backgroundColor: tokens.colors.bgSecondary }}>
        <Text size="xs" fw={600} mb="xs" style={{ color: tokens.colors.textPrimary }}>{label}</Text>
        {payload.map((entry, index) => (
          <Group key={index} justify="space-between" gap="md">
            <Text size="xs" style={{ color: entry.color }}>{entry.name}:</Text>
            <Text size="xs" fw={600} style={{ color: tokens.colors.textPrimary }}>{entry.value}</Text>
          </Group>
        ))}
      </Card>
    );
  };

  if (!chartData || chartData.length === 0) {
    return (
      <Card withBorder p="xl">
        <Text style={{ color: tokens.colors.textMuted }} ta="center">
          No training data available. Import your rides to see your training load metrics.
        </Text>
      </Card>
    );
  }

  return (
    <Card>
      <Group justify="space-between" mb="md" wrap="wrap">
        <Text size="sm" fw={600} style={{ color: tokens.colors.textPrimary }}>
          Training Load Over Time
        </Text>
        <Group gap="xs">
          <SegmentedControl
            size="xs"
            value={timeRange}
            onChange={setTimeRange}
            data={[
              { label: '7 days', value: '7' },
              { label: '30 days', value: '30' },
              { label: '90 days', value: '90' }
            ]}
          />
        </Group>
      </Group>

      {/* Legend */}
      <Group gap="xs" mb="md">
        <Badge color="blue" variant="light" size="sm">CTL (Fitness)</Badge>
        <Badge color="orange" variant="light" size="sm">ATL (Fatigue)</Badge>
        <Badge color="green" variant="light" size="sm">TSB (Form)</Badge>
      </Group>

      {/* Daily TSS Bar Chart */}
      <ResponsiveContainer width="100%" height={120}>
        <AreaChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={tokens.colors.bgTertiary} />
          <XAxis
            dataKey="formattedDate"
            tick={{ fontSize: 11, fill: tokens.colors.textMuted }}
            interval="preserveStartEnd"
          />
          <YAxis tick={{ fontSize: 11, fill: tokens.colors.textMuted }} />
          <Tooltip content={<CustomTooltip />} />
          <Area
            type="monotone"
            dataKey="tss"
            stroke="#60a5fa"
            fill="#60a5fa"
            fillOpacity={0.3}
            name="Daily TSS"
          />
        </AreaChart>
      </ResponsiveContainer>

      <Text size="xs" style={{ color: tokens.colors.textMuted }} mb="lg" mt="xs">
        Daily Training Stress Score
      </Text>

      {/* CTL/ATL/TSB Line Chart */}
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={tokens.colors.bgTertiary} />
          <XAxis
            dataKey="formattedDate"
            tick={{ fontSize: 11, fill: tokens.colors.textMuted }}
            interval="preserveStartEnd"
          />
          <YAxis tick={{ fontSize: 11, fill: tokens.colors.textMuted }} />
          <Tooltip content={<CustomTooltip />} />
          <Legend wrapperStyle={{ fontSize: 12 }} />

          {/* Reference line at TSB = 0 */}
          <ReferenceLine y={0} stroke={tokens.colors.textMuted} strokeDasharray="3 3" />

          {/* CTL - Chronic Training Load (Fitness) */}
          <Line
            type="monotone"
            dataKey="ctl"
            stroke="#3b82f6"
            strokeWidth={2}
            dot={false}
            name="CTL (Fitness)"
          />

          {/* ATL - Acute Training Load (Fatigue) */}
          <Line
            type="monotone"
            dataKey="atl"
            stroke="#f59e0b"
            strokeWidth={2}
            dot={false}
            name="ATL (Fatigue)"
          />

          {/* TSB - Training Stress Balance (Form) */}
          <Line
            type="monotone"
            dataKey="tsb"
            stroke="#22c55e"
            strokeWidth={2}
            dot={false}
            name="TSB (Form)"
          />
        </LineChart>
      </ResponsiveContainer>

      <Text size="xs" style={{ color: tokens.colors.textMuted }} mt="xs">
        CTL = Long-term fitness (42-day) | ATL = Recent fatigue (7-day) | TSB = Freshness/Form (CTL - ATL)
      </Text>
    </Card>
  );
};

export default TrainingLoadChart;
