import { useMemo, useState } from 'react';
import { Box, Card, Text, Group, Badge, SegmentedControl } from '@mantine/core';
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

    // Walk through ALL days with iterative EWA to compute CTL/ATL per day
    // Formula: CTL_today = CTL_yesterday + (TSS_today - CTL_yesterday) / 42
    //          ATL_today = ATL_yesterday + (TSS_today - ATL_yesterday) / 7
    let ctl = 0;
    let atl = 0;
    const allDays = data.map(d => {
      const prevCtl = ctl;
      const prevAtl = atl;
      ctl = ctl + (d.tss - ctl) / 42;
      atl = atl + (d.tss - atl) / 7;
      // TSB uses yesterday's CTL/ATL (freshness going into today)
      return { ...d, ctl: Math.round(ctl), atl: Math.round(atl), tsb: Math.round(prevCtl - prevAtl) };
    });

    // Filter to selected time range for display
    const days = parseInt(timeRange);
    const filtered = allDays.slice(-days);

    return filtered.map(d => ({
      ...d,
      formattedDate: new Date(d.date).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric'
      })
    }));
  }, [data, timeRange]);

  // Custom tooltip
  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload || payload.length === 0) return null;

    return (
      <Card withBorder p="xs" style={{ backgroundColor: 'var(--color-bg-secondary)' }}>
        <Text size="xs" fw={600} mb="xs" style={{ color: 'var(--color-text-primary)' }}>{label}</Text>
        {payload.map((entry, index) => (
          <Group key={index} justify="space-between" gap="md">
            <Text size="xs" style={{ color: entry.color }}>{entry.name}:</Text>
            <Text size="xs" fw={600} style={{ color: 'var(--color-text-primary)' }}>{entry.value}</Text>
          </Group>
        ))}
      </Card>
    );
  };

  if (!chartData || chartData.length === 0) {
    return (
      <Card withBorder p="xl">
        <Text style={{ color: 'var(--color-text-muted)' }} ta="center">
          No training data available. Import your rides to see your training load metrics.
        </Text>
      </Card>
    );
  }

  return (
    <Card>
      <Group justify="space-between" mb="md" wrap="wrap">
        <Text size="sm" fw={600} style={{ color: 'var(--color-text-primary)' }}>
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

      {/* Legend with plain-language sublabels */}
      <Group gap="md" mb="md">
        <Box>
          <Badge color="gold" variant="light" size="sm">CTL (Fitness)</Badge>
          <Text style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: '#7A7970', marginTop: 2 }}>
            Aerobic base — built over ~6 weeks
          </Text>
        </Box>
        <Box>
          <Badge color="coral" variant="light" size="sm">ATL (Fatigue)</Badge>
          <Text style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: '#7A7970', marginTop: 2 }}>
            Recent fatigue — last 7–10 days
          </Text>
        </Box>
        <Box>
          <Badge color="teal" variant="light" size="sm">TSB (Form)</Badge>
          <Text style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: '#7A7970', marginTop: 2 }}>
            Freshness — how ready you are today
          </Text>
        </Box>
      </Group>

      {/* Daily TSS Bar Chart */}
      <ResponsiveContainer width="100%" height={120}>
        <AreaChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={'var(--color-bg-secondary)'} />
          <XAxis
            dataKey="formattedDate"
            tick={{ fontSize: 12, fill: 'var(--color-text-muted)' }}
            interval="preserveStartEnd"
          />
          <YAxis tick={{ fontSize: 12, fill: 'var(--color-text-muted)' }} />
          <Tooltip content={<CustomTooltip />} />
          <Area
            type="monotone"
            dataKey="tss"
            stroke="#2A8C82"
            fill="#2A8C82"
            fillOpacity={0.3}
            name="Daily TSS"
          />
        </AreaChart>
      </ResponsiveContainer>

      <Text size="xs" style={{ color: 'var(--color-text-muted)' }} mb="lg" mt="xs">
        Daily Training Stress Score
      </Text>

      {/* CTL/ATL/TSB Line Chart */}
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={'var(--color-bg-secondary)'} />
          <XAxis
            dataKey="formattedDate"
            tick={{ fontSize: 12, fill: 'var(--color-text-muted)' }}
            interval="preserveStartEnd"
          />
          <YAxis tick={{ fontSize: 12, fill: 'var(--color-text-muted)' }} />
          <Tooltip content={<CustomTooltip />} />
          <Legend wrapperStyle={{ fontSize: 13 }} />

          {/* Reference line at TSB = 0 */}
          <ReferenceLine y={0} stroke={'var(--color-text-muted)'} strokeDasharray="3 3" />

          {/* CTL - Chronic Training Load (Fitness) */}
          <Line
            type="monotone"
            dataKey="ctl"
            stroke="#C49A0A"
            strokeWidth={2}
            dot={false}
            name="CTL (Fitness)"
          />

          {/* ATL - Acute Training Load (Fatigue) */}
          <Line
            type="monotone"
            dataKey="atl"
            stroke="#C43C2A"
            strokeWidth={2}
            dot={false}
            name="ATL (Fatigue)"
          />

          {/* TSB - Training Stress Balance (Form) */}
          <Line
            type="monotone"
            dataKey="tsb"
            stroke="#2A8C82"
            strokeWidth={2}
            dot={false}
            name="TSB (Form)"
          />
        </LineChart>
      </ResponsiveContainer>

      <Text style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: '#7A7970', marginTop: 6 }}>
        TSS = Today&apos;s training load | FTP = Your current threshold power
      </Text>
    </Card>
  );
};

export default TrainingLoadChart;
