import { useState, useEffect, useRef } from 'react';
import {
  Container, Text, Paper, SimpleGrid, Box, Stack, Group,
  Badge, SegmentedControl, Progress, Card,
} from '@mantine/core';
import {
  LineChart, Line, Area, AreaChart, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, ReferenceLine, Cell, Legend,
} from 'recharts';
import { IconBolt, IconChartPie, IconClock, IconFlame, IconTrophy } from '@tabler/icons-react';
import { tokens } from '../../theme';
import { useScrollReveal, usePrefersReducedMotion } from './useScrollReveal';

// ===== Cat 2 Racer Profile =====
// FTP: 295W | Weight: 74kg | W/kg: 4.0 | Rider type: All-Rounder
// 90-day training block with 3:1 build/recovery periodization

const FTP = 295;
const WEIGHT = 74;

// ===== Training Load Data (90 days, daily) =====
// Generates realistic CTL/ATL/TSB for a Cat 2 racer in a build phase
const trainingLoadData = (() => {
  // Daily TSS values for 90 days — 3:1 periodization
  const dailyTSS = [
    // Week 1 (Build 1.1) - moderate
    85, 0, 110, 65, 0, 140, 55,
    // Week 2 (Build 1.2) - increasing
    95, 0, 120, 70, 0, 155, 60,
    // Week 3 (Build 1.3) - peak
    105, 0, 135, 80, 0, 165, 65,
    // Week 4 (Recovery 1)
    45, 0, 55, 40, 0, 65, 0,
    // Week 5 (Build 2.1)
    100, 0, 125, 75, 0, 150, 60,
    // Week 6 (Build 2.2)
    110, 0, 140, 85, 0, 170, 70,
    // Week 7 (Build 2.3) - peak
    120, 0, 150, 90, 0, 180, 75,
    // Week 8 (Recovery 2)
    50, 0, 60, 45, 0, 70, 0,
    // Week 9 (Build 3.1) - race specificity
    115, 0, 145, 85, 0, 165, 65,
    // Week 10 (Build 3.2)
    125, 0, 155, 95, 0, 175, 70,
    // Week 11 (Build 3.3) - peak
    130, 0, 160, 100, 0, 185, 75,
    // Week 12 (Taper)
    70, 0, 80, 50, 0, 90, 45,
    // Week 13 (Race week taper)
    55, 0, 65, 40, 0, 50, 35,
  ];

  // Calculate CTL (42-day EMA) and ATL (7-day EMA)
  let ctl = 72; // Starting CTL
  let atl = 68; // Starting ATL
  const data = [];

  for (let i = 0; i < 90; i++) {
    const tss = dailyTSS[i] || 0;
    ctl = ctl + (tss - ctl) / 42;
    atl = atl + (tss - atl) / 7;
    const tsb = Math.round(ctl - atl);

    const date = new Date(2026, 0, 7 + i); // Starting Jan 7
    data.push({
      date: date.toISOString().split('T')[0],
      formattedDate: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      tss: Math.round(tss),
      ctl: Math.round(ctl),
      atl: Math.round(atl),
      tsb,
    });
  }

  return data;
})();

// ===== Power Duration Curve Data =====
// Cat 2 all-rounder, 90-day bests
const pdcData = [
  { duration: '5s', durationSeconds: 5, name: 'Peak Sprint', current: 1200, previous: 1140, currentWkg: '16.22', previousWkg: '15.41' },
  { duration: '15s', durationSeconds: 15, name: 'Sprint', current: 880, previous: 840, currentWkg: '11.89', previousWkg: '11.35' },
  { duration: '30s', durationSeconds: 30, name: 'Anaerobic', current: 650, previous: 620, currentWkg: '8.78', previousWkg: '8.38' },
  { duration: '1m', durationSeconds: 60, name: '1 Minute', current: 465, previous: 445, currentWkg: '6.28', previousWkg: '6.01' },
  { duration: '2m', durationSeconds: 120, name: '2 Minutes', current: 395, previous: 375, currentWkg: '5.34', previousWkg: '5.07' },
  { duration: '5m', durationSeconds: 300, name: '5 Minutes', current: 345, previous: 330, currentWkg: '4.66', previousWkg: '4.46' },
  { duration: '8m', durationSeconds: 480, name: '8 Minutes', current: 325, previous: 310, currentWkg: '4.39', previousWkg: '4.19' },
  { duration: '10m', durationSeconds: 600, name: '10 Minutes', current: 315, previous: 300, currentWkg: '4.26', previousWkg: '4.05' },
  { duration: '20m', durationSeconds: 1200, name: '20 Minutes', current: 305, previous: 290, currentWkg: '4.12', previousWkg: '3.92' },
  { duration: '30m', durationSeconds: 1800, name: '30 Minutes', current: 295, previous: 280, currentWkg: '3.99', previousWkg: '3.78' },
  { duration: '60m', durationSeconds: 3600, name: '60 Minutes', current: 278, previous: 265, currentWkg: '3.76', previousWkg: '3.58' },
  { duration: '90m', durationSeconds: 5400, name: '90 Minutes', current: 262, previous: 248, currentWkg: '3.54', previousWkg: '3.35' },
  { duration: '2h', durationSeconds: 7200, name: '2 Hours', current: 248, previous: 235, currentWkg: '3.35', previousWkg: '3.18' },
];

const powerBests = {
  sprint5s: 1200,
  oneMin: 465,
  fiveMin: 345,
  twentyMin: 305,
  sixtyMin: 278,
};

// ===== Zone Distribution Data =====
// 90-day, polarized training (Cat 2 racer)
const zoneChartData = [
  { zone: 1, name: 'Recovery', time: 15300, percentage: 10, hours: '4.3', color: tokens.colors.zone1 },
  { zone: 2, name: 'Endurance', time: 76500, percentage: 50, hours: '21.3', color: tokens.colors.zone2 },
  { zone: 3, name: 'Tempo', time: 15300, percentage: 10, hours: '4.3', color: tokens.colors.zone3 },
  { zone: 4, name: 'Threshold', time: 22950, percentage: 15, hours: '6.4', color: tokens.colors.zone4 },
  { zone: 5, name: 'VO2max', time: 16830, percentage: 11, hours: '4.7', color: tokens.colors.zone5 },
  { zone: 6, name: 'Anaerobic', time: 6120, percentage: 4, hours: '1.7', color: tokens.colors.zone6 },
];

// ===== Route Intelligence Data =====
const routeSuitability = [
  { label: 'Endurance', score: 95, color: tokens.colors.zone2 },
  { label: 'Tempo', score: 82, color: tokens.colors.zone3 },
  { label: 'Threshold', score: 71, color: tokens.colors.zone4 },
  { label: 'VO2max', score: 58, color: tokens.colors.zone5 },
  { label: 'Climbing', score: 34, color: tokens.colors.zone6 },
];

const routeProfile = [
  { km: 0, elev: 120 }, { km: 3, elev: 125 }, { km: 6, elev: 155 },
  { km: 9, elev: 180 }, { km: 12, elev: 160 }, { km: 15, elev: 140 },
  { km: 18, elev: 135 }, { km: 21, elev: 130 }, { km: 24, elev: 165 },
  { km: 27, elev: 210 }, { km: 30, elev: 250 }, { km: 33, elev: 220 },
  { km: 36, elev: 170 }, { km: 39, elev: 145 }, { km: 42, elev: 140 },
  { km: 45, elev: 130 }, { km: 48, elev: 125 }, { km: 50, elev: 120 },
];

const terrainSegments = [
  { start: 0, end: 6, type: 'flat', color: tokens.colors.zone2 },
  { start: 6, end: 12, type: 'rolling', color: tokens.colors.zone3 },
  { start: 12, end: 21, type: 'flat', color: tokens.colors.zone2 },
  { start: 21, end: 36, type: 'climb', color: tokens.colors.zone4 },
  { start: 36, end: 45, type: 'descent', color: tokens.colors.zone1 },
  { start: 45, end: 50, type: 'flat', color: tokens.colors.zone2 },
];


// ===== Custom Tooltip (shared) =====
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <Card withBorder p="xs" style={{ backgroundColor: 'var(--tribos-bg-secondary)' }}>
      <Text size="xs" fw={600} mb="xs" style={{ color: 'var(--tribos-text-primary)' }}>{label}</Text>
      {payload.map((entry, index) => (
        <Group key={index} justify="space-between" gap="md">
          <Text size="xs" style={{ color: entry.color }}>{entry.name}:</Text>
          <Text size="xs" fw={600} style={{ color: 'var(--tribos-text-primary)' }}>{entry.value}</Text>
        </Group>
      ))}
    </Card>
  );
}


// ===== Training Load Chart (Recharts — matches TrainingLoadChart.jsx) =====
function TrainingLoadSection() {
  // Show last 30 days by default, matching app
  const displayData = trainingLoadData.slice(-30);

  return (
    <Card>
      <Group justify="space-between" mb="md" wrap="wrap">
        <Text size="sm" fw={600} style={{ color: 'var(--tribos-text-primary)' }}>
          Training Load Over Time
        </Text>
        <SegmentedControl
          size="xs"
          value="30"
          readOnly
          data={[
            { label: '7 days', value: '7' },
            { label: '30 days', value: '30' },
            { label: '90 days', value: '90' },
          ]}
        />
      </Group>

      {/* Legend badges — matches app */}
      <Group gap="xs" mb="md">
        <Badge color="blue" variant="light" size="sm">CTL (Fitness)</Badge>
        <Badge color="orange" variant="light" size="sm">ATL (Fatigue)</Badge>
        <Badge color="green" variant="light" size="sm">TSB (Form)</Badge>
      </Group>

      {/* Daily TSS Area Chart */}
      <ResponsiveContainer width="100%" height={120}>
        <AreaChart data={displayData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--tribos-bg-tertiary)" />
          <XAxis
            dataKey="formattedDate"
            tick={{ fontSize: 12, fill: 'var(--tribos-text-muted)' }}
            interval="preserveStartEnd"
          />
          <YAxis tick={{ fontSize: 12, fill: 'var(--tribos-text-muted)' }} />
          <RechartsTooltip content={<ChartTooltip />} />
          <Area
            type="monotone"
            dataKey="tss"
            stroke="#3D8B50"
            fill="#3D8B50"
            fillOpacity={0.3}
            name="Daily TSS"
          />
        </AreaChart>
      </ResponsiveContainer>

      <Text size="xs" style={{ color: 'var(--tribos-text-muted)' }} mb="lg" mt="xs">
        Daily Training Stress Score
      </Text>

      {/* CTL/ATL/TSB Line Chart */}
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={displayData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--tribos-bg-tertiary)" />
          <XAxis
            dataKey="formattedDate"
            tick={{ fontSize: 12, fill: 'var(--tribos-text-muted)' }}
            interval="preserveStartEnd"
          />
          <YAxis tick={{ fontSize: 12, fill: 'var(--tribos-text-muted)' }} />
          <RechartsTooltip content={<ChartTooltip />} />
          <Legend wrapperStyle={{ fontSize: 13 }} />
          <ReferenceLine y={0} stroke="var(--tribos-text-muted)" strokeDasharray="3 3" />
          <Line type="monotone" dataKey="ctl" stroke="#3D8B50" strokeWidth={2} dot={false} name="CTL (Fitness)" />
          <Line type="monotone" dataKey="atl" stroke="#D4820A" strokeWidth={2} dot={false} name="ATL (Fatigue)" />
          <Line type="monotone" dataKey="tsb" stroke="#3D8B50" strokeWidth={2} dot={false} name="TSB (Form)" />
        </LineChart>
      </ResponsiveContainer>

      <Text size="xs" style={{ color: 'var(--tribos-text-muted)' }} mt="xs">
        CTL = Long-term fitness (42-day) | ATL = Recent fatigue (7-day) | TSB = Freshness/Form (CTL - ATL)
      </Text>
    </Card>
  );
}


// ===== Power Metric Card (matches PowerDurationCurve.jsx) =====
function PowerMetricCard({ label, value, color, isFtp }) {
  const wkg = (value / WEIGHT).toFixed(2);
  return (
    <Paper p="xs" ta="center" style={{ backgroundColor: 'var(--tribos-bg-tertiary)' }}>
      <Text size="xs" c="dimmed">{label}</Text>
      <Text size="sm" fw={700} c={color}>{value}W</Text>
      <Text size="xs" c="dimmed">{wkg}</Text>
    </Paper>
  );
}


// ===== Power Duration Curve (Recharts — matches PowerDurationCurve.jsx) =====
function PowerDurationSection() {
  const PDCTooltip = ({ active, payload }) => {
    if (!active || !payload || payload.length === 0) return null;
    const data = payload[0].payload;
    return (
      <Card withBorder p="xs" style={{ backgroundColor: 'var(--tribos-bg-secondary)' }}>
        <Text size="xs" fw={600} mb="xs" style={{ color: 'var(--tribos-text-primary)' }}>
          {data.name}
        </Text>
        {data.current && (
          <Group justify="space-between" gap="md">
            <Text size="xs" c="yellow">Current:</Text>
            <Text size="xs" fw={600} style={{ color: 'var(--tribos-text-primary)' }}>
              {data.current}W ({data.currentWkg} W/kg)
            </Text>
          </Group>
        )}
        {data.previous && (
          <Group justify="space-between" gap="md">
            <Text size="xs" c="dimmed">Previous:</Text>
            <Text size="xs" c="dimmed">{data.previous}W</Text>
          </Group>
        )}
        {data.current && data.previous && (
          <Group justify="space-between" gap="md">
            <Text size="xs" c="green">
              +{data.current - data.previous}W
            </Text>
          </Group>
        )}
      </Card>
    );
  };

  return (
    <Card>
      <Group justify="space-between" mb="md" wrap="wrap">
        <Group gap="sm">
          <IconBolt size={20} color={tokens.colors.zone4} />
          <Text size="sm" fw={600} style={{ color: 'var(--tribos-text-primary)' }}>
            Power Duration Curve
          </Text>
          <Badge color="grape" variant="light" size="sm">All-Rounder</Badge>
        </Group>
        <SegmentedControl
          size="xs"
          value="90"
          readOnly
          data={[
            { label: '42 days', value: '42' },
            { label: '90 days', value: '90' },
            { label: '1 year', value: '365' },
            { label: 'All time', value: 'all' },
          ]}
        />
      </Group>

      {/* Key Power Metrics */}
      <SimpleGrid cols={{ base: 3, sm: 6 }} spacing="xs" mb="md">
        <PowerMetricCard label="5s" value={powerBests.sprint5s} color="pink" />
        <PowerMetricCard label="1m" value={powerBests.oneMin} color="red" />
        <PowerMetricCard label="5m" value={powerBests.fiveMin} color="orange" />
        <PowerMetricCard label="20m" value={powerBests.twentyMin} color="yellow" />
        <PowerMetricCard label="60m" value={powerBests.sixtyMin} color="green" />
        <PowerMetricCard label="FTP" value={FTP} color="blue" isFtp />
      </SimpleGrid>

      {/* Power Curve Chart */}
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={pdcData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--tribos-bg-tertiary)" />
          <XAxis dataKey="duration" tick={{ fontSize: 12, fill: 'var(--tribos-text-muted)' }} />
          <YAxis
            tick={{ fontSize: 12, fill: 'var(--tribos-text-muted)' }}
            label={{
              value: 'Watts',
              angle: -90,
              position: 'insideLeft',
              style: { textAnchor: 'middle', fill: 'var(--tribos-text-muted)', fontSize: 12 },
            }}
          />
          <RechartsTooltip content={<PDCTooltip />} />
          <ReferenceLine
            y={FTP}
            stroke={tokens.colors.zone4}
            strokeDasharray="5 5"
            label={{
              value: `FTP: ${FTP}W`,
              position: 'right',
              fill: tokens.colors.zone4,
              fontSize: 11,
            }}
          />
          <Line
            type="monotone"
            dataKey="previous"
            stroke="var(--tribos-text-muted)"
            strokeWidth={1}
            strokeDasharray="3 3"
            dot={false}
            name="Previous"
          />
          <Line
            type="monotone"
            dataKey="current"
            stroke="#fbbf24"
            strokeWidth={2}
            dot={{ fill: '#fbbf24', r: 3 }}
            activeDot={{ r: 5, fill: '#fbbf24' }}
            name="Current"
          />
        </LineChart>
      </ResponsiveContainer>

      {/* Rider type description */}
      <Paper p="xs" mt="md" style={{ backgroundColor: 'var(--tribos-bg-tertiary)' }}>
        <Group gap="xs">
          <IconTrophy size={16} color="var(--tribos-terracotta-500)" />
          <Text size="xs" style={{ color: 'var(--tribos-text-secondary)' }}>
            <Text span fw={600} c="grape">All-Rounder</Text>
            {' - '}Balanced power profile
          </Text>
        </Group>
      </Paper>

      <Text size="xs" style={{ color: 'var(--tribos-text-muted)' }} mt="md">
        Power curve shows best efforts at each duration. Dashed line shows previous period for comparison.
      </Text>
    </Card>
  );
}


// ===== Zone Distribution (Recharts — matches ZoneDistributionChart.jsx) =====
function ZoneDistributionSection() {
  const totalTimeSeconds = 153000; // ~42.5 hours
  const z2Pct = 50;
  const highIntensityPct = 30;

  const ZoneTooltip = ({ active, payload }) => {
    if (!active || !payload || payload.length === 0) return null;
    const data = payload[0].payload;
    return (
      <Card withBorder p="xs" style={{ backgroundColor: 'var(--tribos-bg-secondary)' }}>
        <Group gap="xs" mb="xs">
          <Box w={12} h={12} style={{ backgroundColor: data.color, borderRadius: 2 }} />
          <Text size="xs" fw={600} style={{ color: 'var(--tribos-text-primary)' }}>
            Zone {data.zone}: {data.name}
          </Text>
        </Group>
        <Text size="xs" style={{ color: 'var(--tribos-text-secondary)' }}>
          {data.hours}h ({data.percentage}%)
        </Text>
      </Card>
    );
  };

  return (
    <Card>
      <Group justify="space-between" mb="md" wrap="wrap">
        <Group gap="sm">
          <IconChartPie size={20} color="var(--tribos-terracotta-500)" />
          <Text size="sm" fw={600} style={{ color: 'var(--tribos-text-primary)' }}>
            Training Zone Distribution
          </Text>
          <Badge color="green" variant="light" size="sm">Polarized</Badge>
        </Group>
        <Group gap="xs">
          <SegmentedControl
            size="xs"
            value="90"
            readOnly
            data={[
              { label: '7d', value: '7' },
              { label: '30d', value: '30' },
              { label: '90d', value: '90' },
            ]}
          />
          <SegmentedControl
            size="xs"
            value="bar"
            readOnly
            data={[
              { label: 'Bar', value: 'bar' },
              { label: 'Pie', value: 'pie' },
            ]}
          />
        </Group>
      </Group>

      {/* Summary Stats */}
      <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="xs" mb="md">
        <Paper p="xs" style={{ backgroundColor: 'var(--tribos-bg-tertiary)' }}>
          <Group gap="xs">
            <IconClock size={14} color="var(--tribos-text-muted)" />
            <Text size="xs" c="dimmed">Total Time</Text>
          </Group>
          <Text size="sm" fw={600}>42h 15m</Text>
        </Paper>
        <Paper p="xs" style={{ backgroundColor: 'var(--tribos-bg-tertiary)' }}>
          <Group gap="xs">
            <Box w={8} h={8} style={{ backgroundColor: tokens.colors.zone2, borderRadius: '50%' }} />
            <Text size="xs" c="dimmed">Zone 2</Text>
          </Group>
          <Text size="sm" fw={600}>{z2Pct}%</Text>
        </Paper>
        <Paper p="xs" style={{ backgroundColor: 'var(--tribos-bg-tertiary)' }}>
          <Group gap="xs">
            <IconFlame size={14} color={tokens.colors.zone5} />
            <Text size="xs" c="dimmed">High Intensity</Text>
          </Group>
          <Text size="sm" fw={600}>{highIntensityPct}%</Text>
        </Paper>
        <Paper p="xs" style={{ backgroundColor: 'var(--tribos-bg-tertiary)' }}>
          <Text size="xs" c="dimmed">Activities</Text>
          <Text size="sm" fw={600}>47</Text>
        </Paper>
      </SimpleGrid>

      {/* Bar Chart */}
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={zoneChartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--tribos-bg-tertiary)" />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 12, fill: 'var(--tribos-text-muted)' }}
            angle={-20}
            textAnchor="end"
            height={50}
          />
          <YAxis
            tick={{ fontSize: 12, fill: 'var(--tribos-text-muted)' }}
            label={{
              value: '%',
              angle: -90,
              position: 'insideLeft',
              style: { textAnchor: 'middle', fill: 'var(--tribos-text-muted)', fontSize: 12 },
            }}
          />
          <RechartsTooltip content={<ZoneTooltip />} />
          <Bar dataKey="percentage" radius={[4, 4, 0, 0]}>
            {zoneChartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {/* Zone Breakdown with Progress Bars */}
      <Stack gap="xs" mt="md">
        {zoneChartData.map((zone) => (
          <Group key={zone.zone} gap="sm" align="center">
            <Badge
              w={25}
              h={25}
              p={0}
              style={{ backgroundColor: zone.color }}
              variant="filled"
            >
              <Text size="xs" fw={700}>{zone.zone}</Text>
            </Badge>
            <Box style={{ flex: 1 }}>
              <Group justify="space-between" mb={2}>
                <Text size="xs">{zone.name}</Text>
                <Text size="xs" c="dimmed">{zone.hours}h ({zone.percentage}%)</Text>
              </Group>
              <Progress
                value={zone.percentage}
                color={zone.color}
                size="xs"
                radius="xl"
              />
            </Box>
          </Group>
        ))}
      </Stack>

      {/* Distribution insight */}
      <Paper p="xs" mt="md" style={{ backgroundColor: 'var(--tribos-bg-tertiary)' }}>
        <Text size="xs" style={{ color: 'var(--tribos-text-secondary)' }}>
          <Text span fw={600} c="green">Polarized Distribution:</Text>
          {' '}80/20 distribution - optimal for endurance building
        </Text>
      </Paper>

      <Text size="xs" style={{ color: 'var(--tribos-text-muted)' }} mt="md">
        Zone distribution estimated from average power/HR. 80/20 polarized training is optimal for most athletes.
      </Text>
    </Card>
  );
}


// ===== Route Intelligence (SVG — no direct Recharts equivalent in app) =====
function RouteIntelligence({ animate }) {
  const width = 400;
  const height = 120;
  const padding = { top: 15, right: 15, bottom: 25, left: 40 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const maxKm = 50;
  const maxElev = 270;
  const minElev = 100;

  const toX = (km) => padding.left + (km / maxKm) * chartW;
  const toY = (elev) => padding.top + ((maxElev - elev) / (maxElev - minElev)) * chartH;

  const profilePath = routeProfile.map((d, i) =>
    `${i === 0 ? 'M' : 'L'}${toX(d.km)},${toY(d.elev)}`
  ).join(' ');

  const profileRef = useRef(null);
  const [profileLength, setProfileLength] = useState(800);

  useEffect(() => {
    if (profileRef.current) setProfileLength(profileRef.current.getTotalLength());
  }, []);

  const barH = 12;
  const barGap = 6;
  const barMaxW = 130;

  return (
    <Paper p="sm" style={{ overflow: 'hidden' }}>
      <Text size="xs" fw={600} mb="xs" style={{ fontFamily: "'DM Mono', monospace", color: 'var(--tribos-text-muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>
        Route Intelligence
      </Text>
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
        <Box>
          <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto' }}>
            {[150, 200, 250].map(v => (
              <g key={v}>
                <line x1={padding.left} y1={toY(v)} x2={width - padding.right} y2={toY(v)}
                  stroke="var(--tribos-border-default)" strokeWidth="0.5" strokeDasharray="4,4" opacity="0.4" />
                <text x={padding.left - 6} y={toY(v) + 3} textAnchor="end"
                  style={{ fontSize: 8, fontFamily: "'DM Mono', monospace", fill: 'var(--tribos-text-muted)' }}>
                  {v}m
                </text>
              </g>
            ))}

            {terrainSegments.map((seg, i) => {
              const segPoints = routeProfile.filter(d => d.km >= seg.start && d.km <= seg.end);
              if (segPoints.length < 2) return null;
              const areaPath = segPoints.map((d, j) =>
                `${j === 0 ? 'M' : 'L'}${toX(d.km)},${toY(d.elev)}`
              ).join(' ')
                + `L${toX(seg.end)},${padding.top + chartH}`
                + `L${toX(seg.start)},${padding.top + chartH}Z`;
              return (
                <path key={i} d={areaPath} fill={seg.color}
                  style={{
                    opacity: animate ? 0.2 : 0,
                    transition: `opacity 0.5s ease-out ${0.8 + i * 0.1}s`,
                  }}
                />
              );
            })}

            <path ref={profileRef} d={profilePath} fill="none" stroke="var(--tribos-text-secondary)" strokeWidth="1.5"
              strokeLinecap="round" strokeLinejoin="round"
              style={{
                strokeDasharray: profileLength,
                strokeDashoffset: animate ? 0 : profileLength,
                transition: animate ? 'stroke-dashoffset 2s ease-out 0.3s' : 'none',
              }}
            />

            {[0, 10, 20, 30, 40, 50].map(km => (
              <text key={km} x={toX(km)} y={height - 6} textAnchor="middle"
                style={{ fontSize: 8, fontFamily: "'DM Mono', monospace", fill: 'var(--tribos-text-muted)' }}>
                {km}km
              </text>
            ))}
          </svg>

          <Group gap="xs" mt={4} justify="center">
            {[
              { label: 'Flat', color: tokens.colors.zone2 },
              { label: 'Rolling', color: tokens.colors.zone3 },
              { label: 'Climb', color: tokens.colors.zone4 },
              { label: 'Descent', color: tokens.colors.zone1 },
            ].map(t => (
              <Group key={t.label} gap={3}>
                <Box style={{ width: 8, height: 8, background: t.color, opacity: 0.6 }} />
                <Text size="xs" style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'var(--tribos-text-muted)' }}>
                  {t.label}
                </Text>
              </Group>
            ))}
          </Group>
        </Box>

        <Box>
          <svg viewBox={`0 0 240 ${routeSuitability.length * (barH + barGap) + 10}`} style={{ width: '100%', height: 'auto' }}>
            {routeSuitability.map((d, i) => {
              const y = i * (barH + barGap) + 5;
              const barW = (d.score / 100) * barMaxW;
              return (
                <g key={d.label}>
                  <text x={0} y={y + barH - 2}
                    style={{ fontSize: 10, fontFamily: "'DM Mono', monospace", fill: 'var(--tribos-text-secondary)' }}>
                    {d.label}
                  </text>
                  <rect x={75} y={y} width={barMaxW} height={barH} rx={0}
                    fill="var(--tribos-border-default)" opacity="0.3" />
                  <rect x={75} y={y} width={barW} height={barH} rx={0}
                    fill={d.color} opacity="0.7"
                    style={{
                      transformOrigin: `75px ${y + barH / 2}px`,
                      transform: animate ? 'scaleX(1)' : 'scaleX(0)',
                      transition: `transform 0.6s ease-out ${0.6 + i * 0.1}s`,
                    }}
                  />
                  <text x={75 + barMaxW + 8} y={y + barH - 2}
                    style={{
                      fontSize: 10, fontFamily: "'DM Mono', monospace", fontWeight: 600, fill: d.color,
                      opacity: animate ? 1 : 0,
                      transition: `opacity 0.3s ease-out ${1 + i * 0.1}s`,
                    }}>
                    {d.score}%
                  </text>
                </g>
              );
            })}
          </svg>
        </Box>
      </SimpleGrid>
    </Paper>
  );
}


// ===== Main AnalyzeStep Component =====
export default function AnalyzeStep() {
  const { ref, isVisible } = useScrollReveal({ threshold: 0.15 });
  const reducedMotion = usePrefersReducedMotion();
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    if (isVisible) {
      if (reducedMotion) {
        setAnimate(true);
      } else {
        const timer = setTimeout(() => setAnimate(true), 400);
        return () => clearTimeout(timer);
      }
    }
  }, [isVisible, reducedMotion]);

  return (
    <Box py={{ base: 60, md: 100 }} px={{ base: 'md', md: 'xl' }}>
      <Container size="md">
        <div ref={ref} className={`landing-step ${isVisible ? 'visible' : ''}`}>
          <Stack gap="xl" align="center">
            <div>
              <Text
                className="step-label"
                size="xs"
                ta="center"
                style={{
                  fontFamily: "'DM Mono', monospace",
                  letterSpacing: '3px',
                  textTransform: 'uppercase',
                  color: 'var(--tribos-terracotta-500)',
                  marginBottom: 8,
                }}
              >
                Step 03 — Analyze
              </Text>
              <Text
                className="step-title"
                ta="center"
                style={{
                  fontSize: 'clamp(1.4rem, 3.5vw, 2.2rem)',
                  fontFamily: "'Anybody', sans-serif",
                  fontWeight: 800,
                  color: 'var(--tribos-text-primary)',
                }}
              >
                Your numbers start talking.
              </Text>
            </div>

            <SimpleGrid className="step-content" cols={{ base: 1, md: 2 }} spacing="lg" style={{ width: '100%' }}>
              <Box style={{ gridColumn: '1 / -1' }}>
                <TrainingLoadSection />
              </Box>
              <PowerDurationSection />
              <ZoneDistributionSection />
              <Box style={{ gridColumn: '1 / -1' }}>
                <RouteIntelligence animate={animate} />
              </Box>
            </SimpleGrid>
          </Stack>
        </div>
      </Container>
    </Box>
  );
}
