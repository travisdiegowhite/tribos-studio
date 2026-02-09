import { useState } from 'react';
import {
  Paper,
  Stack,
  Group,
  Text,
  Button,
  Badge,
  Box,
  SimpleGrid,
  Loader,
} from '@mantine/core';
import {
  IconCalendarPlus,
  IconClock,
  IconFlame,
  IconTrophy,
  IconX,
  IconChartLine,
} from '@tabler/icons-react';

// Phase color mapping
const PHASE_COLORS = {
  regular: 'blue',
  recovery: 'green',
  build: 'orange',
  peak: 'red',
  taper: 'grape',
};

// Methodology labels
const METHODOLOGY_LABELS = {
  polarized: 'Polarized (80/20)',
  sweet_spot: 'Sweet Spot',
  threshold: 'Threshold',
  pyramidal: 'Pyramidal',
  endurance: 'Endurance',
};

function TrainingPlanPreview({ plan, onActivate, onDismiss, compact = false }) {
  const [activating, setActivating] = useState(false);

  if (!plan) return null;

  const handleActivate = async () => {
    setActivating(true);
    try {
      await onActivate(plan);
    } finally {
      setActivating(false);
    }
  };

  return (
    <Paper
      p={compact ? 'sm' : 'md'}
      style={{
        backgroundColor: 'var(--tribos-bg-tertiary)',
        border: '1px solid var(--tribos-green-border, rgba(50, 205, 50, 0.3))',
        borderRadius: 12,
      }}
    >
      <Stack gap={compact ? 'xs' : 'sm'}>
        {/* Header */}
        <Group justify="space-between" wrap="nowrap">
          <Group gap="xs" wrap="nowrap">
            <IconChartLine size={16} style={{ color: 'var(--tribos-lime)' }} />
            <Text size={compact ? 'sm' : 'md'} fw={600} lineClamp={1}>
              {plan.name}
            </Text>
          </Group>
          {onDismiss && (
            <Button
              variant="subtle"
              color="gray"
              size="compact-xs"
              onClick={onDismiss}
              p={0}
            >
              <IconX size={14} />
            </Button>
          )}
        </Group>

        {/* Methodology badge */}
        <Group gap="xs">
          <Badge size="sm" variant="light" color="lime">
            {METHODOLOGY_LABELS[plan.methodology] || plan.methodology}
          </Badge>
          <Badge size="sm" variant="light" color="gray">
            {plan.duration_weeks} weeks
          </Badge>
          {plan.goal && (
            <Badge size="sm" variant="light" color="blue">
              {plan.goal.replace(/_/g, ' ')}
            </Badge>
          )}
        </Group>

        {/* Stats */}
        {plan.summary && (
          <SimpleGrid cols={compact ? 2 : 3} spacing="xs">
            <Group gap={4} wrap="nowrap">
              <IconCalendarPlus size={14} style={{ color: 'var(--tribos-text-muted)', flexShrink: 0 }} />
              <Text size="xs" c="dimmed">
                {plan.summary.total_workouts} workouts
              </Text>
            </Group>
            <Group gap={4} wrap="nowrap">
              <IconClock size={14} style={{ color: 'var(--tribos-text-muted)', flexShrink: 0 }} />
              <Text size="xs" c="dimmed">
                ~{plan.summary.avg_weekly_hours} hrs/wk
              </Text>
            </Group>
            <Group gap={4} wrap="nowrap">
              <IconFlame size={14} style={{ color: 'var(--tribos-text-muted)', flexShrink: 0 }} />
              <Text size="xs" c="dimmed">
                ~{plan.summary.avg_weekly_tss} TSS/wk
              </Text>
            </Group>
          </SimpleGrid>
        )}

        {/* Phases */}
        {!compact && plan.phases && plan.phases.length > 0 && (
          <Box>
            <Text size="xs" fw={600} c="dimmed" mb={4}>
              Training Phases
            </Text>
            <Group gap={4}>
              {plan.phases.map((phase, i) => (
                <Badge
                  key={i}
                  size="xs"
                  variant="dot"
                  color={PHASE_COLORS[phase.phase] || 'gray'}
                >
                  {phase.phase.charAt(0).toUpperCase() + phase.phase.slice(1)}: {phase.weeks}
                </Badge>
              ))}
            </Group>
          </Box>
        )}

        {/* Date range */}
        <Text size="xs" c="dimmed">
          {plan.start_date} to {plan.end_date}
        </Text>

        {/* Activate button */}
        <Button
          color="lime"
          size={compact ? 'xs' : 'sm'}
          leftSection={activating ? <Loader size={14} color="dark" /> : <IconTrophy size={16} />}
          onClick={handleActivate}
          disabled={activating}
          fullWidth
        >
          {activating ? 'Activating...' : 'Activate Plan & Add to Calendar'}
        </Button>
      </Stack>
    </Paper>
  );
}

export default TrainingPlanPreview;
