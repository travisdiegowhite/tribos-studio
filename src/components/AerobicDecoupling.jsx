import { useMemo } from 'react';
import {
  Card,
  Text,
  Group,
  Badge,
  Stack,
  Box,
  Paper,
  SimpleGrid,
  Progress,
  Tooltip,
  Alert,
} from '@mantine/core';
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
import {
  IconHeartRateFilled,
  IconTrendingUp,
  IconTrendingDown,
  IconInfoCircle,
  IconCheck,
  IconAlertTriangle,
} from '@tabler/icons-react';
import { tokens } from '../theme';

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
      icon: IconTrendingUp,
      message: 'Negative decoupling - you got stronger!',
      description: 'Heart rate dropped or power increased in the second half. Unusual but can happen with good pacing or tailwind.',
    };
  } else if (decoupling < 3) {
    return {
      status: 'excellent',
      color: 'green',
      icon: IconCheck,
      message: 'Excellent aerobic fitness',
      description: 'Minimal cardiac drift indicates strong aerobic base and good pacing.',
    };
  } else if (decoupling < 5) {
    return {
      status: 'good',
      color: 'lime',
      icon: IconCheck,
      message: 'Good aerobic fitness',
      description: 'Low decoupling shows solid aerobic conditioning.',
    };
  } else if (decoupling < 10) {
    return {
      status: 'moderate',
      color: 'yellow',
      icon: IconInfoCircle,
      message: 'Moderate decoupling',
      description: 'Normal for hard efforts. For Z2 rides, indicates room for aerobic improvement.',
    };
  } else if (decoupling < 15) {
    return {
      status: 'high',
      color: 'orange',
      icon: IconAlertTriangle,
      message: 'High decoupling',
      description: 'Significant cardiac drift. May indicate overreaching or poor pacing.',
    };
  } else {
    return {
      status: 'very_high',
      color: 'red',
      icon: IconAlertTriangle,
      message: 'Very high decoupling',
      description: 'Excessive cardiac drift. Review pacing, hydration, and heat factors.',
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

  // Custom tooltip
  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload || payload.length === 0) return null;
    const data = payload[0].payload;

    return (
      <Card withBorder p="xs" style={{ backgroundColor: tokens.colors.bgSecondary }}>
        <Text size="xs" fw={600} mb="xs">{data.name}</Text>
        <SimpleGrid cols={2} spacing="xs">
          <Box>
            <Text size="xs" c="dimmed">EF</Text>
            <Text size="sm" fw={600}>{data.ef}</Text>
          </Box>
          <Box>
            <Text size="xs" c="dimmed">Decoupling</Text>
            <Text size="sm" fw={600}>{data.decoupling}%</Text>
          </Box>
          <Box>
            <Text size="xs" c="dimmed">Avg Power</Text>
            <Text size="sm">{data.avgPower}W</Text>
          </Box>
          <Box>
            <Text size="xs" c="dimmed">Avg HR</Text>
            <Text size="sm">{data.avgHR} bpm</Text>
          </Box>
        </SimpleGrid>
      </Card>
    );
  };

  if (!analysis) {
    return (
      <Card withBorder p="xl">
        <Text style={{ color: tokens.colors.textMuted }} ta="center">
          No activities with both power and heart rate data available.
          Use a power meter and HR monitor together to track aerobic efficiency.
        </Text>
      </Card>
    );
  }

  const StatusIcon = analysis.interpretation?.icon || IconInfoCircle;

  return (
    <Card>
      <Group justify="space-between" mb="md" wrap="wrap">
        <Group gap="sm">
          <IconHeartRateFilled size={20} color="#ef4444" />
          <Text size="sm" fw={600} style={{ color: tokens.colors.textPrimary }}>
            Aerobic Efficiency (Pw:Hr)
          </Text>
        </Group>
        <Badge color={analysis.interpretation?.color || 'gray'} variant="light">
          {analysis.avgDecoupling}% avg decoupling
        </Badge>
      </Group>

      {/* Summary Metrics */}
      <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm" mb="md">
        <Paper p="sm" style={{ backgroundColor: tokens.colors.bgTertiary }}>
          <Group gap="xs" mb={2}>
            <IconHeartRateFilled size={14} color="#ef4444" />
            <Text size="xs" c="dimmed">Avg EF</Text>
          </Group>
          <Text size="lg" fw={700}>{analysis.avgEF}</Text>
          <Text size="xs" c="dimmed">Power/HR ratio</Text>
        </Paper>

        <Paper p="sm" style={{ backgroundColor: tokens.colors.bgTertiary }}>
          <Group gap="xs" mb={2}>
            <StatusIcon size={14} color={`var(--mantine-color-${analysis.interpretation?.color}-5)`} />
            <Text size="xs" c="dimmed">Avg Decoupling</Text>
          </Group>
          <Text size="lg" fw={700} c={analysis.interpretation?.color}>
            {analysis.avgDecoupling}%
          </Text>
          <Text size="xs" c="dimmed">{analysis.interpretation?.status}</Text>
        </Paper>

        <Paper p="sm" style={{ backgroundColor: tokens.colors.bgTertiary }}>
          <Group gap="xs" mb={2}>
            {analysis.efTrend > 0 ? (
              <IconTrendingUp size={14} color={tokens.colors.success} />
            ) : (
              <IconTrendingDown size={14} color={tokens.colors.error} />
            )}
            <Text size="xs" c="dimmed">EF Trend</Text>
          </Group>
          <Text size="lg" fw={700} c={analysis.efTrend > 0 ? 'green' : 'red'}>
            {analysis.efTrend > 0 ? '+' : ''}{analysis.efTrend}%
          </Text>
          <Text size="xs" c="dimmed">vs older rides</Text>
        </Paper>

        <Paper p="sm" style={{ backgroundColor: tokens.colors.bgTertiary }}>
          <Text size="xs" c="dimmed" mb={2}>Activities Analyzed</Text>
          <Text size="lg" fw={700}>{analysis.count}</Text>
          <Text size="xs" c="dimmed">Last {timeRange} days</Text>
        </Paper>
      </SimpleGrid>

      {/* Efficiency Factor Trend Chart */}
      {analysis.activities.length > 3 && (
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={analysis.activities} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={tokens.colors.bgTertiary} />
            <XAxis
              dataKey="formattedDate"
              tick={{ fontSize: 10, fill: tokens.colors.textMuted }}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 11, fill: tokens.colors.textMuted }}
              domain={['auto', 'auto']}
              label={{
                value: 'EF (W/bpm)',
                angle: -90,
                position: 'insideLeft',
                style: { fill: tokens.colors.textMuted, fontSize: 11 }
              }}
            />
            <RechartsTooltip content={<CustomTooltip />} />

            {/* Average EF reference line */}
            <ReferenceLine
              y={analysis.avgEF}
              stroke={tokens.colors.electricLime}
              strokeDasharray="5 5"
            />

            <Line
              type="monotone"
              dataKey="ef"
              stroke="#ef4444"
              strokeWidth={2}
              dot={{ fill: '#ef4444', r: 3 }}
            />
          </LineChart>
        </ResponsiveContainer>
      )}

      {/* Interpretation Alert */}
      {analysis.interpretation && (
        <Alert
          color={analysis.interpretation.color}
          variant="light"
          icon={<StatusIcon size={16} />}
          mt="md"
        >
          <Text size="sm" fw={500}>{analysis.interpretation.message}</Text>
          <Text size="xs" mt={4}>{analysis.interpretation.description}</Text>
        </Alert>
      )}

      {/* Decoupling Scale */}
      <Paper p="sm" mt="md" style={{ backgroundColor: tokens.colors.bgTertiary }}>
        <Text size="xs" fw={500} mb="sm">Decoupling Scale</Text>
        <Box>
          <Group justify="space-between" mb={4}>
            <Text size="xs" c="dimmed">Excellent</Text>
            <Text size="xs" c="dimmed">Moderate</Text>
            <Text size="xs" c="dimmed">High</Text>
          </Group>
          <Box style={{ position: 'relative', height: 8 }}>
            <Progress.Root size="lg" radius="xl">
              <Progress.Section value={15} color="green" />
              <Progress.Section value={10} color="lime" />
              <Progress.Section value={25} color="yellow" />
              <Progress.Section value={25} color="orange" />
              <Progress.Section value={25} color="red" />
            </Progress.Root>
            {/* Marker for current average */}
            <Box
              style={{
                position: 'absolute',
                left: `${Math.min(analysis.avgDecoupling / 20 * 100, 100)}%`,
                top: -6,
                transform: 'translateX(-50%)',
              }}
            >
              <Box
                style={{
                  width: 0,
                  height: 0,
                  borderLeft: '6px solid transparent',
                  borderRight: '6px solid transparent',
                  borderTop: `8px solid ${tokens.colors.textPrimary}`,
                }}
              />
            </Box>
          </Box>
          <Group justify="space-between" mt={4}>
            <Text size="xs" c="dimmed">0%</Text>
            <Text size="xs" c="dimmed">5%</Text>
            <Text size="xs" c="dimmed">10%</Text>
            <Text size="xs" c="dimmed">15%</Text>
            <Text size="xs" c="dimmed">20%+</Text>
          </Group>
        </Box>
      </Paper>

      <Text size="xs" c="dimmed" mt="md">
        EF (Efficiency Factor) = Normalized Power / Heart Rate. Higher is better.
        Track EF over time to see aerobic fitness improvements.
      </Text>
    </Card>
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
      <Badge color="pink" variant="light" size="sm" leftSection={<IconHeartRateFilled size={10} />}>
        EF {ef}
      </Badge>
    </Tooltip>
  );
}

export default AerobicDecoupling;
