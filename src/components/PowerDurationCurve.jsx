import { useMemo, useState } from 'react';
import { Box, Group, SegmentedControl, Stack, Text, Tooltip } from '@mantine/core';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { SubHeading, TONE, kicker, mono, tooltipStyle, useChartColors } from './train/progressUi.jsx';

/**
 * Power Duration Curve Component
 * Displays best power outputs across all durations
 * Compares current period to previous periods
 */
const PowerDurationCurve = ({ activities, ftp, weight }) => {
  const [timeRange, setTimeRange] = useState('90'); // 42, 90, 365, all
  const CHART = useChartColors();

  // Standard durations to track (in seconds)
  const STANDARD_DURATIONS = [
    { seconds: 5, label: '5s', name: 'Peak Sprint' },
    { seconds: 15, label: '15s', name: 'Sprint' },
    { seconds: 30, label: '30s', name: 'Anaerobic' },
    { seconds: 60, label: '1m', name: '1 Minute' },
    { seconds: 120, label: '2m', name: '2 Minutes' },
    { seconds: 300, label: '5m', name: '5 Minutes' },
    { seconds: 480, label: '8m', name: '8 Minutes' },
    { seconds: 600, label: '10m', name: '10 Minutes' },
    { seconds: 1200, label: '20m', name: '20 Minutes' },
    { seconds: 1800, label: '30m', name: '30 Minutes' },
    { seconds: 3600, label: '60m', name: '60 Minutes' },
    { seconds: 5400, label: '90m', name: '90 Minutes' },
    { seconds: 7200, label: '2h', name: '2 Hours' },
  ];

  // Calculate best efforts for each duration
  const powerCurveData = useMemo(() => {
    if (!activities || activities.length === 0) return { current: [], previous: [], bests: {}, usingRealData: false };

    // Filter by time range
    const days = timeRange === 'all' ? 9999 : parseInt(timeRange);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const previousCutoff = new Date();
    previousCutoff.setDate(previousCutoff.getDate() - (days * 2));

    // Filter activities with power data
    const currentActivities = activities.filter(a => {
      const actDate = new Date(a.start_date);
      return actDate >= cutoffDate && a.average_watts > 0;
    });

    const previousActivities = activities.filter(a => {
      const actDate = new Date(a.start_date);
      return actDate >= previousCutoff && actDate < cutoffDate && a.average_watts > 0;
    });

    // Calculate best power for each duration.
    // Prefer real Mean Maximal Power from each activity's power_curve_summary
    // (same JSONB used by ActivityPowerCurve). Only fall back to the avg/max
    // decay-model estimate for activities that lack it. `usedRealData` lets the
    // UI label the curve honestly when nothing real was available.
    const calculateBestPowers = (activityList) => {
      const bests = {};
      let usedRealData = false;

      STANDARD_DURATIONS.forEach(({ seconds }) => {
        bests[seconds] = 0;
      });

      activityList.forEach(activity => {
        const pcs = activity.power_curve_summary;
        const hasPcs = pcs && typeof pcs === 'object';
        const avgWatts = activity.average_watts || 0;
        const maxWatts = activity.max_watts || avgWatts * 1.5;
        const duration = activity.moving_time || 0;

        STANDARD_DURATIONS.forEach(({ seconds }) => {
          // 1) Real best effort for this duration, if recorded.
          const realWatts = hasPcs ? pcs[`${seconds}s`] : null;
          if (realWatts && realWatts > 0) {
            usedRealData = true;
            if (realWatts > bests[seconds]) {
              bests[seconds] = Math.round(realWatts);
            }
            return;
          }

          // 2) Fallback: estimate via simplified power decay model.
          if (duration >= seconds) {
            const factor = Math.pow(seconds / duration, 0.07); // Decay factor
            const estimatedPower = avgWatts + (maxWatts - avgWatts) * Math.max(0, 1 - factor);
            if (estimatedPower > bests[seconds]) {
              bests[seconds] = Math.round(estimatedPower);
            }
          }
        });
      });

      return { bests, usedRealData };
    };

    const currentResult = calculateBestPowers(currentActivities);
    const previousResult = calculateBestPowers(previousActivities);
    const currentBests = currentResult.bests;
    const previousBests = previousResult.bests;
    const usingRealData = currentResult.usedRealData || previousResult.usedRealData;

    // Build chart data
    const chartData = STANDARD_DURATIONS.map(({ seconds, label, name }) => {
      const current = currentBests[seconds] || null;
      const previous = previousBests[seconds] || null;
      const improvement = current && previous ? current - previous : null;

      return {
        duration: label,
        durationSeconds: seconds,
        name,
        current,
        previous,
        improvement,
        currentWkg: current && weight ? (current / weight).toFixed(2) : null,
        previousWkg: previous && weight ? (previous / weight).toFixed(2) : null,
      };
    }).filter(d => d.current !== null || d.previous !== null);

    // Calculate key metrics
    const bests = {
      sprint5s: currentBests[5],
      sprint30s: currentBests[30],
      oneMin: currentBests[60],
      fiveMin: currentBests[300],
      twentyMin: currentBests[1200],
      sixtyMin: currentBests[3600],
    };

    return { current: chartData, bests, usingRealData };
  }, [activities, timeRange, weight]);

  // Determine rider type based on power profile
  const riderType = useMemo(() => {
    const { bests } = powerCurveData;
    if (!bests.fiveMin || !bests.oneMin) return null;

    const fiveToOneRatio = bests.fiveMin / bests.oneMin;
    const twentyToFiveRatio = bests.twentyMin ? bests.twentyMin / bests.fiveMin : 0;

    if (bests.sprint5s && bests.sprint5s / bests.fiveMin > 2.2) {
      return { type: 'Sprinter', description: 'Explosive power specialist' };
    } else if (fiveToOneRatio < 0.75) {
      return { type: 'Pursuiter', description: 'Strong in 3-5 minute efforts' };
    } else if (twentyToFiveRatio > 0.9) {
      return { type: 'Time Trialist', description: 'Excellent sustained power' };
    } else if (bests.sixtyMin && bests.sixtyMin / bests.fiveMin > 0.8) {
      return { type: 'Climber', description: 'Strong endurance climber' };
    } else {
      return { type: 'All-Rounder', description: 'Balanced power profile' };
    }
  }, [powerCurveData]);

  // Custom tooltip: flat, ruled, numbers in Courier
  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload || payload.length === 0) return null;
    const data = payload[0].payload;

    return (
      <Box style={tooltipStyle} p={8}>
        <Text size="xs" fw={700} mb={4}>{data.name}</Text>
        {data.current && (
          <Group justify="space-between" gap="md" wrap="nowrap">
            <Text size="xs" c="var(--color-text-secondary)">Current</Text>
            <Text size="xs" fw={700} style={mono}>
              {data.current}W {data.currentWkg && `(${data.currentWkg} W/kg)`}
            </Text>
          </Group>
        )}
        {data.previous && (
          <Group justify="space-between" gap="md" wrap="nowrap">
            <Text size="xs" c="var(--color-text-muted)">Previous</Text>
            <Text size="xs" style={{ ...mono, color: 'var(--color-text-muted)' }}>{data.previous}W</Text>
          </Group>
        )}
        {data.improvement !== null && data.improvement !== 0 && (
          <Text size="xs" style={{ ...mono, color: data.improvement > 0 ? TONE.neutral : TONE.warn }}>
            {data.improvement > 0 ? '+' : ''}{data.improvement}W
          </Text>
        )}
      </Box>
    );
  };

  if (!powerCurveData.current || powerCurveData.current.length === 0) {
    return (
      <Box>
        <SubHeading>Power duration curve</SubHeading>
        <Text size="sm" style={{ color: 'var(--color-text-secondary)' }}>
          No power data available. Connect a power meter to see your power duration curve.
        </Text>
      </Box>
    );
  }

  const axisTick = { fontSize: 11, fill: CHART.axis, fontFamily: 'var(--font-mono)' };

  return (
    <Box>
      <SubHeading
        aside={
          <SegmentedControl
            size="xs"
            radius={0}
            value={timeRange}
            onChange={setTimeRange}
            styles={{ label: { fontFamily: 'var(--font-mono)' } }}
            data={[
              { label: '42D', value: '42' },
              { label: '90D', value: '90' },
              { label: '1Y', value: '365' },
              { label: 'ALL', value: 'all' },
            ]}
          />
        }
      >
        Power duration curve
      </SubHeading>

      <Group gap="sm" mb="sm" wrap="wrap">
        {riderType && (
          <Text style={{ ...mono, fontSize: 12, border: '1px solid var(--color-ink)', padding: '1px 6px' }}>
            {riderType.type.toUpperCase()}
          </Text>
        )}
        {!powerCurveData.usingRealData && (
          <Tooltip
            multiline
            w={240}
            label="Estimated from each ride's average and max power. Upload activities with full power data (FIT files) for true best-effort numbers."
          >
            <Text style={{ ...mono, fontSize: 12, color: 'var(--color-text-muted)', border: '1px dashed var(--color-border)', padding: '1px 6px' }}>
              ESTIMATED
            </Text>
          </Tooltip>
        )}
      </Group>

      {/* The gloss leads: what this chart is, before the term-heavy numbers. */}
      <Text size="xs" c="var(--color-text-secondary)" mb="sm">
        Your best efforts at each duration, across recent rides — a snapshot of what
        you can do from a few seconds to an hour.
      </Text>

      {/* Key power numbers */}
      <Box
        mb="md"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(84px, 1fr))',
          borderTop: '1px solid var(--color-border)',
          borderBottom: '1px solid var(--color-border)',
        }}
      >
        <PowerMetricCard label="5s" value={powerCurveData.bests.sprint5s} weight={weight} />
        <PowerMetricCard label="1m" value={powerCurveData.bests.oneMin} weight={weight} />
        <PowerMetricCard label="5m" value={powerCurveData.bests.fiveMin} weight={weight} />
        <PowerMetricCard label="20m" value={powerCurveData.bests.twentyMin} weight={weight} ftp={ftp} />
        <PowerMetricCard label="60m" value={powerCurveData.bests.sixtyMin} weight={weight} />
        <PowerMetricCard label="FTP" value={ftp} weight={weight} isFtp />
      </Box>

      {/* Power curve: current period in signal (effort), previous dashed */}
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={powerCurveData.current} margin={{ top: 5, right: 12, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
          <XAxis dataKey="duration" tick={axisTick} stroke={CHART.baseline} />
          <YAxis
            tick={axisTick}
            stroke={CHART.baseline}
            width={44}
            label={{ value: 'Watts', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fill: CHART.axis, fontSize: 11 } }}
          />
          <RechartsTooltip content={<CustomTooltip />} />

          {ftp && (
            <ReferenceLine
              y={ftp}
              stroke={CHART.fitness}
              strokeDasharray="5 5"
              label={{ value: `FTP ${ftp}W`, position: 'right', fill: CHART.fitness, fontSize: 11 }}
            />
          )}

          <Line
            type="monotone"
            dataKey="previous"
            stroke={CHART.future}
            strokeWidth={1}
            strokeDasharray="3 3"
            dot={false}
            name="Previous"
          />
          <Line
            type="monotone"
            dataKey="current"
            stroke={CHART.fatigue}
            strokeWidth={2}
            dot={{ fill: CHART.fatigue, r: 2.5 }}
            activeDot={{ r: 4, fill: CHART.fatigue }}
            name="Current"
          />
        </LineChart>
      </ResponsiveContainer>

      {riderType && (
        <Text size="sm" mt="sm" c="var(--color-text-secondary)">
          <Text span fw={700} c="var(--color-text-primary)">{riderType.type}</Text>
          {' — '}{riderType.description}
        </Text>
      )}

      <Text size="xs" style={{ color: 'var(--color-text-muted)' }} mt="xs">
        Best efforts at each duration. The dashed line is the previous period, for comparison.
      </Text>
    </Box>
  );
};

// One cell of the key-power row: label, Courier watts, W/kg.
function PowerMetricCard({ label, value, weight, ftp, isFtp }) {
  const cell = { padding: '8px 8px 8px 0', minWidth: 0 };
  if (!value) {
    return (
      <Box style={cell}>
        <Text style={kicker}>{label}</Text>
        <Text style={{ ...mono, fontSize: 16, color: 'var(--color-text-muted)' }}>--</Text>
      </Box>
    );
  }

  const wkg = weight ? (value / weight).toFixed(2) : null;
  const ftpPercentage = ftp && !isFtp ? Math.round((value / ftp) * 100) : null;

  return (
    <Tooltip
      label={
        <Stack gap={2}>
          <Text size="xs">{value}W</Text>
          {wkg && <Text size="xs">{wkg} W/kg</Text>}
          {ftpPercentage && <Text size="xs">{ftpPercentage}% of FTP</Text>}
        </Stack>
      }
    >
      <Box style={cell}>
        <Text style={kicker}>{label}</Text>
        <Text style={{ ...mono, fontSize: 16, fontWeight: 700 }}>{value}W</Text>
        {wkg && <Text style={{ ...mono, fontSize: 11, color: 'var(--color-text-muted)' }}>{wkg} W/kg</Text>}
      </Box>
    </Tooltip>
  );
}

export default PowerDurationCurve;
