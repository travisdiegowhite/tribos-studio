import { useMemo, useState } from 'react';
import { Text, Group, Badge, Paper, SimpleGrid, Stack, SegmentedControl } from '@mantine/core';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { tokens } from '../theme';
import { TRAINING_ZONES, getPowerZone, getZoneColor, getZoneName } from '../utils/trainingPlans';

// HR zone definitions (% of max HR)
const HR_ZONES = [
  { zone: 1, name: 'Recovery', min: 0, max: 60, color: tokens.colors.zone1 },
  { zone: 2, name: 'Endurance', min: 60, max: 70, color: tokens.colors.zone2 },
  { zone: 3, name: 'Tempo', min: 70, max: 80, color: tokens.colors.zone3 },
  { zone: 4, name: 'Threshold', min: 80, max: 90, color: tokens.colors.zone4 },
  { zone: 5, name: 'VO2max+', min: 90, max: 200, color: tokens.colors.zone5 },
];

/**
 * Compute HR zone distribution from raw heartRate stream
 */
function computeHRZones(heartRateStream, maxHR) {
  if (!heartRateStream || !maxHR || maxHR <= 0) return null;

  const zones = HR_ZONES.map((z) => ({
    ...z,
    label: `Z${z.zone} ${z.name}`,
    count: 0,
    seconds: 0,
    percent: 0,
  }));

  let validPoints = 0;
  for (const hr of heartRateStream) {
    if (!hr || hr <= 0 || hr > 250) continue;
    validPoints++;
    const pctMax = (hr / maxHR) * 100;
    for (let i = zones.length - 1; i >= 0; i--) {
      if (pctMax >= zones[i].min) {
        zones[i].count++;
        break;
      }
    }
  }

  if (validPoints === 0) return null;

  zones.forEach((z) => {
    z.percent = Math.round((z.count / validPoints) * 100);
  });

  return zones;
}

/**
 * Compute power zone distribution from raw power stream
 */
function computePowerZones(powerStream, ftp) {
  if (!powerStream || !ftp || ftp <= 0) return null;

  const zoneDefs = [
    { zone: 1, name: 'Recovery', min: 0, max: 55, color: tokens.colors.zone1 },
    { zone: 2, name: 'Endurance', min: 55, max: 75, color: tokens.colors.zone2 },
    { zone: 3, name: 'Tempo', min: 75, max: 90, color: tokens.colors.zone3 },
    { zone: 4, name: 'Threshold', min: 90, max: 105, color: tokens.colors.zone4 },
    { zone: 5, name: 'VO2max', min: 105, max: 150, color: tokens.colors.zone5 },
    { zone: 6, name: 'Anaerobic', min: 150, max: 9999, color: tokens.colors.zone6 },
  ];

  const zones = zoneDefs.map((z) => ({
    ...z,
    label: `Z${z.zone} ${z.name}`,
    count: 0,
    percent: 0,
  }));

  let validPoints = 0;
  for (const power of powerStream) {
    if (!power || power <= 0 || power > 2500) continue;
    validPoints++;
    const pctFTP = (power / ftp) * 100;
    for (let i = zones.length - 1; i >= 0; i--) {
      if (pctFTP >= zones[i].min) {
        zones[i].count++;
        break;
      }
    }
  }

  if (validPoints === 0) return null;

  zones.forEach((z) => {
    z.percent = Math.round((z.count / validPoints) * 100);
  });

  return zones;
}

/**
 * Custom tooltip
 */
const ZoneTooltip = ({ active, payload }) => {
  if (!active || !payload || payload.length === 0) return null;
  const data = payload[0]?.payload;
  if (!data) return null;

  return (
    <Paper p="xs" withBorder style={{ backgroundColor: 'var(--tribos-bg-secondary)' }}>
      <Text size="xs" fw={600}>{data.label}</Text>
      <Text size="xs" style={{ color: 'var(--tribos-text-muted)' }}>
        {data.percent}% of ride
      </Text>
    </Paper>
  );
};

/**
 * RideZonesChart — HR & Power zone distribution for a single ride
 */
const RideZonesChart = ({ activity, ftp, maxHr }) => {
  const [mode, setMode] = useState('hr');

  const streams = activity?.activity_streams;
  const rideAnalytics = activity?.ride_analytics;

  // Compute HR zones from pre-computed analytics or raw stream
  const hrZones = useMemo(() => {
    // Try pre-computed first
    if (rideAnalytics?.hr_zones?.zones) {
      return rideAnalytics.hr_zones.zones.map((z, i) => ({
        ...z,
        label: z.label || `Z${i + 1} ${z.name || HR_ZONES[i]?.name || ''}`,
        color: HR_ZONES[i]?.color || tokens.colors.zone1,
        percent: typeof z.percent === 'number' ? Math.round(z.percent) : 0,
      }));
    }
    // Fallback: compute from stream
    const userMaxHR = maxHr || activity?.max_heartrate;
    return computeHRZones(streams?.heartRate, userMaxHR);
  }, [rideAnalytics, streams, maxHr, activity?.max_heartrate]);

  // Compute power zones from stream
  const powerZones = useMemo(() => {
    if (!ftp || !streams?.power) return null;
    return computePowerZones(streams.power, ftp);
  }, [streams, ftp]);

  const hasHR = hrZones && hrZones.some((z) => z.percent > 0);
  const hasPower = powerZones && powerZones.some((z) => z.percent > 0);

  if (!hasHR && !hasPower) return null;

  const chartData = mode === 'power' && hasPower ? powerZones : hrZones;
  const showToggle = hasHR && hasPower;

  // Find dominant zone
  const dominant = chartData?.reduce((max, z) => (z.percent > max.percent ? z : max), { percent: 0 });

  return (
    <Stack gap="xs">
      <Group justify="space-between" align="center">
        <Group gap="xs">
          <Text size="sm" fw={600}>Zone Distribution</Text>
          {dominant?.label && (
            <Badge size="xs" variant="light" color="gray">
              Dominant: {dominant.label}
            </Badge>
          )}
        </Group>
        {showToggle && (
          <SegmentedControl
            size="xs"
            value={mode}
            onChange={setMode}
            data={[
              { label: 'HR Zones', value: 'hr' },
              { label: 'Power Zones', value: 'power' },
            ]}
          />
        )}
      </Group>

      <ResponsiveContainer width="100%" height={180}>
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ top: 0, right: 20, left: 0, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="var(--tribos-bg-tertiary)" horizontal={false} />
          <XAxis
            type="number"
            domain={[0, 100]}
            tick={{ fontSize: 11, fill: 'var(--tribos-text-muted)' }}
            tickFormatter={(v) => `${v}%`}
          />
          <YAxis
            type="category"
            dataKey="label"
            tick={{ fontSize: 11, fill: 'var(--tribos-text-muted)' }}
            width={100}
          />
          <RechartsTooltip content={<ZoneTooltip />} />
          <Bar dataKey="percent" radius={[0, 2, 2, 0]} isAnimationActive={false}>
            {chartData?.map((entry, index) => (
              <Cell key={index} fill={entry.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Stack>
  );
};

export default RideZonesChart;
