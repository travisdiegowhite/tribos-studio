import { useMemo } from 'react';
import { Card, Text, Group, Box, Stack, RingProgress, Badge, Skeleton } from '@mantine/core';
import { tokens } from '../theme';
import { Minus, TrendDown, TrendUp } from '@phosphor-icons/react';

/**
 * Calculate CTL, ATL, and TSB from activity history
 * @param {Array} activities - Array of activities with TSS values
 * @returns {Object} { ctl, atl, tsb }
 */
function calculateTrainingLoad(activities) {
  if (!activities || activities.length === 0) {
    return { ctl: 0, atl: 0, tsb: 0 };
  }

  // Sort activities by date
  const sorted = [...activities].sort(
    (a, b) => new Date(a.start_date) - new Date(b.start_date)
  );

  // Build daily TSS map for the last 60 days
  const now = new Date();
  const sixtyDaysAgo = new Date(now);
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

  const dailyTSS = {};
  for (let d = new Date(sixtyDaysAgo); d <= now; d.setDate(d.getDate() + 1)) {
    const key = d.toISOString().split('T')[0];
    dailyTSS[key] = 0;
  }

  // Sum TSS per day
  sorted.forEach((activity) => {
    const date = new Date(activity.start_date).toISOString().split('T')[0];
    const tss = activity.tss || estimateTSS(activity);
    if (dailyTSS[date] !== undefined) {
      dailyTSS[date] += tss;
    }
  });

  const days = Object.keys(dailyTSS).sort();
  const tssValues = days.map((d) => dailyTSS[d]);

  // CTL/ATL: iterative EWA (matches trainingPlans.ts canonical formulas)
  let ctl = 0;
  let atl = 0;
  let prevCtl = 0;
  let prevAtl = 0;
  for (const tss of tssValues) {
    prevCtl = ctl;
    prevAtl = atl;
    ctl = ctl + (tss - ctl) / 42;
    atl = atl + (tss - atl) / 7;
  }

  // TSB uses yesterday's CTL/ATL (freshness going into today)
  const tsb = Math.round(prevCtl) - Math.round(prevAtl);

  return { ctl: Math.round(ctl), atl: Math.round(atl), tsb };
}

/**
 * Estimate TSS from activity if not provided
 */
function estimateTSS(activity) {
  const hours = (activity.duration_seconds || activity.moving_time || 0) / 3600;
  const avgPower = activity.average_power_watts || activity.average_watts;

  if (avgPower && activity.normalized_power_watts) {
    // Use normalized power for TSS estimation
    const ftp = 200; // Default FTP estimate
    const intensityFactor = activity.normalized_power_watts / ftp;
    return Math.round(hours * intensityFactor * intensityFactor * 100);
  }

  // Simple heuristic based on duration and heart rate
  const avgHR = activity.average_heart_rate || activity.average_hr;
  if (avgHR) {
    const intensity = avgHR / 180; // Rough intensity factor
    return Math.round(hours * intensity * 100);
  }

  // Fallback: ~50 TSS per hour
  return Math.round(hours * 50);
}

/**
 * Get form status based on TSB
 */
function getFormStatus(tsb) {
  if (tsb >= 15) {
    return {
      label: 'Fresh',
      description: 'Well-rested and ready for a hard effort',
      color: tokens.colors.zone2,
      colorName: 'green',
      advice: 'Great day for a hard workout or race!',
      icon: TrendUp,
    };
  } else if (tsb >= 5) {
    return {
      label: 'Ready',
      description: 'Good balance of fitness and freshness',
      color: 'var(--color-teal)',
      colorName: 'terracotta',
      advice: 'Solid training day ahead',
      icon: TrendUp,
    };
  } else if (tsb >= -10) {
    return {
      label: 'Optimal',
      description: 'Building fitness with manageable fatigue',
      color: tokens.colors.zone3,
      colorName: 'yellow',
      advice: 'Keep pushing - you\'re in the zone',
      icon: Minus,
    };
  } else if (tsb >= -25) {
    return {
      label: 'Tired',
      description: 'Accumulating fatigue - watch recovery',
      color: tokens.colors.zone4,
      colorName: 'orange',
      advice: 'Consider an easy day or rest',
      icon: TrendDown,
    };
  } else {
    return {
      label: 'Fatigued',
      description: 'High fatigue - rest recommended',
      color: tokens.colors.zone5,
      colorName: 'red',
      advice: 'Recovery is critical right now',
      icon: TrendDown,
    };
  }
}

/**
 * FormWidget Component
 * Displays current training form based on CTL/ATL/TSB
 */
const FormWidget = ({ activities = [], loading = false }) => {
  const { ctl, atl, tsb } = useMemo(() => {
    return calculateTrainingLoad(activities);
  }, [activities]);

  const formStatus = useMemo(() => getFormStatus(tsb), [tsb]);

  if (loading) {
    return (
      <Card>
        <Stack gap="md">
          <Skeleton height={24} width={120} />
          <Group>
            <Skeleton height={80} width={80} circle />
            <Stack gap="xs" style={{ flex: 1 }}>
              <Skeleton height={20} width="80%" />
              <Skeleton height={16} width="60%" />
            </Stack>
          </Group>
        </Stack>
      </Card>
    );
  }

  // Normalize TSB for ring progress (-50 to +50 -> 0 to 100)
  const normalizedTSB = Math.min(100, Math.max(0, ((tsb + 50) / 100) * 100));

  const StatusIcon = formStatus.icon;

  return (
    <Card>
      <Stack gap="md">
        <Group justify="space-between">
          <Text fw={600} style={{ color: 'var(--color-text-primary)' }}>
            Current Form
          </Text>
          <Badge
            variant="light"
            color={formStatus.colorName}
            leftSection={<StatusIcon size={12} />}
          >
            {formStatus.label}
          </Badge>
        </Group>

        <Group gap="lg" wrap="nowrap">
          {/* TSB Ring */}
          <RingProgress
            size={90}
            thickness={8}
            roundCaps
            sections={[
              {
                value: normalizedTSB,
                color: formStatus.color,
              },
            ]}
            label={
              <Box ta="center">
                <Text size="lg" fw={700} style={{ color: formStatus.color }}>
                  {tsb > 0 ? '+' : ''}{tsb}
                </Text>
                <Text size="xs" style={{ color: 'var(--color-text-muted)' }}>
                  TSB
                </Text>
              </Box>
            }
          />

          {/* Status Description */}
          <Stack gap={4} style={{ flex: 1 }}>
            <Text style={{ color: 'var(--color-text-primary)' }}>
              {formStatus.description}
            </Text>
            <Text size="sm" style={{ color: 'var(--color-text-secondary)' }}>
              {formStatus.advice}
            </Text>
          </Stack>
        </Group>

        {/* CTL / ATL Stats */}
        <Group grow gap="md">
          <Box
            style={{
              padding: tokens.spacing.sm,
              borderRadius: tokens.radius.sm,
              backgroundColor: 'var(--color-bg-secondary)',
            }}
          >
            <Text size="xs" style={{ color: 'var(--color-text-muted)' }}>
              Fitness (CTL)
            </Text>
            <Text fw={600} style={{ color: '#C49A0A' }}>
              {ctl}
            </Text>
          </Box>
          <Box
            style={{
              padding: tokens.spacing.sm,
              borderRadius: tokens.radius.sm,
              backgroundColor: 'var(--color-bg-secondary)',
            }}
          >
            <Text size="xs" style={{ color: 'var(--color-text-muted)' }}>
              Fatigue (ATL)
            </Text>
            <Text fw={600} style={{ color: '#C43C2A' }}>
              {atl}
            </Text>
          </Box>
        </Group>
      </Stack>
    </Card>
  );
};

export default FormWidget;
