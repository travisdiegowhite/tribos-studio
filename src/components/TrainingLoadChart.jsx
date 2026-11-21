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
 *
 * Optional, for the coach chat:
 *   fixedRange — plot every row given (the caller chose the dates) and hide
 *                the 7D/30D/90D toggle.
 *   onDayClick — called with the clicked row's `date` (YYYY-MM-DD).
 */
const TrainingLoadChart = ({
  data,
  fixedRange = false,
  onDayClick = /** @type {((date: string) => void) | null} */ (null),
  // Projection from the planned calendar: [{ date, ctl, atl, tsb, load }]
  // (src/lib/training/session/forecast.ts). Drawn dashed after today.
  forecast = null,
  // [{ date, label }] — races to mark on the time axis.
  markers = null,
  // [{ date, tfi_cycling, tfi_running }] — per-sport fitness (migration 133).
  sportSeries = null,
}) => {
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
    const filtered = fixedRange ? allDays : allDays.slice(-days);

    // Per-sport fitness, when both sports carry some: one line each.
    const bySport = new Map((sportSeries || []).map((r) => [String(r.date).slice(0, 10), r]));
    const withSport = filtered.map((d) => {
      const sp = bySport.get(String(d.date).slice(0, 10));
      return sp
        ? { ...d, rideCtl: sp.tfi_cycling != null ? Math.round(Number(sp.tfi_cycling)) : undefined, runCtl: sp.tfi_running != null ? Math.round(Number(sp.tfi_running)) : undefined }
        : d;
    });

    // The projection on the current plan, joined to today so the dashed lines
    // continue the solid ones. Horizon follows the range: 2 weeks on 7D, 6 on
    // the longer views.
    let rows = withSport;
    if (!fixedRange && forecast && forecast.length > 0 && rows.length > 0) {
      const horizon = timeRange === '7' ? 14 : 42;
      const last = rows[rows.length - 1];
      rows = [
        ...rows.slice(0, -1),
        { ...last, ctlF: last.ctl, atlF: last.atl, tsbF: last.tsb },
        ...forecast.slice(0, horizon).map((f) => ({
          date: f.date,
          ctlF: Math.round(f.ctl),
          atlF: Math.round(f.atl),
          tsbF: Math.round(f.tsb),
          plannedTss: f.load > 0 ? Math.round(f.load) : 0,
          projected: true,
        })),
      ];
    }

    return rows.map(d => ({
      ...d,
      formattedDate: new Date(`${String(d.date).slice(0, 10)}T12:00:00`).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric'
      })
    }));
  }, [data, timeRange, fixedRange, forecast, sportSeries]);

  const hasForecast = chartData.some((d) => d.projected);
  const hasSportLines = chartData.some((d) => d.rideCtl > 0) && chartData.some((d) => d.runCtl > 0);
  const markerRows = (markers || [])
    .map((m) => ({ ...m, row: chartData.find((d) => String(d.date).slice(0, 10) === String(m.date).slice(0, 10)) }))
    .filter((m) => m.row);

  // Custom tooltip: flat, ruled, numbers in Courier
  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload || payload.length === 0) return null;

    return (
      <Box style={tooltipStyle} p={8}>
        <Text size="xs" fw={700} mb={4} style={{ color: 'var(--color-text-primary)' }}>{label}</Text>
        {payload.filter((entry) => entry.value != null).map((entry, index) => (
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
          No training data available. Import your rides and runs to see your training load.
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
  // The sports' shares of fitness: thin and neutral so they read as detail
  // under the combined line, told apart by dash rather than another hue.
  const SPORT_LINES = [
    { key: 'rideCtl', name: 'Ride fitness', color: CHART.axis, dash: undefined },
    { key: 'runCtl', name: 'Run fitness', color: CHART.axis, dash: '6 2 1 2' },
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
          {hasSportLines && SPORT_LINES.map((l) => (
            <Box key={l.key}>
              <Group gap={6} wrap="nowrap">
                <Box style={{ width: 18, borderTop: `1px ${l.dash ? 'dashed' : 'solid'} ${l.color}` }} />
                <Text size="xs" fw={700} style={{ color: 'var(--color-text-primary)' }}>{l.name}</Text>
              </Group>
              <Text style={{ ...mono, fontSize: 10, color: 'var(--color-text-muted)', marginTop: 2 }}>Its share of fitness</Text>
            </Box>
          ))}
          {hasForecast && (
            <Box data-testid="forecast-legend">
              <Group gap={6} wrap="nowrap">
                <Box style={{ width: 18, borderTop: `2px dotted ${CHART.future}` }} />
                <Text size="xs" fw={700} style={{ color: 'var(--color-text-primary)' }}>Projected</Text>
              </Group>
              <Text style={{ ...mono, fontSize: 10, color: 'var(--color-text-muted)', marginTop: 2 }}>If you train as planned</Text>
            </Box>
          )}
        </Group>
        {!fixedRange && <SegmentedControl
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
        />}
      </Group>

      {/* Daily RSS */}
      <ResponsiveContainer width="100%" height={110}>
        <AreaChart data={chartData} margin={{ top: 5, right: 12, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
          <XAxis dataKey="formattedDate" tick={axisTick} interval="preserveStartEnd" minTickGap={28} stroke={CHART.baseline} />
          <YAxis tick={axisTick} stroke={CHART.baseline} width={36} />
          <Tooltip content={<CustomTooltip />} />
          <Area type="monotone" dataKey="tss" stroke={CHART.bar} fill={CHART.bar} fillOpacity={0.35} name="Daily RSS" />
          {hasForecast && (
            <Area type="stepAfter" dataKey="plannedTss" stroke={CHART.future} strokeDasharray="2 3" fill={CHART.future} fillOpacity={0.12} name="Planned RSS" />
          )}
          {markerRows.map((m) => (
            <ReferenceLine key={`a-${m.date}`} x={m.row.formattedDate} stroke={CHART.future} strokeDasharray="2 2" />
          ))}
        </AreaChart>
      </ResponsiveContainer>
      <Text size="xs" style={{ color: 'var(--color-text-muted)' }} mb="md" mt={4}>
        Daily stress (RSS)
      </Text>

      {/* Fitness / fatigue / form */}
      <ResponsiveContainer width="100%" height={220}>
        <LineChart
          data={chartData}
          margin={{ top: 5, right: 12, left: 0, bottom: 5 }}
          onClick={onDayClick ? (e) => {
            const date = e?.activePayload?.[0]?.payload?.date;
            if (date) onDayClick(String(date).slice(0, 10));
          } : undefined}
          style={onDayClick ? { cursor: 'pointer' } : undefined}
        >
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
          {hasForecast && LINES.map((l) => (
            <Line
              key={`${l.key}F`}
              type="monotone"
              dataKey={`${l.key}F`}
              stroke={l.color}
              strokeOpacity={0.6}
              strokeWidth={2}
              strokeDasharray="2 3"
              dot={false}
              name={`${l.name} · projected`}
              connectNulls
            />
          ))}
          {hasSportLines && SPORT_LINES.map((l) => (
            <Line
              key={l.key}
              type="monotone"
              dataKey={l.key}
              stroke={l.color}
              strokeWidth={1}
              strokeDasharray={l.dash}
              dot={false}
              name={l.name}
            />
          ))}
          {markerRows.map((m) => (
            <ReferenceLine
              key={`l-${m.date}`}
              x={m.row.formattedDate}
              stroke={CHART.future}
              strokeDasharray="2 2"
              label={{ value: m.label, position: 'insideTopRight', fill: CHART.axis, fontSize: 10, fontFamily: 'var(--font-mono)' }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>

      <Text style={{ ...mono, fontSize: 10, color: 'var(--color-text-muted)', marginTop: 6 }}>
        RSS = daily training stress · rides score from power, runs from pace or heart rate
      </Text>
    </Box>
  );
};

export default TrainingLoadChart;
