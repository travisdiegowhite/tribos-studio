import { useMemo, useState } from 'react';
import { Box, Text, Group, SegmentedControl } from '@mantine/core';
import {
  LineChart,
  Line,
  Area,
  AreaChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { mono, tooltipStyle, useChartColors } from './train/progressUi.jsx';

/**
 * Training Load Chart Component
 * Displays TFI (fitness), AFI (fatigue), FS (form), and daily RSS over time
 */
const TrainingLoadChart = ({ data }) => {
  const [timeRange, setTimeRange] = useState('30'); // 7, 30, or 90 days
  const CHART = useChartColors();

  // Process data for chart
  const chartData = useMemo(() => {
    if (!data || data.length === 0) return [];

    // Prefer per-point ctl/atl/tsb when the caller provides them (Training-
    // Dashboard passes the server-preferred series from buildDailyLoadSeries,
    // so the chart plots the same numbers as the page header). Fall back to
    // the iterative client EWA for plain {date, tss} inputs:
    //   CTL_today = CTL_yesterday + (TSS_today - CTL_yesterday) / 42
    //   ATL_today = ATL_yesterday + (TSS_today - ATL_yesterday) / 7
    let ctl = 0;
    let atl = 0;
    const allDays = data.map(d => {
      const prevCtl = ctl;
      const prevAtl = atl;
      if (d.ctl != null && d.atl != null) {
        ctl = d.ctl;
        atl = d.atl;
      } else {
        ctl = ctl + (d.tss - ctl) / 42;
        atl = atl + (d.tss - atl) / 7;
      }
      // TSB uses yesterday's CTL/ATL (freshness going into today)
      const tsb = d.tsb != null ? Math.round(d.tsb) : Math.round(prevCtl - prevAtl);
      return { ...d, ctl: Math.round(ctl), atl: Math.round(atl), tsb };
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

  // Custom tooltip: flat, ruled, numbers in Courier
  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload || payload.length === 0) return null;

    return (
      <Box style={tooltipStyle} p={8}>
        <Text size="xs" fw={700} mb={4} style={{ color: 'var(--color-text-primary)' }}>{label}</Text>
        {payload.map((entry, index) => (
          <Group key={index} justify="space-between" gap="md" wrap="nowrap">
            <Text size="xs" style={{ color: 'var(--color-text-secondary)' }}>{entry.name}</Text>
            <Text size="xs" fw={700} style={{ ...mono, color: 'var(--color-text-primary)' }}>{entry.value}</Text>
          </Group>
        ))}
      </Box>
    );
  };

  if (!chartData || chartData.length === 0) {
    return (
      <Box style={{ borderTop: '1px solid var(--color-border)', padding: '16px 0' }}>
        <Text style={{ color: 'var(--color-text-muted)' }}>
          No training data available. Import your rides to see your training load metrics.
        </Text>
      </Box>
    );
  }

  const axisTick = { fontSize: 11, fill: CHART.axis, fontFamily: 'var(--font-mono)' };
  const LINES = [
    { key: 'ctl', name: 'Fitness (TFI)', color: CHART.fitness, note: 'Aerobic base — built over ~6 weeks' },
    { key: 'atl', name: 'Fatigue (AFI)', color: CHART.fatigue, note: 'Recent fatigue — last 7–10 days' },
    { key: 'tsb', name: 'Form (FS)', color: CHART.form, dash: '5 4', note: 'Freshness — how ready you are today' },
  ];

  return (
    <Box>
      <Group justify="space-between" mb="sm" wrap="wrap" gap="xs">
        {/* Legend with plain-language sublabels */}
        <Group gap="lg" wrap="wrap">
          {LINES.map((l) => (
            <Box key={l.key}>
              <Group gap={6} wrap="nowrap">
                <Box style={{ width: 18, borderTop: `2px ${l.dash ? 'dashed' : 'solid'} ${l.color}` }} />
                <Text size="xs" fw={700} style={{ color: 'var(--color-text-primary)' }}>{l.name}</Text>
              </Group>
              <Text style={{ ...mono, fontSize: 10, color: 'var(--color-text-muted)', marginTop: 2 }}>{l.note}</Text>
            </Box>
          ))}
        </Group>
        <SegmentedControl
          size="xs"
          radius={0}
          value={timeRange}
          onChange={setTimeRange}
          data={[
            { label: '7D', value: '7' },
            { label: '30D', value: '30' },
            { label: '90D', value: '90' }
          ]}
          styles={{ label: { fontFamily: 'var(--font-mono)' } }}
        />
      </Group>

      {/* Daily RSS */}
      <ResponsiveContainer width="100%" height={110}>
        <AreaChart data={chartData} margin={{ top: 5, right: 12, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
          <XAxis dataKey="formattedDate" tick={axisTick} interval="preserveStartEnd" minTickGap={28} stroke={CHART.baseline} />
          <YAxis tick={axisTick} stroke={CHART.baseline} width={36} />
          <Tooltip content={<CustomTooltip />} />
          <Area type="monotone" dataKey="tss" stroke={CHART.bar} fill={CHART.bar} fillOpacity={0.35} name="Daily RSS" />
        </AreaChart>
      </ResponsiveContainer>
      <Text size="xs" style={{ color: 'var(--color-text-muted)' }} mb="md" mt={4}>
        Daily ride stress (RSS)
      </Text>

      {/* Fitness / fatigue / form */}
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={chartData} margin={{ top: 5, right: 12, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
          <XAxis dataKey="formattedDate" tick={axisTick} interval="preserveStartEnd" minTickGap={28} stroke={CHART.baseline} />
          <YAxis tick={axisTick} stroke={CHART.baseline} width={36} />
          <Tooltip content={<CustomTooltip />} />
          {/* Form = 0: fresh above, tired below */}
          <ReferenceLine y={0} stroke={CHART.baseline} />
          {LINES.map((l) => (
            <Line
              key={l.key}
              type="monotone"
              dataKey={l.key}
              stroke={l.color}
              strokeWidth={2}
              strokeDasharray={l.dash}
              dot={false}
              name={l.name}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>

      <Text style={{ ...mono, fontSize: 10, color: 'var(--color-text-muted)', marginTop: 6 }}>
        RSS = daily ride stress · FTP = your current threshold power
      </Text>
    </Box>
  );
};

export default TrainingLoadChart;
