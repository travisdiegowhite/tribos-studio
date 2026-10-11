import { useMemo } from 'react';
import { Badge, Box, Group, Text, Tooltip } from '@mantine/core';
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
import { StatRow, SubHeading, TONE, kicker, mono, tooltipStyle, useChartColors } from './train/progressUi.jsx';
import { Check, Heart, Info, TrendUp, Warning } from '@phosphor-icons/react';

/**
 * Aerobic Decoupling Analysis Component
 *
 * Aerobic Decoupling (Pw:Hr or EF) measures the relationship between
 * power and heart rate during a ride. As aerobic fitness improves:
 * - You produce more power at the same heart rate
 * - Or maintain the same power with a lower heart rate
 *
 * Decoupling < 5% = Excellent aerobic fitness / well-paced ride
 * Decoupling 5-10% = Good, normal for moderate efforts
 * Decoupling > 10% = Poor pacing or low aerobic fitness
 *
 * Tracking this metric over time shows aerobic fitness improvements.
 */

/**
 * Calculate Efficiency Factor (EF) = Power / Heart Rate
 * Higher EF = better efficiency
 */
export function calculateEfficiencyFactor(avgPower, avgHR) {
  if (!avgPower || !avgHR || avgHR === 0) return null;
  return Math.round((avgPower / avgHR) * 100) / 100;
}

/**
 * Calculate aerobic decoupling from first and second half of ride
 * Returns percentage difference in efficiency between halves
 */
export function calculateDecoupling(firstHalfEF, secondHalfEF) {
  if (!firstHalfEF || !secondHalfEF || firstHalfEF === 0) return null;
  const decoupling = ((firstHalfEF - secondHalfEF) / firstHalfEF) * 100;
  return Math.round(decoupling * 10) / 10;
}

/**
 * Interpret decoupling percentage
 */
export function interpretDecoupling(decoupling) {
  if (decoupling === null) return null;

  if (decoupling < 0) {
    return {
      status: 'negative',
      color: 'blue',
      icon: TrendUp,
      message: 'Negative decoupling - you got stronger!',
      description: 'Heart rate dropped or power increased in the second half. Unusual but can happen with good pacing or tailwind.',
    };
  } else if (decoupling < 3) {
    return {
      status: 'excellent',
      color: 'green',
      icon: Check,
      message: 'Excellent aerobic fitness',
      description: 'Minimal heart-rate drift — a strong aerobic engine and good pacing.',
    };
  } else if (decoupling < 5) {
    return {
      status: 'good',
      color: 'blue',
      icon: Check,
      message: 'Good aerobic fitness',
      description: 'Low heart-rate drift shows solid aerobic conditioning.',
    };
  } else if (decoupling < 10) {
    return {
      status: 'moderate',
      color: 'yellow',
      icon: Info,
      message: 'Moderate decoupling',
      description: 'Normal for hard efforts. On steady endurance rides, it means room for aerobic improvement.',
    };
  } else if (decoupling < 15) {
    return {
      status: 'high',
      color: 'orange',
      icon: Warning,
      message: 'High decoupling',
      description: 'Significant heart-rate drift — could be accumulated fatigue, heat, or pacing.',
    };
  } else {
    return {
      status: 'very_high',
      color: 'red',
      icon: Warning,
      message: 'Very high decoupling',
      description: 'Heart rate climbed a lot at the same power — review pacing, hydration, and heat.',
    };
  }
}

/**
 * Estimate decoupling from activity data
 * Without power stream data, we use simplified estimation
 */
export function estimateDecouplingFromActivity(activity) {
  if (!activity || !activity.average_watts || !activity.average_heartrate) {
    return null;
  }

  // Without stream data, we estimate based on ride characteristics
  // Longer rides typically have more decoupling
  // Higher intensity rides have more decoupling
  const duration = (activity.moving_time || 0) / 60; // minutes
  const avgPower = activity.average_watts;
  const maxPower = activity.max_watts || avgPower * 1.3;
  const avgHR = activity.average_heartrate;
  const maxHR = activity.max_heartrate || avgHR * 1.2;

  // Calculate overall Efficiency Factor
  const ef = calculateEfficiencyFactor(avgPower, avgHR);

  // Estimate decoupling based on ride characteristics
  // This is a rough estimate - actual decoupling requires power/HR stream data
  let estimatedDecoupling;

  // Variability indicator
  const powerVariability = maxPower / avgPower;
  const hrVariability = maxHR / avgHR;

  // Longer rides = more decoupling typically
  const durationFactor = Math.min(duration / 120, 1) * 3; // 0-3% based on duration

  // Higher intensity = more decoupling
  const intensityFactor = (avgPower / 250) * 2; // Rough estimate

  // High variability = more decoupling
  const variabilityFactor = (powerVariability - 1) * 5;

  estimatedDecoupling = durationFactor + intensityFactor + variabilityFactor;
  estimatedDecoupling = Math.max(0, Math.min(20, estimatedDecoupling)); // Clamp to reasonable range

  return {
    ef,
    decoupling: Math.round(estimatedDecoupling * 10) / 10,
    interpretation: interpretDecoupling(estimatedDecoupling),
    isEstimate: true,
  };
}

/**
 * Aerobic Decoupling Card Component
 * Shows decoupling analysis for recent activities
 */
const AerobicDecoupling = ({ activities, timeRange = 90 }) => {
  const CHART = useChartColors();
  const axisTick = { fontSize: 11, fill: CHART.axis, fontFamily: 'var(--font-mono)' };
  // Analyze activities for decoupling trends
  const analysis = useMemo(() => {
    if (!activities || activities.length === 0) return null;

    // Filter activities with both power and HR data
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - timeRange);

    const validActivities = activities.filter(a => {
      const actDate = new Date(a.start_date);
      return actDate >= cutoff &&
        a.average_watts > 0 &&
        a.average_heartrate > 0 &&
        (a.moving_time || 0) > 1800; // At least 30 minutes
    });

    if (validActivities.length === 0) return null;

    // Calculate decoupling for each activity
    const activityData = validActivities.map(a => {
      const result = estimateDecouplingFromActivity(a);
      return {
        date: a.start_date,
        name: a.name,
        duration: a.moving_time / 60,
        avgPower: a.average_watts,
        avgHR: Math.round(a.average_heartrate),
        ef: result?.ef || 0,
        decoupling: result?.decoupling || 0,
        formattedDate: new Date(a.start_date).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric'
        }),
      };
    }).sort((a, b) => new Date(a.date) - new Date(b.date));

    // Calculate trends
    const recentEFs = activityData.slice(-10).map(a => a.ef);
    const avgEF = recentEFs.reduce((sum, ef) => sum + ef, 0) / recentEFs.length;

    const olderEFs = activityData.slice(0, Math.min(10, activityData.length)).map(a => a.ef);
    const oldAvgEF = olderEFs.reduce((sum, ef) => sum + ef, 0) / olderEFs.length;

    const efTrend = ((avgEF - oldAvgEF) / oldAvgEF) * 100;

    // Average decoupling
    const avgDecoupling = activityData.reduce((sum, a) => sum + a.decoupling, 0) / activityData.length;

    return {
      activities: activityData,
      avgEF: Math.round(avgEF * 100) / 100,
      avgDecoupling: Math.round(avgDecoupling * 10) / 10,
      efTrend: Math.round(efTrend * 10) / 10,
      interpretation: interpretDecoupling(avgDecoupling),
      count: activityData.length,
    };
  }, [activities, timeRange]);

  // Custom tooltip: flat, ruled, numbers in Courier
  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload || payload.length === 0) return null;
    const data = payload[0].payload;
    const row = (label, value) => (
      <Group justify="space-between" gap="md" wrap="nowrap">
        <Text size="xs" c="var(--color-text-secondary)">{label}</Text>
        <Text size="xs" fw={700} style={mono}>{value}</Text>
      </Group>
    );
    return (
      <Box style={tooltipStyle} p={8}>
        <Text size="xs" fw={700} mb={4}>{data.name}</Text>
        {row('EF', data.ef)}
        {row('Decoupling', `${data.decoupling}%`)}
        {row('Avg power', `${data.avgPower}W`)}
        {row('Avg HR', `${data.avgHR} bpm`)}
      </Box>
    );
  };

  if (!analysis) {
    return (
      <Box>
        <SubHeading>Aerobic efficiency</SubHeading>
        <Text size="sm" style={{ color: 'var(--color-text-secondary)' }}>
          No activities with both power and heart rate data available. Use a power meter and HR monitor together
          to track aerobic efficiency.
        </Text>
      </Box>
    );
  }

  // Decoupling status → role tone (good news in ink, drift in signal)
  const status = analysis.interpretation?.status;
  const tone = ['moderate', 'high', 'very_high'].includes(status) ? TONE.warn : TONE.neutral;
  const markerPct = Math.min(Math.max(analysis.avgDecoupling, 0) / 20 * 100, 100);

  return (
    <Box>
      <SubHeading
        aside={
          <Text style={{ ...mono, fontSize: 13, fontWeight: 700, color: tone }}>
            {analysis.avgDecoupling}% avg drift
          </Text>
        }
      >
        Aerobic efficiency
      </SubHeading>

      {/* The gloss leads: say what this measures before any number uses the terms. */}
      <Text size="xs" c="var(--color-text-secondary)" mb="sm">
        Efficiency (EF) = Effective Power (EP) / Heart Rate — how much power each
        heartbeat buys you. Higher is better. &quot;Drift&quot; (decoupling) is how much your
        heart rate rose at the same power as a ride went on — lower means a stronger
        aerobic base.
      </Text>

      <StatRow
        minWidth={130}
        stats={[
          { label: 'Avg EF', value: String(analysis.avgEF), note: 'watts per heartbeat' },
          { label: 'Avg decoupling', value: `${analysis.avgDecoupling}%`, color: tone, note: analysis.interpretation?.message },
          {
            label: 'EF trend',
            value: `${analysis.efTrend > 0 ? '+' : ''}${analysis.efTrend}%`,
            color: analysis.efTrend < 0 ? TONE.warn : TONE.neutral,
            note: 'vs older rides',
          },
          { label: 'Rides analysed', value: String(analysis.count), note: `last ${timeRange} days` },
        ]}
      />

      {/* Efficiency factor trend */}
      {analysis.activities.length > 3 && (
        <Box mt="md">
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={analysis.activities} margin={{ top: 5, right: 12, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
              <XAxis dataKey="formattedDate" tick={axisTick} interval="preserveStartEnd" minTickGap={28} stroke={CHART.baseline} />
              <YAxis
                tick={axisTick}
                stroke={CHART.baseline}
                domain={['auto', 'auto']}
                width={44}
                label={{ value: 'EF (W/bpm)', angle: -90, position: 'insideLeft', style: { fill: CHART.axis, fontSize: 11 } }}
              />
              <RechartsTooltip content={<CustomTooltip />} />
              {/* Average EF */}
              <ReferenceLine y={analysis.avgEF} stroke={CHART.baseline} strokeDasharray="5 5" />
              <Line type="monotone" dataKey="ef" stroke={CHART.fitness} strokeWidth={2} dot={{ fill: CHART.fitness, r: 2.5 }} />
            </LineChart>
          </ResponsiveContainer>
        </Box>
      )}

      {/* What it means */}
      {analysis.interpretation && (
        <Box mt="sm" style={{ borderLeft: `3px solid ${tone === TONE.warn ? 'var(--color-signal)' : 'var(--color-ink)'}`, paddingLeft: 10 }}>
          <Text size="sm" fw={700}>{analysis.interpretation.message}</Text>
          <Text size="xs" mt={2} c="var(--color-text-secondary)">{analysis.interpretation.description}</Text>
        </Box>
      )}

      {/* Decoupling scale: 0–5% is a strong base; drift above that in signal */}
      <Box mt="md">
        <Text style={kicker} mb={6}>Decoupling scale</Text>
        <Box style={{ position: 'relative', height: 10, display: 'flex' }}>
          <Box style={{ width: '25%', backgroundColor: 'var(--color-ink)' }} />
          <Box style={{ width: '25%', backgroundColor: 'var(--color-easy)' }} />
          <Box style={{ width: '25%', backgroundColor: 'var(--color-signal-subtle)' }} />
          <Box style={{ width: '25%', backgroundColor: 'var(--color-signal)' }} />
          <Box
            aria-hidden
            style={{ position: 'absolute', left: `calc(${markerPct}% - 1.5px)`, top: -4, bottom: -4, width: 3, backgroundColor: 'var(--color-text-primary)', outline: '1px solid var(--color-bg)' }}
          />
        </Box>
        <Group justify="space-between" mt={4}>
          {['0%', '5%', '10%', '15%', '20%+'].map((t) => (
            <Text key={t} style={{ ...mono, fontSize: 10, color: 'var(--color-text-muted)' }}>{t}</Text>
          ))}
        </Group>
      </Box>
    </Box>
  );
};

/**
 * Compact EF Badge for activity cards
 */
export function EfficiencyBadge({ avgPower, avgHR }) {
  const ef = calculateEfficiencyFactor(avgPower, avgHR);
  if (!ef) return null;

  return (
    <Tooltip label={`Efficiency Factor: ${ef} W/bpm - Power divided by Heart Rate`}>
      <Badge color="ink" variant="outline" radius={0} size="sm" leftSection={<Heart size={10} />}>
        EF {ef}
      </Badge>
    </Tooltip>
  );
}

export default AerobicDecoupling;
