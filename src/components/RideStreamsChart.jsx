import { useMemo, useState } from 'react';
import { Paper, Text, Group, Chip, Stack, Box, Button } from '@mantine/core';
import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ReferenceArea,
  ResponsiveContainer,
} from 'recharts';
import {
  buildStreamRows,
  downsampleRows,
  smoothRows,
  smoothingWindowForCount,
  niceTicks,
  formatElapsed,
} from '../utils/streamChartData';
import { isRunningActivity } from '../utils/sportType';
import { formatPaceClock, paceForUnits } from '../utils/paceFormat';

const KM_PER_MILE = 1.609344;

const TARGET_POINTS = 400;

// Colors are CSS vars (dark-mode overrides in global.css); chipColor is the
// matching Mantine palette name from theme.js.
const METRIC_CONFIG = {
  // Power is teal (not the theme's "effort" orange): orange sits too close
  // to the coral heart-rate line — the default pairing — for comfortable
  // separation (ΔE 8.7 vs 26 for teal/coral, worse under deuteranopia).
  power: {
    label: 'Power',
    unit: 'W',
    dataKey: 'power',
    color: 'var(--color-teal)',
    chipColor: 'teal',
    yAxisId: 'power',
    decimals: 0,
  },
  heartRate: {
    label: 'Heart Rate',
    unit: 'bpm',
    dataKey: 'heartRate',
    color: 'var(--color-coral)',
    chipColor: 'coral',
    yAxisId: 'hr',
    decimals: 0,
  },
  speed: {
    label: 'Speed',
    unit: 'km/h',
    dataKey: 'speed_kmh',
    color: 'var(--color-orange)',
    chipColor: 'orange',
    yAxisId: 'speed',
    decimals: 1,
  },
  cadence: {
    label: 'Cadence',
    unit: 'rpm',
    dataKey: 'cadence',
    color: 'var(--color-gold)',
    chipColor: 'gold',
    yAxisId: 'cadence',
    decimals: 0,
  },
};

/**
 * Run metrics (multisport phase 4): pace replaces speed — a runner reads
 * min/km, not km/h — and cadence is steps per minute. The pace axis is
 * reversed so faster plots higher, like speed did.
 */
function runMetricConfig(isImperial) {
  const unit = isImperial ? '/mi' : '/km';
  return {
    pace: {
      label: 'Pace',
      unit,
      dataKey: 'pace_s_per_km',
      color: 'var(--color-orange)',
      chipColor: 'orange',
      yAxisId: 'pace',
      decimals: 0,
      reversed: true,
      format: (v) => `${formatPaceClock(paceForUnits(v, isImperial))}${unit}`,
      tick: (v) => formatPaceClock(paceForUnits(v, isImperial)),
    },
    heartRate: METRIC_CONFIG.heartRate,
    cadence: { ...METRIC_CONFIG.cadence, unit: 'spm' },
    power: METRIC_CONFIG.power,
  };
}

/** 2nd–98th percentile of a series, so a stop or a GPS spike can't flatten the pace line. */
function percentileDomain(values) {
  const sorted = values.filter((v) => v != null && Number.isFinite(v)).sort((a, b) => a - b);
  if (sorted.length === 0) return ['auto', 'auto'];
  const at = (q) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))))];
  const lo = at(0.02);
  const hi = at(0.98);
  const pad = Math.max(5, (hi - lo) * 0.05);
  return [Math.max(0, lo - pad), hi + pad];
}

function formatMetricValue(config, value) {
  if (value == null) return '—';
  return config.format ? config.format(value) : `${value.toFixed(config.decimals)} ${config.unit}`;
}

const ELEVATION_CONFIG = {
  label: 'Elevation',
  unit: 'm',
  dataKey: 'elevation_m',
  color: 'var(--color-text-muted)',
  yAxisId: 'elev',
  decimals: 0,
};

// Metrics eligible for the visible left axis, in priority order
const LEFT_AXIS_PRIORITY = ['power', 'pace', 'speed', 'cadence'];

function xAxisLabel(xMode, isImperial) {
  if (xMode === 'distance_km') return isImperial ? 'Distance (mi)' : 'Distance (km)';
  return xMode === 'time_s' ? 'Time' : 'Sample';
}

/** Row x is always km; imperial only changes what the label says. */
function formatXValue(value, xMode, isImperial = false) {
  if (xMode === 'time_s') return formatElapsed(value);
  if (xMode === 'distance_km') {
    const shown = isImperial ? value / KM_PER_MILE : value;
    const rounded = Math.round(shown * 10) / 10;
    return Number.isInteger(rounded) ? `${rounded}` : rounded.toFixed(1);
  }
  return `${Math.round(value)}`;
}

function formatTooltipHeader(value, xMode, isImperial = false) {
  if (xMode === 'time_s') return formatElapsed(value);
  if (xMode === 'distance_km') {
    return isImperial ? `${(value / KM_PER_MILE).toFixed(1)} mi` : `${value.toFixed(1)} km`;
  }
  return `Sample ${Math.round(value)}`;
}

const StreamsTooltip = ({ active, payload, label, activeMetrics, metricConfig, xMode, isImperial, hasElevation }) => {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0]?.payload;
  if (!row) return null;

  const entries = activeMetrics.map((metric) => ({ key: metric, config: metricConfig[metric] }));
  if (hasElevation) entries.push({ key: 'elevation', config: ELEVATION_CONFIG });

  return (
    <Paper withBorder p="xs" style={{ backgroundColor: 'var(--color-bg-secondary)', minWidth: 150 }}>
      <Text size="xs" fw={600} mb={4}>
        {typeof label === 'number' ? formatTooltipHeader(label, xMode, isImperial) : label}
      </Text>
      {entries.map(({ key, config }) => {
        const value = row[config.dataKey];
        return (
          <Group key={key} justify="space-between" gap="md" wrap="nowrap">
            <Group gap={6} wrap="nowrap">
              <Box w={8} h={8} style={{ backgroundColor: config.color, flexShrink: 0 }} />
              <Text size="xs" c="var(--color-text-muted)">
                {config.label}
              </Text>
            </Group>
            <Text size="xs" fw={500} ff="monospace">
              {formatMetricValue(config, value)}
            </Text>
          </Group>
        );
      })}
    </Paper>
  );
};

/**
 * RideStreamsChart — ride profile over distance (or time for indoor rides).
 *
 * Power/HR are smoothed with a rolling average and all series are
 * downsampled with peak-preserving LTTB. Elevation always renders as a
 * muted background area. Drag horizontally to zoom; double-click to reset.
 */
const RideStreamsChart = ({ activity, isImperial = false }) => {
  const streams = activity?.activity_streams;
  const isRun = isRunningActivity(activity);
  const metricConfig = useMemo(
    () => (isRun ? runMetricConfig(isImperial) : METRIC_CONFIG),
    [isRun, isImperial],
  );
  const durationSeconds =
    activity?.moving_time || activity?.duration_seconds || activity?.elapsed_time || 0;

  const [activeMetrics, setActiveMetrics] = useState(null);
  const [zoom, setZoom] = useState(null); // { x1, x2 } committed range
  const [drag, setDrag] = useState(null); // { start, end } while dragging

  // Full-resolution rows + x-axis mode
  const { rows: baseRows, xMode } = useMemo(
    () => buildStreamRows(streams, { durationSeconds, sport: isRun ? 'running' : null }),
    [streams, durationSeconds, isRun]
  );

  const availableMetrics = useMemo(
    () =>
      Object.keys(metricConfig).filter((metric) =>
        baseRows.some((row) => row[metricConfig[metric].dataKey] != null)
      ),
    [baseRows, metricConfig]
  );
  const hasElevation = useMemo(
    () => baseRows.some((row) => row.elevation_m != null),
    [baseRows]
  );

  const resolvedActive =
    activeMetrics ??
    availableMetrics.filter((m) => (isRun ? ['pace', 'heartRate'] : ['power', 'heartRate']).includes(m));

  // Zoom re-slices the FULL-resolution rows, so smoothing and LTTB re-run
  // on the visible span — zooming in reveals detail automatically.
  const visibleRows = useMemo(() => {
    if (!zoom) return baseRows;
    return baseRows.filter((row) => row.x >= zoom.x1 && row.x <= zoom.x2);
  }, [baseRows, zoom]);

  const chartRows = useMemo(() => {
    if (visibleRows.length === 0) return [];
    const window = smoothingWindowForCount(visibleRows.length, TARGET_POINTS);
    const keys = isRun ? ['power', 'heartRate', 'pace_s_per_km'] : ['power', 'heartRate'];
    const smoothed = smoothRows(visibleRows, keys, window);
    return downsampleRows(smoothed, TARGET_POINTS);
  }, [visibleRows, isRun]);

  // Ticks are picked in the display unit so a mile axis reads 1, 2, 3.
  const xTicks = useMemo(() => {
    if (chartRows.length === 0) return [];
    const first = chartRows[0].x;
    const last = chartRows[chartRows.length - 1].x;
    if (xMode === 'distance_km' && isImperial) {
      return niceTicks(first / KM_PER_MILE, last / KM_PER_MILE, 8).map((mi) => mi * KM_PER_MILE);
    }
    return niceTicks(first, last, 8);
  }, [chartRows, xMode, isImperial]);

  const paceDomain = useMemo(
    () => (isRun ? percentileDomain(chartRows.map((r) => r.pace_s_per_km)) : null),
    [isRun, chartRows],
  );

  const fullSpan = baseRows.length > 0 ? baseRows[baseRows.length - 1].x - baseRows[0].x : 0;

  if (availableMetrics.length === 0 && !hasElevation) return null;

  const handleToggle = (metric) => {
    const current = resolvedActive;
    if (current.includes(metric)) {
      if (current.length <= 1) return; // Keep at least one
      setActiveMetrics(current.filter((m) => m !== metric));
    } else {
      setActiveMetrics([...current, metric]);
    }
  };

  const handleMouseDown = (e) => {
    if (e?.activeLabel != null) setDrag({ start: e.activeLabel, end: e.activeLabel });
  };
  const handleMouseMove = (e) => {
    if (drag && e?.activeLabel != null) setDrag((d) => ({ ...d, end: e.activeLabel }));
  };
  const handleMouseUp = () => {
    if (!drag) return;
    const x1 = Math.min(drag.start, drag.end);
    const x2 = Math.max(drag.start, drag.end);
    // Ignore clicks and accidental micro-drags (< 1% of the full ride)
    if (fullSpan > 0 && x2 - x1 > fullSpan * 0.01) setZoom({ x1, x2 });
    setDrag(null);
  };

  // Visible axes: left is bound to the highest-priority active metric,
  // right to heart rate. Every metric keeps its own (hidden) scale so
  // units never collide.
  const leftMetric = LEFT_AXIS_PRIORITY.find((m) => resolvedActive.includes(m)) ?? null;
  const rightMetric = resolvedActive.includes('heartRate') ? 'heartRate' : null;
  const dragRefAxisId = leftMetric
    ? metricConfig[leftMetric].yAxisId
    : rightMetric
      ? metricConfig[rightMetric].yAxisId
      : ELEVATION_CONFIG.yAxisId;

  const distanceUnit = isImperial ? ' mi' : ' km';
  const zoomSpanText = zoom
    ? `${formatXValue(zoom.x1, xMode, isImperial)} – ${formatXValue(zoom.x2, xMode, isImperial)}${xMode === 'distance_km' ? distanceUnit : ''}`
    : null;

  return (
    <Stack gap="xs">
      <Group gap="xs" justify="space-between" wrap="wrap">
        <Group gap="xs" wrap="wrap">
          {availableMetrics.map((metric) => (
            <Chip
              key={metric}
              checked={resolvedActive.includes(metric)}
              onChange={() => handleToggle(metric)}
              size="xs"
              variant="outline"
              color={metricConfig[metric].chipColor}
              styles={{ label: { cursor: 'pointer' } }}
            >
              {metricConfig[metric].label}
            </Chip>
          ))}
        </Group>
        {zoom && (
          <Group gap="xs" wrap="nowrap">
            <Text size="xs" c="dimmed" ff="monospace">
              {zoomSpanText}
            </Text>
            <Button size="compact-xs" variant="light" onClick={() => setZoom(null)}>
              Reset zoom
            </Button>
          </Group>
        )}
      </Group>

      <Box style={{ userSelect: 'none' }} onDoubleClick={() => setZoom(null)}>
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart
            data={chartRows}
            margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={() => setDrag(null)}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-bg-secondary)" />

            <XAxis
              dataKey="x"
              type="number"
              domain={['dataMin', 'dataMax']}
              ticks={xTicks}
              tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }}
              tickFormatter={(v) => formatXValue(v, xMode, isImperial)}
              label={{
                value: xAxisLabel(xMode, isImperial),
                position: 'insideBottomRight',
                offset: -5,
                style: { fontSize: 10, fill: 'var(--color-text-muted)' },
              }}
            />

            {/* One axis per metric so scales never collide; only the
                left-priority metric and heart rate render visibly. */}
            {resolvedActive.map((metric) => {
              const config = metricConfig[metric];
              const isLeft = metric === leftMetric;
              const isRight = metric === rightMetric;
              const domain =
                metric === 'pace'
                  ? paceDomain
                  : metric === 'heartRate'
                    ? ['auto', 'auto']
                    : [0, 'auto'];
              return (
                <YAxis
                  key={config.yAxisId}
                  yAxisId={config.yAxisId}
                  orientation={isRight ? 'right' : 'left'}
                  hide={!isLeft && !isRight}
                  domain={domain}
                  reversed={Boolean(config.reversed)}
                  allowDataOverflow={metric === 'pace'}
                  tickFormatter={config.tick}
                  tick={{ fontSize: 11, fill: config.color }}
                  width={48}
                  label={{
                    value: `${config.label} (${config.unit})`,
                    angle: -90,
                    position: isRight ? 'insideRight' : 'insideLeft',
                    style: { fontSize: 10, fill: config.color, textAnchor: 'middle' },
                  }}
                />
              );
            })}

            {/* Hidden elevation axis pinned to the bottom third of the plot */}
            {hasElevation && (
              <YAxis
                yAxisId={ELEVATION_CONFIG.yAxisId}
                hide
                domain={([dataMin, dataMax]) => [dataMin, dataMin + (dataMax - dataMin) * 3]}
              />
            )}

            <RechartsTooltip
              cursor={{ stroke: 'var(--color-text-muted)', strokeDasharray: '3 3' }}
              isAnimationActive={false}
              content={
                <StreamsTooltip
                  activeMetrics={resolvedActive}
                  metricConfig={metricConfig}
                  xMode={xMode}
                  isImperial={isImperial}
                  hasElevation={hasElevation}
                />
              }
            />

            {/* Elevation always renders as a muted background */}
            {hasElevation && (
              <Area
                yAxisId={ELEVATION_CONFIG.yAxisId}
                type="monotone"
                dataKey="elevation_m"
                stroke={ELEVATION_CONFIG.color}
                strokeOpacity={0.4}
                strokeWidth={1}
                fill={ELEVATION_CONFIG.color}
                fillOpacity={0.1}
                dot={false}
                activeDot={false}
                isAnimationActive={false}
                connectNulls
              />
            )}

            {resolvedActive.map((metric) => {
              const config = metricConfig[metric];
              return (
                <Line
                  key={metric}
                  yAxisId={config.yAxisId}
                  type="monotone"
                  dataKey={config.dataKey}
                  stroke={config.color}
                  strokeWidth={1.5}
                  dot={false}
                  activeDot={{ r: 3, strokeWidth: 0, fill: config.color }}
                  isAnimationActive={false}
                  connectNulls
                />
              );
            })}

            {drag && Math.abs(drag.end - drag.start) > 0 && (
              <ReferenceArea
                yAxisId={dragRefAxisId}
                x1={Math.min(drag.start, drag.end)}
                x2={Math.max(drag.start, drag.end)}
                fill="var(--color-text-muted)"
                fillOpacity={0.12}
                stroke="var(--color-text-muted)"
                strokeOpacity={0.3}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </Box>

      <Text size="xs" c="dimmed" ta="right">
        drag to zoom · double-click to reset
      </Text>
    </Stack>
  );
};

export default RideStreamsChart;
