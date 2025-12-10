/**
 * PlanCard Component
 * Displays a training plan template as a card
 */

import {
  Card,
  Text,
  Badge,
  Group,
  Stack,
  Button,
  ThemeIcon,
} from '@mantine/core';
import {
  IconClock,
  IconFlame,
  IconTarget,
  IconCalendar,
} from '@tabler/icons-react';
import { GOAL_TYPES, FITNESS_LEVELS, TRAINING_PHASES } from '../../utils/trainingPlans';

// Methodology colors
const METHODOLOGY_COLORS = {
  polarized: 'blue',
  sweet_spot: 'orange',
  threshold: 'red',
  pyramidal: 'violet',
  endurance: 'green',
};

export default function PlanCard({
  plan,
  onSelect,
  onPreview,
  compact = false,
}) {
  const goalInfo = GOAL_TYPES[plan.goal] || {};
  const fitnessInfo = FITNESS_LEVELS[plan.fitnessLevel] || {};

  if (compact) {
    return (
      <Card
        padding="sm"
        radius="md"
        withBorder
        style={{ cursor: 'pointer' }}
        onClick={() => onPreview?.(plan)}
      >
        <Group position="apart" noWrap>
          <div style={{ flex: 1 }}>
            <Text fw={500} lineClamp={1}>{plan.name}</Text>
            <Group spacing={4} mt={4}>
              <Badge size="xs" color={METHODOLOGY_COLORS[plan.methodology] || 'gray'}>
                {plan.methodology}
              </Badge>
              <Badge size="xs" variant="outline">
                {plan.duration} weeks
              </Badge>
            </Group>
          </div>
          <Button size="xs" variant="light" onClick={(e) => { e.stopPropagation(); onSelect?.(plan); }}>
            Start
          </Button>
        </Group>
      </Card>
    );
  }

  return (
    <Card padding="lg" radius="md" withBorder>
      <Stack spacing="sm">
        {/* Header */}
        <Group position="apart" noWrap>
          <div style={{ flex: 1 }}>
            <Text fw={600} size="lg" lineClamp={1}>{plan.name}</Text>
            <Text size="sm" c="dimmed" lineClamp={2} mt={4}>
              {plan.description}
            </Text>
          </div>
          <ThemeIcon size={40} radius="md" color={METHODOLOGY_COLORS[plan.methodology]} variant="light">
            <IconTarget size={24} />
          </ThemeIcon>
        </Group>

        {/* Badges */}
        <Group spacing={6}>
          <Badge color={METHODOLOGY_COLORS[plan.methodology] || 'gray'}>
            {plan.methodology?.replace('_', ' ')}
          </Badge>
          <Badge variant="outline" color="gray">
            {fitnessInfo.name || plan.fitnessLevel}
          </Badge>
          {goalInfo.icon && (
            <Badge leftSection={goalInfo.icon} variant="dot">
              {goalInfo.name || plan.goal}
            </Badge>
          )}
        </Group>

        {/* Stats */}
        <Group spacing="lg" mt="xs">
          <Group spacing={6}>
            <IconCalendar size={16} color="var(--mantine-color-dimmed)" />
            <Text size="sm" c="dimmed">{plan.duration} weeks</Text>
          </Group>
          <Group spacing={6}>
            <IconClock size={16} color="var(--mantine-color-dimmed)" />
            <Text size="sm" c="dimmed">
              {plan.hoursPerWeek.min}-{plan.hoursPerWeek.max} hrs/wk
            </Text>
          </Group>
          <Group spacing={6}>
            <IconFlame size={16} color="var(--mantine-color-dimmed)" />
            <Text size="sm" c="dimmed">
              {plan.weeklyTSS.min}-{plan.weeklyTSS.max} TSS/wk
            </Text>
          </Group>
        </Group>

        {/* Actions */}
        <Group mt="sm">
          <Button
            variant="light"
            flex={1}
            onClick={() => onPreview?.(plan)}
          >
            Preview
          </Button>
          <Button
            flex={1}
            onClick={() => onSelect?.(plan)}
          >
            Start Plan
          </Button>
        </Group>
      </Stack>
    </Card>
  );
}
