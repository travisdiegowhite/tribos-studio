import { useMemo } from 'react';
import { Card, Text, Group, Box, Stack, RingProgress, Badge, Skeleton } from '@mantine/core';
import { tokens } from '../theme';
import { Minus, TrendDown, TrendUp } from '@phosphor-icons/react';

/**
 * Calculate TFI, AFI, and Form Score from activity history (spec §2).
 * @param {Array} activities - Array of activities with RSS values
 * @returns {Object} { tfi, afi, formScore }
 */
function calculateTrainingLoad(activities) {
  if (!activities || activities.length === 0) {
    return { tfi: 0, afi: 0, formScore: 0 };
  }

  // Sort activities by date
  const sorted = [...activities].sort(
    (a, b) => new Date(a.start_date) - new Date(b.start_date)
  );

  // Build daily RSS map for the last 60 days
  const now = new Date();
  const sixtyDaysAgo = new Date(now);
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

  const dailyRss = {};
  for (let d = new Date(sixtyDaysAgo); d <= now; d.setDate(d.getDate() + 1)) {
    const key = d.toISOString().split('T')[0];
    dailyRss[key] = 0;
  }

  // Sum RSS per day (spec §2 canonical with legacy fallback for pre-074 rows)
  sorted.forEach((activity) => {
    const date = new Date(activity.start_date).toISOString().split('T')[0];
    const rss = activity.rss ?? activity.tss ?? estimateRss(activity);
    if (dailyRss[date] !== undefined) {
      dailyRss[date] += rss;
    }
  });

  const days = Object.keys(dailyRss).sort();
  const rssValues = days.map((d) => dailyRss[d]);

  // TFI/AFI: iterative EWA (spec §3.4/§3.5)
  let tfi = 0;
  let afi = 0;
  let prevTfi = 0;
  let prevAfi = 0;
  for (const rss of rssValues) {
    prevTfi = tfi;
    prevAfi = afi;
    tfi = tfi + (rss - tfi) / 42;
    afi = afi + (rss - afi) / 7;
  }

  // Form Score uses yesterday's TFI/AFI (freshness going into today, spec §3.6)
  const formScore = Math.round(prevTfi) - Math.round(prevAfi);

  return { tfi: Math.round(tfi), afi: Math.round(afi), formScore };
}

/**
 * Estimate RSS (spec §2) from activity if not provided.
 */
function estimateRss(activity) {
  const hours = (activity.duration_seconds || activity.moving_time || 0) / 3600;
  const avgPower = activity.average_power_watts || activity.average_watts;

  if (avgPower && activity.normalized_power_watts) {
    // Use effective power for RSS estimation
    const ftp = 200; // Default FTP estimate
    const rideIntensity = activity.normalized_power_watts / ftp;
    return Math.round(hours * rideIntensity * rideIntensity * 100);
  }

  // Simple heuristic based on duration and heart rate
  const avgHR = activity.average_heart_rate || activity.average_hr;
  if (avgHR) {
    const intensity = avgHR / 180; // Rough intensity factor
    return Math.round(hours * intensity * 100);
  }

  // Fallback: ~50 RSS per hour
  return Math.round(hours * 50);
}

/**
 * Get form status based on Form Score (spec §2).
 */
function getFormStatus(formScore) {
  if (formScore >= 15) {
    return {
      label: 'Fresh',
      description: 'Well-rested and ready for a hard effort',
      color: tokens.colors.zone2,
      colorName: 'green',
      advice: 'Great day for a hard workout or race!',
      icon: TrendUp,
    };
  } else if (formScore >= 5) {
    return {
      label: 'Ready',
      description: 'Good balance of fitness and freshness',
      color: 'var(--color-teal)',
      colorName: 'terracotta',
      advice: 'Solid training day ahead',
      icon: TrendUp,
    };
  } else if (formScore >= -10) {
    return {
      label: 'Optimal',
      description: 'Building fitness with manageable fatigue',
      color: tokens.colors.zone3,
      colorName: 'yellow',
      advice: 'Keep pushing - you\'re in the zone',
      icon: Minus,
    };
  } else if (formScore >= -25) {
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
 * Displays current training form based on TFI/AFI/Form Score (spec §2).
 */
const FormWidget = ({ activities = [], loading = false }) => {
  const { tfi, afi, formScore } = useMemo(() => {
    return calculateTrainingLoad(activities);
  }, [activities]);

  const formStatus = useMemo(() => getFormStatus(formScore), [formScore]);

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

  // Normalize Form Score for ring progress (-50 to +50 -> 0 to 100)
  const normalizedFormScore = Math.min(100, Math.max(0, ((formScore + 50) / 100) * 100));

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
          {/* Form Score Ring */}
          <RingProgress
            size={90}
            thickness={8}
            roundCaps
            sections={[
              {
                value: normalizedFormScore,
                color: formStatus.color,
              },
            ]}
            label={
              <Box ta="center">
                <Text size="lg" fw={700} style={{ color: formStatus.color }}>
                  {formScore > 0 ? '+' : ''}{formScore}
                </Text>
                <Text size="xs" style={{ color: 'var(--color-text-muted)' }}>
                  FS
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

        {/* TFI / AFI Stats (spec §2) */}
        <Group grow gap="md">
          <Box
            style={{
              padding: tokens.spacing.sm,
              borderRadius: tokens.radius.sm,
              backgroundColor: 'var(--color-bg-secondary)',
            }}
          >
            <Text size="xs" style={{ color: 'var(--color-text-muted)' }}>
              Fitness (TFI)
            </Text>
            <Text fw={600} style={{ color: '#C49A0A' }}>
              {tfi}
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
              Fatigue (AFI)
            </Text>
            <Text fw={600} style={{ color: '#C43C2A' }}>
              {afi}
            </Text>
          </Box>
        </Group>
      </Stack>
    </Card>
  );
};

export default FormWidget;
