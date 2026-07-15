import { useMemo, useState } from 'react';
import { Text, Group, Badge, Paper, Stack, SegmentedControl } from '@mantine/core';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Cell,
  LabelList,
} from 'recharts';
import { useThemeTokens } from '../hooks/useThemeTokens';
import { isPowerSport, isRunningActivity } from '../utils/sportType';

// HR zone definitions (% of max HR). Colors resolve per color scheme in the
// component via useThemeTokens — never capture tokens at module load.
const HR_ZONES = [
  { zone: 1, name: 'Recovery', min: 0, max: 60 },
  { zone: 2, name: 'Endurance', min: 60, max: 70 },
  { zone: 3, name: 'Tempo', min: 70, max: 80 },
  { zone: 4, name: 'Threshold', min: 80, max: 90 },
  { zone: 5, name: 'VO2max+', min: 90, max: 200 },
];

/**
 * Format seconds in zone as "18m" / "1h 05m". `approximate` marks values
 * derived from 1 Hz sample counts rather than server-computed seconds.
 */
function formatZoneTime(seconds, approximate) {
  if (!seconds || seconds <= 0) return null;
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  const text = h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
  return approximate ? `~${text}` : text;
}

/**
 * Compute HR zone distribution from raw heartRate stream
 */
function computeHRZones(heartRateStream, maxHR) {
  if (!heartRateStream || !maxHR || maxHR <= 0) return null;

  const zones = HR_ZONES.map((z) => ({
    ...z,
    label: `Z${z.zone} ${z.name}`,
    count: 0,
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

  // Canonical 7-zone boundaries — lockstep with TRAINING_ZONES and the DB
  // trigger calculate_power_zones (55/75/90/105/120/150 %FTP).
  const zoneDefs = [
    { zone: 1, name: 'Recovery', min: 0, max: 55 },
    { zone: 2, name: 'Endurance', min: 55, max: 75 },
    { zone: 3, name: 'Tempo', min: 75, max: 90 },
    { zone: 4, name: 'Threshold', min: 90, max: 105 },
    { zone: 5, name: 'VO2max', min: 105, max: 120 },
    { zone: 6, name: 'Anaerobic', min: 120, max: 150 },
    { zone: 7, name: 'Neuromuscular', min: 150, max: 9999 },
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
    <Paper p="xs" withBorder style={{ backgroundColor: 'var(--color-bg-secondary)' }}>
      <Text size="xs" fw={600}>{data.label}</Text>
      <Text size="xs" ff="monospace" style={{ color: 'var(--color-text-muted)' }}>
        {data.percent}% of activity{data.timeLabel ? ` · ${data.timeLabel}` : ''}
      </Text>
    </Paper>
  );
};

/**
 * RideZonesChart — HR & Power zone distribution for a single ride
 */
const RideZonesChart = ({ activity, ftp, maxHr }) => {
  const [mode, setMode] = useState('hr');
  const { tokens } = useThemeTokens();

  // Cycling power zones (% FTP) don't apply to runs. Phase 2 will introduce
  // pace-zone rendering; until then runs get HR-only.
  const allowPower = isPowerSport(activity);
  const isRun = isRunningActivity(activity);

  const streams = activity?.activity_streams;
  const rideAnalytics = activity?.ride_analytics;

  // Compute HR zones from pre-computed analytics or raw stream.
  // Colors and time-in-zone labels are attached here so they follow the
  // active color scheme and the best available time source.
  const hrZones = useMemo(() => {
    // Try pre-computed first
    if (rideAnalytics?.hr_zones?.zones) {
      return rideAnalytics.hr_zones.zones.map((z, i) => ({
        ...z,
        label: z.label || `Z${i + 1} ${z.name || HR_ZONES[i]?.name || ''}`,
        color: tokens.colors[`zone${i + 1}`] || tokens.colors.zone1,
        percent: typeof z.percent === 'number' ? Math.round(z.percent) : 0,
        timeLabel: formatZoneTime(z.seconds ?? z.time_seconds ?? z.duration_seconds, false),
      }));
    }
    // Fallback: compute from stream (sample count ≈ seconds at 1 Hz)
    const userMaxHR = maxHr || activity?.max_heartrate;
    const computed = computeHRZones(streams?.heartRate, userMaxHR);
    return computed?.map((z) => ({
      ...z,
      color: tokens.colors[`zone${z.zone}`] || tokens.colors.zone1,
      timeLabel: formatZoneTime(z.count, true),
    }));
  }, [rideAnalytics, streams, maxHr, activity?.max_heartrate, tokens]);

  // Compute power zones from stream (cycling only)
  const powerZones = useMemo(() => {
    if (!allowPower || !ftp || !streams?.power) return null;
    const computed = computePowerZones(streams.power, ftp);
    return computed?.map((z) => ({
      ...z,
      color: tokens.colors[`zone${z.zone}`] || tokens.colors.zone1,
      timeLabel: formatZoneTime(z.count, true),
    }));
  }, [allowPower, streams, ftp, tokens]);

  const hasHR = hrZones && hrZones.some((z) => z.percent > 0);
  const hasPower = powerZones && powerZones.some((z) => z.percent > 0);

  if (!hasHR && !hasPower) return null;

  // Force HR mode for non-power sports even if a state value lingers.
  const effectiveMode = !allowPower ? 'hr' : mode;
  const chartData = effectiveMode === 'power' && hasPower ? powerZones : hrZones;
  const showToggle = hasHR && hasPower && allowPower;

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
          margin={{ top: 0, right: 35, left: 0, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-bg-secondary)" horizontal={false} />
          <XAxis
            type="number"
            domain={[0, 100]}
            tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }}
            tickFormatter={(v) => `${v}%`}
          />
          <YAxis
            type="category"
            dataKey="label"
            tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }}
            width={118}
          />
          <RechartsTooltip content={<ZoneTooltip />} cursor={{ fill: 'var(--color-teal-subtle)' }} />
          <Bar dataKey="percent" radius={0} isAnimationActive={false}>
            {chartData?.map((entry, index) => (
              <Cell key={index} fill={entry.color} />
            ))}
            <LabelList
              dataKey="percent"
              position="right"
              formatter={(v) => (v > 0 ? `${v}%` : '')}
              fill="var(--color-text-muted)"
              fontSize={11}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Stack>
  );
};

export default RideZonesChart;
