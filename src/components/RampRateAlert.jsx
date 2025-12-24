import { useMemo } from 'react';
import {
  Alert,
  Text,
  Group,
  Badge,
  Stack,
  Progress,
  Paper,
  Box,
  Tooltip,
} from '@mantine/core';
import {
  IconTrendingUp,
  IconTrendingDown,
  IconAlertTriangle,
  IconCheck,
  IconInfoCircle,
} from '@tabler/icons-react';
import { tokens } from '../theme';

/**
 * Ramp Rate Alert Component
 * Monitors weekly CTL (fitness) changes and alerts on concerning ramp rates
 *
 * Optimal ramp rate: 3-7 TSS/week
 * Aggressive ramp rate: 7-10 TSS/week (risk of overtraining)
 * Dangerous ramp rate: >10 TSS/week (high injury/illness risk)
 * Detraining: < -5 TSS/week (losing fitness)
 */
const RampRateAlert = ({ dailyTSSData, currentCTL, showDetails = true }) => {
  const rampRateData = useMemo(() => {
    if (!dailyTSSData || dailyTSSData.length < 14) {
      return null;
    }

    // Calculate CTL at different points in time
    const calculateCTLAtDay = (data, endIndex) => {
      if (endIndex < 0) return 0;
      const decay = 1 / 42;
      let ctl = 0;
      const slice = data.slice(0, endIndex + 1);

      slice.forEach((d, index) => {
        const weight = Math.exp(-decay * (slice.length - index - 1));
        ctl += d.tss * weight;
      });

      return Math.round(ctl * decay);
    };

    // Get CTL from 7 days ago and 14 days ago
    const currentIndex = dailyTSSData.length - 1;
    const oneWeekAgoIndex = currentIndex - 7;
    const twoWeeksAgoIndex = currentIndex - 14;

    const ctlNow = currentCTL || calculateCTLAtDay(dailyTSSData, currentIndex);
    const ctlOneWeekAgo = calculateCTLAtDay(dailyTSSData, oneWeekAgoIndex);
    const ctlTwoWeeksAgo = calculateCTLAtDay(dailyTSSData, twoWeeksAgoIndex);

    // Calculate ramp rates
    const weeklyRampRate = ctlNow - ctlOneWeekAgo;
    const previousWeekRampRate = ctlOneWeekAgo - ctlTwoWeeksAgo;
    const trend = weeklyRampRate - previousWeekRampRate;

    // Calculate 4-week average ramp rate for more stability
    const fourWeeksAgoIndex = currentIndex - 28;
    const ctlFourWeeksAgo = calculateCTLAtDay(dailyTSSData, fourWeeksAgoIndex);
    const monthlyRampRate = (ctlNow - ctlFourWeeksAgo) / 4;

    // Determine status
    let status, color, icon, message, recommendation;

    if (weeklyRampRate > 10) {
      status = 'danger';
      color = 'red';
      icon = IconAlertTriangle;
      message = `Ramp rate of +${weeklyRampRate} TSS/week is dangerously high`;
      recommendation = 'Significantly reduce training load immediately. High risk of overtraining, injury, or illness.';
    } else if (weeklyRampRate > 7) {
      status = 'warning';
      color = 'orange';
      icon = IconAlertTriangle;
      message = `Ramp rate of +${weeklyRampRate} TSS/week is aggressive`;
      recommendation = 'Consider backing off slightly. Monitor fatigue levels closely.';
    } else if (weeklyRampRate >= 3 && weeklyRampRate <= 7) {
      status = 'optimal';
      color = 'green';
      icon = IconCheck;
      message = `Ramp rate of +${weeklyRampRate} TSS/week is optimal`;
      recommendation = 'Great job! This is the ideal rate for sustainable fitness gains.';
    } else if (weeklyRampRate >= 0 && weeklyRampRate < 3) {
      status = 'maintenance';
      color = 'blue';
      icon = IconInfoCircle;
      message = `Ramp rate of +${weeklyRampRate} TSS/week - maintaining fitness`;
      recommendation = 'You\'re maintaining fitness. Increase load slightly if looking to improve.';
    } else if (weeklyRampRate >= -5) {
      status = 'recovery';
      color = 'teal';
      icon = IconTrendingDown;
      message = `Ramp rate of ${weeklyRampRate} TSS/week - planned recovery`;
      recommendation = 'This could be a recovery week or taper. Normal if intentional.';
    } else {
      status = 'detraining';
      color = 'yellow';
      icon = IconTrendingDown;
      message = `Ramp rate of ${weeklyRampRate} TSS/week - losing fitness`;
      recommendation = 'Significant fitness loss occurring. Resume training if unintentional.';
    }

    return {
      weeklyRampRate,
      previousWeekRampRate,
      monthlyRampRate: Math.round(monthlyRampRate * 10) / 10,
      trend,
      ctlNow,
      ctlOneWeekAgo,
      status,
      color,
      icon,
      message,
      recommendation,
    };
  }, [dailyTSSData, currentCTL]);

  if (!rampRateData) {
    return null;
  }

  // Don't show alert for optimal/maintenance status unless showDetails is true
  if (!showDetails && (rampRateData.status === 'optimal' || rampRateData.status === 'maintenance')) {
    return null;
  }

  const RampIcon = rampRateData.icon;

  // Calculate progress bar value (normalized to 0-100)
  // Optimal range is 3-7, so we center around 5
  const normalizedRamp = Math.min(15, Math.max(-10, rampRateData.weeklyRampRate));
  const progressValue = ((normalizedRamp + 10) / 25) * 100;

  return (
    <Alert
      color={rampRateData.color}
      variant="light"
      radius="md"
      icon={<RampIcon size={20} />}
      title={
        <Group gap="xs">
          <Text fw={600}>Training Ramp Rate</Text>
          <Badge color={rampRateData.color} variant="filled" size="sm">
            {rampRateData.weeklyRampRate > 0 ? '+' : ''}{rampRateData.weeklyRampRate} TSS/week
          </Badge>
        </Group>
      }
    >
      <Stack gap="sm">
        <Text size="sm">{rampRateData.message}</Text>

        {showDetails && (
          <>
            {/* Ramp Rate Gauge */}
            <Box>
              <Group justify="space-between" mb={4}>
                <Text size="xs" c="dimmed">Detraining</Text>
                <Text size="xs" c="dimmed">Optimal (3-7)</Text>
                <Text size="xs" c="dimmed">Overreaching</Text>
              </Group>
              <Box style={{ position: 'relative' }}>
                <Progress
                  value={progressValue}
                  size="lg"
                  radius="xl"
                  color={rampRateData.color}
                  style={{ backgroundColor: tokens.colors.bgTertiary }}
                />
                {/* Optimal zone markers */}
                <Box
                  style={{
                    position: 'absolute',
                    left: `${((3 + 10) / 25) * 100}%`,
                    top: 0,
                    bottom: 0,
                    width: `${((7 - 3) / 25) * 100}%`,
                    backgroundColor: 'rgba(34, 197, 94, 0.3)',
                    borderRadius: 4,
                    pointerEvents: 'none',
                  }}
                />
              </Box>
              <Group justify="space-between" mt={4}>
                <Text size="xs" c="dimmed">-10</Text>
                <Text size="xs" c="dimmed">0</Text>
                <Text size="xs" c="dimmed">+15</Text>
              </Group>
            </Box>

            {/* Metrics */}
            <Group gap="lg">
              <Tooltip label="Average weekly CTL change over last 4 weeks">
                <Paper p="xs" style={{ backgroundColor: tokens.colors.bgTertiary, flex: 1 }}>
                  <Text size="xs" c="dimmed">4-Week Avg</Text>
                  <Text size="sm" fw={600}>
                    {rampRateData.monthlyRampRate > 0 ? '+' : ''}{rampRateData.monthlyRampRate}/week
                  </Text>
                </Paper>
              </Tooltip>
              <Tooltip label="How ramp rate is changing week over week">
                <Paper p="xs" style={{ backgroundColor: tokens.colors.bgTertiary, flex: 1 }}>
                  <Text size="xs" c="dimmed">Trend</Text>
                  <Group gap={4}>
                    {rampRateData.trend > 0 ? (
                      <IconTrendingUp size={14} color={tokens.colors.zone5} />
                    ) : rampRateData.trend < 0 ? (
                      <IconTrendingDown size={14} color={tokens.colors.zone2} />
                    ) : null}
                    <Text size="sm" fw={600}>
                      {rampRateData.trend > 0 ? '+' : ''}{rampRateData.trend}
                    </Text>
                  </Group>
                </Paper>
              </Tooltip>
              <Tooltip label="Current Chronic Training Load (fitness)">
                <Paper p="xs" style={{ backgroundColor: tokens.colors.bgTertiary, flex: 1 }}>
                  <Text size="xs" c="dimmed">Current CTL</Text>
                  <Text size="sm" fw={600}>{rampRateData.ctlNow}</Text>
                </Paper>
              </Tooltip>
            </Group>

            {/* Recommendation */}
            <Paper p="xs" style={{ backgroundColor: tokens.colors.bgTertiary }}>
              <Text size="xs" c="dimmed" mb={2}>Recommendation</Text>
              <Text size="sm">{rampRateData.recommendation}</Text>
            </Paper>
          </>
        )}
      </Stack>
    </Alert>
  );
};

/**
 * Compact version for dashboard widgets
 */
export const RampRateBadge = ({ dailyTSSData, currentCTL }) => {
  const rampRateData = useMemo(() => {
    if (!dailyTSSData || dailyTSSData.length < 7) {
      return null;
    }

    const currentIndex = dailyTSSData.length - 1;
    const oneWeekAgoIndex = currentIndex - 7;

    const calculateCTLAtDay = (data, endIndex) => {
      if (endIndex < 0) return 0;
      const decay = 1 / 42;
      let ctl = 0;
      const slice = data.slice(0, endIndex + 1);

      slice.forEach((d, index) => {
        const weight = Math.exp(-decay * (slice.length - index - 1));
        ctl += d.tss * weight;
      });

      return Math.round(ctl * decay);
    };

    const ctlNow = currentCTL || calculateCTLAtDay(dailyTSSData, currentIndex);
    const ctlOneWeekAgo = calculateCTLAtDay(dailyTSSData, oneWeekAgoIndex);
    const weeklyRampRate = ctlNow - ctlOneWeekAgo;

    let color;
    if (weeklyRampRate > 10) color = 'red';
    else if (weeklyRampRate > 7) color = 'orange';
    else if (weeklyRampRate >= 3) color = 'green';
    else if (weeklyRampRate >= 0) color = 'blue';
    else if (weeklyRampRate >= -5) color = 'teal';
    else color = 'yellow';

    return { weeklyRampRate, color };
  }, [dailyTSSData, currentCTL]);

  if (!rampRateData) return null;

  return (
    <Tooltip label={`Weekly ramp rate: ${rampRateData.weeklyRampRate > 0 ? '+' : ''}${rampRateData.weeklyRampRate} TSS/week. Optimal: 3-7.`}>
      <Badge
        color={rampRateData.color}
        variant="light"
        size="sm"
        leftSection={
          rampRateData.weeklyRampRate > 0 ? (
            <IconTrendingUp size={12} />
          ) : (
            <IconTrendingDown size={12} />
          )
        }
      >
        {rampRateData.weeklyRampRate > 0 ? '+' : ''}{rampRateData.weeklyRampRate}/wk
      </Badge>
    </Tooltip>
  );
};

export default RampRateAlert;
