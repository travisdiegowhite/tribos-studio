import { useMemo, useState } from 'react';
import { Card, Text, Group, Chip, Stack, Box } from '@mantine/core';
import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from 'recharts';

// FIT protocol sentinel filtering
const MAX_VALID_POWER = 2500;
const MAX_VALID_HR = 250;
const MAX_VALID_SPEED_MPS = 40; // ~144 km/h
const MAX_VALID_CADENCE = 200;
const TARGET_POINTS = 500;

const METRIC_CONFIG = {
  power: {
    label: 'Power',
    unit: 'W',
    color: '#9E5A3C',
    yAxisId: 'left',
  },
  heartRate: {
    label: 'Heart Rate',
    unit: 'bpm',
    color: '#B89040',
    yAxisId: 'right',
  },
  speed: {
    label: 'Speed',
    unit: 'km/h',
    color: '#6B7F94',
    yAxisId: 'left',
  },
  cadence: {
    label: 'Cadence',
    unit: 'rpm',
    color: '#8B6B5A',
    yAxisId: 'left',
  },
  elevation: {
    label: 'Elevation',
    unit: 'm',
    color: '#6B8C72',
    yAxisId: 'right',
  },
};

/**
 * Calculate cumulative distance from coordinate pairs
 * Uses Haversine formula for accuracy
 */
function cumulativeDistance(coords) {
  if (!coords || coords.length === 0) return [];

  const distances = [0];
  for (let i = 1; i < coords.length; i++) {
    const [lng1, lat1] = coords[i - 1];
    const [lng2, lat2] = coords[i];
    const R = 6371; // Earth radius in km
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    distances.push(distances[i - 1] + R * c);
  }
  return distances;
}

/**
 * Downsample an array to target length using LTTB-like approach
 */
function downsample(data, targetLen) {
  if (data.length <= targetLen) return data;
  const step = (data.length - 1) / (targetLen - 1);
  const result = [];
  for (let i = 0; i < targetLen; i++) {
    result.push(data[Math.round(i * step)]);
  }
  return result;
}

/**
 * Custom tooltip for the streams chart
 */
const StreamsTooltip = ({ active, payload, label, activeMetrics }) => {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <Card withBorder p="xs" style={{ backgroundColor: 'var(--tribos-bg-secondary)', minWidth: 140 }}>
      <Text size="xs" fw={600} mb={4}>
        {typeof label === 'number' ? `${label.toFixed(1)} km` : label}
      </Text>
      {payload.map((entry) => {
        const config = METRIC_CONFIG[entry.dataKey];
        if (!config || !activeMetrics.includes(entry.dataKey)) return null;
        return (
          <Group key={entry.dataKey} justify="space-between" gap="xs">
            <Text size="xs" style={{ color: config.color }}>
              {config.label}
            </Text>
            <Text size="xs" fw={500}>
              {entry.dataKey === 'speed'
                ? `${(entry.value).toFixed(1)} ${config.unit}`
                : `${Math.round(entry.value)} ${config.unit}`}
            </Text>
          </Group>
        );
      })}
    </Card>
  );
};

/**
 * RideStreamsChart — time-series visualization of ride metrics
 * Displays power, HR, speed, cadence, and elevation over distance
 */
const RideStreamsChart = ({ activity }) => {
  const streams = activity?.activity_streams;

  // Determine which metrics have data
  const availableMetrics = useMemo(() => {
    if (!streams) return [];
    const available = [];
    if (streams.power?.some((v) => v > 0 && v < MAX_VALID_POWER)) available.push('power');
    if (streams.heartRate?.some((v) => v > 0 && v < MAX_VALID_HR)) available.push('heartRate');
    if (streams.speed?.some((v) => v > 0 && v < MAX_VALID_SPEED_MPS)) available.push('speed');
    if (streams.cadence?.some((v) => v > 0 && v < MAX_VALID_CADENCE)) available.push('cadence');
    if (streams.elevation?.some((v) => v != null)) available.push('elevation');
    return available;
  }, [streams]);

  // Default: show power + HR + elevation (the most useful combo)
  const [activeMetrics, setActiveMetrics] = useState(null);
  const resolvedActive = activeMetrics ?? availableMetrics.filter((m) =>
    ['power', 'heartRate', 'elevation'].includes(m)
  );

  // Process stream data into chart-ready format
  const chartData = useMemo(() => {
    if (!streams || availableMetrics.length === 0) return [];

    const len = streams.coords?.length || streams.power?.length || streams.heartRate?.length || 0;
    if (len === 0) return [];

    // Calculate distance axis from coords
    const distances = streams.coords ? cumulativeDistance(streams.coords) : null;

    // Build raw data points
    const raw = [];
    for (let i = 0; i < len; i++) {
      const point = {};

      // X-axis: distance if available, otherwise index
      point.distance = distances ? Math.round(distances[i] * 100) / 100 : i;

      if (streams.power?.[i] != null) {
        const p = streams.power[i];
        point.power = p > 0 && p < MAX_VALID_POWER ? p : null;
      }
      if (streams.heartRate?.[i] != null) {
        const hr = streams.heartRate[i];
        point.heartRate = hr > 0 && hr < MAX_VALID_HR ? hr : null;
      }
      if (streams.speed?.[i] != null) {
        const s = streams.speed[i];
        point.speed = s >= 0 && s < MAX_VALID_SPEED_MPS ? Math.round(s * 3.6 * 10) / 10 : null; // m/s → km/h
      }
      if (streams.cadence?.[i] != null) {
        const c = streams.cadence[i];
        point.cadence = c >= 0 && c < MAX_VALID_CADENCE ? c : null;
      }
      if (streams.elevation?.[i] != null) {
        point.elevation = streams.elevation[i];
      }

      raw.push(point);
    }

    return downsample(raw, TARGET_POINTS);
  }, [streams, availableMetrics]);

  if (availableMetrics.length === 0) return null;

  const handleToggle = (metric) => {
    const current = resolvedActive;
    if (current.includes(metric)) {
      if (current.length <= 1) return; // Keep at least one
      setActiveMetrics(current.filter((m) => m !== metric));
    } else {
      setActiveMetrics([...current, metric]);
    }
  };

  // Determine if we need dual Y-axes
  const hasLeftAxis = resolvedActive.some((m) => METRIC_CONFIG[m].yAxisId === 'left');
  const hasRightAxis = resolvedActive.some((m) => METRIC_CONFIG[m].yAxisId === 'right');

  return (
    <Stack gap="xs">
      <Group gap="xs" wrap="wrap">
        {availableMetrics.map((metric) => (
          <Chip
            key={metric}
            checked={resolvedActive.includes(metric)}
            onChange={() => handleToggle(metric)}
            size="xs"
            variant="outline"
            color={METRIC_CONFIG[metric].color}
            styles={{
              label: {
                cursor: 'pointer',
              },
            }}
          >
            {METRIC_CONFIG[metric].label}
          </Chip>
        ))}
      </Group>

      <Box>
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--tribos-bg-tertiary)" />

            <XAxis
              dataKey="distance"
              tick={{ fontSize: 11, fill: 'var(--tribos-text-muted)' }}
              tickFormatter={(v) => `${v.toFixed(0)}`}
              label={{
                value: 'km',
                position: 'insideBottomRight',
                offset: -5,
                style: { fontSize: 10, fill: 'var(--tribos-text-muted)' },
              }}
            />

            {hasLeftAxis && (
              <YAxis
                yAxisId="left"
                tick={{ fontSize: 11, fill: 'var(--tribos-text-muted)' }}
                width={45}
              />
            )}
            {hasRightAxis && (
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={{ fontSize: 11, fill: 'var(--tribos-text-muted)' }}
                width={45}
              />
            )}

            <RechartsTooltip
              content={<StreamsTooltip activeMetrics={resolvedActive} />}
            />

            {/* Elevation as filled area (behind lines) */}
            {resolvedActive.includes('elevation') && (
              <Area
                yAxisId={METRIC_CONFIG.elevation.yAxisId}
                type="monotone"
                dataKey="elevation"
                fill={METRIC_CONFIG.elevation.color}
                fillOpacity={0.15}
                stroke={METRIC_CONFIG.elevation.color}
                strokeWidth={1}
                dot={false}
                isAnimationActive={false}
                connectNulls
              />
            )}

            {/* Power line */}
            {resolvedActive.includes('power') && (
              <Line
                yAxisId={METRIC_CONFIG.power.yAxisId}
                type="monotone"
                dataKey="power"
                stroke={METRIC_CONFIG.power.color}
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
                connectNulls
              />
            )}

            {/* Heart Rate line */}
            {resolvedActive.includes('heartRate') && (
              <Line
                yAxisId={METRIC_CONFIG.heartRate.yAxisId}
                type="monotone"
                dataKey="heartRate"
                stroke={METRIC_CONFIG.heartRate.color}
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
                connectNulls
              />
            )}

            {/* Speed line */}
            {resolvedActive.includes('speed') && (
              <Line
                yAxisId={METRIC_CONFIG.speed.yAxisId}
                type="monotone"
                dataKey="speed"
                stroke={METRIC_CONFIG.speed.color}
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
                connectNulls
              />
            )}

            {/* Cadence line */}
            {resolvedActive.includes('cadence') && (
              <Line
                yAxisId={METRIC_CONFIG.cadence.yAxisId}
                type="monotone"
                dataKey="cadence"
                stroke={METRIC_CONFIG.cadence.color}
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
                connectNulls
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </Box>
    </Stack>
  );
};

export default RideStreamsChart;
